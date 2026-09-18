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
     */
    constructor(message: string, statusCode: number) {
        super(message);
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
     */
    constructor(code: number, message: string = '') {
        super(message || 'Internal server error', 500);
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
     */
    constructor() {
        super('Unauthenticated user is accessing the system.', 401);
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
    constructor() {
        super('User doesn\'t have permission to access this function.', 403);
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
    constructor(message: string) {
        super(message, 400);
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
    constructor() {
        super('Web action not found.', 404);
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
    constructor() {
        super('Network request timeout.', 408);
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
    constructor() {
        super('Proxy error', 502);
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
    constructor() {
        super('Service unavailable error', 503);
    }
}


