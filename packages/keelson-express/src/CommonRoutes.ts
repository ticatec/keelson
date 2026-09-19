import {Express, NextFunction, Request, RequestHandler, Response, Router} from "express";
import {getLogger, Logger} from "@ticatec/logger-api";
import {UnauthenticatedError} from "@ticatec/node-exception";

/**
 * Abstract base class for defining common routes
 *
 * Provides a structured way to define routes with support for:
 * - User authentication checks
 * - Custom user validation checks
 * - Custom user processing hooks
 * - Global middleware handlers
 *
 * The middleware execution order is:
 * 1. User hook processing (if `getUserHook()` returns a function)
 * 2. Custom user validation check (via `isValidUser()`)
 * 3. Global middleware (if `getGlobalHandler()` returns a handler)
 * 4. Route handlers (defined in `bindRoutes()`)
 *
 * @example
 * ```typescript
 * class UserRoutes extends CommonRoutes {
 *   // Load additional user data
 *   protected getUserHook(): ((user: any) => any) | null {
 *     return async (user) => {
 *       // Load user preferences
 *       user.preferences = await loadPreferences(user.accountCode);
 *       return user;
 *     };
 *   }
 *
 *   // Enable authentication and validation
 *   protected async isValidUser(user: CommonUser): Promise<boolean> {
 *     // Check if user exists and account is active
 *     if (!user) {
 *       return false;
 *     }
 *     const account = await database.getAccount(user.accountCode);
 *     return account && account.status === 'active';
 *   }
 *
 *   // Define routes
 *   protected bindRoutes() {
 *     this.get('/profile', routerHelper.invokeRestfulAction(this.getProfile));
 *   }
 *
 *   private getProfile = async (req: Request) => {
 *     return req['user'];
 *   };
 * }
 * ```
 */
import { RegisteredUser } from "./LoggedUser.js";

/**
 * Abstract base class for defining common routes
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
        // userCheck() 自 0.5.x 起就没有调用点了（0.4.9 还在调），却一直保留着
        // @deprecated "will be removed in a future version" 的文档和三段把它当作
        // 授权检查使用的示例。靠覆写 userCheck 做授权的应用升级后，检查被静默跳过，
        // 而 isValidUser 的默认实现返回 true——每个请求都放行，没有任何报错。
        // 这里恢复调用：覆写了就执行，并与 isValidUser 取与（原本在保护什么，
        // 继续保护什么），同时在绑定时告警一次，提示迁移。
        const legacyUserCheck = this.userCheck !== CommonRoutes.prototype.userCheck;
        if (legacyUserCheck) {
            this.logger.warn({ path, router: this.constructor.name },
                'This router overrides the deprecated userCheck(); it is being called together with isValidUser(). Move the logic into isValidUser() - userCheck() will be removed.');
        }
        this.router.use(async (req: Request, res: Response, next: NextFunction) => {
            try {
                const user = req.user as RegisteredUser | undefined;
                const subject = ((user as any)?.actAs ?? user) as RegisteredUser;
                const valid = await this.isValidUser(subject)
                    && (!legacyUserCheck || await this.userCheck(subject));
                if (!valid) {
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

    /**
     * Performs custom user validation check
     *
     * @deprecated Use {@link isValidUser} instead. This method will be removed in a future version.
     *
     * Override this method to implement custom user validation logic.
     * This method is called after the user hook (if any) and before the global middleware.
     * It receives the user object (or the actAs user if impersonation is active) and
     * should return true if the user is valid, or false/throw an error otherwise.
     *
     * When this method returns false, an UnauthenticatedError is thrown automatically.
     * If an error is thrown, it will be passed to Express's error handling middleware.
     *
     * This is useful for:
     * - Additional authorization checks beyond authentication
     * - Validating user permissions or roles
     * - Checking account status (e.g., active, suspended)
     * - Tenant-specific validation
     * - Custom business rules for user access
     *
     * @returns true if the user passes validation, false otherwise
     * @protected
     *
     * @example
     * ```typescript
     * // Check if user account is active
     * protected async userCheck(user: any): Promise<boolean> {
     *   if (!user) {
     *     return false;
     *   }
     *   const account = await database.getAccount(user.accountCode);
     *   return account && account.status === 'active';
     * }
     * ```
     *
     * @example
     * ```typescript
     * // Check if user has required role
     * protected userCheck(user: any): boolean {
     *   return user && user.roles && user.roles.includes('admin');
     * }
     * ```
     *
     * @example
     * ```typescript
     * // Check tenant-specific access
     * protected async userCheck(user: any): Promise<boolean> {
     *   if (!user || !user.tenant) {
     *     return false;
     *   }
     *   const tenant = await database.getTenant(user.tenant.code);
     *   return tenant && tenant.isActive;
     * }
     * ```
     * @param _user
     */
    protected userCheck(_user: RegisteredUser): boolean | Promise<boolean> {
        return true;
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

    /**
     * Gets the custom user hook function
     *
     * Override this method to provide custom user processing logic.
     * The hook function receives the user object (from `req['user']`) and returns a
     * processed user object. The returned value will replace `req['user']`.
     *
     * This hook is executed in the middleware pipeline **before the user validation check**
     * (via `isValidUser()`). It is wrapped with automatic error handling - any errors thrown
     * will be passed to Express's error handling middleware.
     *
     * **Middleware execution order:**
     * 1. User hook processing (if `getUserHook()` returns a function)
     * 2. User validation check (via `isValidUser()`)
     * 3. Global handler middleware (if `getGlobalHandler()` returns a handler)
     * 4. Route handlers (defined in `bindRoutes()`)
     *
     * This hook is useful for:
     * - Loading additional user-specific data from database
     * - Adding user permissions or roles
     * - Enriching user profile information
     * - Setting request context based on user
     * - Preparing user data before validation
     *
     * @returns A function that processes the user object, or null if no hook is needed
     */
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