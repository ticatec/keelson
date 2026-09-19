import {getLogger, Logger} from "@ticatec/logger-api";
import {Request} from "express";
import LoggedUser, { RegisteredUser } from "../LoggedUser.js";

/**
 * Base Controller providing logger and logged user access
 */
export default abstract class Controller {

    /** Flag to enable debug logging */
    static debugEnabled: boolean = false;

    /** Logger instance for this controller */
    protected get logger(): Logger {
        return getLogger(this.constructor.name);
    }

    /**
     * Constructor for base controller
     * @protected
     */
    protected constructor() {
    }

    /**
     * Gets the current logged user, if acting as another user, returns the acted user,
     * returns null for requests without user injection.
     * Automatically resolves to the server-wide RegisteredUser type.
     * @param req Express request object
     * @returns The current user typed as RegisteredUser or null if no user is logged in
     */
    protected getLoggedUser = (req: Request): RegisteredUser => {
        const user: LoggedUser = req['user'];
        return (user?.actAs || user) as RegisteredUser;
    }
}