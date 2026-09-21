# 5. Identity and access control

[中文](05-identity_CN.md) | English · [Tutorial index](README.md)

Where `req.user` comes from, how to type it as your own model, and the three places a
request can be turned away.

## The default: the gateway tells you who is calling

Keelson assumes it sits behind an API gateway that has already authenticated the caller and
injects the result as a request header. `HeaderUserResolver` reads it:

- `user` — URL-encoded JSON describing the caller
- `x-language` — optional, copied onto the user as `language`

```
user: %7B%22accountCode%22%3A%22U1%22%2C%22name%22%3A%22Ada%22%7D
```

becomes `req.user = { accountCode: 'U1', name: 'Ada', language: 'en' }`.

> **That header is trusted, completely.** Whatever arrives in it becomes the caller. This is
> only safe when the service cannot be reached except through a gateway that sets the header
> itself and **strips any client-supplied copy**. Expose the service directly — a misrouted
> ingress, a debug port, a teammate curling the pod — and any client can name itself anyone,
> including an administrator.
>
> If you cannot guarantee that, do not use the default resolver. Use one that verifies a
> signature.

Nothing rejects a request at this stage. A request with no `user` header simply has no
`req.user`, which is how a public route stays public. A malformed header is logged and
treated the same way — a garbled header is not an authentication failure, it is a missing
identity.

## Replacing the resolver

Change one step by extending `HeaderUserResolver`:

```typescript
import { HeaderUserResolver, setUserResolver } from '@ticatec/keelson-express';

class BearerResolver extends HeaderUserResolver {
    protected override userHeader(): string {
        return 'authorization';
    }
    protected override decode(raw: string): unknown {
        return verifyJwt(raw.replace(/^Bearer /, ''));   // throws on a bad token
    }
}
```

The other steps — reading the header, the language header, applying the language — carry on
unchanged. Throwing from `decode()` is fine: it is logged and the request continues as
anonymous, which the route layer then rejects if it requires a user.

When the identity does not come from a header at all, extend `UserResolver`:

```typescript
import { UserResolver, setUserResolver } from '@ticatec/keelson-express';
import { Request } from 'express';

class SessionResolver extends UserResolver {
    async resolve(req: Request) {
        const sid = req.cookies?.sid;
        return sid ? await sessions.get(sid) : undefined;
    }
}
```

Install it once, at the composition root, before the server starts:

```typescript
protected async beforeStart(): Promise<void> {
    setUserResolver(new SessionResolver());
}
```

A resolver never rejects. Returning `undefined` means anonymous; authorisation is a separate
job, below.

## Typing the user as your own model

`CommonUser` and `LoggedUser` are deliberately empty — the framework never reads a field off
the user, so it declares none. Your application declares the shape, once, by augmenting
`CustomUserRegistry`:

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

From then on `req.user` and `getLoggedUser(req)` are typed as `AppUser` by default everywhere, with no
casts. `req.user` is declared on Express's `Request` by this package, so you do not augment
`Express.Request` yourself.

If your service caters to multiple distinct clients simultaneously (e.g. back-office administrators and mobile end-users), you can also specify the user type directly via the controller's generic parameter: `class AdminController extends BaseController<AdminService, AdminUser>`. In that controller, `this.getLoggedUser(req)` resolves directly to `AdminUser`.

## Impersonation

An `actAs` field on the user means "this administrator is acting as that user". Two rules
follow from it:

`getLoggedUser(req)` returns **the impersonated user** when `actAs` is present, and the real
one otherwise. Business code therefore operates on whoever the request is acting as, without
knowing impersonation exists:

```typescript
protected getCreateNewArguments(req: Request): Array<any> {
    return [this.getLoggedUser(req), req.body];   // the actAs user, if any
}
```

`isValidUser()` is also handed the `actAs` user when one is present. That is what you want —
the question is whether *the account being acted as* may do this — but it means the real
administrator is not re-checked at this point. If your rules need both, read `req.user`
directly.

## Authorisation: three places, three questions

**1. Does this route group need a user at all?**

```typescript
export default class UserRoutes extends AuthenticatedRoutes { /* ... */ }
```

`AuthenticatedRoutes` rejects a request with no user — a `401`. `CommonRoutes` is open.

**2. Is this particular user allowed into this route group?**

```typescript
export default class AdminRoutes extends CommonRoutes {
    protected override async isValidUser(user: RegisteredUser): Promise<boolean> {
        if (user == null) {
            return false;
        }
        const account = await accounts.find(user.accountCode);
        return account?.status === 'active' && account.role === 'admin';
    }
}
```

Returning false produces a `401`. Throwing passes the error to the middleware, so throw
`InsufficientPermissionError()` when `403` is the honest answer — "you are who you say you
are, and you still may not".

The check runs once per request, before any handler. It is the right place for coarse
questions: is the account active, is the tenant enabled, does the role match this group.

**3. May this user do this to this record?**

That belongs in the Service, because it needs the record:

```typescript
@Transaction()
async updateOrder(user: AppUser, order: Order): Promise<void> {
    const existing = await this.orders.findById(order.id);
    if (existing == null) {
        throw new ActionNotFoundError();
    }
    if (existing.tenantCode !== user.tenant?.code) {
        throw new ActionNotFoundError();      // not 403 — see below
    }
    await this.orders.update(order);
}
```

Note the `404` for a record belonging to another tenant. A `403` would confirm the record
exists, which lets someone enumerate other tenants' ids. Answer as if it is not there,
because from that caller's perspective it is not.

## Enriching the user before the checks

`getUserHook()` runs before `isValidUser()` and can replace `req.user`:

```typescript
protected override getUserHook() {
    return async (user: RegisteredUser) => {
        (user as AppUser).permissions = await permissions.load((user as AppUser).accountCode);
        return user;
    };
}
```

It runs on every request in the group, so it is a database round-trip per request. Cache it
(chapter 8) or fold the data into the gateway's header instead.

## What is not logged

The framework does not write the user identity into the log. The `user` header is never
echoed, and a failed `isValidUser()` records the route and whether impersonation was in play
— not who was rejected.

That is a deliberate default, not an oversight: a debug log that names every caller is a
personal-data store nobody planned for. If you want per-user request tracing, add it in your
own middleware where you decide the retention.

---

Next: [Logging and health](06-logging-and-health.md).
