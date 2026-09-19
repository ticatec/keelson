import { Redis } from "ioredis";
import type { RedisOptions } from "ioredis";
import MockRedis from "ioredis-mock";
import { getLogger, Logger } from "@ticatec/logger-api";

export type MessageHandler = (channel: string, data: any) => void;

/**
 * Accepted connection input.
 *
 * - `RedisOptions` - ioredis options object.
 * - `string` - a connection URL (`redis://`, `rediss://`), which is what
 *   `REDIS_URL` holds in most container and PaaS setups.
 * - `null` - use the in-memory mock client.
 */
export type RedisConnection = RedisOptions | string | null;

/**
 * Redis client wrapper powered by ioredis.
 * Provides singleton and multi-instance management, Mock Redis switching,
 * atomic TTL pipelines, in-flight Cache Stampede protection, and Pub/Sub support.
 * @class RedisClient
 */
/**
 * 单例注册表挂在 globalThis 上，键为一个众所周知的 Symbol。
 *
 * 本包同时发布 CommonJS 与 ESM 两份构建，Node 把它们当作两个互不相干的模块实例，
 * 因此类静态属性会一分为二：主程序用 import 调 init()，某个第三方模块用 require
 * 调 getInstance()，后者会直接抛「尚未初始化」。锚到全局注册表后，无论以哪种方式
 * 加载，整个进程共享同一份注册表。
 */
interface RegistryState {
    instances: Map<string, RedisClient>;
}

const REGISTRY_KEY = Symbol.for('@ticatec/redis-client.instances');

const registry: RegistryState = ((globalThis as any)[REGISTRY_KEY] ??= {
    instances: new Map<string, RedisClient>()
});

export default class RedisClient {

    private static staticLogger: Logger | null = null;

    /**
     * 静态方法用的 logger。惰性取得，避免在模块求值阶段就固定下来。
     * @private
     */
    private static getStaticLogger(): Logger {
        RedisClient.staticLogger ??= getLogger('RedisClient');
        return RedisClient.staticLogger;
    }

    protected readonly logger: Logger = getLogger('RedisClient');
    private handlers: Map<string, MessageHandler[]> = new Map();
    private inflight: Map<string, Promise<any>> = new Map();
    
    private readonly _client: Redis;
    private subClient: Redis | null = null;
    private isClosed = false;
    /** 本实例在单例注册表中的名字；通过 create() 构造的独立实例为 null。 */
    private registeredName: string | null = null;

    /**
     * 构造一条可安全写入日志的连接参数摘要。
     *
     * RedisOptions 里带着 `password`、`username`、`sentinelPassword` 以及 TLS 的
     * 密钥material，整个对象直接丢进日志等于把生产库口令写进日志系统。这里采用
     * 白名单而非黑名单：只挑出确定安全的字段，将来 ioredis 新增了什么敏感选项也
     * 不会悄悄泄露出去。
     *
     * @param conf - 连接参数
     * @returns 仅含非敏感字段的摘要
     * @private
     */
    private static describeConnection(conf: RedisOptions | string, options?: RedisOptions): Record<string, unknown> {
        if (typeof conf === 'string') {
            // URL 里的 user:pass@ 同样是凭据，绝不能原样写进日志。
            try {
                const url = new URL(conf);
                // 必须确认是 redis 连接串再拆解。new URL('anything:whatever') 也能
                // 解析成功，此时 pathname 就是原串的后半段——直接当 db 报出去等于
                // 把内容回显进日志。
                if ((url.protocol !== 'redis:' && url.protocol !== 'rediss:') || url.hostname === '') {
                    return { connection: 'url', parsed: false };
                }
                return {
                    host: url.hostname,
                    port: url.port === '' ? 6379 : Number(url.port),
                    db: url.pathname.length > 1 ? url.pathname.slice(1) : 0,
                    tls: url.protocol === 'rediss:',
                    authenticated: url.username !== '' || url.password !== ''
                };
            } catch {
                // 连 URL 都解析不出来时，只报告「给的是一个连接串」，不回显内容。
                return { connection: 'url', parsed: false };
            }
        }
        const effective = options ? { ...conf, ...options } : conf;
        const summary: Record<string, unknown> = {
            host: effective.host ?? '127.0.0.1',
            port: effective.port ?? 6379,
            db: effective.db ?? 0,
            tls: effective.tls != null,
            // 只报告「是否配置了凭据」，绝不报告凭据本身
            authenticated: effective.password != null || effective.username != null
        };
        if (Array.isArray(effective.sentinels)) {
            summary.sentinels = effective.sentinels.length;
        }
        if (effective.name != null) {
            summary.name = effective.name;
        }
        return summary;
    }

