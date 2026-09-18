# @ticatec/pg-common-library

[![Version](https://img.shields.io/npm/v/@ticatec/pg-common-library)](https://www.npmjs.com/package/@ticatec/pg-common-library)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

基于 `pg` 驱动构建的 PostgreSQL 数据库连接与连接池实现，专为配合 [`@ticatec/node-common-library`](https://www.npmjs.com/package/@ticatec/node-common-library) 和 `@ticatec/logger-pino` 使用而设计。支持 CommonJS 与 ESM 双模块导出。

中文 ｜ [English](./README.md)

## 特性

- **双模块系统支持**：完整支持 CommonJS (`lib/cjs`) 与 ESM (`lib/esm`) 及 TypeScript 类型声明
- **完整事务控制**：支持 `BEGIN`、`COMMIT` 和 `ROLLBACK` 操作
- **标准接口实现**：实现 `DBConnection` 与 `DBFactory` 抽象接口
- **自动布尔值转换**：原生支持 PostgreSQL 布尔类型及 `1/0`、`t/f` 转换
- **连接池管理**：基于 `pg.Pool` 提供高效连接池管理
- **日志抽象集成**：使用 `@ticatec/logger-pino` 提供高性能结构化日志

## 安装

```bash
pnpm add @ticatec/pg-common-library @ticatec/node-common-library @ticatec/logger-pino pg pino
```

## 快速上手

```typescript
import pino from 'pino';
import { initialize as initLogger } from '@ticatec/logger-pino';
import { initializePg } from '@ticatec/pg-common-library';
import { DBManager } from '@ticatec/node-common-library';

// 1. 初始化日志组件
initLogger(pino({ level: 'info' }));

// 2. 初始化 PostgreSQL 数据库工厂与 DBManager
const pgFactory = initializePg({
  host: 'localhost',
  user: 'postgres',
  password: 'secret',
  database: 'myapp',
  port: 5432,
  max: 20
});

DBManager.init(pgFactory);

// 3. 获取连接并执行数据库操作
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

## 开源协议

MIT © [Ticatec](https://github.com/ticatec)