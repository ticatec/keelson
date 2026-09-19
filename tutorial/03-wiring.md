# 3. Wiring

[中文](03-wiring_CN.md) | English · [Tutorial index](README.md)

A Service needs a Repository, which needs a DAO. Written with `new`, that becomes an
initialisation order you have to get right and keep right. Keelson's answer is a registry
of names and a proxy that defers construction until first use.

## Register, then ask by name

```typescript
import { beanFactory } from '@ticatec/keelson-core';

beanFactory.register('UserDAO', UserDAO);
beanFactory.register('UserRepository', UserRepository);
beanFactory.register('UserService', UserService);
```

`register()` stores the class. It does not call the constructor — nothing is instantiated
here, so the order of these three lines does not matter.

Asking for one back:

```typescript
const service = beanFactory.createBean<UserService>('UserService');
```

What comes back is a `Proxy`. The real `UserService` is constructed the first time you touch
a property or call a method on it, and cached from then on. Call `createBean` again with the
same name and you get the same proxy, backed by the same instance.

That is what removes the ordering problem. `UserService`'s constructor can reference
`UserRepository`, which references `UserDAO`, and none of them is built until a request
actually arrives — by which time everything is registered.

## Inside the layers, use the typed accessors

`beanFactory.createBean()` is the entry point from outside — your startup code, a route
class. Inside the layers, use the accessor the base class gives you:

```typescript
export class UserService extends CommonService {
    private get userRepo(): UserRepository {
        return this.getRepositoryInstance<UserRepository>('UserRepository');
    }
}

export class UserRepository extends CommonRepository {
    private get userDAO(): UserDAO {
        return this.getDAOInstance<UserDAO>('UserDAO');
    }
}
```

They differ in one way that matters. `createBean<T>()` returns `T | undefined` — undefined
when the name was never registered — so `strict` makes you handle it, usually with `!`.
`getRepositoryInstance()` and `getDAOInstance()` return `T` and **throw** when the name is
missing, with a message naming the bean and telling you to register it.

The asymmetry is deliberate: a missing bean deep inside a request is a programming error you
want loud and immediate, not an `undefined` that travels three more frames before turning
into `Cannot read properties of undefined`.

## Why a getter and not a field

Notice the accessors are getters, not fields assigned in the constructor:

```typescript
// do this
private get userRepo(): UserRepository {
    return this.getRepositoryInstance<UserRepository>('UserRepository');
}

// not this
private userRepo = this.getRepositoryInstance<UserRepository>('UserRepository');
```

A field initialiser runs during construction. Since construction happens lazily on first
use, a field would resolve its dependency at that moment — which is usually fine, but ties
the two lifetimes together for no benefit. A getter resolves on each access and costs a map
lookup, because the proxy is cached.

## Circular dependencies

`UserService` uses `AccountService`, which uses `UserService`. With `new`, that is a stack
overflow. With lazy proxies, it is fine — as long as neither constructor *uses* the other
during construction.

```typescript
// fine: each only resolves the other when a method actually runs
class UserService extends CommonService {
    private get accounts(): AccountService {
        return beanFactory.createBean<AccountService>('AccountService')!;
    }
}
```

What is not fine is calling into the other one from a constructor. The factory detects that
and throws with the chain spelled out:

```
Circular dependency detected: UserService -> AccountService -> UserService
```

That message is telling you a constructor is doing work it should not. Move it into a
method.

## Registering a lot of beans

Listing every class in `beforeStart()` gets long, and each one is an import at the top of
your entry file — which means every class is loaded at startup whether the process ever uses
it or not. `Beans` registers *loaders* instead:

```typescript
import { Beans } from '@ticatec/keelson-core';

protected async beforeStart(): Promise<void> {
    DBManager.init(initializePg(AppConf.getInstance()!.get('database')));

    const beans = Beans.getInstance();
    beans.register('UserDAO', () => import('./dao/UserDAO.js'));
    beans.register('UserRepository', () => import('./repository/UserRepository.js'));
    beans.register('UserService', () => import('./service/UserService.js'));

    await beans.load();
}
```

Each loader is a dynamic import whose module's **default export** is the class. `load()`
walks them, imports each one and hands the class to `beanFactory` under that name. From
there everything behaves exactly as before.

This also breaks import cycles at the module level, which the lazy proxy cannot help with —
two modules that import each other at the top are a problem before any of your code runs.

## Where registration belongs

In `beforeStart()`, always. It runs after config is loaded and before the Express app
exists, which is the window where the database has been initialised and no request can
arrive yet.

Registering inside `setupRoutes()` works by accident — routes are bound before the server
listens — but it puts the registration after `addHealthCheck()`, so a health indicator that
resolves a bean would find it missing.

## One registry per process

`beanFactory` is a singleton, and singletons in a package that ships both CommonJS and ESM
are a trap: two module formats, two module-level variables, two registries. Register through
one and resolve through the other, and the bean is simply not there.

Keelson anchors it on `globalThis` under a `Symbol.for()` key, so both builds share one
registry. You do not have to do anything about this — it is worth knowing only because it
explains why `beanFactory` is not just an exported `const`.

## When a bean is missing

```
Repository "UserRepository" is not registered in BeanFactory.
Please register it via beanFactory.register('UserRepository', Class) before usage.
```

Three usual causes, in order of likelihood: a typo between the `register` name and the
lookup name — they are strings, nothing checks them; registration in the wrong lifecycle
method; or a `Beans` loader pointing at a module with no `default` export.

## Keep beans stateless

A bean is one instance shared by every request in the process. Anything you assign to
`this` outside the constructor is visible to the next request, and under load that is two
requests writing the same field. Per-request state travels as arguments, or in the
transaction context — never on the service.

## A registry of your own

`BeanFactory` is exported as a class as well as a singleton, so `new BeanFactory()` gives
you a private registry that nothing else can see.

It is narrower than it sounds. `CommonService.getRepositoryInstance()` and
`CommonRepository.getDAOInstance()` read the module-level singleton and take no registry
argument, so a test that exercises a service or a repository has to register onto the
global `beanFactory` regardless. A private instance is only useful for code that calls the
registry directly.

---

Next: [The HTTP layer](04-http-layer.md) — routes, controllers, validation and errors.