    public constructor(conf: RedisConnection, options?: RedisOptions) {
        if (conf != null) {
            this.logger.debug(RedisClient.describeConnection(conf, options), 'Connecting to Redis');
            if (typeof conf === 'string') {
                this._client = options ? new Redis(conf, options) : new Redis(conf);
            } else {
                this._client = options ? new Redis({ ...conf, ...options }) : new Redis(conf);
            }
            this._client.on('error', (err) => this.logger.error({ err }, 'Redis Client Error'));
            this._client.on('connect', () => this.logger.info('Connecting to Redis server...'));
            this._client.on('ready', () => this.logger.info('Connected to Redis server.'));
            this._client.on('end', () => this.logger.info('Connection closed from Redis server'));
            this._client.on('reconnecting', () => this.logger.info('Attempting to reconnect to Redis server...'));
        } else {
            this.logger.debug('Using mock Redis client (ioredis-mock)');
            this._client = new (MockRedis as any)() as Redis;
        }
    }

    private parseMessage(message: string): any {
        try {
            return JSON.parse(message);
        } catch {
            return message;
        }
    }

    /**
     * Inspects pipeline.exec() results and throws the first command error found.
     * ioredis pipelines only reject on connection-level failures; individual command
     * errors are returned inline as [Error, result] tuples and must be checked manually.
     * @private
     */
    private checkPipelineResults(results: Array<[Error | null, unknown]> | null): void {
        if (!results) return;
        for (const [err] of results) {
            if (err) throw err;
        }
    }

    /**
     * Creates an independent, non-singleton RedisClient instance.
     * @static
     * @param conf - Redis connection options, a `redis://` / `rediss://` URL, or `null` for the mock client.
     * @param options - Optional additional RedisOptions (e.g. when connecting via URL).
     * @returns RedisClient instance.
     */
    public static create(conf: RedisConnection, options?: RedisOptions): RedisClient {
        return new RedisClient(conf, options);
    }

    /**
     * Initializes a named RedisClient singleton instance.
     * In Node.js single-threaded event loop without yield points, checking and creating instance is naturally atomic.
     * @static
     * @param conf - Redis connection options, a `redis://` / `rediss://` URL, or `null` for Mock Redis.
     * @param name - Singleton instance identifier (defaults to 'default').
     * @param options - Optional additional RedisOptions (e.g. when connecting via URL).
     * @returns Promise resolving to RedisClient singleton instance.
     */
    public static async init(
        conf: RedisConnection,
        name: string = 'default',
        options?: RedisOptions
    ): Promise<RedisClient> {
        const existing = registry.instances.get(name);
        if (existing && !existing.isClosed) {
            // 第二次调用的 conf 会被静默丢弃，而调用方多半以为自己重新配置了连接。
            RedisClient.getStaticLogger().warn(
                { name },
                'RedisClient.init() called again for an already initialized instance; the new options are ignored'
            );
            return existing;
        }
        if (existing) {
            // 已关闭的实例不该继续占着名字：此前 init() 会把这个死连接原样返回，
            // 之后每一次命令都失败，而调用方以为自己刚刚建立了一条新连接。
            RedisClient.getStaticLogger().debug({ name }, 'Replacing a closed RedisClient instance');
        }
        const instance = new RedisClient(conf, options);
        instance.registeredName = name;
        registry.instances.set(name, instance);
        return instance;
    }

    /**
     * Retrieves an initialized named RedisClient singleton instance.
     * @static
     * @param name - Singleton instance identifier (defaults to 'default').
     * @returns RedisClient singleton instance.
     */
    public static getInstance(name: string = 'default'): RedisClient {
        const instance = registry.instances.get(name);
        if (!instance) {
            throw new Error(`RedisClient instance '${name}' has not been initialized. Call RedisClient.init() first.`);
        }
        return instance;
    }

