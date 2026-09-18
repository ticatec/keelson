import {getLogger} from "@ticatec/logger-api";
import ErrorResponse from "./ErrorResponse.js";
import HttpError, {AppError} from './HttpError.js';
import HttpContainer, {ExpressContainer} from "./HttpContainer.js";

/**
 * `getLogger` returns a lazily-resolving proxy, so holding it at module scope is
 * safe: the concrete logger is looked up on the first call, not here. That keeps
 * this module independent of whether `setLoggerProvider()` has run yet.
 */
const logger = getLogger('ErrorHandler');

/**
 * The active container is held on `globalThis` under a well-known symbol.
 *
 * This package ships a CommonJS build and an ESM build. Node treats them as two
 * separate module instances, so a module-scoped variable would give an
 * application that mixes `require()` and `import` two independent containers:
 * one set via `setHttpContainer()` and one left at its default. Anchoring the
 * state to the global registry keeps a single container per process regardless
 * of how the package is loaded.
 */
interface ContainerState {
    container: HttpContainer;
}

const STATE_KEY = Symbol.for('@ticatec/node-exception.state');

const state: ContainerState = ((globalThis as any)[STATE_KEY] ??= {
    container: new ExpressContainer()
});

/**
 * Describes the request for the log line, without letting a misbehaving container
 * break error handling.
 */
const describeRequest = (req: any): string => {
    const method = req?.method || 'GET';
    let path: string;
    try {
        path = state.container.getPath(req) || 'unknown';
    } catch {
        path = 'unknown';
    }
    return `${method} ${path}`;
};

/**
 * Logs the error before it is turned into a response.
 *
 * The split is by status class, not by error type:
 *
 * - **5xx** (`AppError`, `ProxyError`, `ServiceUnavailableError`, any subclass
 *   returning >= 500) - `error`, **with the stack**. The server failed. The client
 *   gets no stack in production, so this record is the only thing that says why,
 *   and on which line. Silencing it because the type is "declared" would leave a
 *   production 500 with nothing but `POST /pay 500` in the access log.
 * - **4xx** - `debug`. A rejected login or a bad parameter is the client's problem;
 *   at volume these would drown out real faults. Visible when debugging, silent in
 *   production.
 * - **Anything that is not an `HttpError`** - `error` with the stack. It reached the
 *   handler unexpectedly, and this record is usually its only trace.
 *
 * The error object is passed as the first argument rather than nested in a context
 * object: that is the one shape both pino (which serialises it through its `err`
 * serializer, following `cause` as it goes) and the console fallback (which prints
 * `error.stack`) render fully.
 *
 * Logging must never be able to break error handling, so every failure here is
 * swallowed.
 */
const logApplicationError = (req: any, err: any): void => {
    try {
        if (err instanceof HttpError) {
            const where = `Handled ${err.statusCode} on ${describeRequest(req)}`;
            if (err.statusCode >= 500) {
                logger.error(err, where);
            } else {
                logger.debug(err, where);
            }
        } else if (err instanceof Error) {
            logger.error(err, `Unhandled error on ${describeRequest(req)}`);
        } else {
            logger.error({thrown: err}, `Unhandled non-Error throwable on ${describeRequest(req)}`);
        }
    } catch {
        // A broken logger must not turn a handled error into an unhandled one.
    }
};

/**
 * Sends a standardized error response to the client with comprehensive error information.
 * @param req - Express request object containing client and request information
 * @param res - Express response object used to send the error response
 * @param err - The error object to be processed and sent to the client
 */
const sendApplicationError = (req: any, res: any, err: any): void => {
    const statusCode = err instanceof HttpError ? err.statusCode : 500;
    const code = err instanceof AppError ? err.code : -1;
    const message = err instanceof Error ? err.message : 'Unknown error';
    const data: ErrorResponse = {
        code,
        client: state.container.getRemoteIp(req) || 'unknown',
        path: state.container.getPath(req) || 'unknown',
        method: req.method || 'GET',
        timestamp: (new Date()).getTime(),
        message
    };
    if (state.container.isDevelopment(req)) {
        data.stack = err instanceof Error ? err.stack : undefined;
    }
    state.container.sendError(req, res, statusCode, data);
}

/**
 * Express error handling middleware that processes all application errors.
 * This function serves as the main entry point for error handling in Express applications.
 *
 * Every error is logged first: 5xx and unknown errors at `error` level with their
 * stack, 4xx at `debug` level.
 *
 * @param err - The error object that was thrown or passed to next()
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next function. It is only called when the response has
 *   already started, which is the one case this middleware cannot handle: writing
 *   a status line at that point throws `ERR_HTTP_HEADERS_SENT`, so the error is
 *   delegated to Express' built-in handler, which closes the connection. It is
 *   optional - callers that invoke this handler directly may pass `null` - and in
 *   that case a response that has already started simply ends the handling.
 *   The parameter must stay declared regardless: Express identifies
 *   error-handling middleware by arity (`fn.length === 4`), so dropping it would
 *   turn this into ordinary middleware.
 */
const handleError = (err: any, req: any, res: any, next?: any): void => {
    logApplicationError(req, err);
    if (res && res.headersSent) {
        // Nothing can be written once the response has started - not a status line,
        // not a header. Delegating to Express is the best that can be done, and when
        // there is no `next` to delegate to (callers such as RouterHelper pass
        // `null`), returning is still the only safe move: falling through would
        // throw ERR_HTTP_HEADERS_SENT out of the error handler itself.
        if (typeof next === 'function') {
            next(err);
        }
        return;
    }
    sendApplicationError(req, res, err);
}

/**
 * Replaces the HTTP container used by {@link handleError}.
 * Call this once at the composition root, before the server starts accepting requests.
 *
 * @param container - The container implementation to use
 */
const setHttpContainer = (container: HttpContainer): void => {
    state.container = container;
}

/**
 * Returns the HTTP container currently in use. Primarily useful for testing and diagnostics.
 */
const getHttpContainer = (): HttpContainer => state.container;

export {handleError, setHttpContainer, getHttpContainer};
