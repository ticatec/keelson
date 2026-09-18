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
    ConflictError,
    TooManyRequestsError,
    TimeoutError,
    ProxyError,
    ServiceUnavailableError
} from './HttpError.js';
import {handleError, setHttpContainer, getHttpContainer} from "./handleError.js";
import type HttpContainer from "./HttpContainer.js";
import {ExpressContainer} from "./HttpContainer.js";
import {toHtml, toText} from "./utils.js";
import type ErrorResponse from "./ErrorResponse.js";

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
    /** Error for a request conflicting with the resource's current state */
        ConflictError,
    /** Error for a client exceeding a rate limit or quota */
        TooManyRequestsError,
    /** Main error handling middleware function */
        handleError,
    TimeoutError,
    ProxyError,
    ServiceUnavailableError,
    setHttpContainer,
    getHttpContainer,
    ExpressContainer,
    toHtml,
    toText
}

/** Interfaces are exported as types so the package stays safe under
 *  `isolatedModules` / transpile-only toolchains (esbuild, swc, ts-jest). */
export type {HttpContainer, ErrorResponse};