    /**
     * 关闭并注销指定的单例实例。
     * @static
     * @param name - 实例名（默认 'default'）
     */
    public static async closeInstance(name: string = 'default'): Promise<void> {
        const instance = registry.instances.get(name);
        if (instance) {
            await instance.close();
        }
    }

    /**
     * Resets all singleton instances (primarily for testing environments).
     * Disconnects all active connections to prevent background reconnection attempts.
     * @static
     */
    public static resetInstances(): void {
        for (const instance of registry.instances.values()) {
            if (!instance.isClosed) {
                if (instance._client) {
                    try {
                        instance._client.removeAllListeners();
                        instance._client.on('error', () => { /* ignored */ });
                        instance._client.disconnect();
                    } catch { /* ignore */ }
                }
                if (instance.subClient) {
                    try {
                        instance.subClient.removeAllListeners();
                        instance.subClient.on('error', () => { /* ignored */ });
                        instance.subClient.disconnect();
                    } catch { /* ignore */ }
                }
                instance.isClosed = true;
            }
        }
        registry.instances.clear();
    }

    /**
     * Gets the underlying ioredis client instance.
     * @readonly
     */
    get client(): Redis {
        return this._client;
    }

    /**
     * Sets a key-value pair.
     * Objects (except Buffers) are automatically serialized as JSON strings.
     * @param key - Redis key name.
     * @param value - Value to store (objects serialized to JSON; Buffers passed raw).
     * @param seconds - Expiration time in seconds (0 for no expiration).
     */
    async set(key: string, value: any, seconds: number = 0): Promise<void> {
        if (typeof value === "object" && value !== null && !Buffer.isBuffer(value)) {
            value = JSON.stringify(value);
        }
        if (seconds === 0) {
            await this._client.set(key, value);
        } else {
            await this._client.set(key, value, 'EX', seconds);
        }
    }

    /**
     * Retrieves the string or buffer value associated with the specified key.
     * @param key - Redis key name.
     * @returns Promise resolving to value or null if non-existent.
     */
    get(key: string): Promise<string | null> {
        return this._client.get(key);
    }

    /**
     * Retrieves the raw Buffer value associated with the specified key, without string decoding.
     * Use this to read back values stored via set() as a Buffer, since get() decodes as a string
     * and can corrupt non-UTF-8 binary data.
     * @param key - Redis key name.
     * @returns Promise resolving to Buffer value or null if non-existent.
     */
    getBuffer(key: string): Promise<Buffer | null> {
        return this._client.getBuffer(key);
    }

    /**
     * Retrieves the value for the key and parses it as a JSON object.
     * @template T - Return object type.
     * @param key - Redis key name.
     * @returns Promise resolving to parsed object or null if invalid / non-existent.
     */
    async getObject<T = any>(key: string): Promise<T | null> {
        const text = await this.get(key);
        let result: T | null = null;
        if (text != null && typeof text === "string") {
            try {
                result = JSON.parse(text);
            } catch {
                // 记 key 与长度，不记内容：缓存里放的往往是用户记录、令牌、会话，
                // 把值本身写进日志等于把它们复制进日志系统。
                this.logger.debug({ key, length: text.length }, 'Cached value is not JSON; returning null');
            }
        }
        return result;
    }

    /**
     * Cache-Aside query pattern with Cache Stampede (In-flight Promise Deduplication) protection.
     * Checks cache first; if un-cached, deduplicates concurrent requests so fetchFn is executed exactly ONCE,
     * and populates the cache atomically.
     * Note: Returning null or undefined from fetchFn indicates an uncacheable empty result and will not populate cache.
     * @template T - Data payload type.
     * @param key - Redis key name.
     * @param fetchFn - Data provider function invoked on cache miss.
     * @param seconds - Cache expiration in seconds (0 for no expiration).
     * @returns Promise resolving to the data payload.
     */
    /**
     * Stores a value as JSON, so it reads back through {@link getObject} unchanged.
     *
     * {@link set} is deliberately different: it only serialises objects, leaving a
     * string to be stored verbatim so that {@link get} returns exactly what was put
     * in. That asymmetry is fine for a `set`/`get` pair, but it breaks a
     * `set`/`getObject` pair - a stored `'active'` is not valid JSON, so
     * `getObject` parses it as a miss, and a stored `'123'` parses back as the
     * number `123`. Anything written for `getObject` goes through this method.
     *
     * @param key - Redis key name.
     * @param value - Value to store. Buffers are stored raw; everything else is JSON-encoded.
     * @param seconds - Expiration time in seconds (0 for no expiration).
     */
    async setObject(key: string, value: any, seconds: number = 0): Promise<void> {
        const payload = Buffer.isBuffer(value) ? value : JSON.stringify(value);
        if (seconds === 0) {
            await this._client.set(key, payload);
        } else {
            await this._client.set(key, payload, 'EX', seconds);
        }
    }

