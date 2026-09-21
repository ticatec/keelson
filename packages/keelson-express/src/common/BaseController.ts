import {Request} from "express";
import Controller from "./Controller.js";
import LoggedUser, {CommonUser, RegisteredUser} from "../LoggedUser.js";

/**
 * Abstract base service controller class providing business service injection and logged-in user access.
 * @template T The business service type this controller depends on
 * @template U The logged-in user type, defaults to server-wide RegisteredUser
 */
export default abstract class BaseController<T, U extends CommonUser = RegisteredUser> extends Controller {
    /** The service instance this controller uses */
    protected readonly service: T;

    /**
     * Constructor for base controller
     * @param service The service instance to inject
     * @protected
     */
    protected constructor(service: T) {
        super();
        this.service = service;
    }

    /**
     * Gets the current logged user. If acting as another user (impersonation), returns the acted user.
     * Automatically resolves to type U (defaults to server-wide RegisteredUser).
     * @param req Express request object
     * @returns The current user typed as U or undefined/null if no user is injected
     */
    protected getLoggedUser = (req: Request): U => {
        const user: LoggedUser | undefined = req.user;
        return (user?.actAs || user) as unknown as U;
    }
}