/**
 * Standardized error response structure for Express applications.
 * This interface defines the consistent format for all error responses sent to clients.
 */
export default interface ErrorResponse {
    /** The application-specific error code. -1 indicates a generic error */
    code: number,
    /** The IP address of the client that made the request */
    client: string,
    /** The full request path including base URL and route path */
    path: string,
    /** The HTTP method used for the request (GET, POST, PUT, DELETE, etc.) */
    method: string,
    /** Unix timestamp in milliseconds when the error occurred */
    timestamp: number,
    /** Human-readable error message. Null if no specific message is available */
    message: string | null,
    /** Stack trace information. Only included in development environments for debugging */
    stack?: string
}