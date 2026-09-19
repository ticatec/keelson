# Service & Repository Layer Development Guide

[中文文档](SERVICE_GUIDE_CN.md) | English

This guide explains how to build and maintain Services and Repositories with `@ticatec/keelson-core` v4.

## 📚 Table of Contents

1. [4-Tier Architecture](#-4-tier-architecture)
2. [Repository Layer (`CommonRepository`)](#1-repository-layer-commonrepository)
3. [Service Layer (`CommonService`) & `@Transaction`](#2-service-layer-commonservice--transaction)
4. [Transaction Propagation](#3-transaction-propagation)
5. [Transactions Without the Decorator](#4-transactions-without-the-decorator)
6. [Core Rules & Safeguards](#-core-rules--safeguards)

---

## 📚 4-Tier Architecture

To keep concerns separated, **Services never reference DAOs directly** — they go through the **Repository** layer:

```
┌─────────────────────────────────────────┐
│          Controller / Router            │  HTTP request handling
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│            Service Layer                │  Business logic & declarative transactions (@Transaction)
│  - Extends CommonService                │
│  - Calls Repositories via               │
│    getRepositoryInstance<T>(name)       │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│           Repository Layer              │  Domain persistence & DAO aggregation
│  - Extends CommonRepository             │
│  - Calls DAOs via getDAOInstance<T>(name)│
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│             DAO Layer                   │  Single-table access / SQL execution
│  - Extends CommonDAO                    │
│  - Resolves the ambient connection via  │
│    await this.getDBConnection()         │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│             Database                    │  Data storage
└─────────────────────────────────────────┘
```

The transaction opened by the Service is carried down through `AsyncLocalStorage`, so every DAO statement in the call tree runs on the same connection without anyone passing it as an argument.

---

## 1. Repository Layer (`CommonRepository`)

Repositories encapsulate persistence logic and aggregate DAO calls:

```typescript
import { CommonRepository } from '@ticatec/keelson-core';
import type { UserDAO } from '../dao/UserDAO';
import type { ProfileDAO } from '../dao/ProfileDAO';

export interface User {
  id?: string;
  name: string;
  email: string;
  bio?: string;
}

export class UserRepository extends CommonRepository {

  private get userDAO(): UserDAO { return this.getDAOInstance<UserDAO>('UserDAO'); }
  private get profileDAO(): ProfileDAO { return this.getDAOInstance<ProfileDAO>('ProfileDAO'); }

  async findUserWithProfile(id: string): Promise<User | null> {
    const user = await this.userDAO.findById(id);
    if (!user) return null;
    const profile = await this.profileDAO.findByUserId(id);
    return { ...user, bio: profile?.bio };
  }

  async saveUser(user: User): Promise<string> {
    const userId = user.id || this.genID();          // genID() comes from CommonRepository
    await this.userDAO.create({ ...user, id: userId });
    if (user.bio) {
      await this.profileDAO.saveProfile(userId, user.bio);
    }
    return userId;
  }
}
```

Two things worth noting:

- **Resolve DAOs through a getter, not a field initialiser.** `getDAOInstance()` throws when the bean is not registered yet, and a field initialiser runs at Repository construction time — which may be before `beanFactory.register()` has run for that DAO. A getter defers the lookup to first use. (The returned object is a lazy proxy either way, so there is no extra cost.)
- **`genID()` / `genUUID()` belong to the Repository.** They are `protected` on `CommonDAO` too, so `this.userDAO.genID()` would not compile — call `this.genID()` on the Repository instead.

`CommonRepository` members:

| Member | Purpose |
| --- | --- |
| `getDAOInstance<T>(name)` | Returns the registered DAO proxy; throws a descriptive error when it is missing |
| `genID()` | 32-character UUID v7 without dashes |
| `genUUID()` | Canonical 36-character UUID v7 with dashes |
| `logger` | Logger scoped to the concrete Repository class name |

---

## 2. Service Layer (`CommonService`) & `@Transaction`

Services extend `CommonService`, reach Repositories through `getRepositoryInstance<T>(name)`, and declare transaction boundaries with `@Transaction`.

```typescript
import { CommonService, Transaction, Propagation } from '@ticatec/keelson-core';
import type { UserRepository, User } from '../repository/UserRepository';

export class UserService extends CommonService {

  private get userRepo(): UserRepository {
    return this.getRepositoryInstance<UserRepository>('UserRepository');
  }

  @Transaction()
  async registerUser(user: User): Promise<string> {
    this.logger.info({ email: user.email }, 'Registering user');   // logger comes from CommonService

    const existing = await this.userRepo.findUserWithProfile(user.id || '');
    if (existing) {
      throw new Error('User already exists');                      // throwing rolls the transaction back
    }

    return await this.userRepo.saveUser(user);
  }

  @Transaction(Propagation.REQUIRES_NEW)
  async logAuditRecord(action: string, payload: any): Promise<void> {
    // Independent transaction: commits even if the outer transaction rolls back
  }
}
```

> Do **not** redeclare `logger` in a subclass. `CommonService` already exposes a `protected readonly logger` scoped to the subclass name; redeclaring it as `private` is a TypeScript error.

How the wiring works: `@Transaction` only records metadata through `reflect-metadata`. The actual weaving happens in the `CommonService` constructor, which walks the prototype chain and wraps each annotated method in `TransactionManager.execute(propagation, …)`. Two consequences:

- The decorator has **no effect** on a class that does not extend `CommonService`.
- Wrapping is idempotent — an inherited method already wrapped by a parent class is not wrapped a second time, so `REQUIRES_NEW` opens exactly one transaction rather than two.

`CommonService` members:

| Member | Purpose |
| --- | --- |
| `getRepositoryInstance<T>(name)` | Returns the registered Repository proxy; throws when it is missing |
| `getDBConnection()` | Returns the connection of the current transaction |
| `logger` | Logger scoped to the concrete Service class name |

---

## 3. Transaction Propagation

| Propagation | Behaviour |
| --- | --- |
| `REQUIRED` (default) | Joins the surrounding **transaction** if one is active; otherwise opens a new connection and starts a transaction |
| `REQUIRES_NEW` | Always opens an independent connection and transaction, suspending the surrounding context |
| `NONE` | Runs on a fresh, non-transactional connection — statements auto-commit |

`NONE` establishes a context so DAOs can still resolve a connection, but that context is **not** transactional. A `REQUIRED` method called from inside a `NONE` context therefore starts a real transaction of its own instead of silently joining the auto-commit connection.

```typescript
@Transaction(Propagation.NONE)
async exportReport(): Promise<Buffer> {
  // read-only work on a non-transactional connection
  return await this.reportRepo.render();
}
```

Whatever the propagation, the connection is committed on normal return, rolled back on a thrown error, and always closed afterwards.

---

## 4. Transactions Without the Decorator

For ad-hoc work — a script, a scheduled job, a place where decorators are impractical — call `TransactionManager` directly:

```typescript
import { TransactionManager, Propagation } from '@ticatec/keelson-core';

await TransactionManager.execute(Propagation.REQUIRED, async (conn) => {
  // Committed on resolve, rolled back on throw, always closed
  // DAOs called in here resolve this same connection
});

// Anywhere inside that callback:
const conn = TransactionManager.getCurrentConnection();   // DBConnection | undefined
```

---

## 🔑 Core Rules & Safeguards

1. **Registration requirement.** `getRepositoryInstance<T>(name)` and `getDAOInstance<T>(name)` verify the bean is registered in `beanFactory` and throw an explicit `Error` when it is not (`Repository/DAO "X" is not registered in BeanFactory...`). See [DEPENDENCY_INJECTION_GUIDE.md](DEPENDENCY_INJECTION_GUIDE.md).
2. **Layer boundaries.** Service → Repository → DAO. A Service that reaches for a DAO directly bypasses the aggregation layer and makes the Repository tier pointless.
3. **Transactions start at the Service layer.** DAO helpers throw outside a transaction context, which is what keeps stray statements from running on an unmanaged connection.
4. **Roll back by throwing.** Never swallow an error inside a `@Transaction` method and return normally — that commits the partial work.
5. **Initialise before use.** `initialize()` (logger) and `DBManager.init(factory)` both run once at application startup, before any Service, Repository or DAO is constructed.
