/**
 * Base HTTP error class that extends the standard Error class with HTTP status code support.
 * This class serves as the foundation for all HTTP-specific errors in the library.
 */
export default class HttpError extends Error {

    /**
     * The HTTP status code associated with this error.
     * Used by the error handler to set the appropriate HTTP response status.
     * @readonly
     */
    readonly statusCode: number;

    /**
     * Creates a new HttpError instance with a message and HTTP status code.
     *
     * @param message - The error message describing what went wrong
     * @param statusCode - The HTTP status code (e.g., 400, 401, 404, 500)
     * @param options - Standard `ErrorOptions`. Pass `{ cause }` to keep the
     *   underlying failure attached; Node and pino both unwind the chain when
     *   printing, so the original stack stays available for diagnosis.
     */
    constructor(message: string, statusCode: number, options?: ErrorOptions) {
        super(message, options);
        this.name = this.constructor.name;
        this.statusCode = statusCode;
        // Node.js 环境下捕获堆栈信息（仅限服务端，不涉及浏览器兼容性）
        Error.captureStackTrace(this, this.constructor);
    }
}


/**
 * Generic application error with a custom error code and HTTP 500 status.
 * This class is designed for business logic errors and application-specific issues.
 * It always returns HTTP status 500 (Internal Server Error) but allows custom error codes
 * for more granular error identification.
 */
export class AppError extends HttpError {

    /**
     * Private storage for the custom error code.
     * @private
     * @readonly
     */
    private readonly _code: number;

    /**
     * Gets the application-specific error code associated with this error.
     * This code can be used by clients to identify the specific type of error
     * and handle it accordingly.
     * 
     * @returns The numeric error code assigned to this error instance
     */
    get code(): number {
        return this._code;
    }

    /**
     * Creates a new AppError instance with a custom error code and message.
     * The HTTP status code is automatically set to 500 (Internal Server Error).
     *
     * @param code - The numeric error code to associate with this error (e.g., 1001, 2001)
     * @param message - Optional error message describing the error
     * @param options - Standard `ErrorOptions`, e.g. `{ cause: originalError }`
     */
    constructor(code: number, message: string = '', options?: ErrorOptions) {
        super(message || 'Internal server error', 500, options);
        this._code = code;
    }
}


/**
 * Error thrown when an unauthenticated user attempts to access a protected resource.
 * This error indicates that the user needs to authenticate (provide credentials) before proceeding.
 * Always returns HTTP status 401 (Unauthorized).
 */
export class UnauthenticatedError extends HttpError {
    /**
     * Creates a new UnauthenticatedError instance with a predefined message.
     * The error message is set to "Unauthenticated user is accessing the system."
     * and the HTTP status code is automatically set to 401.
     *
     * @param options - Standard `ErrorOptions`, e.g. `{ cause: originalError }`
     */
    constructor(options?: ErrorOptions) {
        super('Unauthenticated user is accessing the system.', 401, options);
    }
}


/**
 * Error thrown when an authenticated user lacks sufficient permissions to perform a specific action.
 * This error indicates that the user is properly authenticated but doesn't have the required 
 * authorization level or role to access the requested resource.
 * Always returns HTTP status 403 (Forbidden).
 */
export class InsufficientPermissionError extends HttpError {
    /**
     * Creates a new InsufficientPermissionError instance with a predefined message.
     * The error message is set to "User doesn't have permission to access this function."
     * and the HTTP status code is automatically set to 403.
     */
    constructor(options?: ErrorOptions) {
        super('User doesn\'t have permission to access this function.', 403, options);
    }
}


/**
 * Error thrown when invalid or illegal parameters are provided to a function or API endpoint.
 * This error indicates that the input parameters don't meet the expected format, type,
 * or validation rules. Always returns HTTP status 400 (Bad Request).
 */
