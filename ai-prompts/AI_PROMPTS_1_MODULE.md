# 1. Module setup and access control

[中文](AI_PROMPTS_1_MODULE_CN.md) | English · [Index](README.md)

Standing up a Keelson module: the server class, its lifecycle, the database, bean
registration, and deciding who is allowed in.

## What the layer is responsible for

`BaseServer` calls four hooks in a fixed order, and what goes in each is not a matter of
taste:

| Hook | What belongs there |
| --- | --- |
| `loadConfigFile()` | Load configuration, initialise the logger, `AppConf.init()` |
| `beforeStart()` | Database, user resolver, bean registration, health checks, processors |
| `getWebConf()` | Return `{ port, ip, contextRoot }` from config — a pure read |
| `setupRoutes()` | `bindRoutes()` calls, nothing else |

Anything a request could touch must exist by the end of `beforeStart()`. The Express app
does not exist until after it, which is why `bindRoutes()` cannot be called earlier.

## Access control has two layers, and they answer different questions

**Who is the caller?** — a `UserResolver`. The default reads a `user` header injected by an
API gateway. It never rejects anyone; no header means no `req.user`.

**May this caller into this route group?** — `isValidUser()` on the route class, or
`AuthenticatedRoutes` for the plain "must be logged in" case.

Per-record permission is neither of these; it belongs in the service, because it needs the
record.

---

## Prompt 1.1 — Scaffold the server class

```
Create the entry point and server class for a Keelson module.

Module name: <orders>
Database: <PostgreSQL, via @ticatec/keelson-pg>
Context root: <"/api">

Produce:

1. src/main.ts
   - `import 'reflect-metadata';` as the first line
   - initialise the logger with @ticatec/logger-pino from the loaded logger config
   - `BaseServer.startup(new <Orders>Server());`
   - a SIGTERM and SIGINT handler that calls server.shutdown() then process.exit(0)

2. src/<Orders>Server.ts — a class extending BaseServer with:
   - a public constructor calling super() (BaseServer's is protected, so this is required)
   - loadConfigFile(): use loadConfig('local', 'app.yaml', 'logger.yaml') from
     @ticatec/config-loader, initialise the logger, then AppConf.init(appConf)
   - getWebConf(): return AppConf.getInstance()!.get('web')
   - beforeStart(): DBManager.init(initializePg(AppConf.getInstance()!.get('database')))
   - setupRoutes(): empty for now, with a comment showing the bindRoutes call shape

3. config/app.yaml and config/logger.yaml with the shape those calls expect

Do not register any beans yet. Do not add routes yet.
```

## Prompt 1.2 — Register the beans

```
Add bean registration to <Orders>Server.beforeStart().

Register these, in this order, using Beans.getInstance() with dynamic-import loaders. Note
what is deferred and what is not: beans.load() awaits every loader in one pass, so all the
modules are imported and registered at startup. What stays lazy is instantiation — the
class is only constructed the first time a bean is actually resolved. The loaders keep the
wiring out of the entry file's import graph, which is what breaks module-level cycles:

  <OrderDAO>          -> ./dao/<OrderDAO>.js
  <OrderRepository>   -> ./repository/<OrderRepository>.js
  <OrderService>      -> ./service/impl/<OrderServiceImpl>.js

Note that the service is registered under the INTERFACE name (<OrderService>) while the
loader points at the IMPLEMENTATION module. Call `await beans.load()` at the end.

Each loader module must have the class as its default export.

Registration goes after DBManager.init() and before anything that could resolve a bean.
```

## Prompt 1.3 — The default gateway resolver

