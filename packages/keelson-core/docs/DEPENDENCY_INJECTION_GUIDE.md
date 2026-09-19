# Dependency Injection & Bean Management Guide

[中文文档](DEPENDENCY_INJECTION_GUIDE_CN.md) | English

This document explains dependency management in `@ticatec/keelson-core` v4 — `beanFactory` for registration and lookup, and `Beans` for deferred module loading.

## 📚 Table of Contents

1. [Lazy Bean Proxies](#lazy-bean-proxies)
2. [Registering & Retrieving Beans](#registering--retrieving-beans)
3. [Deferred Registration with `Beans`](#deferred-registration-with-beans)
4. [Circular Dependency Prevention](#circular-dependency-prevention)
5. [Isolated Registries](#isolated-registries)
6. [Best Practices](#best-practices)

---

## Lazy Bean Proxies

The package exports a singleton registry as its default export, `beanFactory`.

`beanFactory.register(name, Class)` does **not** instantiate the class. `beanFactory.createBean<T>(name)` returns a transparent Proxy; the real instance is constructed on the first property or method access and cached as a singleton from then on. Calling `createBean(name)` repeatedly with the same name always returns the same proxy.

```typescript
import { beanFactory } from '@ticatec/keelson-core';
import { UserDAO } from './dao/UserDAO';
import { UserRepository } from './repository/UserRepository';
import { UserService } from './service/UserService';

// 1. Register constructors — nothing is built yet
beanFactory.register('UserDAO', UserDAO);
beanFactory.register('UserRepository', UserRepository);
beanFactory.register('UserService', UserService);

// 2. Retrieve the lazy singleton proxy
const userService = beanFactory.createBean<UserService>('UserService');

// 3. The real UserService is constructed here, on first access
await userService.registerUser({ name: 'Ada', email: 'ada@example.com' });
```

---

## Registering & Retrieving Beans

| Method | Signature | Notes |
| --- | --- | --- |
| `register` | `register(name: string, beanClass: any): void` | Registering an existing name replaces the class and discards the cached proxy |
| `createBean` | `createBean<T>(name: string): T \| undefined` | Returns **`undefined`** when nothing is registered under that name |

`createBean` returning `undefined` is why the framework base classes wrap it:

```typescript
// CommonService
protected getRepositoryInstance<T extends object>(name: string): T

// CommonRepository
protected getDAOInstance<T extends object>(name: string): T
```

Both throw a descriptive error rather than handing back `undefined`:

```
Repository "UserRepository" is not registered in BeanFactory.
Please register it via beanFactory.register('UserRepository', Class) before usage.
```

Prefer those helpers inside Services and Repositories; use `beanFactory.createBean()` directly only at the composition root (controllers, bootstrap code, tests), and handle the `undefined` case there.

---

## Deferred Registration with `Beans`

`Beans` registers async loader functions and resolves them into `beanFactory` in one pass. It suits code-split builds and large applications where you would rather not import every class at startup.

```typescript
import { Beans } from '@ticatec/keelson-core';

const beans = Beans.getInstance();

beans.register('UserDAO', () => import('./dao/UserDAO.js'));
beans.register('UserRepository', () => import('./repository/UserRepository.js'));
beans.register('UserService', () => import('./service/UserService.js'));

// Resolves every loader and registers each module's default export into beanFactory
await beans.load();
```

| Method | Purpose |
| --- | --- |
| `Beans.getInstance()` | Singleton accessor |
| `register(name, loader)` | Records a `() => Promise<any>` loader under a name |
| `load()` | Awaits every loader and registers its `default` export into `beanFactory` |

> Each loader's module must have a **default export** — that is what gets registered.

---

## Circular Dependency Prevention

Because construction is deferred until first use, a cycle across module boundaries (`import` / `require`) no longer throws `ReferenceError: Cannot access 'X' before initialization` at load time. Registering A and B that reference each other is fine — neither is built until something actually calls a method on its proxy.

If a genuine cycle occurs *during construction* — A's constructor uses B, whose constructor uses A — the factory detects it and reports the chain:

```
Error: Circular dependency detected: UserService -> AuditService -> UserService
```

That is a design problem the proxy cannot paper over. Break it by moving the dependency out of the constructor and resolving it lazily in a getter:

```typescript
export class UserService extends CommonService {
  // Resolved on use, not during construction
  private get auditService(): AuditService {
    return this.getRepositoryInstance<AuditService>('AuditService');
  }
}
```

---

## Isolated Registries

`beanFactory` is the shared singleton, but the `BeanFactory` class is exported too — useful when a test needs its own registry instead of mutating global state:

```typescript
import { BeanFactory } from '@ticatec/keelson-core';

const registry = new BeanFactory();
registry.register('UserDAO', FakeUserDAO);
const dao = registry.createBean<UserDAO>('UserDAO');
```

> **Changed in 4.0.0.** The `BeanFactory` export previously resolved to the singleton instance — the same object as `beanFactory` — so `new BeanFactory()` was impossible. It is now the class.

---

## Best Practices

- Register every bean at application startup, before the first request is served.
- Use one consistent naming convention for bean names — the class name is the obvious choice, and it is what the error messages quote back at you.
- Keep beans stateless. They are singletons shared across every request; per-request state belongs in method arguments or the transaction context.
- Resolve dependencies in a getter rather than a field initialiser, so lookup happens on first use instead of at construction time — this keeps registration order from mattering.
- In tests, prefer a fresh `new BeanFactory()` over re-registering onto the global singleton.
