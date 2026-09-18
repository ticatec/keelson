import { Redis } from "ioredis";
import type { RedisOptions } from "ioredis";
import MockRedis from "ioredis-mock";
import { getLogger, Logger } from "@ticatec/logger-api";

export type MessageHandler = (channel: string, data: any) => void;

/**
 * Redis client wrapper powered by ioredis.
 * Provides singleton and multi-instance management, Mock Redis switching,
 * atomic TTL pipelines, in-flight Cache Stampede protection, and Pub/Sub support.
 * @class RedisClient
 */
export default class RedisClient {

    private static instances: Map<string, RedisClient> = new Map();

    protected readonly logger: Logger = getLogger('RedisClient');
    private handlers: Map<string, MessageHandler[]> = new Map();
    private inflight: Map<string, Promise<any>> = new Map();
    
    private readonly _client: Redis;
    private subClient: Redis | null = null;
    private isClosed = false;

    public constructor(conf: RedisOptions | null) {
        if (conf != null) {
            this.logger.debug({ conf }, 'Redis connection parameters');
            this._client = new Redis(conf);
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
     * @param conf - Redis connection options.
     * @returns RedisClient instance.
     */
    public static create(conf: RedisOptions | null): RedisClient {
        return new RedisClient(conf);
    }

    /**
     * Initializes a named RedisClient singleton instance.
     * In Node.js single-threaded event loop without yield points, checking and creating instance is naturally atomic.
     * @static
     * @param conf - Redis connection options (pass null for Mock Redis).
     * @param name - Singleton instance identifier (defaults to 'default').
     * @returns Promise resolving to RedisClient singleton instance.
     */
    public static async init(conf: RedisOptions | null, name: string = 'default'): Promise<RedisClient> {
        if (!RedisClient.instances.has(name)) {
            RedisClient.instances.set(name, new RedisClient(conf));
        }
        return RedisClient.instances.get(name)!;
    }

    /**
     * Retrieves an initialized named RedisClient singleton instance.
     * @static
     * @param name - Singleton instance identifier (defaults to 'default').
     * @returns RedisClient singleton instance.
     */
    public static getInstance(name: string = 'default'): RedisClient {
        const instance = RedisClient.instances.get(name);
        if (!instance) {
            throw new Error(`RedisClient instance '${name}' has not been initialized. Call RedisClient.init() first.`);
        }
        return instance;
    }

    /**
     * Resets all singleton instances (primarily for testing environments).
     * @static
     */
    public static resetInstances(): void {
        RedisClient.instances.clear();
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
        let text = await this.get(key);
        let result: T | null = null;
        if (text != null && typeof text === "string") {
            try {
                result = JSON.parse(text);
            } catch (ex) {
                this.logger.debug({ text }, 'Value is not a JSON string');
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
    async getOrSet<T>(key: string, fetchFn: () => Promise<T>, seconds: number = 0): Promise<T> {
        let data = await this.getObject<T>(key);
        if (data !== null && data !== undefined) {
            return data;
        }

        let existingPromise = this.inflight.get(key);
        if (existingPromise) {
            return await existingPromise;
        }

        const fetchPromise = (async () => {
            try {
                const fetchedData = await fetchFn();
                if (fetchedData !== null && fetchedData !== undefined) {
                    await this.set(key, fetchedData, seconds);
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
     */
    async hsetnx(key: string, name: string, value: string | Buffer | number): Promise<void> {
        await this._client.hsetnx(key, name, value);
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
        let arr = await this._client.lrange(key, start, end);
        let list: any[] = [];
        for (let item of arr) {
            if (typeof item === "string") {
                try {
                    list.push(JSON.parse(item));
                } catch (ex) {
                    this.logger.warn({ item }, 'Value is not a JSON string');
                }
            } else {
                list.push(item);
            }
        }
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

        if (this._client) {
            await this._client.quit();
            this.logger.info('Redis client closed');
        }
        if (this.subClient) {
            await this.subClient.quit();
            this.subClient = null;
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
        if (!this.subClient) {
            this.subClient = this._client.duplicate();
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