```
This service sits behind an API gateway that authenticates the caller and injects the
result as the `<x-auth-user>` request header, URL-encoded JSON.

1. Define the application's user model in src/types/user-registry.d.ts:

   import type { CommonUser } from '@ticatec/keelson-express';

   interface AppUser extends CommonUser {
       accountCode: string;
       name: string;
       tenantCode: string;
       roles: string[];
       actAs?: AppUser;
   }

   Register it by augmenting CustomUserRegistry from '@ticatec/keelson-express', so that
   req.user and getLoggedUser(req) are typed as AppUser everywhere without casts.

   RegisteredUser resolves through `U extends CommonUser ? U : LoggedUser`. Extend
   CommonUser explicitly so the declared intent is what the type checks, rather than
   relying on the structural match.

2. If the header name is not the default `user`, subclass HeaderUserResolver and override
   userHeader() only — leave decoding and the language header alone.

3. Install it with setUserResolver() in beforeStart(), before routes are set up.

4. In a comment above the resolver, state the deployment requirement: this header is
   trusted completely, so the service must be unreachable except through the gateway, and
   the gateway must strip any client-supplied copy of the header.
```

## Prompt 1.4 — A resolver that verifies a token

```
Replace the default resolver: this service is reachable directly, so it must verify the
caller itself rather than trusting a header.

Create src/auth/<Jwt>UserResolver.ts:

1. Extend HeaderUserResolver
2. Override userHeader() to return 'authorization'
3. Override decode(raw) to strip a leading 'Bearer ' and verify the token with <jose>,
   returning the claims mapped onto AppUser
4. Let verification failures throw — the framework logs them and treats the request as
   anonymous, which the route layer then rejects

Install it with setUserResolver() in beforeStart().

Do not reject requests inside the resolver, and do not return a partially populated user
when verification fails.

JSDoc on every protected method you override — userHeader, decode and any other — saying
what it changes relative to the default.
```

## Prompt 1.5 — A resolver for a non-header source

```
The caller's identity comes from <a session cookie / a database-backed session store>,
not from a header.

Create src/auth/<Session>UserResolver.ts extending UserResolver (the abstract base, not
HeaderUserResolver) with a single resolve(req) method that returns the user or undefined.

Import it as a named export: `import { UserResolver } from '@ticatec/keelson-express'` —
the package's default export is BaseServer.

Returning undefined means anonymous; that is how a public route stays public.
```

## Prompt 1.6 — Route-group authorisation

```
Define the access rule for the <orders> route group.

Requirements:
- <Every caller must be authenticated and belong to a tenant>
- <Callers with the role ORDER_ADMIN may reach the /admin sub-group>

Generate the route classes:

1. <Order>Routes extends AuthenticatedRoutes — rejects an anonymous caller with 401,
   then overrides isValidUser(user) to <return user.tenantCode != null>
2. <Order>AdminRoutes extends CommonRoutes — overrides isValidUser(user) to check the
   role, and throws InsufficientPermissionError() rather than returning false, so the
   caller gets 403 instead of 401

isValidUser receives the actAs user when impersonation is active. Do not put per-record
permission checks here — those go in the service.

JSDoc on isValidUser in both classes stating the rule it enforces. Where the admin class
throws InsufficientPermissionError, log the reason and the role set first.
```

## Prompt 1.7 — Health checks and processors

```
Add to <Orders>Server.beforeStart(), after DBManager.init():

1. A critical health check named 'database' that takes a connection, runs SELECT 1, and
   closes it in a finally block. Critical means a failure takes the pod out of rotation.

2. A non-critical health check named 'cache' returning UP/DOWN from a Redis ping. Non-
   critical means a failure reports DEGRADED with a 200 — a cold cache is slow, not broken.

3. Register <OrderExpiryProcessor> with ProcessorManager.getInstance() and call startAll().
   Registration must come after the database and the beans, because a processor can fire
   its first tick within a second of starting.

Use this.registerHealthCheck(name, indicator, isCritical, timeoutMs). The timeout defaults
to 3000ms; keep it below the probe's own timeout.
```

---

Next: [Web layer](AI_PROMPTS_2_WEB.md). Deeper background: tutorial chapters
[1](../../tutorial/01-getting-started.md), [5](../../tutorial/05-identity.md) and
[6](../../tutorial/06-logging-and-health.md).
