# @ticatec/node-exception

[中文](./README_CN.md) | English

[![Version](https://img.shields.io/npm/v/@ticatec/node-exception)](https://www.npmjs.com/package/@ticatec/node-exception)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-≥14.0.0-green)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue)](https://www.typescriptlang.org/)

Production-ready Express error handling middleware with standardized HTTP error types, centralized exception management, and automatic content negotiation for REST APIs. Type-safe, with logging injected through the `@ticatec/logger-api` contract.

## 🚀 Features

- **🎯 Standardized Error Types**: Eight predefined error classes covering common HTTP scenarios
- **🔧 Express Middleware**: Drop-in error handling middleware with zero configuration
- **📋 Consistent Response Format**: Uniform error responses with comprehensive request context
- **🎨 Content Negotiation**: Automatic response formatting (JSON, HTML, plain text)
- **🔍 Development Support**: Stack trace inclusion in development environments
- **📝 Built-in Logging**: Unknown errors logged with their stack via `@ticatec/logger-api`
- **📘 TypeScript First**: Full TypeScript support with complete type definitions
- **🌐 IP Detection**: Automatic client and server IP address detection
- **⚡ Minimal Dependencies**: `@ticatec/logger-api` (itself dependency-free) is the only runtime peer
- **✨ Type-Safe**: Improved type safety with null checks and strict typing
- **🛡️ Null-Safe**: Automatic default values for optional properties
- **🔄 Dual Module Format**: Ships both ESM and CommonJS builds via conditional `exports`

## 📦 Installation

```bash
npm install @ticatec/node-exception @ticatec/logger-api
```

`@ticatec/logger-api` is a peer dependency - the zero-dependency logging contract
the package writes its error records against. See [Logging](#-logging).

## 🔄 Module System

This library publishes **both ESM and CommonJS** builds and selects the right one automatically via Node's conditional `exports` map. Use whichever import style matches your project — no extra configuration needed.

### ESM (e.g. `"type": "module"` in your `package.json`)

```javascript
import { handleError, AppError, UnauthenticatedError } from '@ticatec/node-exception';
```

### CommonJS

```javascript
const { handleError, AppError, UnauthenticatedError } = require('@ticatec/node-exception');
```

**Subpath imports** are also available for both formats:

```javascript
// ESM
import HttpError from '@ticatec/node-exception/HttpError';
import { toHtml } from '@ticatec/node-exception/utils';

// CommonJS
const HttpError = require('@ticatec/node-exception/HttpError');
const { toHtml } = require('@ticatec/node-exception/utils');
```

> ℹ️ **Mixing import styles is safe.** The active container is stored on `globalThis` under `Symbol.for('@ticatec/node-exception.state')`, so the CommonJS and ESM builds share one container. A container registered through `require()` is visible to code that loaded the package with `import`, and vice versa.

## 🔧 Quick Start

```javascript
import express from 'express';
import { handleError, AppError, UnauthenticatedError } from '@ticatec/node-exception';

const app = express();

// Your API routes
app.get('/api/protected', (req, res, next) => {
    try {
        if (!req.headers.authorization) {
            throw new UnauthenticatedError();
        }
        res.json({ message: 'Success!' });
    } catch (error) {
        next(error);
    }
});

// Error handling middleware (must be the last middleware)
app.use((err, req, res, next) => {
    handleError(err, req, res);
});

app.listen(3000, () => {
    console.log('Server running on port 3000');
});
```

## 📚 Error Types & Usage

### 🔑 AppError
Generic application error with custom error codes for business logic errors.

```javascript
// Database errors
throw new AppError(1001, "Database connection failed");

// Business logic errors
throw new AppError(2001, "Insufficient account balance");

// Validation errors
throw new AppError(3001, "User email already exists");
```

### 🚫 UnauthenticatedError
For authentication failures (HTTP 401).

```javascript
// Missing authentication
if (!req.headers.authorization) {
    throw new UnauthenticatedError();
}

// Invalid token
if (!isValidToken(token)) {
    throw new UnauthenticatedError();
}
```

### 🔒 InsufficientPermissionError
For authorization failures (HTTP 403).

```javascript
// Role-based access control
if (!user.hasRole('admin')) {
    throw new InsufficientPermissionError();
}

// Resource ownership
if (resource.ownerId !== user.id) {
    throw new InsufficientPermissionError();
}
```

### ❌ IllegalParameterError
For input validation failures (HTTP 400).

```javascript
// Email validation
if (!isValidEmail(email)) {
    throw new IllegalParameterError("Invalid email format");
}

// Required field validation
if (!userId) {
    throw new IllegalParameterError("User ID is required");
}

// Range validation
if (age < 0 || age > 150) {
    throw new IllegalParameterError("Age must be between 0 and 150");
}
```

### 🔍 ActionNotFoundError
For non-existent routes or resources (HTTP 404).

```javascript
// Route not found
if (!routeExists(req.path)) {
    throw new ActionNotFoundError();
}

// Resource not found
if (!user) {
    throw new ActionNotFoundError();
}
```

### ⏱️ TimeoutError
For request timeouts (HTTP 408).

```javascript
// Database query timeout
if (Date.now() - startTime > TIMEOUT_LIMIT) {
    throw new TimeoutError();
}

// API request timeout
const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new TimeoutError()), 5000);
});
```

### 🌐 ProxyError
For proxy server issues (HTTP 502).

```javascript
// Proxy server failure
if (!proxyResponse.ok) {
    throw new ProxyError();
}

// Gateway error
if (!upstreamServer.isHealthy()) {
    throw new ProxyError();
}
```

### 🚫 ServiceUnavailableError
For service unavailability (HTTP 503).

```javascript
// Service maintenance
if (isMaintenanceMode()) {
    throw new ServiceUnavailableError();
}

// Server overload
if (activeConnections > maxConnections) {
    throw new ServiceUnavailableError();
}
```

## 🎨 Response Format & Content Negotiation

The library automatically handles content negotiation based on the `Accept` header:

### JSON Response (Default)
```json
{
    "code": -1,
    "client": "192.168.1.50",
    "path": "/api/users",
    "method": "GET",
    "timestamp": 1699123456789,
    "message": "Unauthenticated user is accessing the system.",
    "stack": "Error: ... (development only)"
}
```

### HTML Response
When `Accept: text/html` is requested, a professionally styled HTML5 page is returned:

```html
<!DOCTYPE html>
<html>
<head>
    <title>Error 401</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .error-container { border: 1px solid #ccc; padding: 20px; border-radius: 5px; }
        h1 { color: #d32f2f; }
        .stack { background: #f5f5f5; padding: 10px; font-family: monospace; }
    </style>
</head>
<body>
    <div class="error-container">
        <h1>Error Code: 401</h1>
        <div><strong>Client:</strong> 192.168.1.50</div>
        <div><strong>Method:</strong> GET</div>
        <div><strong>Path:</strong> /api/users</div>
        <div><strong>Timestamp:</strong> 1699123456789</div>
        <div><strong>Message:</strong> Unauthenticated user is accessing the system.</div>
    </div>
</body>
</html>
```

### Plain Text Response
When `Accept: text/plain` is requested:
```
Code: 401
Client: 192.168.1.50
Method: GET
Path: /api/users
Timestamp: 1699123456789
Message: Unauthenticated user is accessing the system.
---Stack Trace---
Error: UnauthenticatedError...
```

## 📊 Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `code` | number | Application-specific error code (-1 for generic errors) |
| `client` | string | Client IP address (defaults to 'unknown' if unavailable) |
| `path` | string | Full request path (baseUrl + path) |
| `method` | string | HTTP method (GET, POST, PUT, DELETE, etc.) |
| `timestamp` | number | Unix timestamp in milliseconds |
| `message` | string \| null | Human-readable error message |
| `stack` | string | Stack trace (development environments only) |

## 📝 Logging

Every error passing through `handleError` is logged through
[`@ticatec/logger-api`](https://www.npmjs.com/package/@ticatec/logger-api), the
framework's zero-dependency logging contract:

| Error | Level | Contents |
|---|---|---|
| Not an `HttpError` (or not an `Error` at all) | `error` | the error **with its stack trace** |
| Any `HttpError` subclass | `debug` | the error and the status code it mapped to |

`HttpError`s are declared outcomes - a 404, a validation failure, a missing token -
so they stay out of production logs. Anything else arrived unexpectedly, and that
log record is usually the only trace it leaves behind.

```
2026-09-18T02:07:50.894Z ERROR [ErrorHandler] Unhandled error on GET /api/orders SyntaxError: Expected property name or '}' in JSON at position 1
    at JSON.parse (<anonymous>)
    at /srv/app/routes/orders.js:24:19
    ...
```

### Choosing a logger

`@ticatec/logger-api` is a **peer dependency**. With no provider installed it
writes to the console, filtered by the `LOG_LEVEL` environment variable
(`trace` | `debug` | `info` | `warn` | `error` | `silent`, default `info`), so the
middleware is useful out of the box with no configuration.

To route the records into a real logger, register a provider once at the
composition root - before the server starts:

```typescript
import { setLoggerProvider } from '@ticatec/logger-api';
import { initialize, getPinoLogger } from '@ticatec/logger-pino';

initialize({
    appenders: [{ name: 'out', type: 'console', level: 'debug' }],
    loggers: { root: { level: 'debug', appenders: ['out'] } }
});
setLoggerProvider(getPinoLogger);
```

```json
{"level":50,"module":"ErrorHandler","msg":"Unhandled error on GET /api/orders",
 "err":{"type":"SyntaxError","message":"...","stack":"SyntaxError: ...\n    at JSON.parse ..."}}
```

Logging never interferes with the response: if the provider throws, the failure is
swallowed and the error response is still sent.

## 🔍 Development vs Production

Stack traces are included only when the **server** is running in a development
environment. The environment is resolved from server-side configuration alone -
never from anything the client sends:

1. Express' `env` application setting (`app.set('env', ...)`, which itself
   defaults to `process.env.NODE_ENV || 'development'`)
2. `process.env.NODE_ENV`, when no Express application is attached to the request
3. `development`, when neither is set

`development`, `dev` and `test` enable stack traces; anything else disables them.

```bash
# Production: no stack traces in the response
NODE_ENV=production node server.js
```

```javascript
// Or set it explicitly on the app
app.set('env', 'production');
```

> 🔒 **Security**: versions before 2.1.0 read this from the `env` **request
> header**, which let any client turn stack-trace disclosure on by sending
> `env: development`. Upgrade if you are on 2.0.0 or earlier. Note that the
> header was also the *only* way to enable stack traces back then, so if your
> development tooling sends one, replace it with `NODE_ENV` or `app.set('env')`.

## 🚦 HTTP Status Code Mapping

| Error Type | HTTP Status | Use Case |
|------------|-------------|----------|
| `UnauthenticatedError` | 401 Unauthorized | Missing or invalid authentication |
| `InsufficientPermissionError` | 403 Forbidden | Insufficient permissions/authorization |
| `IllegalParameterError` | 400 Bad Request | Invalid input parameters or validation |
| `ActionNotFoundError` | 404 Not Found | Non-existent routes or resources |
| `TimeoutError` | 408 Request Timeout | Network requests or operations timeout |
| `AppError` | 500 Internal Server Error | Business logic or application errors |
| `ProxyError` | 502 Bad Gateway | Proxy server or gateway issues |
| `ServiceUnavailableError` | 503 Service Unavailable | Service maintenance or overload |
| Other errors | 500 Internal Server Error | Unexpected system errors |

## 💡 Advanced Usage

### Custom HTTP Container
Create custom HTTP adapters for different frameworks:

```javascript
import { setHttpContainer, HttpContainer } from '@ticatec/node-exception';

class CustomContainer implements HttpContainer {
    getRemoteIp(req) {
        return req.connection.remoteAddress;
    }

    getPath(req) {
        return req.originalUrl;
    }

    isDevelopment(req) {
        return process.env.NODE_ENV === 'development';
    }

    sendError(req, res, statusCode, data) {
        res.status(statusCode).json(data);
    }
}

setHttpContainer(new CustomContainer());
```

### Error Code Conventions
Organize your error codes systematically:

```javascript
// Authentication errors: 1000-1999
const AUTH_ERRORS = {
    INVALID_TOKEN: 1001,
    EXPIRED_TOKEN: 1002,
    MISSING_TOKEN: 1003
};

// Validation errors: 2000-2999
const VALIDATION_ERRORS = {
    INVALID_EMAIL: 2001,
    WEAK_PASSWORD: 2002,
    REQUIRED_FIELD: 2003
};

// Business logic errors: 3000-3999
const BUSINESS_ERRORS = {
    INSUFFICIENT_BALANCE: 3001,
    DUPLICATE_EMAIL: 3002,
    LIMIT_EXCEEDED: 3003
};

throw new AppError(AUTH_ERRORS.INVALID_TOKEN, "Authentication token is invalid");
```

## 🔧 TypeScript Integration

Full TypeScript support with comprehensive type definitions:

```typescript
import {
    AppError,
    UnauthenticatedError,
    InsufficientPermissionError,
    IllegalParameterError,
    ActionNotFoundError,
    handleError
} from '@ticatec/node-exception';
import { Request, Response, NextFunction } from 'express';

// Type-safe error middleware
const errorHandler = (
    err: AppError | Error,
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    handleError(err, req, res);
};

// Custom error with proper typing
class CustomValidationError extends IllegalParameterError {
    constructor(field: string, value: any) {
        super(`Invalid ${field}: ${value}`);
    }
}
```

## 🏗️ Architecture

The library uses a modular architecture with clear separation of concerns:

- **Error Classes** (`HttpError.ts`): Standardized error types with stack trace support
- **Error Handler** (`handleError.ts`): Central error processing and response logic
- **HTTP Container** (`HttpContainer.ts`): Framework-agnostic HTTP abstraction
- **Response Types** (`ErrorResponse.ts`): Standardized response structure
- **Utilities** (`utils.ts`): Response formatting helpers with XSS protection

## 📋 Requirements

- **Node.js**: ≥14.0.0
- **npm**: ≥6.0.0
- No runtime dependencies

## 🆕 Recent Improvements

### Dual ESM / CommonJS Support
- ✅ Ships both ESM (`lib/esm/`) and CommonJS (`lib/cjs/`) builds
- ✅ Conditional `exports` map selects the correct format automatically
- ✅ Per-output `package.json` markers ensure correct module interpretation
- ✅ Source updated to use explicit `.js` extensions (NodeNext-compatible)

### Version 2.1.0
- 🔒 **Security**: the development check no longer reads the `env` request header,
  which previously allowed any client to force stack-trace disclosure
- 🔒 **Security**: every field in the HTML error page is HTML-escaped (`client`,
  `path`, `method` and `code` were previously interpolated raw; `client` follows
  `X-Forwarded-For` under `trust proxy`)
- 🔒 Error responses now send `X-Content-Type-Options: nosniff`
- ✅ `handleError` delegates to `next(err)` when the response has already started
- ✅ Container state anchored to `globalThis`, so CJS and ESM share one container
- ✅ `HttpContainer` and `ErrorResponse` exported as types (`isolatedModules`-safe)
- ✅ Per-condition `types` in every subpath export
- 📝 Errors are now logged through `@ticatec/logger-api`: unknown errors at
  `error` level with their stack, declared `HttpError`s at `debug` level
- ✅ 69 tests, including regression tests for both security issues
- ✅ `strict` and `isolatedModules` enabled

### Version 2.0.0
- ✅ Enhanced type safety with strict TypeScript typing
- ✅ Fixed bug in text response format (Client IP display)
- ✅ Improved HTML error pages with professional styling
- ✅ Added null-safety with default values
- ✅ Removed @ts-ignore and improved error handling
- ✅ Fixed grammar and spelling in error messages
- ✅ Better code documentation with JSDoc comments

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](https://github.com/ticatec/node-exception/blob/main/CONTRIBUTING.md) for details.

### Development Setup
```bash
git clone https://github.com/ticatec/node-exception.git
cd node-exception
npm install
npm run build       # Build both CJS and ESM outputs
npm run build:cjs   # Build only the CommonJS output
npm run build:esm   # Build only the ESM output
npm run typecheck   # Type-check both configurations
```

## 📄 License

MIT © [Henry Feng](https://github.com/henryfeng)

## 🔗 Links

- **GitHub Repository**: [https://github.com/ticatec/node-exception](https://github.com/ticatec/node-exception)
- **npm Package**: [https://www.npmjs.com/package/@ticatec/node-exception](https://www.npmjs.com/package/@ticatec/node-exception)
- **Issues**: [https://github.com/ticatec/node-exception/issues](https://github.com/ticatec/node-exception/issues)
- **Documentation**: [https://docs.ticatec.com/node-exception](https://docs.ticatec.com/node-exception)