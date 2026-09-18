import { AsyncLocalStorage } from 'async_hooks';

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
            console.warn('ThreadLocal.set() called outside of an active thread context (storage.run()). Value ignored.');
        }
    }
}