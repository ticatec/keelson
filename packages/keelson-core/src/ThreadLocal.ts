import { AsyncLocalStorage } from 'async_hooks';
import { getLogger } from './Logger.js';
import type { Logger } from './Logger.js';

/** `getLogger` 返回惰性解析的代理，放在模块作用域是安全的。 */
const logger: Logger = getLogger('ThreadLocal', 'db');

/**
 * Thread-local context storage backed by AsyncLocalStorage.
 */
export default class ThreadLocal<T extends object> {
    private storage = new AsyncLocalStorage<T>();

    /**
     * Runs a synchronous or asynchronous function within the specified context store.
     * Preserves context across all async await operations inside fn.
     */
    run<R>(value: T, fn: () => R): R {
        return this.storage.run(value, fn);
    }

    /**
     * Retrieves the current context store.
     */
    get(): T | undefined {
        return this.storage.getStore();
    }

    /**
     * Merges values into the current context store.
     */
    set(value: T): void {
        const store = this.get();
        if (store) {
            Object.assign(store, value);
        } else {
            // 此前是裸 console.warn，绕过了 logger-api 这条统一管线：既不受
            // LOG_LEVEL 控制，也进不了应用配置的日志目的地。
            logger.warn(
                {},
                'ThreadLocal.set() called outside of an active context (storage.run()); the value was ignored'
            );
        }
    }
}