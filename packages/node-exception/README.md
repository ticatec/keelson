# @ticatec/node-exception

[中文](./README_CN.md) | English

[![Version](https://img.shields.io/npm/v/@ticatec/node-exception)](https://www.npmjs.com/package/@ticatec/node-exception)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-≥14.0.0-green)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue)](https://www.typescriptlang.org/)

Production-ready Express error handling middleware with standardized HTTP error types, centralized exception management, and automatic content negotiation for REST APIs. Type-safe, zero-dependency core.

## 🚀 Features

- **🎯 Standardized Error Types**: Eight predefined error classes covering common HTTP scenarios
- **🔧 Express Middleware**: Drop-in error handling middleware with zero configuration
- **📋 Consistent Response Format**: Uniform error responses with comprehensive request context
- **🎨 Content Negotiation**: Automatic response formatting (JSON, HTML, plain text)
- **🔍 Development Support**: Stack trace inclusion in development environments
- **📘 TypeScript First**: Full TypeScript support with complete type definitions
- **🌐 IP Detection**: Automatic client and server IP address detection
- **⚡ Zero Dependencies**: Minimal runtime footprint with no runtime dependencies
- **✨ Type-Safe**: Improved type safety with null checks and strict typing
- **🛡️ Null-Safe**: Automatic default values for optional properties
- **🔄 Dual Module Format**: Ships both ESM and CommonJS builds via conditional `exports`

## 📦 Installation

```bash
npm install @ticatec/node-exception
```

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

> ⚠️ **Mixing import styles**: `setHttpContainer()` mutates a module-level singleton. CJS and ESM are separate module instances, so a container set via `require()` will not be visible to code that imports the library via `import`, and vice versa. Pick one style per application.

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

## 🔍 Development vs Production

Stack traces are automatically included in development environments:

```javascript
// Enable development mode by setting request header
fetch('/api/users', {
    headers: {
        'env': 'development' // or 'dev'
    }
});
```

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