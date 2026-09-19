# Keelson

[中文文档](README_CN.md) | English

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

An enterprise TypeScript framework for Node.js and Express: a four-tier data layer with
declarative transactions, dependency injection, request validation, standardised error
handling, and server scaffolding with health probes and background processors.

A keelson is the internal beam bolted over a ship's keel, running the length of the hull.
It ties the frames together and carries the longitudinal load. You never see it, and
nothing holds without it.

## What it is for

Keelson is for line-of-business HTTP services that talk to a relational database: the kind
where most endpoints read and write a few tables inside a transaction, the tenant comes
from the request, and the interesting part is the business rule, not the plumbing.

It is opinionated about the shape of an application — four layers, one transaction per
service call, dependencies resolved by name — and deliberately thin everywhere else. It is
not an ORM: you write SQL. It is not a DI container with decorators and metadata scanning:
you register classes and get lazy singletons back.

## The one idea

A transaction is opened at the **Service** layer and carried down the call tree in
`AsyncLocalStorage`. Every DAO underneath it — however deep, across as many repositories as
you like — picks up the same connection without anyone passing it as an argument, and
without any layer knowing whether it is inside a transaction at all.

```typescript
@Transaction()
async registerUser(user: User): Promise<string> {
    const existing = await this.userRepo.findByEmail(user.email);   // same connection
    if (existing) {
        throw new Error('User already exists');                     // rolls back
    }
    return await this.userRepo.save(user);                          // same connection
}
```

Throwing rolls back. Returning commits. `@Transaction(Propagation.REQUIRES_NEW)` opens an
independent one, which commits even when the outer transaction rolls back — the usual case
being an audit record you want to keep regardless.

## Architecture

```
┌─────────────────────────────────────────────┐
│  Controller / Router                        │  keelson-express
│  HTTP handling, validation, error mapping   │  bean-validator · node-exception
└───────────────────┬─────────────────────────┘
                    │
┌───────────────────▼─────────────────────────┐
│  Service                                    │  keelson-core
│  business logic, @Transaction boundaries    │
└───────────────────┬─────────────────────────┘
                    │
┌───────────────────▼─────────────────────────┐
│  Repository                                 │  keelson-core
│  domain persistence, DAO aggregation        │
└───────────────────┬─────────────────────────┘
                    │
┌───────────────────▼─────────────────────────┐
│  DAO                                        │  keelson-core
│  SQL execution, result mapping              │  + pg / mysql / dm driver
└───────────────────┬─────────────────────────┘
                    │
              ┌─────▼─────┐
              │ Database  │
              └───────────┘
```

Each layer talks only to the one below it. A Service never reaches a DAO directly; it goes
through a Repository. The rule is what keeps a transaction boundary meaningful — if a
Service could call a DAO, the boundary would be wherever someone last remembered to put it.

## A request, end to end

**DAO** — SQL and nothing else. Placeholders are the driver's dialect (`$1` for PostgreSQL,
`?` for MySQL and Dameng); `getPlaceholder(i)` gives you the right one when you build SQL
dynamically.

```typescript
export class UserDAO extends CommonDAO {
    async findByEmail(email: string): Promise<User | null> {
        return await this.findByPK('SELECT * FROM users WHERE email = $1', [email]);
    }

    async save(user: User): Promise<InsertResult<User>> {
        return await this.executeInsertQuery<User>(
            'INSERT INTO users (id, name, email) VALUES ($1, $2, $3) RETURNING *',
            [user.id || this.genID(), user.name, user.email]
        );
    }
}
```

**Repository** — aggregates DAOs, speaks in domain terms.

```typescript
export class UserRepository extends CommonRepository {
    private get userDAO(): UserDAO {
        return this.getDAOInstance<UserDAO>('UserDAO');
    }

    async findByEmail(email: string): Promise<User | null> {
        return this.userDAO.findByEmail(email);
    }
}
```

**Service** — business rules and the transaction boundary.

```typescript
export class UserService extends CommonService {
    private get userRepo(): UserRepository {
        return this.getRepositoryInstance<UserRepository>('UserRepository');
    }

    @Transaction()
    async registerUser(user: User): Promise<string> {
        if (await this.userRepo.findByEmail(user.email)) {
            throw new IllegalParameterError('That email is already registered');
        }
        return await this.userRepo.save(user);
    }
}
```

**Controller and routes** — `CommonController` maps CRUD onto a service, validates the
body against declared rules, and turns a thrown `HttpError` into the right status code.

```typescript
export class UserController extends CommonSearchController<UserService> {
    constructor() {
        super(beanFactory.createBean<UserService>('UserService')!);
    }

    protected getCreateRules(): ValidationRules {
        return [
            new StringValidator('name', { required: true, maxLen: 64 }),
            new StringValidator('email', {
                required: true,
                maxLen: 128,
                format: { regex: /^[^@\s]+@[^@\s]+\.[^@\s]+$/, message: 'Not a valid email address' }
            })
        ];
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

`CommonController` gives you `createNew()`, `update()` and `del()`;
`CommonSearchController` adds `search()`, which passes `req.query` to the service as search
criteria. Each returns a handler, so you decide the paths and the HTTP verbs. Anything
outside that shape is an ordinary route with an ordinary handler.

**Wiring and startup** — register the classes, point the framework at a database, start.

```typescript
import BaseServer, { AppConf } from '@ticatec/keelson-express';
import { DBManager, beanFactory } from '@ticatec/keelson-core';
import { initializePg } from '@ticatec/keelson-pg';

