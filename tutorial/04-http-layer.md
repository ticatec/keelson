# 4. The HTTP layer

[中文](04-http-layer_CN.md) | English · [Tutorial index](README.md)

Everything between the socket and your Service: how a route is declared, how a controller
maps a request onto a service call, how the body is validated, and how a thrown error
becomes a status code.

## Routes

A route group is a class. It owns a path prefix and the handlers under it.

```typescript
import { CommonRoutes, routerHelper } from '@ticatec/keelson-express';

export default class UserRoutes extends CommonRoutes {
    protected bindRoutes() {
        this.get('/', routerHelper.invokeRestfulAction(req => this.list(req)));
        this.get('/:id', routerHelper.invokeRestfulAction(req => this.find(req)));
        this.post('/', routerHelper.invokeRestfulAction(req => this.create(req)));
    }
    // ...
}
```

Mounted from the server:

```typescript
protected async setupRoutes(): Promise<void> {
    await this.bindRoutes('/users', () => import('./routes/UserRoutes.js'));
}
```

The final path is `contextRoot` + the mount path + the route path, so with
`contextRoot: '/api'` the second handler answers `GET /api/users/:id`. The module's
**default export** must be the class, and it is imported dynamically — the route file is not
loaded until the server mounts it.

## Two handler wrappers

`invokeRestfulAction(fn)` is for handlers that return a value:

```typescript
routerHelper.invokeRestfulAction(async (req) => {
    return await this.service.find(String(req.params.id));
})
```

The return value is sent as JSON. `null` or `undefined` becomes `204 No Content`. A thrown
error goes to the error middleware. You never touch `res`, which means you cannot forget to
send a response.

`invokeController(fn)` is for handlers that must control the response themselves — a file
download, a stream, a non-JSON content type:

```typescript
routerHelper.invokeController(async (req, res) => {
    const file = await this.service.export(String(req.params.id));
    res.setHeader('Content-Type', 'text/csv');
    res.send(file);
})
```

Errors are still caught for you. The difference is only that you own the response.

Anything else is an ordinary Express handler — `this.get('/x', (req, res) => {...})` works,
you just lose the error handling.

## Controllers

For the common CRUD shape, `CommonController<T>` wraps a service and gives you handlers:

```typescript
import { CommonSearchController } from '@ticatec/keelson-express';
import { beanFactory } from '@ticatec/keelson-core';

export class UserController extends CommonSearchController<UserService> {
    constructor() {
        super(beanFactory.createBean<UserService>('UserService')!);
    }
}

export default class UserRoutes extends AuthenticatedRoutes {
    private controller = new UserController();

    protected bindRoutes() {
        this.post('/', routerHelper.invokeRestfulAction(this.controller.createNew()));
        this.put('/', routerHelper.invokeRestfulAction(this.controller.update()));
        this.get('/', routerHelper.invokeRestfulAction(this.controller.search()));
    }
}
```

`CommonController` gives you `createNew()`, `update()` and `del()`.
`CommonSearchController` adds `search()`, which passes `req.query` to the service as
criteria. Each returns a handler, so you still choose the paths and the verbs.

The controller calls the service method of the same name — `createNew()` calls
`service.createNew(...)` — and throws `ActionNotFoundError` (404) if the service does not
have it. That is how a controller can be generic without an interface: the check is at
call time, and it fails as a clean 404 rather than `undefined is not a function`.

### What gets passed to the service

By default, the logged user and the request body:

```typescript
protected getCreateNewArguments(req: Request): Array<any> {
    return [this.getLoggedUser(req), req.body];
}
```

Override it when your service wants something else — a tenant from the path, a header:

```typescript
export class UserController extends CommonSearchController<UserService> {
    protected override getCreateNewArguments(req: Request): Array<any> {
        return [this.getLoggedUser(req), String(req.params.tenantId), req.body];
    }
}
```

`getLoggedUser(req)` returns the impersonated user when impersonation is active, and the
real one otherwise — chapter 5.

To reshape the body before validation, override `buildNewEntry(req)` / `buildUpdatedEntry(req)`.

### `del()` needs you

`_del()` throws `ActionNotFoundError` unless you override it. Deleting is rarely a plain
"call the service with the id" — there is usually a soft-delete flag, a cascade, or a rule
about who may — so the framework declines to guess.

### An endpoint that is not CRUD

`BaseController<T, U = RegisteredUser>` is the layer beneath `CommonController`: it holds the injected service, the logger, and `this.getLoggedUser(req): U` for resolving the current authenticated user. Extend it when the endpoint has its own shape — an export, an approval step, a bulk action — and write the method yourself.

