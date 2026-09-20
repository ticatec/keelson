# 1. Getting started

[中文](01-getting-started_CN.md) | English · [Tutorial index](README.md)

By the end of this chapter you have a service that connects to PostgreSQL, answers a
request, and reports its health. About sixty lines of your own code.

## What is Keelson?

A **keelson** is the internal beam bolted over a ship's keel, running the entire length of the hull. It ties the frames together and carries the longitudinal load. You never see it from the outside, and nothing holds without it.

In the Node.js and Express ecosystem, Keelson is an enterprise TypeScript framework designed specifically for **relational database business applications**. It is tailored for standard line-of-business services: endpoints that read and write database tables inside transactional boundaries, extract tenant and user identities from request context, and where the core focus belongs on business rules rather than plumbing boilerplate.

### Core Philosophy

Keelson is opinionated about the foundational skeleton of an application, while deliberately thin and unobtrusive everywhere else:

- **Not an ORM: You write SQL**: Decades of experience prove that SQL is the most expressive, performant, and transparent language for relational databases. In Keelson, you write clean, parameterised SQL directly. Complex dynamic filters are powered by type-safe Search Criteria helpers without leaky abstractions.
- **Context-driven Declarative Transactions**: A transaction is declared once on a service method. Powered by Node.js `AsyncLocalStorage`, the active database connection flows down the execution tree automatically. Every repository and DAO picks up the same connection without anyone passing it as a function argument.
- **Lightweight, Explicit Dependency Injection (BeanFactory)**: Avoids heavyweight runtime decorator metadata scanning and magic discovery. Dependencies are registered by name and resolved as lazy singletons on first access, eliminating initialization order headaches and hidden circular dependency traps.

### Strict Four-Tier Architecture

Keelson cleanly structures business logic across four distinct tiers, each calling only the next layer down:

| Layer | Responsibility & Conventions | Key Constraints |
| :--- | :--- | :--- |
| **Web layer** (`routes` + `controller`) | HTTP routing and **all boundary input validation** | Declared via `@ticatec/bean-validator`; downstream never re-validates input shape |
| **Service layer** | Domain business logic and the **sole transaction boundary** | Write operations use `@Transaction()`, reads use `@Transaction(Propagation.NONE)` |
| **Repository layer** | Domain entity assembly, basic status checks & caching | Bridges business and data; owns Redis cache; never leaks cache logic up or down |
| **DAO layer** | Raw single-table SQL queries | Zero business rules; automatically retrieves DB connection from transaction context |

---

## Install

```bash
pnpm add @ticatec/keelson-express @ticatec/keelson-core \
         @ticatec/bean-validator @ticatec/node-exception \
         @ticatec/logger-api reflect-metadata

pnpm add @ticatec/keelson-pg pg          # or keelson-mysql + mysql2, keelson-dm + dmdb
pnpm add -D typescript @types/node @types/express
```

Keelson ships both CommonJS and ESM. These examples use ESM — `"type": "module"` in
`package.json`, `NodeNext` module resolution in `tsconfig.json`, and `.js` suffixes on
relative imports even though the files are `.ts`. That last one surprises people; it is
what Node requires of ESM, and TypeScript deliberately does not rewrite it.

`@Transaction` is a decorator that reads parameter metadata, so two `tsconfig.json`
settings are not optional:

```json
{
  "compilerOptions": {
    "target": "es2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "strict": true
  }
}
```

And `reflect-metadata` has to be imported once, before anything that uses a decorator:

```typescript
// src/main.ts — the very first line of the program
import 'reflect-metadata';
```

Forget it and `@Transaction` throws at startup rather than misbehaving quietly, which is
the failure mode you want.

## The smallest service

Four files. Start at the bottom and work up.

**`src/dao/GreetingDAO.ts`** — SQL, and nothing but.

```typescript
import { CommonDAO } from '@ticatec/keelson-core';

export interface Greeting {
    id: string;
    text: string;
}

export class GreetingDAO extends CommonDAO {
    async findById(id: string): Promise<Greeting | null> {
        return await this.findByPK('SELECT id, text FROM greetings WHERE id = $1', [id]);
    }
}
```

`findByPK` returns the first row mapped to an object, or `null`. Column names come back
camelCased: `created_at` becomes `createdAt`. You never opened a connection, because the
DAO takes it from whatever transaction is in scope — chapter 2 is about that.

**`src/repository/GreetingRepository.ts`** — aggregates DAOs.

```typescript
import { CommonRepository } from '@ticatec/keelson-core';
import { GreetingDAO, Greeting } from '../dao/GreetingDAO.js';

export class GreetingRepository extends CommonRepository {
    private get dao(): GreetingDAO {
        return this.getDAOInstance<GreetingDAO>('GreetingDAO');
    }

    async findById(id: string): Promise<Greeting | null> {
        return this.dao.findById(id);
    }
}
```

One DAO behind one repository looks like pure overhead, and at this size it is. It stops
being overhead the first time a use case needs two tables — chapter 2.

**`src/service/GreetingService.ts`** — business rules, and the transaction boundary.

```typescript
import { CommonService, Transaction } from '@ticatec/keelson-core';
import { ActionNotFoundError } from '@ticatec/node-exception';
import { GreetingRepository } from '../repository/GreetingRepository.js';
import { Greeting } from '../dao/GreetingDAO.js';

export class GreetingService extends CommonService {
    private get repo(): GreetingRepository {
        return this.getRepositoryInstance<GreetingRepository>('GreetingRepository');
    }

    @Transaction()
    async get(id: string): Promise<Greeting> {
        const greeting = await this.repo.findById(id);
        if (greeting == null) {
            throw new ActionNotFoundError();      // becomes a 404
        }
        return greeting;
    }
}
```

