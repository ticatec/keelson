import {getLogger} from "./Logger.js";
import type {Logger} from "./Logger.js";
import beanFactory from "./BeanFactory.js";

export type BeanLoader = () => Promise<any>;

export default class Beans {

    private static instance: Beans;
    /**
     * 已注册的 Bean 类型。此前写成 `= {}`，被推断为 `{}`，于是用字符串索引它在
     * strict 下报错，而在 strict 之外 `v.loader` 的类型一路是 any，写错成员名也没人管。
     */
    private _types: Record<string, { loader: BeanLoader }> = {};
    protected logger: Logger = getLogger('Beans');

    private constructor() {
    }

    /**
     * Gets the singleton instance of Beans.
     * @static
     * @returns Beans singleton instance.
     */
    static getInstance(): Beans {
        if (Beans.instance == null) {
            Beans.instance = new Beans();
        }
        return Beans.instance;
    }

    /**
     * Registers a Bean type with its dynamic loader function.
     * @param name - The name of the Bean.
     * @param loader - The loader function returning a Promise.
     */
    register(name: string, loader: BeanLoader) {
        this.logger.debug(`Registering bean type: ${name}`);
        this._types[name] = {loader};
    }

    /**
     * Loads all registered Bean types into BeanFactory.
     * @returns Promise resolving when loading completes.
     */
    async load(): Promise<void> {
        const names = Object.keys(this._types);
        this.logger.debug({ count: names.length, beans: names }, 'Loading registered bean types');
        for (const t in this._types) {
            const v = this._types[t];
            if (v.loader != null) {
                const classLoader = (await v.loader()).default;
                beanFactory.register(t, classLoader);
            }
        }
    }
}