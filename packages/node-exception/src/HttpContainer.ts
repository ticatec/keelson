import {toHtml, toText} from "./utils.js";
import ErrorResponse from "./ErrorResponse.js";

/**
 * Interface for HTTP container that provides request/response handling utilities.
 * Implementations can customize error handling, IP extraction, path resolution, and environment detection.
 */
export default interface HttpContainer {

    /**
     * Gets the remote client IP address from the request.
     * @param req - Express request object
     * @returns The client IP address as a string
     */
    getRemoteIp(req: any): string;


    /**
     * Sends an error response to the client with appropriate format based on Accept header.
     * @param req - Express request object
     * @param res - Express response object
     * @param statusCode - HTTP status code to send
     * @param data - Error response data to send
     */
    sendError(req: any, res: any, statusCode: number, data: ErrorResponse): void;

    /**
     * Gets the current request path including base URL.
     * @param req - Express request object
     * @returns The full request path as a string
     */
    getPath(req: any): string;

    /**
     * Checks if the current environment is development or test.
     *
     * Implementations MUST derive this from server-side configuration only.
     * Deriving it from anything the client controls (a header, a query
     * parameter, a cookie) would let callers switch stack-trace disclosure on.
     *
     * @param req - Express request object
     * @returns True if in development or test environment, false otherwise
     */
    isDevelopment(req: any): boolean;

}

/**
 * Default implementation of HttpContainer for Express applications.
 * Provides standard Express-compatible request/response handling.
 */
export class ExpressContainer implements HttpContainer {
    /**
     * Checks if the current environment is development or test.
     *
     * The value is resolved from the server's own configuration only - never from
     * the incoming request. It reads Express' `env` application setting
     * (`app.set('env', ...)`, which itself defaults to `process.env.NODE_ENV ||
     * 'development'`) and falls back to `process.env.NODE_ENV` when no Express
     * application is attached to the request.
     *
     * Reading this from a request header would let any client turn stack-trace
     * disclosure on at will, so it must not be done.
     *
     * @param req - Express request object
     * @returns True if the environment is 'development', 'dev' or 'test'
     */
    isDevelopment(req: any): boolean {
        let env: unknown;
        const app = req?.app;
        if (app && typeof app.get === 'function') {
            env = app.get('env');
        }
        if (typeof env !== 'string' || env.length === 0) {
            env = process.env.NODE_ENV;
        }
        if (typeof env !== 'string' || env.length === 0) {
            env = 'development';
        }
        return env === 'development' || env === 'dev' || env === 'test';
    }

    /**
     * Gets the full request path including base URL.
     * @param req - Express request object
     * @returns The combined base URL and path, or just the path if no base URL
     */
    getPath(req: any): string {
        const baseUrl = req.baseUrl || '';
        const path = req.path || '';
        return baseUrl + path;
    }

    /**
     * Gets the remote client IP address from the request.
     * @param req - Express request object
     * @returns The client IP address, or 'unknown' if not available
     */
    getRemoteIp(req: any): string {
        return req.ip || 'unknown';
    }

    /**
     * Sends an error response to the client with content negotiation.
     * Formats the response as HTML, plain text or JSON according to the Accept
     * header's q-values, with JSON as the default for clients that express no
     * preference.
     * @param req - Express request object
     * @param res - Express response object
     * @param statusCode - HTTP status code to send
     * @param err - Error response data to send
     */
    sendError(req: any, res: any, statusCode: number, err: ErrorResponse): void {
        // Error payloads echo request-derived data back to the client; stop
        // browsers from MIME-sniffing a text/plain body into something executable.
        if (typeof res.setHeader === 'function') {
            res.setHeader('X-Content-Type-Options', 'nosniff');
        }
        // The list form is required, not a convenience. Asking `req.accepts('json')`
        // on its own returns 'json' for a browser, because a browser's Accept header
        // ends in `*/*;q=0.8` - so a chain of single-type checks would answer every
        // page request with JSON and never reach the HTML branch at all. Passing the
        // candidates together makes Express weigh the q-values: a browser's
        // `text/html` (q=1.0) beats its `*/*` (q=0.8) and selects 'html', while a
        // client sending only `*/*` (curl) falls through to the first entry, 'json'.
        switch (req.accepts(['json', 'html', 'text'])) {
            case 'html':
                res.type('text/html').status(statusCode).send(toHtml(err));
                break;
            case 'text':
                res.type('text/plain').status(statusCode).send(toText(err));
                break;
            case 'json':
            default:
                res.status(statusCode).json(err);
                break;
        }
    }

}