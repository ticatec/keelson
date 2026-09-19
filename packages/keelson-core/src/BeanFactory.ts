/**
 * Creates a lazy-loading proxy: the actual instance is only constructed when its properties or methods are accessed for the first time.
 * All subsequent accesses are forwarded to the cached singleton instance.
 *
 * This design defers bean instance construction to actual usage time,
 * avoiding ReferenceError / circular dependency exceptions during module loading.
 */
function createBeanProxy(beanClass: any, name: string, creating: Set<string>): any {
    let instance: any = null;
    const getInstance = (): any => {
        if (instance == null) {
            if (creating.has(name)) {
                const chain = [...creating, name].join(' -> ');
                throw new Error(`Circular dependency detected: ${chain}`);
            }
            creating.add(name);
            try {
                instance = new beanClass();
            } finally {
                creating.delete(name);
            }
        }
        return instance;
    };
    return new Proxy({}, {
        get: (_target, prop) => {
            const target = getInstance();
            const value = target[prop];
            return typeof value === 'function' ? value.bind(target) : value;
        },
        set: (_target, prop, value) => {
            getInstance()[prop] = value;
            return true;
        },
        has: (_target, prop) => prop in getInstance(),
        deleteProperty: (_target, prop) => delete getInstance()[prop],
        ownKeys: () => Reflect.ownKeys(getInstance()),
        getOwnPropertyDescriptor: (_target, prop) =>
            Reflect.getOwnPropertyDescriptor(getInstance(), prop),
        getPrototypeOf: () => Reflect.getPrototypeOf(getInstance())
    });
}

export class BeanFactory {
    #classes: Map<string, any> = new Map();
    #proxies: Map<string, any> = new Map();
    #creating: Set<string> = new Set();

    /**
     * Registers a Bean class.
     * Does not instantiate immediately; construction happens lazily upon method invocation on the proxy obtained via createBean().
     *
     * @param name - The name of the Bean.
     * @param beanClass - Constructor function of the Bean class.
     */
    register(name: string, beanClass: any): void {
        this.#classes.set(name, beanClass);
        this.#proxies.delete(name);
    }

    /**
     * Returns a proxy for the specified Bean. Calling with the same name always returns the same proxy.
     * The internal real instance is lazily constructed on first access and reused thereafter.
     *
     * @param name - The name of the Bean.
     * @returns The Bean proxy instance, or undefined if not registered.
     */
    createBean<T>(name: string): T | undefined {
        const cached = this.#proxies.get(name);
        if (cached != null) {
            return cached as T;
        }
        const beanClass = this.#classes.get(name);
        if (beanClass == null) {
            return undefined;
        }
        const proxy = createBeanProxy(beanClass, name, this.#creating);
        this.#proxies.set(name, proxy);
        return proxy as T;
    }
}

const beanFactory: BeanFactory = new BeanFactory();

export default beanFactory;