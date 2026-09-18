import ErrorResponse from "./ErrorResponse.js";

/**
 * HTML-escapes an arbitrary value so it can be safely interpolated into markup.
 *
 * Every field of an {@link ErrorResponse} must pass through this function before
 * being written into the HTML error page: several of them (`client`, `path`,
 * `method`) are derived from the incoming request and are therefore
 * attacker-controlled. `client`, in particular, resolves to `req.ip`, which is
 * taken from the `X-Forwarded-For` header whenever the application enables
 * Express' `trust proxy` setting.
 *
 * @param value - The value to escape. `null` / `undefined` become an empty string.
 * @returns The HTML-escaped string representation of the value.
 */
const escapeHtml = (value: unknown): string => {
    if (value === null || value === undefined) return "";
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/**
 * HTML-escapes a value and renders its line breaks as `<br/>`.
 * Used for multi-line fields such as the message and the stack trace.
 *
 * @param value - The value to escape.
 * @returns The HTML-escaped string with line breaks converted to `<br/>`.
 */
const escapeHtmlMultiline = (value: unknown): string =>
    escapeHtml(value).replace(/\r?\n/g, "<br/>");


/**
 * Converts an ErrorResponse object to an HTML formatted string.
 * All interpolated values are HTML-escaped.
 *
 * @param err - The error response object to convert
 * @returns HTML formatted error information
 */
export const toHtml = (err: ErrorResponse): string => {
    const code = escapeHtml(err.code);
    return `<!DOCTYPE html>
<html>
<head>
    <title>Error ${code}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .error-container { border: 1px solid #ccc; padding: 20px; border-radius: 5px; }
        h1 { color: #d32f2f; }
        div { margin: 10px 0; }
        .stack { background: #f5f5f5; padding: 10px; border-radius: 3px; font-family: monospace; white-space: pre-wrap; }
    </style>
</head>
<body>
    <div class="error-container">
        <h1>Error Code: ${code}</h1>
        <div><strong>Client:</strong> ${escapeHtml(err.client)}</div>
        <div><strong>Method:</strong> ${escapeHtml(err.method)}</div>
        <div><strong>Path:</strong> ${escapeHtml(err.path)}</div>
        <div><strong>Timestamp:</strong> ${escapeHtml(err.timestamp)}</div>
        <div><strong>Message:</strong> ${escapeHtmlMultiline(err.message)}</div>
        ${err.stack ? '<div class="stack"><strong>Stack Trace:</strong><br/>' + escapeHtmlMultiline(err.stack) + '</div>' : ''}
    </div>
</body>
</html>`;
}

/**
 * Converts an ErrorResponse object to a plain text formatted string.
 * @param err - The error response object to convert
 * @returns Plain text formatted error information
 */
export const toText = (err: ErrorResponse): string => {
    let text = `Code: ${err.code}\nClient: ${err.client}\nMethod: ${err.method}\nPath: ${err.path}\nTimestamp: ${err.timestamp}`;
    if (err.message) {
        text += `\nMessage: ${err.message}`;
    }
    if (err.stack) {
        text += `\n---Stack Trace---\n${err.stack}`;
    }
    return text;
}