    async getOrSet<T>(key: string, fetchFn: () => Promise<T>, seconds: number = 0): Promise<T> {
        const data = await this.getObject<T>(key);
        if (data !== null && data !== undefined) {
            return data;
        }

        const existingPromise = this.inflight.get(key);
        if (existingPromise) {
            // 缓存击穿保护生效：本次请求搭上了正在进行中的那次取数。
            this.logger.debug({ key }, 'Joined an in-flight fetch for the same key');
            return await existingPromise;
        }
        this.logger.debug({ key }, 'Cache miss; fetching');

        const fetchPromise = (async () => {
            try {
                const fetchedData = await fetchFn();
                if (fetchedData !== null && fetchedData !== undefined) {
                    // 必须与读取端的 getObject 对称，否则字符串缓存永远不命中，
                    // 而 '123' 这类字面量还会在往返中被改写成 number。
                    await this.setObject(key, fetchedData, seconds);
                }
                return fetchedData;
            } finally {
                this.inflight.delete(key);
            }
        })();

        this.inflight.set(key, fetchPromise);
        return await fetchPromise;
    }

    /**
     * Deletes the specified key.
     * @param key - Redis key name.
     */
    async del(key: string): Promise<void> {
        await this._client.del(key);
    }

    /**
     * Sets expiration time for a key in seconds.
     * @param key - Redis key name.
     * @param seconds - Expiration time in seconds.
     */
    async expiry(key: string, seconds: number): Promise<void> {
        await this._client.expire(key, seconds);
    }

    /**
     * Alias for expiry() following standard ioredis naming convention.
     * @param key - Redis key name.
     * @param seconds - Expiration time in seconds.
     */
    async expire(key: string, seconds: number): Promise<void> {
        await this.expiry(key, seconds);
    }

    /**
     * Sets Hash table fields.
     * Uses atomic pipeline when seconds > 0 to guarantee atomic write + TTL expiration.
     * @param key - Redis key name.
     * @param data - Hash key-value object.
     * @param seconds - Expiration time in seconds (0 for no expiration).
     */
    async hset(key: string, data: any, seconds: number = 0): Promise<void> {
        if (seconds > 0) {
            const pipeline = this._client.pipeline();
            pipeline.hset(key, data);
            pipeline.expire(key, seconds);
            this.checkPipelineResults(await pipeline.exec());
        } else {
            await this._client.hset(key, data);
        }
    }

    /**
     * Gets a single Hash field value.
     * @param key - Redis key name.
     * @param name - Hash field name.
     * @returns Value or null if non-existent.
     */
    async hget(key: string, name: string): Promise<string | null> {
        return this._client.hget(key, name);
    }

    /**
     * Retrieves all fields and values from a Hash table.
     * @param key - Redis key name.
     * @returns Record object containing field-value pairs.
     */
    async hgetall(key: string): Promise<Record<string, string>> {
        return this._client.hgetall(key);
    }

    /**
     * Sets Hash field value only if the field does not already exist.
     * @param key - Redis key name.
     * @param name - Hash field name.
     * @param value - Value to set.
     * @returns `true` when the field was set, `false` when it already existed.
     *   `HSETNX` is typically used as a lightweight lock or an idempotency marker,
     *   so the caller needs this answer - it used to be discarded.
     */
    async hsetnx(key: string, name: string, value: string | Buffer | number): Promise<boolean> {
        return (await this._client.hsetnx(key, name, value)) === 1;
    }

