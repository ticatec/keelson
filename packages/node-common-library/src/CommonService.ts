import DBConnection from "./db/DBConnection.js";
import beanFactory from "./BeanFactory.js";
import { getLogger } from "./Logger.js";
import type { Logger } from "./Logger.js";
import TransactionManager from './TransactionManager.js';
import {Propagation} from "./db/Transaction.js";

const wrappedPrototypes = new WeakSet<object>();

const IS_WRAPPED = Symbol('transaction:is_wrapped');

export default abstract class CommonService {
    protected readonly logger: Logger;

    protected constructor() {
        this.logger = getLogger(this.constructor.name, "service");
        this.logger.debug(`Created Service instance: ${this.constructor.name}`);
        this._applyTransactionAspect();
    }

    /**
     * Retrieves the database connection for the current transaction context.
     */
    protected async getDBConnection(): Promise<DBConnection> {
        const conn = TransactionManager.getCurrentConnection();
        if (!conn) {
            throw new Error('No connection in current context. Ensure the calling Service method has @Transaction.');
        }
        return conn;
    }

    /**
     * Obtains a lazy proxy for the specified Repository instance.
     * @param name - Registered Repository bean name.
     */
    protected getRepositoryInstance<T extends object>(name: string): T {
        const bean = beanFactory.createBean<T>(name);
        if (!bean) {
            throw new Error(`Repository "${name}" is not registered in BeanFactory. Please register it via beanFactory.register('${name}', Class) before usage.`);
        }
        return bean;
    }

    private _applyTransactionAspect(): void {
        const targetProto = Object.getPrototypeOf(this);
        if (wrappedPrototypes.has(targetProto)) {
            return;
        }

        let proto = targetProto;
        const methodMetadata: Map<string, { proto: any, propagation: Propagation }> = new Map();

        while (proto && proto !== Object.prototype) {
            const methodNames = Object.getOwnPropertyNames(proto)
                .filter(name => name !== 'constructor' && typeof (proto as any)[name] === 'function');
            for (const name of methodNames) {
                const isTx = Reflect.getMetadata('transaction:enabled', proto, name);
                if (isTx && !methodMetadata.has(name)) {
                    const propagation = Reflect.getMetadata('transaction:propagation', proto, name) ?? Propagation.REQUIRED;
                    methodMetadata.set(name, { proto, propagation });
                }
            }
            proto = Object.getPrototypeOf(proto);
        }

        for (const [name, meta] of methodMetadata.entries()) {
            const originalMethod = targetProto[name] as ((...args: any[]) => any);
            if (typeof originalMethod !== 'function' || (originalMethod as any)[IS_WRAPPED]) {
                continue;
            }

            const wrappedMethod = async function (this: any, ...args: any[]) {
                return await TransactionManager.execute(meta.propagation, async () => {
                    return await originalMethod.apply(this, args);
                });
            };
            (wrappedMethod as any)[IS_WRAPPED] = true;
            targetProto[name] = wrappedMethod;
        }

        wrappedPrototypes.add(targetProto);
    }
}