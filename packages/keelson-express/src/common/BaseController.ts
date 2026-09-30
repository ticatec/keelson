import {Request} from "express";
import Controller from "./Controller.js";
import {
    CommonUser,
    RegisteredUser,
    getEffectiveUser as extractEffectiveUser,
    getLoggedUser as extractLoggedUser,
    getRealUser as extractRealUser,
    isImpersonating as checkImpersonating
} from "../LoggedUser.js";

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
     * Gets the effective user for business logic. If acting as another user (impersonation),
     * returns the impersonated user; otherwise returns the logged-in user.
     * Automatically resolves to type U (defaults to server-wide RegisteredUser).
     * @param req Express request object
     * @returns The effective user typed as U or undefined/null if no user is injected
     */
    protected getEffectiveUser = (req: Request): U => {
        return extractEffectiveUser<U>(req);
    };

    /**
     * Gets the current effective user. Alias for {@link getEffectiveUser}.
     * @param req Express request object
     * @returns The current user typed as U or undefined/null if no user is injected
     */
    protected getLoggedUser = (req: Request): U => {
        return extractLoggedUser<U>(req);
    };

    /**
     * Gets the real authenticated user (the actual person/credential logged in),
     * without unwrapping impersonation. Useful for audit logging and operator checks.
     * @param req Express request object
     * @returns The real logged-in user or undefined if not authenticated
     */
    protected getRealUser = (req: Request): RegisteredUser | undefined => {
        return extractRealUser(req);
    };

    /**
     * Checks whether the current request is operating in user impersonation mode.
     * @param req Express request object
     * @returns True if the request is impersonating another user
     */
    protected isImpersonating = (req: Request): boolean => {
        return checkImpersonating(req);
    };
}