# @ticatec/keelson-express

[![npm version](https://badge.fury.io/js/@ticatec%2Fkeelson-express.svg)](https://badge.fury.io/js/@ticatec%2Fkeelson-express)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A comprehensive TypeScript library providing common classes, controllers, and middleware for building scalable Express.js applications with multi-tenant support.

[中文](./README_CN.md) ｜ English

## Features

- 🚀 **Express.js Foundation**: Built on Express.js 5.x with full TypeScript support
- 🏢 **Multi-tenant Architecture**: Built-in support for multi-tenant applications
- 🔐 **Authentication & Authorization**: User authentication and role-based access control
- 🎯 **Controller Patterns**: Pre-built base controllers for common CRUD operations
- 📝 **Validation**: Integrated data validation using bean-validator
- 🔄 **Error Handling**: Centralized error handling and logging
- 🌐 **Internationalization**: Built-in language support via headers
- 📊 **Logging**: Structured logging integrated with `@ticatec/logger-pino` and Pino
- 📦 **Dual Module Support**: Full CommonJS and ESM compatibility out of the box

## Documentation

- **[Controller Guide](https://github.com/ticatec/keelson/blob/main/docs/prompts/CONTROLLER.md)** - Comprehensive guide on using controllers for CRUD and search operations

> 🚀 **Major Upgrade Notice**: The controller hierarchy has been streamlined. The redundant subclasses (`AdminBaseController`, `TenantBaseController`, `AdminSearchController`, `TenantSearchController`) have been unified into `CommonController` and `CommonSearchController`. Validation rules are now cleanly configured by overriding `getRules(): ValidationRules`.

## Installation

```bash
pnpm add @ticatec/keelson-express
```

### Peer Dependencies

```json
{
  "peerDependencies": {
    "@ticatec/logger-api": ">=1.0.0",
    "@ticatec/keelson-core": ">=1.0.0",
    "@ticatec/bean-validator": ">=1.1.0",
    "@ticatec/node-exception": ">=2.1.0",
    "express": "^5.0.0"
  }
}
```

```bash
pnpm add @ticatec/logger-api @ticatec/keelson-core @ticatec/bean-validator @ticatec/node-exception express
```

A logging provider is optional. With none installed, `@ticatec/logger-api` falls back to
the console, filtered by `LOG_LEVEL`. To route logs through pino, add
`@ticatec/logger-pino` and install the provider at your composition root.

## Quick Start

### 1. Create a Basic Server

```typescript
import { BaseServer } from '@ticatec/keelson-express';

class MyServer extends BaseServer {
    protected async loadConfigFile(): Promise<void> {
        // Load your configuration here
        console.log('Loading configuration...');
    }

    protected getWebConf() {
        return {
            port: 3000,
            ip: '0.0.0.0',
            contextRoot: '/api'
        };
    }

    protected async setupRoutes(): Promise<void> {
        // Set up your routes here
        await this.bindRoutes('/users', () => import('./routes/UserRoutes'));
    }
}

// Start the server
const server = new MyServer();
BaseServer.startup(server);
```

`BaseServer.startup()` is the entry point: it returns `void`, logs a failed startup and sets
`process.exitCode = 1`, so the process exits non-zero on its own. When you need to decide
what happens on failure — retry, report, shut something down — await the instance method
instead, which rethrows:

```typescript
try {
    await server.startup();
} catch (err) {
    await reportToPagerDuty(err);
    process.exit(1);
}
```

### 3. Cloud-Native Health Check

The framework includes built-in Kubernetes probe endpoints by default:
- `GET /health/live`: Liveness Probe (HTTP 200 when process is running).
- `GET /health/ready`: Readiness Probe (HTTP 200 when all critical components pass, HTTP 503 if any critical component is DOWN).
- `GET /health`: Comprehensive aggregate status view.

Register custom health indicators (e.g. Database, Redis):

```typescript
class MyServer extends BaseServer {
    protected async beforeStart(): Promise<void> {
        // Register Database Health Indicator
        this.registerHealthCheck('database', async () => {
            const isOk = await db.ping();
            return {
                status: isOk ? 'UP' : 'DOWN',
                details: { latencyMs: 5 }
            };
        }, true); // true marks component as critical (returns HTTP 503 if DOWN)

        // Register Non-Critical Component (e.g. Cache)
        this.registerHealthCheck('redis', async () => {
            return { status: 'UP' };
        }, false);
    }
}
```

### 2. Create Routes

```typescript
import { CommonRoutes, routerHelper } from '@ticatec/keelson-express';

class UserRoutes extends CommonRoutes {

    // Load additional user data
    protected getUserHook(): ((user: any) => any) | null {
        return async (user) => {
            // Load user preferences
            user.preferences = await loadPreferences(user.accountCode);
            return user;
        };
    }

    protected bindRoutes() {
        this.get('/profile', routerHelper.invokeRestfulAction(this.getProfile));
        this.post('/update', routerHelper.invokeRestfulAction(this.updateProfile));
    }

    private getProfile = async (req: Request) => {
        // Your logic here
        return { message: 'User profile' };
    };

    private updateProfile = async (req: Request) => {
        // Your logic here
        return { message: 'Profile updated' };
    };
}

export default UserRoutes;
```

#### Custom User Hook

The `getUserHook()` method allows you to process and enrich user data after authentication:

```typescript
import { CommonRoutes } from '@ticatec/keelson-express';

class AdminRoutes extends CommonRoutes {

    // Process and enrich user data
    protected getUserHook(): ((user: any) => any) | null {
        return async (user) => {
            if (user) {
                // Load admin-specific data
                user.adminData = await loadAdminData(user.accountCode);
                user.permissions = await loadPermissions(user.accountCode);
                user.settings = await loadSettings(user.accountCode);
            }
            return user;
        };
    }

    protected bindRoutes() {
        this.get('/dashboard', routerHelper.invokeRestfulAction(this.getDashboard));
    }

    private getDashboard = async (req: Request) => {
        // User data is already enriched here
        return {
            dashboard: req['user'].adminData,
            permissions: req['user'].permissions
        };
    };
}
```

#### Authenticated Routes (AuthenticatedRoutes)

Extending `AuthenticatedRoutes` enforces that requests must contain a valid logged-in user (`user != null`). Unauthenticated requests automatically trigger a `401 UnauthenticatedError`:

```typescript
import { AuthenticatedRoutes, routerHelper } from '@ticatec/keelson-express';

class ProtectedUserRoutes extends AuthenticatedRoutes {
    protected bindRoutes() {
        this.get('/profile', routerHelper.invokeRestfulAction(this.getProfile));
    }

    private getProfile = async (req: Request) => {
        // req['user'] is guaranteed to be non-null
        return req['user'];
    };
}
```

#### Server-Wide Custom User Model (CustomUserRegistry)

For applications with extended user attributes (e.g., `userId`, `roles`, `permissions`), you can bind a server-wide user model via TypeScript module augmentation (Declaration Merging):

```typescript
// types/user-registry.d.ts
import { LoggedUser } from '@ticatec/keelson-express';

export interface AppUser extends LoggedUser {
    userId: string;
    roles: string[];
    permissions: string[];
}

declare module '@ticatec/keelson-express' {
    interface CustomUserRegistry {
        user: AppUser;
    }
}
```

Once registered, `this.getLoggedUser(req)` across all controllers, `CommonController` arguments, and route user hooks will **automatically infer as `AppUser`**, avoiding generic boilerplate on every controller!

#### Custom User Validation

The `isValidUser()` method allows you to implement custom validation logic beyond authentication:

```typescript
import { CommonRoutes } from '@ticatec/keelson-express';

class VerifiedUserRoutes extends CommonRoutes {

    // Validate user account status
    protected async isValidUser(user: any): Promise<boolean> {
        if (!user) {
            return false;
        }
        // Check if user account is active
        const account = await database.getAccount(user.accountCode);
        return account && account.status === 'active';
    }

    protected bindRoutes() {
        this.get('/profile', routerHelper.invokeRestfulAction(this.getProfile));
    }

    private getProfile = async (req: Request) => {
        return req['user'];
    };
}
```

**More examples:**

```typescript
// Check user roles
class AdminRoutes extends CommonRoutes {
    protected isValidUser(user: any): boolean {
        return user && user.roles && user.roles.includes('admin');
    }
}

// Tenant validation
class TenantRoutes extends CommonRoutes {
    protected async isValidUser(user: any): Promise<boolean> {
        if (!user || !user.tenant) {
            return false;
        }
        const tenant = await database.getTenant(user.tenant.code);
        return tenant && tenant.isActive;
    }
}
```

#### Custom Authentication Middleware

Use `getGlobalHandler()` to add custom middleware:

```typescript
import { CommonRoutes, routerHelper } from '@ticatec/keelson-express';

class ApiRoutes extends CommonRoutes {

    // Add custom global middleware
    protected getGlobalHandler(): RequestHandler | null {
        return async (req, res, next) => {
            // Check API version
            const version = req.headers['api-version'];
            if (!version) {
                throw new Error('API version is required');
            }
            next();
        };
    }

    protected bindRoutes() {
        this.get('/data', routerHelper.invokeRestfulAction(this.getData));
    }

    private getData = async (req: Request) => {
        return { data: [] };
    };
}
```

#### Public Routes (No Authentication)

```typescript
import { CommonRoutes, routerHelper } from '@ticatec/keelson-express';

class PublicRoutes extends CommonRoutes {

    // Override isValidUser to allow public access (no authentication required)
    protected isValidUser(user: any): boolean {
        return true; // Allow access without authentication
    }

    protected bindRoutes() {
        this.get('/info', routerHelper.invokeRestfulAction(this.getInfo));
    }

    private getInfo = async (req: Request) => {
        return { message: 'Public information' };
    };
}
```

### 3. Create Controllers

```typescript
import { CommonController } from '@ticatec/keelson-express';
import { ValidationRules, StringValidator } from '@ticatec/bean-validator';

interface UserService {
    createNew(user: any, data: any): Promise<any>;
    update(user: any, data: any): Promise<any>;
    search(user: any, query: any): Promise<any>;
}

const userValidationRules: ValidationRules = [
    new StringValidator('name', { required: true, minLen: 2 }),
    new StringValidator('email', {
        required: true,
        format: {
            regex: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
            message: 'Invalid email format'
        }
    })
];

class UserController extends CommonController<UserService> {
    constructor(userService: UserService) {
        super(userService);
    }

    // Configure validation rules
    protected getRules(): ValidationRules {
        return userValidationRules;
    }

    // CRUD methods (createNew, update, del) are inherited and automatically validated,
    // passing [loggedUser, req.body] to service methods by default.

    // Add custom methods
    search() {
        return async (req: Request): Promise<any> => {
            const query = req.query;
            this.checkInterface('search');
            return await this.invokeServiceInterface('search', [
                this.getLoggedUser(req),
                query
            ]);
        };
    }
}
```

## Core Classes

### BaseServer

Abstract base server class that provides:
- Express application setup
- Configuration loading
- Route binding
- Error handling
- Health check endpoints (/health/live, /health/ready)
- Static file serving
- **Global user parsing** (non-invasive, for all requests)


**Global Middleware Order:**
```
1. SetNoCache              - Disable caching
2. HealthCheck             - /health/live, /health/ready, /health endpoints
3. RetrieveUser (Global)   - Extract user info from headers (non-blocking)
4. Routes                  - All defined routes
5. ActionNotFound          - 404 handler
6. Error Handler           - Error handling
```

### RouterHelper (Singleton)

Middleware helper for:
- JSON response formatting
- Cache control
- User authentication
- Error handling
- Request logging

**Usage:**
```typescript
import { routerHelper } from '@ticatec/keelson-express';

// Use middleware
routerHelper.setNoCache           // Disable caching
routerHelper.checkLoggedUser()    // Require authentication
routerHelper.retrieveUser()       // Extract user (non-blocking)
routerHelper.actionNotFound()     // 404 handler
routerHelper.invokeRestfulAction() // Wrap async handler
routerHelper.invokeController()    // Wrap controller handler
```

### CommonRoutes

Base class for route definitions featuring:
- Express Router integration
- Flexible authentication control
- Custom user validation checks
- User hook support
- Global middleware support
- Logging capabilities
- Built-in HTTP method helper methods

**Middleware Execution Order:**
```
1. getUserHook()           - Process and enrich user data
2. isValidUser()             - Custom user validation
3. getGlobalHandler()      - Custom middleware
4. bindRoutes()            - Route definitions
```

**Key Methods:**
- `getUserHook(): ((user: any) => any) | null` - Process user data
- `isValidUser(user: any): boolean | Promise<boolean>` - Custom user validation
- `getGlobalHandler(): RequestHandler | null` - Custom middleware
- `bindRoutes()` - Define your routes

### Controller Hierarchy

- **BaseController<T>**: Base controller providing logging and user context access
- **CommonController<T>**: Base CRUD controller with automatic validation and default user argument passing `[loggedUser, req.body]`
- **CommonSearchController<T>**: Search controller providing out-of-the-box search query handling

📚 **[Full Controller Usage Guide →](https://github.com/ticatec/keelson/blob/main/docs/prompts/CONTROLLER.md)**

## Architecture Overview

### Request Processing Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    BaseServer Middleware                    │
├─────────────────────────────────────────────────────────────┤
│ 1. SetNoCache              - Disable caching                │
│ 2. HealthCheck             - /health/live, /health/ready    │
│ 3. RetrieveUser (Global)   - Extract user info from headers │
│ 4. Routes                  - All defined routes             │
│ 5. ActionNotFound          - 404 handler                    │
│ 6. Error Handler           - Error handling                 │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│              CommonRoutes Middleware Order                   │
├─────────────────────────────────────────────────────────────┤
│ 1. getUserHook()           - Process user data             │
│ 2. isValidUser()             - Custom user validation         │
│ 3. getGlobalHandler()      - Custom middleware              │
│ 4. bindRoutes()            - Route definitions              │
└─────────────────────────────────────────────────────────────┘
```

### Configuration

#### Application Configuration

```typescript
import { AppConf } from '@ticatec/keelson-express';

// Initialize configuration
AppConf.init({
    database: {
        host: 'localhost',
        port: 5432
    },
    server: {
        port: 3000
    }
});

// Use configuration
const config = AppConf.getInstance();
const dbHost = config.get('database.host');
const serverPort = config.get('server.port');
```

#### Gateway Architecture

This application is designed to work behind an API Gateway. The gateway handles JWT tokens or session-based authentication and forwards the authenticated user information to the Express application via HTTP headers.

##### Architecture Flow

```
Client Request (JWT/Session) → API Gateway → Express Application
                                    ↓
                            User Info Headers
```

##### Gateway Responsibilities

The API Gateway should:

1. **Authenticate requests** using JWT tokens, session cookies, or other authentication mechanisms
2. **Extract user information** from the authentication token/session
3. **Forward user data** as HTTP headers to the Express application
4. **Handle authorization** and rate limiting as needed

##### User Authentication Headers

The library expects user information in the request headers:

```typescript
// Headers forwarded by the gateway
{
    'user': encodeURIComponent(JSON.stringify({
        accountCode: 'user123',
        name: 'John Doe',
        tenant: { code: 'tenant1', name: 'Tenant One' }
    })),
    'x-language': 'en'
}
```

#### User Impersonation

The library supports user impersonation for debugging and troubleshooting:

```typescript
// Headers with user impersonation
{
    'user': encodeURIComponent(JSON.stringify({
        // Original privileged user
        accountCode: 'admin123',
        name: 'System Admin',
        tenant: { code: 'system', name: 'System Tenant' },

        // User being impersonated
        actAs: {
            accountCode: 'user456',
            name: 'Target User',
            tenant: { code: 'client-a', name: 'Client A' }
        }
    })),
    'x-language': 'en'
}
```

## Multi-tenant Support

The library provides built-in multi-tenant support via `CommonController`:

```typescript
// Standard / Tenant controller (defaults to passing logged user)
class ProductController extends CommonController<ProductService> {
    // Automatically receives logged user context
    // All CRUD operations pass [loggedUser, req.body] to service methods
}

// Admin controller (cross-tenant / platform operations)
class SystemController extends CommonController<SystemService> {
    // Override argument builders to omit the user parameter if needed
    protected getCreateNewArguments(req: Request): Array<any> {
        return [req.body];
    }

    protected getUpdateArguments(req: Request): Array<any> {
        return [req.body];
    }
}
```

## Validation

Built-in validation using `@ticatec/bean-validator`:

```typescript
import { ValidationRules, StringValidator, NumberValidator } from '@ticatec/bean-validator';

const rules: ValidationRules = [
    new StringValidator('name', { required: true, minLen: 2, maxLen: 50 }),
    new StringValidator('email', {
        required: true,
        format: {
            regex: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
            message: 'Invalid email format'
        }
    }),
    new NumberValidator('age', { required: false, minValue: 18, maxValue: 120 })
];

class UserController extends CommonController<UserService> {
    constructor(service: UserService) {
        super(service);
    }

    protected getRules(): ValidationRules {
        return rules; // Validation applied automatically on createNew() & update()
    }
}
```

## Error Handling

Centralized error handling with `@ticatec/node-exception`:

```typescript
import {
    ActionNotFoundError,
    UnauthenticatedError,
    IllegalParameterError
} from '@ticatec/node-exception';

// Errors are caught by the framework and rendered with the right status code
throw new ActionNotFoundError();                     // 404, fixed message
throw new UnauthenticatedError();                    // 401, fixed message
throw new IllegalParameterError('Invalid input');    // 400, message is yours

// Every constructor also takes ErrorOptions, so the original error can be kept:
throw new IllegalParameterError('Invalid input', { cause: parseError });
```

## API Reference

### Types

```typescript
// Function signatures
export type RestfulFunction = (req: Request) => any;
export type ControlFunction = (req: Request, res: Response) => any;
export type moduleLoader = () => Promise<any>;

// User interfaces. Both are deliberately empty: the framework never reads a field off
// the user, so it declares none. Your application supplies the shape.
export interface CommonUser {}

export interface LoggedUser extends CommonUser {
    actAs?: CommonUser;   // For user impersonation
}
```

Declare your own user model once, through module augmentation, and every
`getLoggedUser(req)` and `req.user` in the application is typed as it:

```typescript
// types/keelson-express.d.ts
import '@ticatec/keelson-express';

interface AppUser {
    accountCode: string;
    name: string;
    isPlatform?: boolean;
    tenant?: { code: string; name: string };
    actAs?: AppUser;
}

declare module '@ticatec/keelson-express' {
    interface CustomUserRegistry {
        user: AppUser;
    }
}
```

`req.user` is declared on Express's `Request` by this package, so no separate
augmentation of `Express.Request` is needed.

### Resolving the user

The caller is resolved by a {@link UserResolver} before any route runs. The default,
`HeaderUserResolver`, reads a user an API gateway injected as the `user` header
(URL-encoded JSON) plus an `x-language` header.

> **That header is trusted.** Whatever arrives in it becomes the caller, so the service
> must be unreachable except through a gateway that sets the header itself and strips any
> client-supplied copy. Exposed directly, any client can name itself anyone.

Every step is its own method, so changing one does not mean restating the rest:

```typescript
import { HeaderUserResolver, setUserResolver } from '@ticatec/keelson-express';

class BearerResolver extends HeaderUserResolver {
    protected override userHeader(): string {
        return 'authorization';
    }
    protected override decode(raw: string): unknown {
        return verifyJwt(raw.replace(/^Bearer /, ''));
    }
}

setUserResolver(new BearerResolver());   // once, at the composition root
```

When the identity comes from somewhere else entirely, extend `UserResolver` directly:

```typescript
import UserResolver, { setUserResolver } from '@ticatec/keelson-express';

class SessionResolver extends UserResolver {
    async resolve(req: Request) {
        return sessions.get(req.cookies.sid);
    }
}

setUserResolver(new SessionResolver());
```

A resolver never rejects a request. Returning `undefined` leaves it anonymous, which is
how a public route stays public; a malformed header is logged and treated the same way.
Authorization is `isValidUser()`'s job, and `routerHelper.checkLoggedUser()` is what turns
an anonymous request into a 401.

### Background processors

```typescript
import { ProcessorManager, CommonProcessor } from '@ticatec/keelson-express';

class MailProcessor extends CommonProcessor<Mail> {
    constructor() { super(30); }                        // poll every 30 seconds
    protected async loadToProcessData(): Promise<Mail[]> { return mailRepo.pending(); }
    protected async processItem(mail: Mail): Promise<void> { await send(mail); }
}

ProcessorManager.getInstance().register(MailProcessor);
ProcessorManager.getInstance().startAll();
```

`BaseServer.shutdown()` calls `ProcessorManager.getInstance().stopAll()`, which stops the
timers and awaits whatever is still in flight.

## Requirements

- Node.js >= 18.0.0
- Express ^5.0.0
- TypeScript ^5.0.0 (to build from source)

## Logging

Logging goes through the [`@ticatec/logger-api`](https://www.npmjs.com/package/@ticatec/logger-api)
contract. With no provider installed it falls back to the console, filtered by `LOG_LEVEL`.

Route binding, the request lifecycle and processor ticks are logged at `debug`; server
startup and shutdown at `info`. The framework does not write the user identity into the
log: the gateway-supplied `user` header is not echoed, and a failed `isValidUser()` logs
the route and whether impersonation was in play, not who was rejected.

Request and response bodies are logged only when you opt in, by setting
`Controller.debugEnabled = true`. That switch prints `req.body` and `req.query` at `debug`
— everything a client sent, credentials included — so it belongs in development, not in
production.

## Contributing

This package lives in the [Keelson](https://github.com/ticatec/keelson) monorepo. Issues
and pull requests are welcome there.

### Development Setup

```bash
git clone https://github.com/ticatec/keelson.git
cd keelson
pnpm install
cd packages/keelson-express

pnpm build       # Build both CJS and ESM outputs (lints first)
pnpm test        # Run the test suite
pnpm typecheck   # Type-check all three configurations
pnpm lint        # Lint only
```

From the monorepo root, `pnpm verify` builds, type-checks and tests every package.

The workspace is pnpm-only: the dependencies here are declared with `workspace:*`, a
protocol npm does not understand, so `npm install` fails outright with
`EUNSUPPORTEDPROTOCOL`.

### Publishing

```bash
pnpm publish:public   # runs lint, typecheck, test and build first, via prepublishOnly
```

## License

MIT - see the [LICENSE](LICENSE) file.

## 👨‍💻 Author

**Henry Feng** — [huili.f@gmail.com](mailto:huili.f@gmail.com)

## 🔗 Links

- [GitHub Repository](https://github.com/ticatec/keelson/tree/main/packages/keelson-express)
- [NPM Package](https://www.npmjs.com/package/@ticatec/keelson-express)
- [Issues](https://github.com/ticatec/keelson/issues)
- [CHANGELOG](CHANGELOG.md)
- 📚 Documentation: [GitHub Repository](https://github.com/ticatec/keelson-express)

---

Made with ❤️ by [TicaTec](https://github.com/ticatec)