import RedisClient from "../RedisClient.js";

/**
 * Key generator function type definition.
 * @template T - Target cache object type.
 * @param key - Key partial object.
 * @returns Redis key string.
 */
export type GetKey<T> = (key: Partial<T>) => string;

/**
 * Abstract base class for cached data items.
 * Provides standard cache-aside, load, save, clean, and getOrSet operations.
 * @abstract
 * @template T - Cached entity type.
 */
export default abstract class AbstractCachedData<T> {

    /**
     * Singleton RedisClient instance name.
     * @protected
     */
    protected readonly instanceName: string;

    /**
     * Lazy getter for the target RedisClient instance.
     * @protected
     * @returns {RedisClient}
     */
    protected get redisClient(): RedisClient {
        return RedisClient.getInstance(this.instanceName);
    }
    
    /**
     * Key generator function.
     * @protected
     */
    protected readonly getKey: GetKey<T>;
    
    /**
     * Cache TTL in seconds (0 means no expiration).
     * @protected
     */
    protected readonly ttl: number;

    /**
     * Constructs AbstractCachedData.
     * @protected
     * @param getKey - Function generating Redis key from entity partial.
     * @param ttl - Cache TTL in seconds (default 0 for no expiration).
     * @param instanceName - RedisClient instance name (default 'default').
     */
    protected constructor(getKey: GetKey<T>, ttl: number = 0, instanceName: string = 'default') {
        this.getKey = getKey;
        this.ttl = ttl;
        this.instanceName = instanceName;
    }

    /**
     * Loads entity from cache.
     * @param key - Key partial object.
     * @returns Promise resolving to cached entity object or null.
     */
    async load(key: Partial<T>): Promise<T | null> {
        return await this.redisClient.getObject<T>(this.getKey(key));
    }

    /**
     * Cache-Aside mechanism: loads from cache, invoking fetchFn on miss to populate cache.
     * Utilizes in-flight Promise deduplication to protect against Cache Stampede.
     * @param key - Key partial object.
     * @param fetchFn - Data fetch provider function.
     * @returns Promise resolving to entity.
     */
    async getOrSet(key: Partial<T>, fetchFn: () => Promise<T>): Promise<T> {
        const redisKey = this.getKey(key);
        return await this.redisClient.getOrSet(redisKey, fetchFn, this.ttl);
    }

    /**
     * Evicts cache for the specified key.
     * @param key - Key partial object.
     */
    async clean(key: Partial<T>): Promise<void> {
        await this.redisClient.del(this.getKey(key));
    }

    /**
     * Saves entity data to cache with configured TTL.
     * @param data - Entity object to save.
     */
    async save(data: T): Promise<void> {
        // load() 读的是 getObject，因此写入必须走对称的 setObject——用 set() 时，
        // 字符串型的 T 会被原样存入，再也读不回来。
        await this.redisClient.setObject(this.getKey(data), data, this.ttl);
    }
}