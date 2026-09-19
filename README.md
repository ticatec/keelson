# Keelson

[中文文档](README_CN.md) | English

An enterprise TypeScript framework for Node.js and Express — layered data access, declarative transactions, dependency injection, bean validation and server scaffolding.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A keelson is the internal beam bolted over a ship's keel, running the length of the hull. It ties the frames together and carries the longitudinal load. You never see it, but nothing holds without it.

## Packages

All packages are published under the `@ticatec/*` scope.

### Core

| Package | Version | What it does |
| --- | --- | --- |
| [keelson-express](packages/keelson-express) | 1.0.0 | Express server scaffolding — `BaseServer`, controllers, routing, health checks, multi-tenancy, auth context |
| [keelson-core](packages/keelson-core) | 1.0.0 | The four-tier data layer — `CommonDAO` / `CommonRepository` / `CommonService`, `@Transaction`, `BeanFactory`, `CommonSearchCriteria`, pagination |
| [bean-validator](packages/bean-validator) | 1.1.0 | Declarative DTO validation and sanitisation |
| [node-exception](packages/node-exception) | 2.1.0 | Standardised Express error handling middleware |

### Database drivers

Implementations of `keelson-core`'s `DBConnection` / `DBFactory` contracts.

| Package | Version | Database |
| --- | --- | --- |
| [keelson-pg](packages/keelson-pg) | 1.0.0 | PostgreSQL |
| [keelson-mysql](packages/keelson-mysql) | 1.0.0 | MySQL |
| [keelson-dm](packages/keelson-dm) | 1.0.0 | Dameng (DM8) |

### Infrastructure

Usable on their own, in any Node project.

| Package | Version | What it does |
| --- | --- | --- |
| [logger-api](packages/logger-api) | 1.0.0 | Zero-dependency logging contract — packages log against it, applications inject the implementation |
| [logger-pino](packages/logger-pino) | 1.0.0 | Optional pino adapter for `logger-api`, with appenders and per-category levels |
| [config-loader](packages/config-loader) | 1.1.0 | YAML / JSON configuration loading |
| [redis-client](packages/redis-client) | 1.2.0 | ioredis wrapper with singleton management and cached-data helpers |

## Architecture

```
┌─────────────────────────────────────────────┐
│  Controller / Router                        │  keelson-express
│  request handling, validation, error mapping│  bean-validator · node-exception
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

The transaction opened at the Service layer is carried down through `AsyncLocalStorage`, so every statement in the call tree shares one connection without anyone passing it as an argument.

## Renamed packages

Five packages were renamed ahead of their first Keelson release. The framework's
own layers now carry the framework's name; the generic building blocks keep plain
names, because they stand on their own outside Keelson.

| Was | Now | Last release under the old name |
| --- | --- | --- |
| `@ticatec/node-common-library` | `@ticatec/keelson-core` | 3.2.5 |
| `@ticatec/pg-common-library` | `@ticatec/keelson-pg` | 3.1.0 |
| `@ticatec/mysql-common-library` | `@ticatec/keelson-mysql` | 2.1.0 |
| `@ticatec/dm-common-library` | `@ticatec/keelson-dm` | 1.0.2 |
| `@ticatec/common-express-server` | `@ticatec/keelson-express` | 2.0.1 |

`logger-api`, `logger-pino`, `bean-validator`, `config-loader`, `node-exception`
and `redis-client` are **unchanged** - none of them depends on Keelson, and each is
useful in any Node project.

Every renamed package restarts at **1.0.0**: a new name on npm is a new package
with its own publish history, so continuing the old numbering would be a fiction.

Migrating is a find-and-replace on the dependency name and the import specifier.
No export changed its name or signature.

```diff
-import { CommonDAO, Transaction } from '@ticatec/node-common-library';
+import { CommonDAO, Transaction } from '@ticatec/keelson-core';
```

The packages under the old names will be deprecated on npm, each pointing at its
replacement.

## Getting started

```bash
pnpm add @ticatec/keelson-express @ticatec/keelson-core \
         @ticatec/bean-validator @ticatec/node-exception \
         @ticatec/logger-api reflect-metadata
# plus the driver for your database
pnpm add @ticatec/keelson-pg pg
```

Start with the [keelson-core README](packages/keelson-core/README.md) — it covers the data layer end to end, and links to the in-depth guides:

- [DAO Layer](packages/keelson-core/docs/DAO_GUIDE.md)
- [Service & Repository Layers](packages/keelson-core/docs/SERVICE_GUIDE.md)
- [Dependency Injection](packages/keelson-core/docs/DEPENDENCY_INJECTION_GUIDE.md)
- [Search Criteria](packages/keelson-core/docs/SEARCH_CRITERIA.md)

- **Deprecations**: [DEPRECATIONS.md](DEPRECATIONS.md) — npm deprecate commands to run after publishing

## Working in this repo

A pnpm workspace. Package-to-package dependencies use `workspace:*`, so everything builds against local sources.

```bash
pnpm install
pnpm build        # topological order, respects the dependency graph
pnpm typecheck
pnpm test
pnpm verify       # typecheck && test && build
```

Per package:

```bash
pnpm --filter @ticatec/keelson-core test
```

## License

MIT — see [LICENSE](LICENSE).

## Author

**Henry Feng** — [huili.f@gmail.com](mailto:huili.f@gmail.com)
