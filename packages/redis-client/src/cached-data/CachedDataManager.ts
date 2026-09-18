import AbstractCachedData from "./AbstractCachedData.js";

export interface CachedDataConstructor {
    new (...args: any[]): AbstractCachedData<any>;
}

/**
 * Cache Data Manager singleton managing different types of cached data instances.
 * @class CachedDataManager
 * @since 0.1.3
 */
export default class CachedDataManager {

    /**
     * Map storing constructor-to-instance mappings.
     * @protected
     */
    protected map: Map<CachedDataConstructor, AbstractCachedData<any>>;
    
    /**
     * Singleton instance.
     * @private
     * @static
     */
    private static instance?: CachedDataManager;

    /**
     * Gets the CachedDataManager singleton instance.
     * @static
     * @returns {CachedDataManager} CachedDataManager instance.
     */
    static getInstance(): CachedDataManager {
        if (!CachedDataManager.instance) {
            CachedDataManager.instance = new CachedDataManager();
        }
        return CachedDataManager.instance;
    }

    /**
     * Resets the singleton instance (primarily for testing).
     * @static
     */
    static resetInstance(): void {
        CachedDataManager.instance = undefined;
    }

    /**
     * Private constructor for singleton pattern.
     * @private
     */
    private constructor() {
        this.map = new Map<CachedDataConstructor, AbstractCachedData<any>>();
    }

    /**
     * Registers a cached data instance with its constructor class.
     * @param {CachedDataConstructor} ctor - Constructor function of the cached data class.
     * @param {AbstractCachedData<any>} instance - Cached data instance.
     */
    register(ctor: CachedDataConstructor, instance: AbstractCachedData<any>): void {
        this.map.set(ctor, instance);
    }

    /**
     * Retrieves the cached data instance associated with the given class constructor.
     * Infers the exact return type automatically from the constructor.
     * @template T - Subclass of AbstractCachedData.
     * @param ctor - Class constructor.
     * @returns Instance of T or undefined if not registered.
     */
    get<T extends AbstractCachedData<any>>(
        ctor: (abstract new (...args: any[]) => T) | CachedDataConstructor
    ): T | undefined {
        return this.map.get(ctor as CachedDataConstructor) as T | undefined;
    }
}