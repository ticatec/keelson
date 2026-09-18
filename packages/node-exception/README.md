# @ticatec/node-exception

[中文](./README_CN.md) | English

[![Version](https://img.shields.io/npm/v/@ticatec/node-exception)](https://www.npmjs.com/package/@ticatec/node-exception)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-≥18.0.0-green)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue)](https://www.typescriptlang.org/)

Production-ready Express error handling middleware with standardized HTTP error types, centralized exception management, and automatic content negotiation for REST APIs. Type-safe, with logging injected through the `@ticatec/logger-api` contract.

## 🚀 Features

- **🎯 Standardized Error Types**: Ten predefined error classes covering common HTTP scenarios
- **🔧 Express Middleware**: Drop-in error handling middleware with zero configuration
- **📋 Consistent Response Format**: Uniform error responses with comprehensive request context
- **🎨 Content Negotiation**: Automatic response formatting (JSON, HTML, plain text)
- **🔍 Development Support**: Stack trace inclusion in development environments
- **📝 Built-in Logging**: 5xx and unknown errors logged with their stack via `@ticatec/logger-api`; 4xx kept at `debug`
- **📘 TypeScript First**: Full TypeScript support with complete type definitions
- **🌐 Client IP Detection**: Client address resolved from the request (honours `trust proxy`)
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

// Error handling middleware (must be registered last)
// Register it directly - Express detects error middleware by arity, and passing
// `next` through lets the handler delegate if the response has already started.
app.use(handleError);

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

### ⚡ ConflictError
For a request that conflicts with the resource's current state (HTTP 409).

```javascript
// Uniqueness violation
if (await users.existsByEmail(email)) {
    throw new ConflictError("Email already registered");
}

// Optimistic locking
if (order.version !== payload.version) {
    throw new ConflictError("Order was modified by someone else");
}
```

### 🚧 TooManyRequestsError
For a client that exceeded a rate limit or quota (HTTP 429).

```javascript
if (!rateLimiter.tryConsume(req.ip)) {
    res.set('Retry-After', '60');   // the header belongs on the response
    throw new TooManyRequestsError();
}
```

> Use `IllegalParameterError` (400) for input that fails validation. This library
> does not ship a separate 422 type - the 400/422 boundary is blurry in practice,
> and two overlapping classes only invite inconsistent use.

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

The format is chosen from the `Accept` header, weighing its q-values:

| Client sends | Response |
|---|---|
| `application/json` | JSON |
| `*/*` (curl, most HTTP libraries) | JSON |
| a browser's `text/html,...,*/*;q=0.8` | HTML |
| `text/html` | HTML |
| `text/plain` | plain text |
| nothing acceptable | JSON |

JSON is the default: a client that expresses no preference gets it, and HTML is
reserved for clients that actually asked for a page. Every response also carries
`X-Content-Type-Options: nosniff`.

### JSON Response (default)
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

> `code` is the **application** error code, not the HTTP status. It is `-1` for
> every error except `AppError`, which carries the code you passed it. The HTTP
> status lives in the response status line.

### HTML Response
Returned to browsers and to any client that prefers `text/html`:

```html
<!DOCTYPE html>
<html>
<head>
    <title>Error -1</title>
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
        <h1>Error Code: -1</h1>
        <div><strong>Client:</strong> 192.168.1.50</div>
        <div><strong>Method:</strong> GET</div>
        <div><strong>Path:</strong> /api/users</div>
        <div><strong>Timestamp:</strong> 1699123456789</div>
        <div><strong>Message:</strong> Unauthenticated user is accessing the system.</div>
    </div>
</body>
</html>
```

Every interpolated value is HTML-escaped; the stack trace block is appended only in
development. To change the markup, replace `sendError` in a custom
[HTTP container](#custom-http-container).

### Plain Text Response
Returned when the client asks for `text/plain`:
```
Code: -1
Client: 192.168.1.50
Method: GET
Path: /api/users
Timestamp: 1699123456789
Message: Unauthenticated user is accessing the system.
---Stack Trace---
UnauthenticatedError: Unauthenticated user is accessing the system.
    at ... (development only)
```

## 📊 Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `code` | number | Application error code, **not** the HTTP status. `-1` for every error except `AppError` |
| `client` | string | Client IP address (defaults to 'unknown' if unavailable) |
| `path` | string | Full request path (baseUrl + path) |
| `method` | string | HTTP method (GET, POST, PUT, DELETE, etc.) |
| `timestamp` | number | Unix timestamp in milliseconds |
| `message` | string \| null | Human-readable error message |
| `stack` | string | Stack trace (development environments only) |

## 📝 Logging

Errors passing through `handleError` are logged through
[`@ticatec/logger-api`](https://www.npmjs.com/package/@ticatec/logger-api), the
framework's zero-dependency logging contract:

| Error | Level | Contents |
|---|---|---|
| Not an `HttpError` (or not an `Error` at all) | `error` | the error **with its stack trace** |
| `HttpError` with `statusCode >= 500` | `error` | the error **with its stack trace** |
| `HttpError` with a 4xx status | `debug` | the error and the status it mapped to |

The split is by **status class, not by error type**. A 5xx means the server failed:
`AppError` (always 500), `ProxyError` (502), `ServiceUnavailableError` (503), and
any subclass of your own that returns >= 500. In production the client gets no
stack, so this log record is the only thing that says *why* the request failed and
*on which line* - without it a production outage leaves nothing but `POST /pay 500`
in the access log.

4xx is the client's problem - a rejected login, a bad parameter, a missing route -
and at any real traffic volume logging those at `error` would drown out the records
that matter. They are written at `debug`: available while debugging, silent in
production.

Anything that is not an `HttpError` arrived unexpectedly, and that record is usually
the only trace it leaves behind.

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
| `ConflictError` | 409 Conflict | Uniqueness violations, optimistic-locking failures |
| `TooManyRequestsError` | 429 Too Many Requests | Rate limits and quotas |
| `TimeoutError` | 408 Request Timeout | Network requests or operations timeout |
| `AppError` | 500 Internal Server Error | Business logic or application errors |
| `ProxyError` | 502 Bad Gateway | Proxy server or gateway issues |
| `ServiceUnavailableError` | 503 Service Unavailable | Service maintenance or overload |
| Other errors | 500 Internal Server Error | Unexpected system errors |

## 💡 Advanced Usage

### Custom HTTP Container
Create custom HTTP adapters for different frameworks:

```typescript
import { setHttpContainer } from '@ticatec/node-exception';
import type { HttpContainer, ErrorResponse } from '@ticatec/node-exception';

class CustomContainer implements HttpContainer {
    getRemoteIp(req: any): string {
        return req.ip || 'unknown';
    }

    getPath(req: any): string {
        return req.originalUrl;
    }

    isDevelopment(_req: any): boolean {
        // Resolve this from server-side configuration only. Reading it from
        // anything the client controls - a header, a query parameter, a cookie -
        // lets callers switch stack-trace disclosure on for themselves.
        return process.env.NODE_ENV === 'development';
    }

    sendError(req: any, res: any, statusCode: number, data: ErrorResponse): void {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.status(statusCode).json(data);
    }
}

// Call this once at the composition root, before the server accepts requests.
setHttpContainer(new CustomContainer());
```

`ExpressContainer` (the default) and `getHttpContainer()` are exported too, so a
custom container can extend the default rather than reimplement it, and tests can
restore it afterwards:

```typescript
import { setHttpContainer, getHttpContainer, ExpressContainer } from '@ticatec/node-exception';
import type { ErrorResponse } from '@ticatec/node-exception';

class AuditingContainer extends ExpressContainer {
    sendError(req: any, res: any, statusCode: number, data: ErrorResponse): void {
        metrics.increment('http.error', { status: statusCode });
        super.sendError(req, res, statusCode, data);
    }
}

const previous = getHttpContainer();
setHttpContainer(new AuditingContainer());
// ... later, e.g. in a test teardown
setHttpContainer(previous);
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
    ConflictError,
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
    handleError(err, req, res, next);
};

// Custom error with proper typing
class CustomValidationError extends IllegalParameterError {
    constructor(field: string, value: any) {
        super(`Invalid ${field}: ${value}`);
    }
}

// Keeping the underlying failure attached
try {
    await orders.insert(order);
} catch (cause) {
    throw new ConflictError('Order number already exists', { cause });
}
```

## 🏗️ Architecture

The library uses a modular architecture with clear separation of concerns:

- **Error Classes** (`HttpError.ts`): Standardized error types with stack trace support
- **Error Handler** (`handleError.ts`): Central error processing and response logic
- **HTTP Container** (`HttpContainer.ts`): Framework-agnostic HTTP abstraction
- **Response Types** (`ErrorResponse.ts`): Standardized response structure
- **Utilities** (`utils.ts`): Response formatting helpers with XSS protection

Logging goes through the `@ticatec/logger-api` contract rather than a concrete
logging library, so the package stays independent of whichever logger the
application chooses.

## 📋 Requirements

- **Node.js**: ≥18.0.0
- **Peer dependency**: `@ticatec/logger-api` (≥1.0.0, itself dependency-free)
- No other runtime dependencies

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
- 📝 Errors are logged through `@ticatec/logger-api`: 5xx and unknown errors at
  `error` level **with their stack**, 4xx at `debug` level
- 🐛 Content negotiation rewritten: a browser's `*/*;q=0.8` made `req.accepts('json')`
  return `'json'`, so the HTML error page was unreachable in practice
- 🐛 `handleError` no longer throws `ERR_HTTP_HEADERS_SENT` when the response has
  started and the caller passed no `next`
- ✨ All error constructors accept `ErrorOptions`, so `{ cause }` chains survive
- ✨ New error types: `ConflictError` (409) and `TooManyRequestsError` (429)
- ✅ 104 tests, including regression tests for every issue above
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

This package lives in the [Keelson](https://github.com/ticatec/keelson) monorepo. Issues and pull requests are welcome there.

### Development Setup
```bash
git clone https://github.com/ticatec/keelson.git
cd keelson
pnpm install
cd packages/node-exception

pnpm build       # Build both CJS and ESM outputs (lints first)
pnpm test        # Run the test suite
pnpm typecheck   # Type-check both configurations
pnpm lint        # Lint only
```

From the monorepo root, `pnpm verify` type-checks, tests and builds every package.

## 📄 License

MIT © [Henry Feng](https://github.com/henryfeng)

## 🔗 Links

- **Source**: [github.com/ticatec/keelson/tree/main/packages/node-exception](https://github.com/ticatec/keelson/tree/main/packages/node-exception)
- **npm Package**: [@ticatec/node-exception](https://www.npmjs.com/package/@ticatec/node-exception)
- **Issues**: [github.com/ticatec/keelson/issues](https://github.com/ticatec/keelson/issues)
- **Changelog**: [CHANGELOG.md](./CHANGELOG.md)
