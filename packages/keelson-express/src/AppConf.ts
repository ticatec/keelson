import { getLogger } from '@ticatec/logger-api';

/**
 * 单例挂在 globalThis 上，而不是类静态字段。
 *
 * 这个包同时发布 CJS 与 ESM 两份产物，两份各自求值一次模块顶层代码。单例若是
 * 类静态字段，一个进程里同时出现两份时就会有两个 AppConf：ESM 侧 `init()` 写入的
 * 配置，CJS 侧 `getInstance()` 读不到，返回 null。Symbol.for 的键在整个 realm 内
 * 唯一，两份产物拿到的是同一个对象。
 */
const STATE_KEY = Symbol.for('@ticatec/keelson-express.app-conf');

interface AppConfState {
    instance: AppConf | null;
}

const state: AppConfState = ((globalThis as any)[STATE_KEY] ??= { instance: null });

/**
 * Application configuration singleton class
 */
export default class AppConf {

    /** Configuration object */
    private readonly conf: any;

    /**
     * Singleton instance, shared across the CommonJS and ESM builds.
     */
    static get instance(): AppConf | null {
        return state.instance;
    }

    static set instance(value: AppConf | null) {
        state.instance = value;
    }

    /**
     * Private constructor for singleton pattern
     * @param conf Configuration object
     */
    private constructor(conf: any) {
        this.conf = conf;
    }

    /**
     * Gets the singleton instance
     * @returns AppConf instance or null if not initialized
     */
    static getInstance(): AppConf | null {
        return state.instance;
    }

    /**
     * Initializes the configuration singleton
     * @param config Configuration object
     * @returns AppConf instance
     */
    static init(config: any): AppConf {
        getLogger('AppConf').info({}, 'Initializing configuration center');
        if (state.instance == null) {
            state.instance = new AppConf(config);
        }
        return state.instance;
    }

    /**
     * Gets configuration value by key (supports dot notation)
     * @param key Configuration key (can use dot notation like 'server.port')
     * @returns Configuration value or undefined if not found
     */
    get(key: string): any {
        if (!key) return undefined;

        const keys = key.split('.');
        let result = this.conf;

        for (const k of keys) {
            // 用 hasOwnProperty 而不是 `in`：`in` 会顺着原型链找，于是
            // get('constructor') / get('toString') 能取到 Object.prototype 上的成员，
            // 配置里并没有这些键。
            if (result != null && typeof result === 'object'
                && Object.prototype.hasOwnProperty.call(result, k)) {
                result = result[k];
            } else {
                return undefined;
            }
        }

        return result;
    }
}