    /**
     * Adds members to a Set.
     * Uses atomic pipeline when seconds > 0 to guarantee atomic write + TTL expiration.
     * @param key - Redis key name.
     * @param arr - Array of members to add.
     * @param seconds - Expiration time in seconds (0 for no expiration).
     */
    async sadd(key: string, arr: Array<string | Buffer | number>, seconds: number = 0): Promise<void> {
        if (arr && arr.length > 0) {
            if (seconds > 0) {
                const pipeline = this._client.pipeline();
                pipeline.sadd(key, ...arr);
                pipeline.expire(key, seconds);
                this.checkPipelineResults(await pipeline.exec());
            } else {
                await this._client.sadd(key, ...arr);
            }
        }
    }

    /**
     * Retrieves the cardinality (member count) of a Set.
     * @param key - Redis key name.
     * @returns Member count.
     */
    async scard(key: string): Promise<number> {
        return this._client.scard(key);
    }

    /**
     * Checks if a value is a member of a Set.
     * @param key - Redis key name.
     * @param value - Member value to check.
     * @returns True if value is a member.
     */
    async isSetMember(key: string, value: any): Promise<boolean> {
        return (await this._client.sismember(key, value)) === 1;
    }

    /**
     * Appends an element to the end of a List.
     * Objects (except Buffers) are automatically JSON serialized.
     * Uses atomic pipeline when seconds > 0 to guarantee atomic write + TTL expiration.
     * @param key - Redis key name.
     * @param data - Element payload.
     * @param seconds - Expiration time in seconds (0 for no expiration).
     */
    async rpush(key: string, data: any, seconds: number = 0): Promise<void> {
        let valStr = data;
        if (typeof data === "object" && data !== null && !Buffer.isBuffer(data)) {
            valStr = JSON.stringify(data);
        }

        if (seconds > 0) {
            const pipeline = this._client.pipeline();
            pipeline.rpush(key, valStr);
            pipeline.expire(key, seconds);
            this.checkPipelineResults(await pipeline.exec());
        } else {
            await this._client.rpush(key, valStr);
        }
    }

    /**
     * Retrieves elements from a List within the specified index range.
     * @param key - Redis key name.
     * @param start - Start index (0-based).
     * @param end - End index (-1 for last element).
     * @returns Array of string values.
     */
    async lrange(key: string, start: number, end: number): Promise<string[]> {
        return this._client.lrange(key, start, end);
    }

    /**
     * Retrieves elements from a List within the specified range and parses JSON strings to objects.
     * @param key - Redis key name.
     * @param start - Start index.
     * @param end - End index.
     * @returns Array of parsed objects.
     */
    async lrangeObject(key: string, start: number, end: number): Promise<Array<any>> {
        const arr = await this._client.lrange(key, start, end);
        const list: any[] = [];
        arr.forEach((item, index) => {
            if (typeof item === "string") {
                try {
                    list.push(JSON.parse(item));
                } catch {
                    // 同上：只记位置与长度，不记内容。
                    this.logger.warn({ key, index, length: item.length }, 'List element is not JSON; skipped');
                }
            } else {
                list.push(item);
            }
        });
        return list;
    }

    /**
     * Retrieves the length of a List.
     * @param key - Redis key name.
     * @returns List length.
     */
    async llen(key: string): Promise<number> {
        return this._client.llen(key);
    }

    /**
     * Removes and returns the first element of a List.
     * @param key - Redis key name.
     * @returns First element or null if empty.
     */
    async lpop(key: string): Promise<string | null> {
        return this._client.lpop(key);
    }

