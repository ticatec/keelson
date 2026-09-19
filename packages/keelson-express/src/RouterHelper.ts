import {NextFunction, Request, Response} from "express";
import {ActionNotFoundError, handleError, UnauthenticatedError} from '@ticatec/node-exception';
import {getLogger} from "@ticatec/logger-api";
import {getUserResolver} from "./UserResolver.js";


/**
 * Function signature for RESTful API handlers
 *
 * These handlers receive a Request object and return any value.
 * The returned value will be automatically serialized as JSON.
 *
 * @example
 * ```typescript
 * const handler: RestfulFunction = async (req) => {
 *   return { message: 'Hello' };
 * };
 * ```
 */
export type RestfulFunction = (req: Request) => any;

/**
 * Function signature for control handlers
 *
 * These handlers receive both Request and Response objects,
 * allowing manual control over the response.
 *
 * @example
 * ```typescript
 * const handler: ControlFunction = async (req, res) => {
 *   res.status(201).json({ message: 'Created' });
 * };
 * ```
 */
export type ControlFunction = (req: Request, res: Response) => any;

/**
 * Internal class providing middleware and utilities for Express routing
 *
 * This class is not exported directly. Use the singleton instance `routerHelper` instead.
 *
 * @internal
 */
class RouterHelper {

    private get logger() {
        return getLogger('RouterHelper');
    }

    /**
     * Sets HTTP response header to JSON format
     *
     * Middleware that sets the Content-Type header to application/json.
     *
     * @param req Express request object
     * @param res Express response object
     * @param next Express next function
     */
    setJsonHeader(req: Request, res: Response, next: NextFunction): void {
        res.header('Content-Type', 'application/json');
        next();
    }


    /**
     * Sets response headers to disable caching
     *
     * Middleware that adds cache control headers to prevent client-side caching.
     * Sets Cache-Control, Expires, and Pragma headers.
     *
     * @param req Express request object
     * @param res Express response object
     * @param next Express next function
     */
    setNoCache(req: Request, res: Response, next: NextFunction): void {
        res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
        res.header('Expires', '-1');
        res.header('Pragma', 'no-cache');
        next();
    }

