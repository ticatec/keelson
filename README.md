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
| [common-express-server](packages/common-express-server) | 2.0.1 | Express server scaffolding — `BaseServer`, controllers, routing, health checks, multi-tenancy, auth context |
| [node-common-library](packages/node-common-library) | 4.1.0 | The four-tier data layer — `CommonDAO` / `CommonRepository` / `CommonService`, `@Transaction`, `BeanFactory`, `CommonSearchCriteria`, pagination |
| [bean-validator](packages/bean-validator) | 1.1.0 | Declarative DTO validation and sanitisation |
| [node-exception](packages/node-exception) | 2.1.0 | Standardised Express error handling middleware |

### Database drivers

Implementations of `node-common-library`'s `DBConnection` / `DBFactory` contracts.

| Package | Version | Database |
| --- | --- | --- |
| [pg-common-library](packages/pg-common-library) | 4.0.0 | PostgreSQL |
| [mysql-common-library](packages/mysql-common-library) | 4.0.0 | MySQL |
| [dm-common-library](packages/dm-common-library) | 4.0.0 | Dameng (DM8) |

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
│  Controller / Router                        │  common-express-server
│  request handling, validation, error mapping│  bean-validator · node-exception
└───────────────────┬─────────────────────────┘
                    │
┌───────────────────▼─────────────────────────┐
│  Service                                    │  node-common-library
│  business logic, @Transaction boundaries    │
└───────────────────┬─────────────────────────┘
                    │
┌───────────────────▼─────────────────────────┐
│  Repository                                 │  node-common-library
│  domain persistence, DAO aggregation        │
└───────────────────┬─────────────────────────┘
                    │
┌───────────────────▼─────────────────────────┐
│  DAO                                        │  node-common-library
│  SQL execution, result mapping              │  + pg / mysql / dm driver
└───────────────────┬─────────────────────────┘
                    │
              ┌─────▼─────┐
              │ Database  │
              └───────────┘
```

The transaction opened at the Service layer is carried down through `AsyncLocalStorage`, so every statement in the call tree shares one connection without anyone passing it as an argument.

## Getting started

```bash
pnpm add @ticatec/common-express-server @ticatec/node-common-library \
         @ticatec/bean-validator @ticatec/node-exception \
         @ticatec/logger-api reflect-metadata
# plus the driver for your database
pnpm add @ticatec/pg-common-library pg
```

Start with the [node-common-library README](packages/node-common-library/README.md) — it covers the data layer end to end, and links to the in-depth guides:

- [DAO Layer](packages/node-common-library/docs/DAO_GUIDE.md)
- [Service & Repository Layers](packages/node-common-library/docs/SERVICE_GUIDE.md)
- [Dependency Injection](packages/node-common-library/docs/DEPENDENCY_INJECTION_GUIDE.md)
- [Search Criteria](packages/node-common-library/docs/SEARCH_CRITERIA.md)

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
pnpm --filter @ticatec/node-common-library test
```

## License

MIT — see [LICENSE](LICENSE).

## Author

**Henry Feng** — [huili.f@gmail.com](mailto:huili.f@gmail.com)