    /**
     * Closes the Redis client connection idempotently.
     */
    async close(): Promise<void> {
        if (this.isClosed) return;
        this.isClosed = true;

        // 先摘掉订阅连接，再关主连接；此前 subClient 是在主连接之后处理的，
        // 主连接 quit() 若抛异常，subClient 就永远泄漏了。
        if (this.subClient) {
            const sub = this.subClient;
            this.subClient = null;
            this.handlers.clear();
            sub.removeAllListeners();
            sub.on('error', () => { /* ignored after close */ });
            if (sub.status === 'wait' || sub.status === 'reconnecting' || sub.status === 'connecting') {
                sub.disconnect();
            } else {
                try {
                    await sub.quit();
                } catch {
                    sub.disconnect();
                }
            }
        }
        if (this._client) {
            const client = this._client;
            client.removeAllListeners();
            client.on('error', () => { /* ignored after close */ });
            if (client.status === 'wait' || client.status === 'reconnecting' || client.status === 'connecting') {
                client.disconnect();
            } else {
                try {
                    await client.quit();
                } catch {
                    client.disconnect();
                }
            }
            this.logger.info('Redis client closed');
        }
        // 把自己从注册表里摘掉：此前关闭后的实例仍留在表里，getInstance() 会继续
        // 把这条死连接交给调用方。
        if (this.registeredName != null && registry.instances.get(this.registeredName) === this) {
            registry.instances.delete(this.registeredName);
            this.registeredName = null;
        }
    }

    /**
     * Publishes a message to a Pub/Sub channel.
     * Objects are automatically JSON serialized.
     * Note: For pattern subscriptions, use standard channel matching.
     * @param channel - Channel name.
     * @param data - Payload string or object.
     * @returns Promise resolving to subscriber count receiving the message.
     */
    async publish(channel: string, data: object | string): Promise<number> {
        return await this._client.publish(channel, typeof data === "object" ? JSON.stringify(data) : data);
    }

    /**
     * Creates dedicated subscription connection lazily when subscribing.
     * @private
     */
    private createSubClient(): void {
        if (this.isClosed) {
            // 关闭后再订阅，派生出来的 subClient 会因为 close() 提前返回而永远泄漏。
            throw new Error('RedisClient is closed; subscribe() is no longer available.');
        }
        if (!this.subClient) {
            this.subClient = this._client.duplicate();
            // duplicate() 只复制连接选项，不会复制主连接上的监听器。EventEmitter
            // 在没有 'error' 监听时触发 error，Node 会直接抛未捕获异常并终止进程
            // ——服务端重载、网络闪断、订阅连接被踢，都会走到这里。
            this.subClient.on('error', (err) => this.logger.error({ err }, 'Redis subscription client error'));
            this.subClient.on('message', (channel: string, message: string) => {
                const parsed = this.parseMessage(message);
                const handlers = this.handlers.get(channel) || [];
                handlers.forEach(h => h(channel, parsed));
            });
        }
    }

    /**
     * Subscribes to one or more Pub/Sub channels.
     * Note: handlers are matched by function reference. To unsubscribe a specific handler later,
     * pass the exact same function reference used here (not a new inline/anonymous function).
     * @param channels - Channel name or array of channel names.
     * @param handler - Callback handler function.
     */
    async subscribe(channels: string | Array<string>, handler: MessageHandler): Promise<void> {
        this.createSubClient();
        const chList = Array.isArray(channels) ? channels : [channels];

        chList.forEach(ch => {
            if (!this.handlers.has(ch)) {
                this.handlers.set(ch, []);
            }
            const list = this.handlers.get(ch)!;
            if (!list.includes(handler)) {
                list.push(handler);
            }
        });

        await this.subClient!.subscribe(...chList);
    }

    /**
     * Unsubscribes from a Pub/Sub channel.
     * Closes dedicated subscription client connection if channel subscription count drops to 0.
     * Note: handler is matched by function reference (see subscribe()); a different function
     * instance, even if logically equivalent, will not be found and will silently no-op.
     * @param channel - Channel name.
     * @param handler - Optional callback handler to remove. If omitted, clears all callbacks for the channel.
     */
    async unsubscribe(channel: string, handler?: MessageHandler): Promise<void> {
        if (!this.handlers.has(channel)) return;

        if (handler) {
            const list = this.handlers.get(channel)!;
            const index = list.indexOf(handler);
            if (index !== -1) {
                list.splice(index, 1);
            }
            if (list.length === 0) {
                this.handlers.delete(channel);
                if (this.subClient) {
                    await this.subClient.unsubscribe(channel);
                }
            }
        } else {
            this.handlers.delete(channel);
            if (this.subClient) {
                await this.subClient.unsubscribe(channel);
            }
        }

        if (this.handlers.size === 0 && this.subClient) {
            await this.subClient.quit();
            this.subClient = null;
        }
    }
}