**`src/routes/GreetingRoutes.ts`** — the HTTP surface.

```typescript
import { CommonRoutes, routerHelper } from '@ticatec/keelson-express';
import { beanFactory } from '@ticatec/keelson-core';
import { GreetingService } from '../service/GreetingService.js';

export default class GreetingRoutes extends CommonRoutes {
    private get service(): GreetingService {
        return beanFactory.createBean<GreetingService>('GreetingService')!;
    }

    protected bindRoutes() {
        this.get('/:id', routerHelper.invokeRestfulAction(
            req => this.service.get(String(req.params.id))
        ));
    }
}
```

The `String(...)` is not decoration. Express 5 types a route parameter as
`string | string[]`, because a wildcard segment can match more than one value, so passing
`req.params.id` straight into a `string` parameter does not compile under `strict`. Wrap it,
or destructure with a type annotation — but do not reach for `as string`, which would also
silence the case where it really is an array.

`invokeRestfulAction` takes a function of the request that returns a value. The value is
sent as JSON; `null` becomes `204 No Content`; a thrown error goes to the error middleware
and comes back with the right status code. You do not touch `res`.

## Starting it

```typescript
// src/main.ts
import 'reflect-metadata';
import BaseServer, { AppConf } from '@ticatec/keelson-express';
import { DBManager, beanFactory } from '@ticatec/keelson-core';
import { initializePg } from '@ticatec/keelson-pg';

import { GreetingDAO } from './dao/GreetingDAO.js';
import { GreetingRepository } from './repository/GreetingRepository.js';
import { GreetingService } from './service/GreetingService.js';

class GreetingServer extends BaseServer {
    public constructor() {
        super();
    }

    protected async loadConfigFile(): Promise<void> {
        AppConf.init({
            web: { port: 3000, ip: '0.0.0.0', contextRoot: '/api' },
            database: {
                host: 'localhost', port: 5432,
                database: 'demo', user: 'demo', password: process.env.DB_PASSWORD,
                max: 10
            }
        });
    }

    protected getWebConf(): any {
        return AppConf.getInstance()!.get('web');
    }

    protected async beforeStart(): Promise<void> {
        DBManager.init(initializePg(AppConf.getInstance()!.get('database')));

        beanFactory.register('GreetingDAO', GreetingDAO);
        beanFactory.register('GreetingRepository', GreetingRepository);
        beanFactory.register('GreetingService', GreetingService);
    }

    protected async setupRoutes(): Promise<void> {
        await this.bindRoutes('/greetings', () => import('./routes/GreetingRoutes.js'));
    }
}

BaseServer.startup(new GreetingServer());
```

`BaseServer` calls these in a fixed order: `loadConfigFile()`, `beforeStart()`,
`getWebConf()`, then it creates the Express app, mounts health checks, calls
`setupRoutes()`, and listens. Anything that must exist before a request arrives —
the database, the bean registrations — belongs in `beforeStart()`.

`public constructor() { super(); }` is needed because `BaseServer`'s constructor is
`protected`; without one of your own, `new GreetingServer()` will not compile.

## What you get without asking

```
GET /api/greetings/abc     your route
GET /health/live           200 while the process is up
GET /health/ready          200 when every critical check passes, 503 otherwise
GET /health                same as /health/ready
```

The health endpoints are mounted before your routes and need no authentication, which is
what Kubernetes needs from a probe. Chapter 6 covers adding your own indicators.

Logging works with nothing installed: `@ticatec/logger-api` falls back to the console,
filtered by `LOG_LEVEL`. Run with `LOG_LEVEL=debug` and you will see the routes being
registered, the pool being created and each statement as it executes — without the bound
values, which chapter 6 explains.

## Where the config actually comes from

The example hard-codes config to keep it to one file. Real services load it — from a YAML
file, Nacos or Consul — with `@ticatec/config-loader`, which is chapter 8. The shape stays
the same: whatever you pass to `AppConf.init()` is what `AppConf.getInstance()!.get()`
reads, with dot notation for nesting:

```typescript
AppConf.getInstance()!.get('web.port');        // 3000
AppConf.getInstance()!.get('nope.nothing');    // undefined, no throw
```

Note the `!`. `getInstance()` returns `AppConf | null` — null before `init()` has run —
and in a method that only runs after `loadConfigFile()`, the assertion is honest.

## When it does not start

**`Cannot read properties of undefined (reading 'init')` or a decorator error at startup**
— `reflect-metadata` was not imported first. It must be the first line of the entry file,
before any import that pulls in a class with `@Transaction`.

**`DBManager is not initialized`** — something called a DAO before `DBManager.init()` ran.
Check that the `init` is in `beforeStart()` and not in `setupRoutes()`.

**`Express application is not created yet`** — `bindRoutes()` was called outside
`setupRoutes()`. The app does not exist until `BaseServer` creates it.

**A bean name that was never registered** — `getDAOInstance('GreetingDAO')` throws naming
the bean. `beanFactory.createBean()` is the one that returns `undefined` instead; chapter 3
explains why they differ.

---

Next: [Layers and transactions](02-layers-and-transactions.md) — what the four tiers buy
you, and the one mechanism that makes them work.
