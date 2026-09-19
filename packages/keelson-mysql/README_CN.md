# @ticatec/keelson-mysql

为 `@ticatec/keelson-core` 框架提供的 MySQL 数据库连接实现，支持连接池管理、事务处理和 async/await 操作。

[![npm version](https://badge.fury.io/js/@ticatec%2Fkeelson-mysql.svg)](https://badge.fury.io/js/@ticatec%2Fkeelson-mysql)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[English](README.md) | 中文文档

## 特性

- 🔄 **事务管理**: 完整支持 BEGIN、COMMIT 和 ROLLBACK 操作
- 🏊 **连接池**: 基于 mysql2 的内置 MySQL 连接池管理  
- ⚡ **异步支持**: 基于 Promise 的 API，支持现代 JavaScript/TypeScript
- 🛡️ **类型安全**: 完整的 TypeScript 支持和正确的类型定义
- 🔍 **查询操作**: 支持 SELECT、INSERT、UPDATE、DELETE 操作
- 📊 **结果映射**: 自动字段映射和驼峰命名转换
- 🏗️ **可扩展设计**: 遵循 DBConnection 模式的清晰接口实现

## 安装

```bash
pnpm add @ticatec/keelson-mysql
```

### 对等依赖

请确保安装所需的对等依赖：

```bash
pnpm add mysql2 @ticatec/keelson-core
```

## 快速开始

### 1. 初始化连接工厂

```typescript
import { initializeMySQL } from '@ticatec/keelson-mysql';

const dbFactory = initializeMySQL({
  host: 'localhost',
  user: 'root',
  password: 'your_password',
  database: 'your_database',
  port: 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});
```

### 2. 基本查询操作

```typescript
async function performDatabaseOperations() {
  const connection = await dbFactory.createDBConnection();
  
  try {
    // 开始事务
    await connection.beginTransaction();
    
    // 查询数据
    const users = await connection.fetchData(
      'SELECT * FROM users WHERE status = ?', 
      ['active']
    );
    console.log('活跃用户:', users.rows);
    
    // 插入记录
    await connection.insertRecord(
      'INSERT INTO users (name, email, status) VALUES (?, ?, ?)',
      ['张三', 'zhangsan@example.com', 'active']
    );
    
    // 更新记录
    const affectedRows = await connection.executeUpdate(
      'UPDATE users SET last_login = NOW() WHERE email = ?',
      ['zhangsan@example.com']
    );
    console.log(`更新了 ${affectedRows} 行记录`);
    
    // 提交事务
    await connection.commit();
    
  } catch (error) {
    // 发生错误时回滚
    await connection.rollback();
    console.error('事务失败:', error);
    throw error;
  } finally {
    // 始终关闭连接
    await connection.close();
  }
}
```

## API 参考

### `initializeMySQL(config): DBFactory`

创建一个带连接池的 MySQL 数据库工厂。

**参数:**
- `config`: MySQL 连接配置对象（mysql2 PoolOptions）

**返回:** `DBFactory` 实例

### `MysqlDBFactory`

实现 `DBFactory` 接口的工厂类。

#### 方法

- `createDBConnection(): Promise<DBConnection>` - 从连接池创建新的数据库连接
- `close(): Promise<void>` - 关闭连接池，释放全部资源。可重复调用，第二次起为空操作

### `MysqlDBConnection`

实现 `DBConnection` 接口的数据库连接类。

#### 事务方法

- `beginTransaction(): Promise<void>` - 开始数据库事务
- `commit(): Promise<void>` - 提交当前事务
- `rollback(): Promise<void>` - 回滚当前事务
- `close(): Promise<void>` - 将连接释放回连接池

#### 查询方法

- `fetchData(sql: string, params?: any[]): Promise<{rows: any[], fields: any[]}>` - 执行 SELECT 查询
- `executeUpdate(sql: string, params: any[]): Promise<number>` - 执行 UPDATE/DELETE 查询，返回受影响行数
- `insertRecord<T>(sql: string, params: any[]): Promise<InsertResult<T>>` - 执行 INSERT，返回 `{ affectedRows, record: null, insertId }`
- `updateRecord<T>(sql: string, params: any[]): Promise<UpdateResult<T>>` - 执行 UPDATE，返回 `{ affectedRows, record: null }`
- `deleteRecord(sql: string, params: any[]): Promise<number>` - 执行 DELETE 查询

#### 工具方法

- `getFields(result: any): Field[]` - 从查询结果中提取字段元数据
- `getRowSet(result: any): any[]` - 从查询结果中提取行数据
- `getAffectRows(result: any): number` - 获取受影响的行数
- `getFirstRow(result: any): any | null` - 从查询结果中获取第一行数据

## 配置选项

`config` 参数接受所有 mysql2 PoolOptions。常用选项包括：

```typescript
interface MySQLConfig {
  host?: string;           // 数据库主机（默认：'localhost'）
  port?: number;           // 数据库端口（默认：3306）
  user?: string;           // 数据库用户名
  password?: string;       // 数据库密码
  database?: string;       // 数据库名
  connectionLimit?: number; // 连接池最大连接数（默认：10）
  queueLimit?: number;     // 最大排队请求数（默认：0）
  acquireTimeout?: number; // 连接获取超时时间（毫秒）
  timeout?: number;        // 查询超时时间（毫秒）
  reconnect?: boolean;     // 连接丢失时自动重连
  ssl?: any;              // SSL 配置
}
```

## 错误处理

该库包含内置的错误处理：

```typescript
try {
  const connection = await dbFactory.createDBConnection();
  await connection.beginTransaction();
  
  // 在此处执行数据库操作
  
  await connection.commit();
} catch (error) {
  if (connection) {
    await connection.rollback(); // 错误时自动回滚
  }
  console.error('数据库操作失败:', error);
} finally {
  if (connection) {
    await connection.close(); // 始终清理连接
  }
}
```

## 日志

日志走 [`@ticatec/logger-api`](https://www.npmjs.com/package/@ticatec/logger-api) 契约。
未注入实现时回退到 console，按 `LOG_LEVEL` 过滤。

取连接、事务生命周期与每条语句记在 `debug`，建池与关池记在 `info`。
**绑定参数一律不写入日志**，只有 SQL 文本与参数个数。确需排查时设置
`KEELSON_LOG_SQL_PARAMS=true`；默认关闭，不应出现在生产环境。
连接池配置摘要不含 `password` 与 `uri`。

## 已知问题和限制

1. **插入/更新不回传记录行**: MySQL 没有 PostgreSQL 的 `RETURNING` 子句，所以 `insertRecord` 与 `updateRecord` 的 `record` 恒为 `null`；新记录的主键通过 `insertId` 取得。只关心影响行数时用 `executeUpdate()` 更直接。

2. **查询走预处理语句协议**：`fetchData()`、`executeUpdate()`、`insertRecord()`、
   `updateRecord()` 调用的是 `mysql2` 的 `execute()`。`executeSQL()` 用的是 `query()`，
   预处理协议不接受的语句走这条路。

3. **每条不同的语句在连接级预处理缓存里占一个槽位**：`mysql2` 按 SQL 文本缓存，
   因此动态拼 `IN (?, ?, ?)` 的查询构造器，每种参数个数都会生成一个新条目。
   默认每个连接缓存 16000 条，超出后淘汰最旧的；连接池配置里的
   `maxPreparedStatements` 可以调整这个上限。

## 贡献

本包位于 [Keelson](https://github.com/ticatec/keelson) monorepo，欢迎在该仓库提交 issue 与 PR。

### 开发设置

```bash
git clone https://github.com/ticatec/keelson.git
cd keelson
pnpm install
cd packages/keelson-mysql

pnpm build       # 同时构建 CJS 与 ESM 产物（构建前先跑 lint）
pnpm test        # 运行测试
pnpm typecheck   # 对三套配置做类型检查
pnpm lint        # 仅 lint
```

在 monorepo 根目录执行 `pnpm verify`，会对全部包做构建、类型检查与测试。

工作区只支持 pnpm：这里的依赖用 `workspace:*` 声明，npm 不认识这个协议，
`npm install` 会直接以 `EUNSUPPORTEDPROTOCOL` 失败。

### 发布

```bash
pnpm publish:public   # prepublishOnly 会先跑 typecheck、test 与 build
```

## 授权协议

MIT —— 详见 [LICENSE](LICENSE) 文件。

## 👨‍💻 作者

**Henry Feng** —— [huili.f@gmail.com](mailto:huili.f@gmail.com)

## 🔗 相关链接

- [GitHub 仓库](https://github.com/ticatec/keelson/tree/main/packages/keelson-mysql)
- [NPM 包](https://www.npmjs.com/package/@ticatec/keelson-mysql)
- [问题反馈](https://github.com/ticatec/keelson/issues)
- [变更日志](CHANGELOG.md)
