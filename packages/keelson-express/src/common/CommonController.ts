import {ActionNotFoundError, IllegalParameterError} from "@ticatec/node-exception";
import BaseController from "./BaseController.js";
import beanValidator, {ValidationRules} from "@ticatec/bean-validator";
import {RestfulFunction} from "../RouterHelper.js";
import {Request} from "express";
import Controller from "./Controller.js";

/**
 * Controller class that implements Create/Read/Update/Delete operations
 * @template T The service type this controller depends on
 */
export default abstract class CommonController<T> extends BaseController<T> {

    /**
     * Constructor for common controller
     * @param service The service instance to inject
     * @protected
     */
    protected constructor(service: T) {
        super(service);
    }


    /**
     * Default validation rules for entity operations (can be overridden by subclass)
     * @protected
     */
    protected getRules(): ValidationRules {
        return null;
    }

    /**
     * Validation rules for create operation (defaults to getRules)
     * @protected
     */
    protected getCreateRules(): ValidationRules {
        return this.getRules();
    }

    /**
     * Validation rules for update operation (defaults to getRules)
     * @protected
     */
    protected getUpdateRules(): ValidationRules {
        return this.getRules();
    }

    /**
     * Validates data when creating a new entity
     * @param req Express request object
     * @param data The data to validate
     * @protected
     */
    protected validateCreateEntity(req: Request, data: any) {
        const rules = this.getCreateRules();
        this.doValidate(data, rules);
    }

    /**
     * Validates data when updating an entity
     * @param req Express request object
     * @param data The data to validate
     * @protected
     */
    protected validateUpdateEntity(req: Request, data: any) {
        const rules = this.getUpdateRules();
        this.doValidate(data, rules);
    }

    /**
     * Executes entity data validation against specified rules
     * @param data The data to validate
     * @param rules Validation rules
     * @protected
     */
    protected doValidate(data: any, rules: ValidationRules) {
        if (!rules || !Array.isArray(rules) || rules.length === 0) {
            return;
        }
        const validator: any = (beanValidator as any).validate ? beanValidator : (beanValidator as any).default;
        const result = validator.validate(data, rules);
        if (!result.valid) {
            Controller.debugEnabled && this.logger.debug({error: result.errorMessage}, 'Invalid entity data');
            throw new IllegalParameterError(result.errorMessage);
        }
    }

    /**
     * Creates new entity endpoint
     * @returns RESTful function for creating new entities
     */
    createNew(): RestfulFunction {
        return async (req: Request): Promise<any> => {
            return this._createNew(req);
        }
    }

    /**
     * Updates entity endpoint
     * @returns RESTful function for updating entities
     */
    update(): RestfulFunction {
        return async (req: Request): Promise<any> => {
            return this._update(req);
        }
    }

    /**
     * Deletes entity endpoint
     * @returns RESTful function for deleting entities
     */
    del(): RestfulFunction {
        return async (req: Request): Promise<any> => {
            return this._del(req);
        }
    }

    /**
     * Checks if a service interface method exists
     * @param name The method name to check
     * @protected
     */
    protected checkInterface(name: string): void {
        if (this.service[name] == null) {
            this.logger.warn(`Current service does not have interface: ${name}`);
            throw new ActionNotFoundError();
        }
    }

    /**
     * Invokes service interface by name
     * @param name The method name to invoke
     * @param args Arguments to pass to the method
     * @returns Promise resolving to the method result
     * @protected
     */
    protected async invokeServiceInterface(name: string, args: Array<any> = []): Promise<any> {
        return await this.service[name](...args);
    }

    protected buildNewEntry(req: Request): any {
        return req.body;
    }

    protected buildUpdatedEntry(req: Request): any {
        return req.body;
    }

    /**
     * Creates a new entity
     * @param req Express request object
     * @returns Promise resolving to the created entity
     * @protected
     */
    protected _createNew(req: Request): Promise<any> {
        const data: any = this.buildNewEntry(req);
        Controller.debugEnabled && this.logger.debug({data}, `${req.method} ${req.originalUrl} Request to create an entity`);
        this.checkInterface('createNew');
        this.validateCreateEntity(req, data);
        return this.invokeServiceInterface('createNew', this.getCreateNewArguments(req));
    }

    /**
     * Updates an entity
     * @param req Express request object
     * @returns Promise resolving to the updated entity
     * @protected
     */
    protected _update(req: Request): Promise<any> {
        const data: any = this.buildUpdatedEntry(req);
        Controller.debugEnabled && this.logger.debug({data}, `${req.method} ${req.originalUrl} Request to update an entity`);
        this.checkInterface('update');
        this.validateUpdateEntity(req, data);
        return this.invokeServiceInterface('update', this.getUpdateArguments(req));
    }

    /**
     * Deletes an entity
     * @param _req Express request object
     * @returns Promise resolving when entity is deleted
     * @protected
     */
    protected _del(_req: Request): Promise<any> {
        // Please implement delete interface in subclass, otherwise system exception will be thrown
        this.logger.warn('Current service does not have delete interface');
        throw new ActionNotFoundError();
    }

    /**
     * Gets arguments for creating new entity
     * @param req Express request object
     * @returns Array of arguments to pass to service create method
     * @protected
     */
    protected getCreateNewArguments(req: Request): Array<any> {
        return [this.getLoggedUser(req), req.body];
    }

    /**
     * Gets arguments for updating entity
     * @param req Express request object
     * @returns Array of arguments to pass to service update method
     * @protected
     */
    protected getUpdateArguments(req: Request): Array<any> {
        return [this.getLoggedUser(req), req.body];
    }
}