    /**
     * Invokes a RESTful operation and wraps the result in JSON format for the client
     *
     * This middleware wrapper automatically handles:
     * - Awaiting async function execution
     * - Serializing the result as JSON (returns 204 No Content if result is null)
     * - Catching errors and passing them to error handling middleware
     *
     * @param func The RESTful function to execute
     * @returns Express middleware function
     *
     * @example
     * ```typescript
     * import { routerHelper } from '@ticatec/keelson-express';
     *
     * class UserRoutes extends CommonRoutes {
     *   protected bindRoutes() {
     *     this.get('/users/:id', routerHelper.invokeRestfulAction(this.getUser));
     *   }
     *
     *   private getUser = async (req: Request) => {
     *     const user = await database.findUserById(req.params.id);
     *     return user; // Automatically serialized as JSON
     *   };
     * }
     * ```
     */
    invokeRestfulAction(func: RestfulFunction): any {
        return async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
            try {
                const result = await func(req);
                if (result != null) {
                    res.json(result);
                } else {
                    res.status(204).send();
                }
            } catch (ex) {
                // 不再在这里补一条日志：@ticatec/node-exception 的 handleError 已经
                // 按状态码分级记录（5xx 带栈记 error，4xx 记 debug），这里再打一条
                // 只会让同一个错误在日志里出现两次。
                handleError(ex, req, res, null);
            }
        }
    }

    /**
     * Invokes an asynchronous controller function with error handling
     *
     * Use this for controllers that need manual control over the Response object.
     * Automatically catches errors and passes them to error handling middleware.
     *
     * @param func The controller function to execute
     * @returns Express middleware function
     *
     * @example
     * ```typescript
     * import { routerHelper } from '@ticatec/keelson-express';
     *
     * class FileRoutes extends CommonRoutes {
     *   protected bindRoutes() {
     *     this.get('/download/:id', routerHelper.invokeController(this.downloadFile));
     *   }
     *
     *   private downloadFile = async (req: Request, res: Response) => {
     *     const file = await getFile(req.params.id);
     *     res.setHeader('Content-Type', 'application/octet-stream');
     *     res.send(file);
     *   };
     * }
     * ```
     */
    invokeController(func: ControlFunction) {
        return async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
            try {
                await func(req, res);
            } catch (ex) {
                handleError(ex, req, res, null);
            }
        }
    }


    /**
     * Handles invalid request paths by throwing ActionNotFoundError
     *
     * Use this as a catch-all handler for undefined routes.
     *
     * @returns Express middleware function for handling 404 errors
     *
     * @example
     * ```typescript
     * import { routerHelper } from '@ticatec/keelson-express';
     *
     * class MyServer extends BaseServer {
     *   protected async startWebServer(webConf: any) {
     *     // ... setup routes
     *     app.use(routerHelper.actionNotFound());
     *   }
     * }
     * ```
     */
    actionNotFound() {
        return (req: Request, res: Response, _next: NextFunction) => {
            handleError(new ActionNotFoundError(), req, res, null);
        }
    }

    /**
     * Resolves the caller through the configured {@link UserResolver} and attaches it to
     * `req.user`. A request that carries no identity is left anonymous - that is how a
     * public route stays public.
     *
     * 提取逻辑此前直接写在这里：固定的 user 头、固定的 x-language、固定的
     * decodeURIComponent + JSON.parse。想换个头名、换个编码或换一套认证方式，
     * 只能连这个单例一起改。现在交给 UserResolver，应用侧用 setUserResolver() 替换。
     * @param req Express request object
     * @protected
     */
    protected async resolveUser(req: Request): Promise<void> {
        const user = await getUserResolver().resolve(req);
        if (user != null) {
            req.user = user;
            this.logger.debug({ path: req.path, impersonating: (user as any).actAs != null },
                'User attached to request');
        }
    }

    /**
     * Middleware to retrieve user information from headers
     *
     * This middleware parses user information from the 'user' header and sets it to req['user'].
     * It does NOT require authentication - if the header is missing, the request continues
     * without a user object.
     *
     * Use this middleware for routes that should work both with and without authentication.
     *
     * @returns Express middleware function
     *
     * @example
     * ```typescript
     * import { routerHelper } from '@ticatec/keelson-express';
     *
     * // Use globally for all routes (non-invasive)
     * app.use(routerHelper.retrieveUser());
     *
     * // Use for specific routes
     * app.get('/public/content', routerHelper.retrieveUser(), (req, res) => {
     *   if (req['user']) {
     *     res.json({ message: `Hello ${req['user'].name}` });
     *   } else {
     *     res.json({ message: 'Hello anonymous' });
     *   }
     * });
     * ```
     */
    retrieveUser() {
        return async (req: Request, _res: Response, next: any) => {
            await this.resolveUser(req);
            next();
        }
    }


    /**
     * Middleware to check if user is authenticated
     *
     * This middleware first calls retrieveUser() to parse user from headers,
     * then checks if req['user'] exists. If not, throws UnauthenticatedError.
     *
     * Use this middleware for routes that require authentication.
     *
     * @returns Express middleware function that validates user authentication
     *
     * @example
     * ```typescript
     * import { routerHelper } from '@ticatec/keelson-express';
     *
     * class ProtectedRoutes extends CommonRoutes {
     *   protected bindRoutes() {
     *     // Require authentication for all routes in this router
     *     this.get('/profile', routerHelper.checkLoggedUser(), async (req, res) => {
     *       res.json(req['user']);
     *     });
     *   }
     * }
     * ```
     */
    checkLoggedUser() {
        return async (req: Request, res: Response, next: any) => {
            await this.resolveUser(req);
            if (req.user == null) {
                this.logger.warn({path: req.path, method: req.method}, 'Unauthenticated request');
                handleError(new UnauthenticatedError(), req, res, null);
            } else {
                this.logger.debug({ path: req.path, method: req.method }, 'Authenticated request');
                next();
            }
        }
    }

}

// Create and export singleton instance
const routerHelper = new RouterHelper();
export default routerHelper;