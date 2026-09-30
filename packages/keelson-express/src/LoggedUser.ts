import { Request } from "express";

/**
 * Common user interface representing basic user information
 */
export interface CommonUser {

}

/**
 * Interface for currently logged in user
 * @template T Type of the impersonated user, defaults to CommonUser
 */
export default interface LoggedUser<T extends CommonUser = CommonUser> extends CommonUser {

    /**
     * The impersonated user when in user impersonation mode
     */
    impersonatedUser?: T;
}

/**
 * Registry interface for server-wide custom user model.
 * Applications can extend this interface via module augmentation:
 *
 * ```typescript
 * declare module '@ticatec/keelson-express' {
 *     interface CustomUserRegistry {
 *         user: MyCustomAppUser;
 *     }
 * }
 * ```
 */
export interface CustomUserRegistry {
    // Extensible by application via declaration merging
}

/**
 * Resolved server-wide logged in user type.
 * Automatically resolves to CustomUserRegistry['user'] if defined, otherwise falls back to LoggedUser.
 */
export type RegisteredUser = CustomUserRegistry extends { user: infer U }
    ? (U extends LoggedUser ? U : LoggedUser)
    : LoggedUser;

/**
 * Declares `req.user` on Express's `Request`, typed as {@link RegisteredUser}.
 *
 * 框架把网关注入的用户放在 `req.user` 上，但 Express 的 `Request` 类型里没有这个
 * 属性，于是整个代码库一直写 `req['user']` 来绕开类型检查——括号写法关掉的不只是
 * 这一处报错，连拼错属性名、用错类型都一并放过了。这里一次性声明清楚，使用方
 * 也跟着拿到类型。
 *
 * 需要自定义用户模型时，扩展 {@link CustomUserRegistry} 即可，无需重复声明这段。
 */
declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace Express {
        interface Request {
            user?: RegisteredUser;
        }
    }
}

/**
 * Resolves the effective user for business logic. If acting as another user (impersonation),
 * returns the impersonated user; otherwise returns the logged-in user.
 *
 * @param req Express request object
 * @returns The effective user typed as U or undefined if no user is present
 */
export function getEffectiveUser<U extends CommonUser = RegisteredUser>(req: Request): U {
    const user: LoggedUser | undefined = req.user;
    const impersonated = user?.impersonatedUser;
    return (impersonated || user) as unknown as U;
}

/**
 * Gets the current effective user. Alias for {@link getEffectiveUser}.
 *
 * @param req Express request object
 * @returns The current user typed as U or undefined if no user is present
 */
export function getLoggedUser<U extends CommonUser = RegisteredUser>(req: Request): U {
    return getEffectiveUser<U>(req);
}

/**
 * Gets the real authenticated user (the actual person/credential logged in),
 * without unwrapping impersonation. Useful for audit logging and operator checks.
 *
 * @param req Express request object
 * @returns The real logged-in user or undefined if not authenticated
 */
export function getRealUser(req: Request): RegisteredUser | undefined {
    return req.user;
}

/**
 * Checks whether the current request is operating in user impersonation mode.
 *
 * @param req Express request object
 * @returns True if the request is impersonating another user
 */
export function isImpersonating(req: Request): boolean {
    const user = req.user as LoggedUser | undefined;
    return user?.impersonatedUser != null;
}
