# @ticatec/keelson-pg

[![Version](https://img.shields.io/npm/v/@ticatec/keelson-pg)](https://www.npmjs.com/package/@ticatec/keelson-pg)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

基于 `pg` 驱动构建的 PostgreSQL 数据库连接与连接池实现，专为配合 [`@ticatec/keelson-core`](https://www.npmjs.com/package/@ticatec/keelson-core) 使用而设计。支持 CommonJS 与 ESM 双模块导出。

中文 ｜ [English](./README.md)

## 特性

- **双模块系统支持**：完整支持 CommonJS (`lib/cjs`) 与 ESM (`lib/esm`) 及 TypeScript 类型声明
- **完整事务控制**：支持 `BEGIN`、`COMMIT` 和 `ROLLBACK` 操作
- **标准接口实现**：实现 `DBConnection` 与 `DBFactory` 抽象接口
- **自动布尔值转换**：原生支持 PostgreSQL 布尔类型及 `1/0`、`t/f` 转换
- **连接池管理**：基于 `pg.Pool` 提供高效连接池管理
- **结构化日志**：通过 `@ticatec/logger-api` 契约输出。日志里只有 SQL 语句与参数个数，绑定参数一律不写入；确需排查时显式设置 `KEELSON_LOG_SQL_PARAMS=true`。连接池配置摘要不含口令与连接串。
- **空闲连接断开不再拖垮进程**：空闲连接出错会被记录并移出连接池，而不是让 Node 以 `uncaughtException` 退出

## 安装

```bash
pnpm add @ticatec/keelson-pg @ticatec/keelson-core pg
```

### 对等依赖

```json
{
  "peerDependencies": {
    "@ticatec/keelson-core": ">=1.0.0",
    "pg": "^8.8.0"
  }
}
```

日志实现是可选的。不装任何实现时，`@ticatec/logger-api` 回退到 console，按 `LOG_LEVEL` 过滤。
需要走 pino，就再装 `@ticatec/logger-pino` 与 `pino`，并在应用入口注入实现。

## 快速上手

```typescript
import { initializePg } from '@ticatec/keelson-pg';
import { DBManager } from '@ticatec/keelson-core';

// 1. 初始化 PostgreSQL 数据库工厂与 DBManager
const pgFactory = initializePg({
  host: 'localhost',
  user: 'postgres',
  password: 'secret',
  database: 'myapp',
  port: 5432,
  max: 20
});

DBManager.init(pgFactory);

// 2. 获取连接并执行数据库操作
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

## 导出

| 导出 | 类型 | 说明 |
| --- | --- | --- |
| `initializePg(config, postConnection?)` | 函数 | 创建工厂。`postConnection` 对每个新建立的物理连接执行一次；抛错时销毁该 socket，`createDBConnection()` 以原异常作为 `cause` 拒绝。 |
| `PgDBFactory` | 类 | `createDBConnection()`、`close()`。`close()` 可重复调用。 |
| `PgDBConnection` | 类 | 需要改写某个方言细节时继承它。 |
| `PostConnection` | 类型 | `((client: PoolClient) => Promise<void>) | null` |

## 贡献

本包位于 [Keelson](https://github.com/ticatec/keelson) monorepo，欢迎在该仓库提交 issue 与 PR。

### 开发设置

```bash
git clone https://github.com/ticatec/keelson.git
cd keelson
pnpm install
cd packages/keelson-pg

pnpm build       # 同时构建 CJS 与 ESM 产物（构建前先跑 lint）
pnpm test        # 运行测试
pnpm typecheck   # 对三套配置做类型检查
pnpm lint        # 仅 lint
```

在 monorepo 根目录执行 `pnpm verify`，会对全部包做构建、类型检查与测试。

工作区只支持 pnpm：这里的依赖用 `workspace:*` 声明，npm 不认识这个协议，
`npm install` 会直接以 `EUNSUPPORTEDPROTOCOL` 失败。

测试套件对 `pg` 做了 mock，因此克隆后无需可连接的 PostgreSQL 服务也能构建与跑测试。

### 发布

```bash
pnpm publish:public   # prepublishOnly 会先跑 typecheck、test 与 build
```

## 授权协议

MIT —— 详见 [LICENSE](LICENSE) 文件。

## 👨‍💻 作者

**Henry Feng** —— [huili.f@gmail.com](mailto:huili.f@gmail.com)

## 🔗 相关链接

- [GitHub 仓库](https://github.com/ticatec/keelson/tree/main/packages/keelson-pg)
- [NPM 包](https://www.npmjs.com/package/@ticatec/keelson-pg)
- [问题反馈](https://github.com/ticatec/keelson/issues)
- [变更日志](CHANGELOG.md)
