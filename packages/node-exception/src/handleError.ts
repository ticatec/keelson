import ErrorResponse from "./ErrorResponse.js";
import {AppError} from './HttpError.js';
import HttpError from "./HttpError.js";
import HttpContainer, {ExpressContainer} from "./HttpContainer.js";


/**
 * Sends a standardized error response to the client with comprehensive error information.
 * @param req - Express request object containing client and request information
 * @param res - Express response object used to send the error response
 * @param err - The error object to be processed and sent to the client
 */
const sendApplicationError = (req: any, res: any, err: any): void => {
    const statusCode = err instanceof HttpError ? (err as HttpError).statusCode : 500;
    const code = err instanceof AppError ? (err as AppError).code : -1;
    const message = (err instanceof Error) ? (err as Error).message : 'Unknown error';
    const data: ErrorResponse = {
        code,
        client: httpContainer?.getRemoteIp(req) || 'unknown',
        path: httpContainer?.getPath(req) || 'unknown',
        method: req.method || 'GET',
        timestamp: (new Date()).getTime(),
        message
    };
    if (httpContainer.isDevelopment(req)) {
        data.stack = err.stack;
    }
    if (httpContainer) {
        httpContainer.sendError(req, res, statusCode, data);
    }
}

/**
 * Express error handling middleware that processes all application errors.
 * This function serves as the main entry point for error handling in Express applications.
 * @param err - The error object that was thrown or passed to next()
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next function (required for error middleware signature)
 */
const handleError = (err: any, req: any, res: any, next?: any): void => {
    sendApplicationError(req, res, err);
}

let httpContainer: HttpContainer = new ExpressContainer();

const setHttpContainer = (container: HttpContainer): void => {
    httpContainer = container;
}

export {handleError, setHttpContainer};