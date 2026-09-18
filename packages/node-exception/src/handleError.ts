import ErrorResponse from "./ErrorResponse.js";
import HttpError, {AppError} from './HttpError.js';
import HttpContainer, {ExpressContainer} from "./HttpContainer.js";

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
