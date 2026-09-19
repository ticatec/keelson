import { getLogger } from "@ticatec/logger-api";
import type { Logger } from "@ticatec/logger-api";
import AbstractCachedData from "./AbstractCachedData.js";

/**
 * 用作注册键的类。
 *
 * 允许抽象构造签名：业务里常见的做法是定义一个抽象基类（如 `UserCache`）当 token，
 * 注册其派生实现——此前只接受具体构造函数，这种写法会直接编译报错。
 */
export type CachedDataConstructor = abstract new (...args: any[]) => AbstractCachedData<any>;

/**
 * Cache Data Manager singleton managing different types of cached data instances.
 * @class CachedDataManager
 * @since 0.1.3
 */
/**
 * 单例挂在 globalThis 上，理由与 RedisClient 的注册表相同：CJS 与 ESM 两份构建是
 * 两个模块实例，类静态属性会分裂成两个互不相干的管理池。
 */
interface ManagerState {
    instance?: CachedDataManager;
}

const MANAGER_KEY = Symbol.for('@ticatec/redis-client.cached-data-manager');

const managerState: ManagerState = ((globalThis as any)[MANAGER_KEY] ??= {});

export default class CachedDataManager {

    /**
     * `getLogger` 返回惰性解析的代理，因此放在模块作用域是安全的。
     * @private
     */
    private static readonly logger: Logger = getLogger('CachedDataManager');

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
    private static get instance(): CachedDataManager | undefined {
        return managerState.instance;
    }

    private static set instance(value: CachedDataManager | undefined) {
        managerState.instance = value;
    }

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
        if (this.map.has(ctor)) {
            // 重复注册会静默替换掉先前那个实例，而两处注册方多半都以为自己的那个
            // 还在生效——这类问题在运行期极难定位。
            CachedDataManager.logger.warn(
                { cachedData: ctor.name },
                'Re-registering a cached data class; the previous instance is replaced'
            );
        }
        this.map.set(ctor, instance);
    }

    /**
     * Retrieves the cached data instance associated with the given class constructor.
     * Infers the exact return type automatically from the constructor.
     * @template T - Subclass of AbstractCachedData.
     * @param ctor - Class constructor.
     * @returns Instance of T or undefined if not registered.
     */
    get<T extends AbstractCachedData<any>>(ctor: abstract new (...args: any[]) => T): T | undefined {
        return this.map.get(ctor as CachedDataConstructor) as T | undefined;
    }
}