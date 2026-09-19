/**
 * Common user interface representing basic user information
 */
export interface CommonUser {

}

/**
 * Interface for currently logged in user
 */
export default interface LoggedUser extends CommonUser {

    /**
     * User being acted as (for user impersonation)
     */
    actAs?: CommonUser;
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
    ? (U extends CommonUser ? U : LoggedUser)
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
