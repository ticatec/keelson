import {Express, NextFunction, Request, RequestHandler, Response, Router} from "express";
import {getLogger, Logger} from "@ticatec/logger-api";
import {UnauthenticatedError} from "@ticatec/node-exception";
import { RegisteredUser } from "./LoggedUser.js";

/**
 * Base class for a group of routes mounted under one path.
 *
 * Middleware runs in this order, and every step is optional except the last:
 *
 * 1. `getUserHook()` — enrich `req.user` (load permissions, profile, tenant)
 * 2. `isValidUser()` — authorize; returning false produces a 401
 * 3. `getGlobalHandler()` — anything that applies to the whole group
 * 4. the routes registered in `bindRoutes()`
 *
 * @example
 * ```typescript
 * class UserRoutes extends AuthenticatedRoutes {
 *     protected async isValidUser(user: RegisteredUser): Promise<boolean> {
 *         return (await accounts.find(user.accountCode))?.status === 'active';
 *     }
 *
 *     protected bindRoutes() {
 *         this.get('/profile', routerHelper.invokeRestfulAction(req => req.user));
 *     }
 * }
 * ```
 */
export default class CommonRoutes {

    /** Express router instance */
    private readonly router: Router;
    /** Logger instance for this routes class */
    protected get logger(): Logger {
        return getLogger(this.constructor.name);
    }

    /**
     * Constructor for common routes
     * @param mergeParams Whether to merge params from parent router (default: false)
     */
    constructor(mergeParams: boolean = false) {
        this.router = Router({mergeParams});
    }

    /**
     * Binds this router to the Express application with the given path
     *
     * The binding process follows this order:
     * 1. If `getUserHook()` returns a function, adds user hook middleware (with error handling)
     * 2. Adds custom user validation middleware (via `isValidUser()`)
     * 3. If `getGlobalHandler()` returns a handler, adds global middleware
     * 4. Calls `bindRoutes()` to register route definitions
     * 5. Mounts the router to the Express app at the specified path
     *
     * @param app Express application instance
     * @param path The route path to bind this router to
     */
    async bind(app: Express, path: string): Promise<void> {
        this.logger.debug({ path }, 'Binding router to path');
        const userHook = this.getUserHook();
        if (userHook) {
            this.router.use(async (req: Request, _res: Response, next: NextFunction) => {
                try {
                    if (req.user) {
                        req.user = await userHook(req.user);
                    }
                    next();
                } catch (error) {
                    next(error);
                }
            });
        }
        this.router.use(async (req: Request, res: Response, next: NextFunction) => {
            try {
                const user = req.user as RegisteredUser | undefined;
                const subject = ((user as any)?.actAs ?? user) as RegisteredUser;
                if (!await this.isValidUser(subject)) {
                    // 这里原先记的是整个 user 对象——账号、角色、租户，网关塞进头里的
                    // 一切都会落到日志上。校验失败要定位的是哪条路由被拒了，不是这个人是谁。
                    this.logger.debug({ path, impersonating: (user as any)?.actAs != null }, 'User validation failed');
                    next(new UnauthenticatedError());
                } else {
                    next();
                }
            } catch (error) {
                next(error);
            }
        });
        const globalHandler = this.getGlobalHandler();
        if (globalHandler) {
            this.logger.info({ path }, 'Setting global handler middleware');
            this.router.use(globalHandler as RequestHandler);
        }
        this.bindRoutes();
        app.use(path, this.router);
        this.logger.info({ path }, 'Router bound successfully');
    }

    protected isValidUser(_user: RegisteredUser): boolean | Promise<boolean> {
        return true;
    }

    protected getUserHook(): ((user: RegisteredUser) => RegisteredUser | Promise<RegisteredUser>) | null {
        return null;
    }

    /**
     * Abstract method for binding routes
     *
     * Override this method to define your routes using:
     * - `get(path, handler)` - Register a GET route
     * - `post(path, handler)` - Register a POST route
     * - `put(path, handler)` - Register a PUT route
     * - `delete(path, handler)` - Register a DELETE route
     *
     * @protected
     *
     * @example
     * ```typescript
     * protected bindRoutes() {
     *   // Simple route
     *   this.get('/users', async (req, res) => {
     *     res.json({ users: [] });
     *   });
     *
     *   // Using routerHelper for automatic error handling
     *   this.post('/users', routerHelper.invokeRestfulAction(async (req) => {
     *     return await createNewUser(req.body);
     *   }));
     *
     *   // Route with parameters
     *   this.get('/users/:id', async (req, res) => {
     *     res.json({ id: req.params.id });
     *   });
     * }
     * ```
     */
    protected bindRoutes() {

    }

