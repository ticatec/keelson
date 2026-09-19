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