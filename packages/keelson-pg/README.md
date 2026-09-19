# @ticatec/keelson-pg

[![Version](https://img.shields.io/npm/v/@ticatec/keelson-pg)](https://www.npmjs.com/package/@ticatec/keelson-pg)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A production-ready PostgreSQL database driver implementation for Node.js applications, built on the `pg` driver with connection pooling and dual CommonJS / ESM support. Integrates seamlessly with the [`@ticatec/keelson-core`](https://www.npmjs.com/package/@ticatec/keelson-core) database abstractions.

[中文](./README_CN.md) ｜ English

## Features

- **Dual Module Support**: Full CommonJS and ESM support with TypeScript typings (`lib/cjs` & `lib/esm`)
- **Transaction Control**: Full transaction control with `BEGIN`, `COMMIT`, and `ROLLBACK` operations
- **CRUD Operations**: Complete support for SQL queries, inserts, updates, and deletes with generic typing
- **Interface Compliance**: Implements standard `DBConnection` and `DBFactory` interfaces for system decoupling
- **Connection Pooling**: Built-in connection pool management using `pg.Pool`
- **Structured Logging**: Logs through the `@ticatec/logger-api` contract. Bind parameters are never written to the log - only the statement and the parameter count - unless `KEELSON_LOG_SQL_PARAMS=true` is set explicitly. Pool configuration is logged without the password or connection string.
- **Fails Loudly, Not Fatally**: An idle pooled connection that dies is logged and removed; it does not take the process down with it

## Installation

```bash
pnpm add @ticatec/keelson-pg @ticatec/keelson-core pg
```

### Peer Dependencies

```json
{
  "peerDependencies": {
    "@ticatec/keelson-core": ">=1.0.0",
    "pg": "^8.8.0"
  }
}
```

A logging provider is optional. With none installed, `@ticatec/logger-api` falls back to
the console, filtered by `LOG_LEVEL`. To route logs through pino, add
`@ticatec/logger-pino` and `pino` and install the provider at your composition root.

## Quick Start

```typescript
import { initializePg } from '@ticatec/keelson-pg';
import { DBManager } from '@ticatec/keelson-core';

// 1. Initialize PostgreSQL Factory & DBManager
const pgFactory = initializePg({
  host: 'localhost',
  user: 'postgres',
  password: 'secret',
  database: 'myapp',
  port: 5432,
  max: 20
});

DBManager.init(pgFactory);

// 2. Connect and execute
const conn = await DBManager.getInstance().connect();
try {
  await conn.beginTransaction();
  const user = await conn.find<{ id: number; name: string }>(
    'SELECT * FROM users WHERE id = $1',
    [1]
  );
  await conn.commit();
} catch (error) {
  await conn.rollback();
} finally {
  await conn.close();
}
```

## Exports

| Export | Kind | Notes |
| --- | --- | --- |
| `initializePg(config, postConnection?)` | function | Creates the factory. `postConnection` runs once per new physical connection; if it throws, the socket is destroyed and `createDBConnection()` rejects with the original error as `cause`. |
| `PgDBFactory` | class | `createDBConnection()`, `close()`. `close()` is idempotent. |
| `PgDBConnection` | class | Extend it to adjust a dialect detail. |
| `PostConnection` | type | `((client: PoolClient) => Promise<void>) | null` |

## Contributing

This package lives in the [Keelson](https://github.com/ticatec/keelson) monorepo. Issues
and pull requests are welcome there.

### Development Setup

```bash
git clone https://github.com/ticatec/keelson.git
cd keelson
pnpm install
cd packages/keelson-pg

pnpm build       # Build both CJS and ESM outputs (lints first)
pnpm test        # Run the test suite
pnpm typecheck   # Type-check all three configurations
pnpm lint        # Lint only
```

From the monorepo root, `pnpm verify` builds, type-checks and tests every package.

The workspace is pnpm-only: the dependencies here are declared with `workspace:*`, a
protocol npm does not understand, so `npm install` fails outright with
`EUNSUPPORTEDPROTOCOL`.

The test suite mocks `pg`, so a clone builds and tests without a PostgreSQL server to
connect to.

### Publishing

```bash
pnpm publish:public   # runs typecheck, test and build first, via prepublishOnly
```

## License

MIT - see the [LICENSE](LICENSE) file.

## 👨‍💻 Author

**Henry Feng** — [huili.f@gmail.com](mailto:huili.f@gmail.com)

## 🔗 Links

- [GitHub Repository](https://github.com/ticatec/keelson/tree/main/packages/keelson-pg)
- [NPM Package](https://www.npmjs.com/package/@ticatec/keelson-pg)
- [Issues](https://github.com/ticatec/keelson/issues)
- [CHANGELOG](CHANGELOG.md)
