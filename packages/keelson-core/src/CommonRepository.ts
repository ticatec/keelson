import {getLogger} from "./Logger.js";
import type {Logger} from "./Logger.js";
import beanFactory from "./BeanFactory.js";
import stringUtils from "./StringUtils.js";

/**
 * Abstract base class for Repositories in the Four-Tier Architecture.
 *
 * Repositories encapsulate data access abstraction, coordinate multiple DAOs,
 * assemble POs/DTOs, and manage domain entity lifecycle between the Service layer and DAO layer.
 */
export default abstract class CommonRepository {

    protected readonly logger: Logger;

    protected constructor() {
        this.logger = getLogger(this.constructor.name, "repository");
        this.logger.debug(`Create repository instance:${this.constructor.name}`);
    }

    /**
     * Obtains an instance of the specified DAO from BeanFactory.
     * @template T - Type of the DAO class or interface.
     * @param name - Registered DAO bean name.
     * @throws {Error} If the DAO is not registered in BeanFactory.
     * @returns The resolved DAO instance.
     */
    protected getDAOInstance<T extends object>(name: string): T {
        const bean = beanFactory.createBean<T>(name);
        if (!bean) {
            throw new Error(`DAO "${name}" is not registered in BeanFactory. Please register it via beanFactory.register('${name}', Class) before usage.`);
        }
        return bean;
    }

    /**
     * Generates a 32-character UUID string with hyphens removed.
     * @protected
     * @returns Generated 32-character UUID string.
     */
    protected genID(): string {
        return stringUtils.genID();
    }

    /**
     * Generates a standard 36-character UUID string with hyphens.
     * @protected
     * @returns Generated standard UUID string.
     */
    protected genUUID(): string {
        return stringUtils.uuid();
    }
}