import ErrorResponse from "./ErrorResponse.js";

/**
 * HTML encodes a string to prevent XSS attacks.
 * @param str - The string to encode
 * @returns The HTML-encoded string
 */
const htmlEncode = (str: string): string => {
    if (!str) return "";
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;")
        .replace(/\r?\n/g, "<br/>");
}


/**
 * Converts an ErrorResponse object to an HTML formatted string.
 * @param err - The error response object to convert
 * @returns HTML formatted error information
 */
export const toHtml = (err: ErrorResponse): string => {
    return `<!DOCTYPE html>
<html>
<head>
    <title>Error ${err.code}</title>
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
        <h1>Error Code: ${err.code}</h1>
        <div><strong>Client:</strong> ${err.client}</div>
        <div><strong>Method:</strong> ${err.method}</div>
        <div><strong>Path:</strong> ${err.path}</div>
        <div><strong>Timestamp:</strong> ${err.timestamp}</div>
        <div><strong>Message:</strong> ${htmlEncode(err.message)}</div>
        ${err.stack ? '<div class="stack"><strong>Stack Trace:</strong><br/>' + htmlEncode(err.stack) + '</div>' : ''}
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