    /**
     * Gets the global handler middleware for this router
     *
     * Override this method to add custom middleware that applies to all routes in this router.
     * This middleware is executed after the user hook (if any) and before route handlers.
     *
     * This can be used for:
     * - Additional logging
     * - Request validation
     * - Permissions checking
     * - Rate limiting
     * - Custom headers
     *
     * @returns Express middleware handler or null if no global handler is needed
     * @protected
     *
     * @example
     * ```typescript
     * protected getGlobalHandler(): RequestHandler | null {
     *   return async (req, res, next) => {
     *     // Log all requests
     *     console.log(`Processing ${req.method} ${req.path}`);
     *     next();
     *   };
     * }
     * ```
     *
     * @example
     * ```typescript
     * protected getGlobalHandler(): RequestHandler | null {
     *   return async (req, res, next) => {
     *     // Check API version
     *     const version = req.headers['api-version'];
     *     if (!version) {
     *       throw new IllegalParameterError('API version is required');
     *     }
     *     next();
     *   };
     * }
     * ```
     */
    protected getGlobalHandler(): RequestHandler | null {
        return null;
    }

    /**
     * Registers a GET route
     * @param path Route path (can include parameters like `/users/:id`)
     * @param handler Request handler function
     *
     * @example
     * ```typescript
     * // Simple handler
     * this.get('/users', (req, res) => {
     *   res.json({ users: [] });
     * });
     *
     * // With routerHelper for automatic error handling
     * this.get('/users/:id', routerHelper.invokeRestfulAction(async (req) => {
     *   const user = await getUserById(req.params.id);
     *   return user;
     * }));
     * ```
     */
    get(path: string, handler: RequestHandler) {
        this.router.get(path, handler);
        this.logger.debug({ method: 'GET', path }, 'Registered route');
    }

    /**
     * Registers a POST route
     * @param path Route path
     * @param handler Request handler function
     *
     * @example
     * ```typescript
     * // Simple handler
     * this.post('/users', (req, res) => {
     *   const user = createUser(req.body);
     *   res.status(201).json(user);
     * });
     *
     * // With routerHelper
     * this.post('/users', routerHelper.invokeRestfulAction(async (req) => {
     *   return await createUser(req.body);
     * }));
     * ```
     */
    post(path: string, handler: RequestHandler) {
        this.router.post(path, handler);
        this.logger.debug({ method: 'POST', path }, 'Registered route');
    }

    /**
     * Registers a PUT route
     * @param path Route path (can include parameters like `/users/:id`)
     * @param handler Request handler function
     *
     * @example
     * ```typescript
     * this.put('/users/:id', routerHelper.invokeRestfulAction(async (req) => {
     *   return await updateUser(req.params.id, req.body);
     * }));
     * ```
     */
    put(path: string, handler: RequestHandler) {
        this.router.put(path, handler);
        this.logger.debug({ method: 'PUT', path }, 'Registered route');
    }

    /**
     * Registers a DELETE route
     * @param path Route path (can include parameters like `/users/:id`)
     * @param handler Request handler function
     *
     * @example
     * ```typescript
     * this.delete('/users/:id', routerHelper.invokeRestfulAction(async (req) => {
     *   await deleteUser(req.params.id);
     *   res.status(204).send();
     * }));
     * ```
     */
    delete(path: string, handler: RequestHandler) {
        this.router.delete(path, handler);
        this.logger.debug({ method: 'DELETE', path }, 'Registered route');
    }

}

/**
 * Subclass of CommonRoutes that requires an authenticated user by default.
 * Automatically rejects requests with 401 UnauthenticatedError if user is not logged in.
 */
export class AuthenticatedRoutes extends CommonRoutes {
    protected isValidUser(user: RegisteredUser): boolean | Promise<boolean> {
        return user != null;
    }
}