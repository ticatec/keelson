/**
 * @fileoverview Express exception handling library that provides standardized error types and error handling middleware.
 * This library offers a comprehensive solution for handling various types of application errors in Express.js applications.
 */

import HttpError, {
    AppError,
    UnauthenticatedError,
    InsufficientPermissionError,
    IllegalParameterError,
    ActionNotFoundError,
    TimeoutError,
    ProxyError,
    ServiceUnavailableError
} from './HttpError.js';
import {handleError, setHttpContainer} from "./handleError.js";
import HttpContainer from "./HttpContainer.js";
import {toHtml, toText} from "./utils.js";
import ErrorResponse from "./ErrorResponse.js";

/**
 * Re-exports all error classes and the main error handling function.
 * This allows consumers to import everything they need from a single entry point.
 */
export default HttpError;
export {
    /** Generic application error with custom error codes */
        AppError,
    /** Error for unauthenticated access attempts */
        UnauthenticatedError,
    /** Error for insufficient permission scenarios */
        InsufficientPermissionError,
    /** Error for invalid or illegal parameters */
        IllegalParameterError,
    /** Error for non-existent routes or actions */
        ActionNotFoundError,
    /** Main error handling middleware function */
        handleError,
    TimeoutError,
    ProxyError,
    ServiceUnavailableError,
    setHttpContainer,
    HttpContainer,
    ErrorResponse,
    toHtml,
    toText
}