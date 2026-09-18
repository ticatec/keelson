import {getLogger, Logger} from "./Logger.js";
import beanFactory from "./BeanFactory.js";

export type BeanLoader = () => Promise<any>;

export default class Beans {

    private static instance: Beans;
    private _types = {};
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
        this.logger.debug(this._types, 'Loading registered bean types');
        for (const t in this._types) {
            const v = this._types[t];
            if (v.loader != null) {
                const classLoader = (await v.loader()).default;
                beanFactory.register(t, classLoader);
            }
        }
    }
}