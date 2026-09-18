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
 * Anything that is an {@link HttpError} is a **declared outcome**: the application
 * raised it on purpose, chose the status code, and the client is being told exactly
 * what happened. There is nothing to diagnose, and at any real traffic volume these
 * would drown out the records that do matter - reporting requests is the access
 * log's job, not the error handler's. They are not logged at all.
 *
 * Everything else reached the handler unexpectedly and is logged at `error` level
 * **with its stack**, because this record is usually the only trace such a failure
 * leaves behind. A value that is not even an `Error` gets the same treatment,
 * wrapped so the logger has something to serialise.
 *
 * The error object is passed as the first argument rather than nested in a context
 * object: that is the one shape both pino (which serialises it through its `err`
 * serializer) and the console fallback (which prints `error.stack`) render fully.
 *
 * Logging must never be able to break error handling, so every failure here is
 * swallowed.
 */
const logApplicationError = (req: any, err: any): void => {
    try {
        if (err instanceof HttpError) {
            return;
        }
        if (err instanceof Error) {
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
 * Errors that are not {@link HttpError}s are logged first, at error level and with
 * their stack. `HttpError`s are declared outcomes and are not logged.
 *
 * @param err - The error object that was thrown or passed to next()
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next function. It is only called when the response has
 *   already started, which is the one case this middleware cannot handle: writing
 *   a status line at that point throws `ERR_HTTP_HEADERS_SENT`, so the error is
 *   delegated to Express' built-in handler, which closes the connection.
 *   The parameter must also stay declared regardless: Express identifies
 *   error-handling middleware by arity (`fn.length === 4`), so dropping it would
 *   turn this into ordinary middleware.
 */
const handleError = (err: any, req: any, res: any, next?: any): void => {
    logApplicationError(req, err);
    if (res && res.headersSent && typeof next === 'function') {
        next(err);
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
