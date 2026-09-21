import {Request} from "express";
import CommonController from "./CommonController.js";
import Controller from "./Controller.js";
import {CommonUser, RegisteredUser} from "../LoggedUser.js";

/**
 * Interface with search capabilities for tenant use
 * @template T The service type this controller depends on
 * @template U The logged-in user type, defaults to server-wide RegisteredUser
 */
export default class CommonSearchController<T, U extends CommonUser = RegisteredUser> extends CommonController<T, U> {

    /**
     * Search method for querying entities with tenant context
     * @returns Function that handles tenant-specific search requests
     */
    search() {
        return async (req: Request): Promise<any> => {
            const query: any = req.query;
            Controller.debugEnabled && this.logger.debug({ query }, `Path: ${req.path}, query by criteria`);
            this.checkInterface('search');
            return await this.invokeServiceInterface('search', [this.getLoggedUser(req), query]);
        };
    }
}