class MyServer extends BaseServer {
    public constructor() {
        super();   // BaseServer's constructor is protected, so declare a public one
    }

    protected async loadConfigFile(): Promise<void> {
        AppConf.init(await loadYourConfig());
    }

    protected getWebConf() {
        return AppConf.getInstance()!.get('web');
    }

    protected async beforeStart(): Promise<void> {
        DBManager.init(initializePg(AppConf.getInstance()!.get('database')));

        beanFactory.register('UserDAO', UserDAO);
        beanFactory.register('UserRepository', UserRepository);
        beanFactory.register('UserService', UserService);

        this.registerHealthCheck('database', async () => ({
            status: await pingDatabase() ? 'UP' : 'DOWN'
        }));
    }

    protected async setupRoutes(): Promise<void> {
        await this.bindRoutes('/users', () => import('./routes/UserRoutes.js'));
    }
}

BaseServer.startup(new MyServer());
```

`beanFactory.register()` does not construct anything. `createBean<T>(name)` hands back a
proxy; the real instance is built on first use and cached from then on. That is what lets a
Service reference a Repository that references a DAO without an initialisation order to get
right. It returns `T | undefined` — `undefined` when the name was never registered — hence
the `!` above; `getDAOInstance()` and `getRepositoryInstance()` inside the layers throw
instead, naming the bean you forgot.

Every example in this file compiles against the published types.

## Packages

All published under the `@ticatec/*` scope. Every package ships both CommonJS and ESM
builds with TypeScript declarations, targets Node 18+, and is `strict`.

### Framework

| Package | Version | What it does |
| --- | --- | --- |
| [keelson-express](packages/keelson-express) | 1.0.0 | `BaseServer`, controllers, routing, health probes, background processors, user resolution |
| [keelson-core](packages/keelson-core) | 1.0.0 | The four-tier data layer — `CommonDAO` / `CommonRepository` / `CommonService`, `@Transaction`, `BeanFactory`, `CommonSearchCriteria`, pagination |

### Database drivers

Implementations of keelson-core's `DBConnection` / `DBFactory` contracts. Pick one; the
layers above never name it again.

| Package | Version | Database |
| --- | --- | --- |
| [keelson-pg](packages/keelson-pg) | 1.0.0 | PostgreSQL |
| [keelson-mysql](packages/keelson-mysql) | 1.0.0 | MySQL |
| [keelson-dm](packages/keelson-dm) | 1.0.0 | Dameng (DM8) |

### Standalone libraries

Keelson uses these; none of them depends on Keelson. They are worth using in any Node
project on their own.

| Package | Version | What it does |
| --- | --- | --- |
| [logger-api](packages/logger-api) | 1.0.0 | A logging contract with no dependencies — libraries log against it, the application injects the implementation |
| [logger-pino](packages/logger-pino) | 1.0.0 | pino adapter for `logger-api`, with appenders and per-category levels |
| [bean-validator](packages/bean-validator) | 1.1.0 | Declarative validation for request bodies and DTOs |
| [node-exception](packages/node-exception) | 2.1.0 | HTTP error types and the Express error middleware that renders them |
| [config-loader](packages/config-loader) | 1.1.0 | Configuration from local YAML/JSON, Nacos or Consul, behind one interface |
| [redis-client](packages/redis-client) | 1.2.0 | ioredis wrapper with named instances and cache helpers |

## Conventions that hold across every package

**Logging goes through a contract, not a library.** Packages call
`getLogger(name, category)` from `@ticatec/logger-api` and never import a logging library.
With no provider installed, output falls back to the console filtered by `LOG_LEVEL`; add
`@ticatec/logger-pino` and install it once at the composition root to get structured JSON,
appenders and per-category levels. Nothing in the framework writes to `console` directly.

**Secrets and payloads stay out of the logs by default.** Connection configuration is
summarised without the password or connection string. SQL is logged with its statement and
parameter *count*, never the bound values — set `KEELSON_LOG_SQL_PARAMS=true` when you are
tracing a problem and need them. Request and response bodies are logged only when you set
`Controller.debugEnabled = true`. Both switches are development tools and say so.

**Errors carry their status.** Throw `IllegalParameterError`, `UnauthenticatedError`,
`InsufficientPermissionError`, `ActionNotFoundError`, `ConflictError` and the rest from
`@ticatec/node-exception` anywhere in the call tree; the error middleware renders the right
status code, negotiates JSON/HTML/text from `Accept`, and shows a stack only outside
production. 5xx is logged with its stack, 4xx at debug — a client sending bad input is not
an incident.

**The user comes from a resolver, not from a hard-coded header.** By default
`HeaderUserResolver` reads the user an API gateway injected as the `user` header. That
header is *trusted*, so the service must sit behind a gateway that sets it and strips any
client-supplied copy. `setUserResolver()` swaps in your own — a bearer token, a cookie, a
session store — and every route sees the result as `req.user`.

**Health probes are there from the start.** `/health/live`, `/health/ready` and `/health`
are mounted automatically and need no authentication. Register your own indicators with
`registerHealthCheck()`; a critical one that is DOWN makes readiness answer 503, a
non-critical one answers 200 DEGRADED. In production the response omits details and
generalises error strings, so a probe cannot become a source of internal information.

**Both module formats, one set of state.** Every package ships CJS and ESM. Singletons —
`DBManager`, the transaction context, `beanFactory`, `AppConf`, `ProcessorManager` — are
anchored on `globalThis` under `Symbol.for()` keys, so a process that ends up loading both
builds still has one of each rather than two that silently disagree.

## Getting started

```bash
pnpm add @ticatec/keelson-express @ticatec/keelson-core \
         @ticatec/bean-validator @ticatec/node-exception \
         @ticatec/logger-api reflect-metadata

# plus the driver for your database
pnpm add @ticatec/keelson-pg pg
```

`reflect-metadata` must be imported once, before anything else, for `@Transaction` to work:

```typescript
import 'reflect-metadata';
```

Start with the [tutorial](tutorial/README.md) — nine chapters, one topic each, readable in
any order. It covers why the pieces are shaped the way they are and how they fit together.

For the exhaustive detail of a single layer, the reference guides:

| Guide | Covers |
| --- | --- |
| [DAO Layer](docs/prompts/DAO_GUIDE.md) | Writing DAOs, the query helpers, `InsertResult` / `UpdateResult`, pagination, placeholders |
| [Service & Repository](docs/prompts/SERVICE_GUIDE.md) | The four tiers, `@Transaction`, propagation, `TransactionManager` |
| [Dependency Injection](docs/prompts/DEPENDENCY_INJECTION_GUIDE.md) | `beanFactory`, lazy proxies, `Beans` loaders, circular dependencies |
| [Search Criteria](docs/prompts/SEARCH_CRITERIA.md) | The dynamic query builder — baseline contract, condition helpers, generated SQL |
| [Controllers](docs/prompts/CONTROLLER.md) | CRUD and search controllers, validation rules, argument mapping |
| [Bean Validation](docs/prompts/BEAN_VALIDATION.md) | Validator types, options, custom checks, localised messages |

Each guide has a Chinese counterpart with a `_CN` suffix.

## Renamed packages

Five packages were renamed ahead of their first Keelson release. The framework's own layers
now carry the framework's name; the standalone libraries keep plain names, because they
stand on their own outside Keelson.

| Was | Now | Last release under the old name |
| --- | --- | --- |
| `@ticatec/node-common-library` | `@ticatec/keelson-core` | 3.2.5 |
| `@ticatec/pg-common-library` | `@ticatec/keelson-pg` | 3.1.0 |
| `@ticatec/mysql-common-library` | `@ticatec/keelson-mysql` | 2.1.0 |
| `@ticatec/dm-common-library` | `@ticatec/keelson-dm` | 1.0.2 |
| `@ticatec/common-express-server` | `@ticatec/keelson-express` | 2.0.1 |

Each restarts at **1.0.0**: a new name on npm is a new package with its own publish history,
so continuing the old numbering would be a fiction.

Migrating is a find-and-replace on the dependency name and the import specifier — no export
changed its name or signature:

```diff
-import { CommonDAO, Transaction } from '@ticatec/node-common-library';
+import { CommonDAO, Transaction } from '@ticatec/keelson-core';
```

One behavioural change needs a search rather than a replace: `CommonRoutes.userCheck()` is
gone. It had had no call site since `common-express-server@0.5.4`, so a router that
overrode it lost that check silently long ago; move the body into `isValidUser()`. Each
package's CHANGELOG lists the rest.

The old names will be deprecated on npm, each pointing at its replacement — see
[DEPRECATIONS.md](DEPRECATIONS.md).

## Working in this repo

A pnpm workspace. Package-to-package dependencies use `workspace:*`, so everything builds
against local sources.

```bash
pnpm install
pnpm build        # topological, follows the dependency graph
pnpm typecheck
pnpm test
pnpm verify       # build && typecheck && test — build first, because
                  # cross-package types live in each package's built lib/
```

Per package:

```bash
pnpm --filter @ticatec/keelson-core test
```

The workspace is pnpm-only: `workspace:*` is not a protocol npm implements, so `npm install`
fails with `EUNSUPPORTEDPROTOCOL`.

## License

MIT — see [LICENSE](LICENSE).

## 👨‍💻 Author

**Henry Feng** — [huili.f@gmail.com](mailto:huili.f@gmail.com)

## 🔗 Links

- [GitHub Repository](https://github.com/ticatec/keelson)
- [Issues](https://github.com/ticatec/keelson/issues)
