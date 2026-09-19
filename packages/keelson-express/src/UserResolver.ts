import { Request } from "express";
import { getLogger, Logger } from "@ticatec/logger-api";
import { RegisteredUser } from "./LoggedUser.js";

/**
 * Turns an incoming request into the user it acts as, or `undefined` for an anonymous one.
 *
 * Extend {@link HeaderUserResolver} to keep the header pipeline and change one step of it.
 * Extend this class directly when the identity comes from somewhere else entirely - a
 * bearer token, a cookie, a session store.
 *
 * Resolvers must not reject anonymous requests: returning `undefined` is how a public
 * route stays public. Authorization belongs in `CommonRoutes.isValidUser()`.
 */
export default abstract class UserResolver {

    protected get logger(): Logger {
        return getLogger(this.constructor.name);
    }

    /**
     * @param req The incoming request.
     * @returns The resolved user, or `undefined` when the request carries no identity.
     */
    abstract resolve(req: Request): Promise<RegisteredUser | undefined> | RegisteredUser | undefined;
}

/**
 * Default resolver: reads the user an API gateway injected as a request header.
 *
 * > **The header is trusted.** Whatever reaches this service in the `user` header becomes
 * > the caller. That is only safe when the service is unreachable except through a gateway
 * > that sets the header itself and strips any client-supplied copy. Exposed directly, any
 * > client can name itself anyone.
 *
 * Every step is a separate method so a subclass can change one without restating the rest:
 *
 * ```typescript
 * class JwtHeaderResolver extends HeaderUserResolver {
 *     protected override userHeader(): string {
 *         return 'authorization';
 *     }
 *     protected override decode(raw: string): unknown {
 *         return verifyJwt(raw.replace(/^Bearer /, ''));
 *     }
 * }
 *
 * setUserResolver(new JwtHeaderResolver());
 * ```
 */
export class HeaderUserResolver extends UserResolver {

    /**
     * Name of the header carrying the encoded user. Defaults to `user`.
     * @protected
     */
    protected userHeader(): string {
        return 'user';
    }

    /**
     * Name of the header carrying the caller's language, or `null` to ignore language.
     * Defaults to `x-language`.
     * @protected
     */
    protected languageHeader(): string | null {
        return 'x-language';
    }

    /**
     * Turns the raw header value into a user object. Defaults to URL-decoded JSON.
     * Throwing here is fine - {@link resolve} logs it and treats the request as anonymous.
     * @param raw The raw header value.
     * @protected
     */
    protected decode(raw: string): unknown {
        return JSON.parse(decodeURIComponent(raw));
    }

    /**
     * Writes the caller's language onto the user, and onto `actAs` when impersonating.
     * @param user The decoded user.
     * @param language The language header value.
     * @protected
     */
    protected applyLanguage(user: any, language: string): void {
        if (user.actAs) {
            user.actAs.language = language;
        }
        user.language = language;
    }

    /**
     * Reads the first value of a header. Express joins repeated headers, and a client can
     * send the same header twice; taking the first value keeps the result a string either way.
     * @param req The incoming request.
     * @param name The header name.
     * @protected
     */
    protected readHeader(req: Request, name: string): string | undefined {
        const value = req.headers[name.toLowerCase()];
        if (Array.isArray(value)) {
            return value[0];
        }
        return value;
    }

    /**
     * Template method: read, decode, apply language. Subclasses normally override one of
     * the steps above rather than this.
     * @param req The incoming request.
     */
    resolve(req: Request): RegisteredUser | undefined {
        const raw = this.readHeader(req, this.userHeader());
        if (raw == null || raw === '') {
            return undefined;
        }
        let user: any;
        try {
            user = this.decode(raw);
        } catch (ex) {
            this.logger.warn({ error: ex instanceof Error ? ex.message : String(ex), path: req.path },
                'Invalid user header; treating the request as anonymous');
            return undefined;
        }
        if (user == null || typeof user !== 'object') {
            this.logger.warn({ path: req.path }, 'User header did not decode to an object; treating the request as anonymous');
            return undefined;
        }
        const languageHeader = this.languageHeader();
        if (languageHeader) {
            const language = this.readHeader(req, languageHeader);
            if (language) {
                this.applyLanguage(user, language);
            }
        }
        return user as RegisteredUser;
    }
}

/**
 * 解析器挂在 globalThis 上，而不是模块级变量。
 *
 * 这个包同时发布 CJS 与 ESM 两份产物，模块级变量在两份里各有一个。应用在 ESM 侧
 * setUserResolver() 换掉解析器，CJS 侧加载的 RouterHelper 用的仍是默认实现——
 * 自定义的认证方式静默失效，请求全部按匿名处理。
 */
const RESOLVER_KEY = Symbol.for('@ticatec/keelson-express.user-resolver');

interface ResolverState {
    resolver: UserResolver | null;
}

const state: ResolverState = ((globalThis as any)[RESOLVER_KEY] ??= { resolver: null });

/**
 * Replaces the resolver used for every request. Call it once, at the composition root,
 * before the server starts.
 * @param resolver The resolver to install.
 */
export const setUserResolver = (resolver: UserResolver): void => {
    state.resolver = resolver;
};

/**
 * Restores the built-in {@link HeaderUserResolver}.
 */
export const resetUserResolver = (): void => {
    state.resolver = null;
};

/**
 * The resolver in effect, falling back to a {@link HeaderUserResolver}.
 */
export const getUserResolver = (): UserResolver => {
    return (state.resolver ??= new HeaderUserResolver());
};
