# @ticatec/pg-common-library

[![Version](https://img.shields.io/npm/v/@ticatec/pg-common-library)](https://www.npmjs.com/package/@ticatec/pg-common-library)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A production-ready PostgreSQL database driver implementation for Node.js applications, built on the `pg` driver with connection pooling and dual CommonJS / ESM support. Integrates seamlessly with [`@ticatec/node-common-library`](https://www.npmjs.com/package/@ticatec/node-common-library) database abstractions and `@ticatec/logger-pino`.

[中文](./README_CN.md) ｜ English

## Features

- **Dual Module Support**: Full CommonJS and ESM support with TypeScript typings (`lib/cjs` & `lib/esm`)
- **Transaction Control**: Full transaction control with `BEGIN`, `COMMIT`, and `ROLLBACK` operations
- **CRUD Operations**: Complete support for SQL queries, inserts, updates, and deletes with generic typing
- **Interface Compliance**: Implements standard `DBConnection` and `DBFactory` interfaces for system decoupling
- **Connection Pooling**: Built-in connection pool management using `pg.Pool`
- **Logger Wrapper Integration**: Uses `@ticatec/logger-pino` for high-performance structured logging

## Installation

```bash
pnpm add @ticatec/pg-common-library @ticatec/node-common-library @ticatec/logger-pino pg pino
```

### Peer Dependencies

```json
{
  "peerDependencies": {
    "@ticatec/logger-pino": "^0.1.0",
    "@ticatec/node-common-library": "^3.1.0",
    "pg": "^8.8.0",
    "pino": ">=8.0.0"
  }
}
```

## Quick Start

```typescript
import pino from 'pino';
import { initialize as initLogger } from '@ticatec/logger-pino';
import { initializePg } from '@ticatec/pg-common-library';
import { DBManager } from '@ticatec/node-common-library';

// 1. Initialize Logger
initLogger(pino({ level: 'info' }));

// 2. Initialize PostgreSQL Factory & DBManager
const pgFactory = initializePg({
  host: 'localhost',
  user: 'postgres',
  password: 'secret',
  database: 'myapp',
  port: 5432,
  max: 20
});

DBManager.init(pgFactory);

// 3. Connect and execute
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

## License

MIT © [Ticatec](https://github.com/ticatec)