When a controller serves a specific user type (such as an administrative user with distinct permissions), specify the second generic parameter (e.g. `BaseController<ReportService, AdminUser>`). `this.getLoggedUser(req)` will then return the strongly-typed user directly without manual type assertions.

For public endpoints, webhook handlers, or health probes that need neither a service nor user authentication context, extend the lightweight root class `Controller` directly: it provides structured logging and the global debug switch with zero overhead.

Inside it, two protected helpers give you the same late-bound dispatch the CRUD methods
use:

```typescript
import { BaseController } from '@ticatec/keelson-express';
import type { RestfulFunction } from '@ticatec/keelson-express';

export class ReportController extends BaseController<ReportService> {

    constructor(service: ReportService) {
        super(service);          // BaseController's constructor is protected — declare a public one
    }

    exportCsv(): RestfulFunction {
        return async (req) => this.service.exportCsv(
            this.getLoggedUser(req), String(req.query.month)
        );
    }
}
```

You have a typed service here, so call it directly. The late-bound pair —
`checkInterface(name)`, which throws `ActionNotFoundError` when the method is missing, and
`invokeServiceInterface(name, args)`, which calls it — lives one level up on
`CommonController`, and is what lets the CRUD methods stay generic over a service they
have no interface for. Extend `CommonController` if you want them.

A `RestfulFunction` takes the request and returns a value — it is not an Express handler,
so it still goes through `routerHelper.invokeRestfulAction(...)` when you bind it.

## Validation

Declare rules; the controller runs them before calling the service.

```typescript
import { StringValidator, NumberValidator, ValidationRules } from '@ticatec/bean-validator';

protected getCreateRules(): ValidationRules {
    return [
        new StringValidator('name', { required: true, maxLen: 64 }),
        new StringValidator('email', {
            required: true,
            maxLen: 128,
            format: { regex: /^[^@\s]+@[^@\s]+\.[^@\s]+$/, message: 'Not a valid email address' }
        }),
        new NumberValidator('age', { minValue: 0, maxValue: 150 })
    ];
}
```

`getCreateRules()` and `getUpdateRules()` both fall back to `getRules()`, so when create and
update share a shape you override `getRules()` once. They differ more often than you expect
— update usually requires an `id` that create must not have — which is why they are separate
hooks.

A failure throws `IllegalParameterError`, which the error middleware renders as `400` with
the validator's message. Validators also sanitise: `trim` is on by default for strings, and
`toLowerCase` / `toUpperCase` are available.

Validation only covers what the rules mention. A field with no rule passes through
untouched, so a service that reads `body.isAdmin` will happily read whatever the client
sent. Either declare every field you intend to accept, or build the entity explicitly in
`buildNewEntry()`.

## Errors

Throw from anywhere in the call tree; the middleware maps the type to a status:

| Throw | Status |
| --- | --- |
| `IllegalParameterError(message)` | 400 |
| `UnauthenticatedError()` | 401 |
| `InsufficientPermissionError()` | 403 |
| `ActionNotFoundError()` | 404 |
| `ConflictError(message)` | 409 |
| `TooManyRequestsError()` | 429 |
| `TimeoutError()` | 408 |
| `AppError(message?)` | 500 |
| `ProxyError()` | 502 |
| `ServiceUnavailableError()` | 503 |

Only the ones that carry a caller-facing explanation take a message. `ActionNotFoundError`
and `UnauthenticatedError` have fixed messages — telling an unauthenticated caller *why*
authentication failed is how you build an account-enumeration oracle.

Every constructor also takes `ErrorOptions`, so the original error survives:

```typescript
throw new IllegalParameterError('Invalid date range', { cause: parseError });
```

An error that is not an `HttpError` becomes a 500 with a generic body. The stack is included
only outside production; `NODE_ENV=production` strips it.

The response is content-negotiated from `Accept` — JSON by default, HTML or plain text if
that is what the client asked for. All interpolated values are HTML-escaped.

What gets logged: 5xx at `error` with the stack, 4xx at `debug`. A client sending a bad
request is not an incident, and logging it at warning level is how a dashboard fills with
noise. Your handlers should not log errors themselves — by the time the middleware sees it,
it is already recorded.

## Route groups and authentication

`CommonRoutes` is open by default. `AuthenticatedRoutes` rejects a request with no user:

```typescript
export default class UserRoutes extends AuthenticatedRoutes { /* ... */ }
```

For anything finer, override `isValidUser()` — chapter 5.

---

Deeper reference: [keelson-express's README](../packages/keelson-express/README.md) for
controllers and routes, [bean-validator's README](../packages/bean-validator/README.md) for
every validator and option, and [the web-layer prompts](../ai-prompts/AI_PROMPTS_2_WEB.md)
for the rules.

Next: [Identity and access control](05-identity.md).