export class IllegalParameterError extends HttpError {
    /**
     * Creates a new IllegalParameterError instance with a custom error message.
     * The HTTP status code is automatically set to 400.
     * 
     * @param message - A descriptive error message explaining which parameter is invalid
     *                 and why it doesn't meet the validation requirements
     */
    constructor(message: string, options?: ErrorOptions) {
        super(message, 400, options);
    }
}


/**
 * Error thrown when a requested web action, route, or resource cannot be found.
 * This error indicates that the requested endpoint, action, or resource doesn't exist 
 * in the application. Always returns HTTP status 404 (Not Found).
 */
export class ActionNotFoundError extends HttpError {
    /**
     * Creates a new ActionNotFoundError instance with a predefined message.
     * The error message is set to "Web action not found."
     * and the HTTP status code is automatically set to 404.
     */
    constructor(options?: ErrorOptions) {
        super('Web action not found.', 404, options);
    }
}


/**
 * Error thrown when a request conflicts with the current state of the resource.
 * Typical causes are a uniqueness violation (an email already registered), an
 * optimistic-locking failure, or an attempt to create something that already
 * exists. The condition is specific to the operation, so a message is required.
 * Always returns HTTP status 409 (Conflict).
 */
export class ConflictError extends HttpError {
    /**
     * Creates a new ConflictError instance with a custom error message.
     * The HTTP status code is automatically set to 409.
     *
     * @param message - A descriptive message explaining what conflicts with what
     * @param options - Standard `ErrorOptions`, e.g. `{ cause: originalError }`
     */
    constructor(message: string, options?: ErrorOptions) {
        super(message, 409, options);
    }
}


/**
 * Error thrown when a client has sent too many requests in a given period.
 * Raised by rate limiters and quota checks. Always returns HTTP status 429
 * (Too Many Requests).
 *
 * Note that this class does not set a `Retry-After` header - that belongs to the
 * response, not the error. Set it on `res` in your rate limiter, or in a custom
 * {@link HttpContainer}.
 */
export class TooManyRequestsError extends HttpError {
    /**
     * Creates a new TooManyRequestsError instance with a predefined message.
     * The error message is set to "Too many requests."
     * and the HTTP status code is automatically set to 429.
     *
     * @param options - Standard `ErrorOptions`, e.g. `{ cause: originalError }`
     */
    constructor(options?: ErrorOptions) {
        super('Too many requests.', 429, options);
    }
}


/**
 * Error thrown when a network request or operation times out.
 * This error indicates that an operation took longer than the allowed time limit.
 * Always returns HTTP status 408 (Request Timeout).
 */
export class TimeoutError extends HttpError {
    /**
     * Creates a new TimeoutError instance with a predefined message.
     * The error message is set to "Network request timeout."
     * and the HTTP status code is automatically set to 408.
     */
    constructor(options?: ErrorOptions) {
        super('Network request timeout.', 408, options);
    }
}

/**
 * Error thrown when there's an issue with a proxy server or gateway.
 * This error indicates problems with intermediate servers between the client and the target server.
 * Always returns HTTP status 502 (Bad Gateway).
 */
export class ProxyError extends HttpError {
    /**
     * Creates a new ProxyError instance with a predefined message.
     * The error message is set to "Proxy error"
     * and the HTTP status code is automatically set to 502.
     */
    constructor(options?: ErrorOptions) {
        super('Proxy error', 502, options);
    }
}

/**
 * Error thrown when a service is temporarily unavailable.
 * This error indicates that the server is currently unable to handle requests,
 * usually due to maintenance, overload, or temporary issues.
 * Always returns HTTP status 503 (Service Unavailable).
 */
export class ServiceUnavailableError extends HttpError {
    /**
     * Creates a new ServiceUnavailableError instance with a predefined message.
     * The error message is set to "Service unavailable error"
     * and the HTTP status code is automatically set to 503.
     */
    constructor(options?: ErrorOptions) {
        super('Service unavailable error', 503, options);
    }
}


