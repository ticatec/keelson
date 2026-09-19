# @ticatec/keelson-dm

针对 `@ticatec/keelson-core` 框架的达梦数据库 (Dameng 8) 驱动适配包，提供连接池管理、事务处理、类型化返回结构和 async/await 异步支持。

[![npm version](https://badge.fury.io/js/@ticatec%2Fkeelson-dm.svg)](https://badge.fury.io/js/@ticatec%2Fkeelson-dm)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

中文文档 | [English](README.md)

## 特性

- 🔄 **完善的事务管理**：支持 `beginTransaction`、`commit` 与安全 `rollback` 操作，通过执行选项 `autoCommit` 强控事务生命周期
- 🏊 **内置连接池**：基于 `dmdb` 原生连接池实现，具备防并发竞态懒加载及失败重试机制
- ⚡ **现代化异步支持**：完整的 Promise / async / await 编程模型
- 🛡️ **强类型约束**：`insertRecord` 与 `updateRecord` 返回统一的类型化结构 (`InsertResult<T>`, `UpdateResult<T>`)
- 🔍 **参数绑定**：标准达梦 `?` 占位符绑定
- 📊 **自动映射转化**：支持下划线列名转驼峰、保留加引号的显式驼峰别名、`__` 与 `.` 多级对象映射（带原型链防御）、兼容数组与对象行结构，并安全保留 `null` 值
- 🏗️ **双格式导出**：同时支持 CommonJS 和 ESM

## 安装

```bash
pnpm add @ticatec/keelson-dm
```

### Peer Dependencies

请确保项目中已安装对应对等依赖：

```bash
pnpm add dmdb @ticatec/keelson-core
```

## 快速上手

### 1. 初始化数据库工厂

```typescript
import { initializeDmDB } from '@ticatec/keelson-dm';

const dbFactory = initializeDmDB({
  connectString: 'dm://SYSDBA:SYSDBA@localhost:5236',
  poolMax: 10,
  poolMin: 1
});
```

### 2. 基础数据库操作

```typescript
async function performDatabaseOperations() {
  const connection = await dbFactory.createDBConnection();
  
  try {
    // 开启事务（内部设置执行选项 autoCommit: false）
    await connection.beginTransaction();
    
    // 查询数据
    const users = await connection.fetchData(
      'SELECT * FROM users WHERE status = ?', 
      ['active']
    );
    console.log('活跃用户列表:', users.rows);
    
    // 插入记录
    const insertRes = await connection.insertRecord(
      'INSERT INTO users (name, status) VALUES (?, ?)',
      ['张三', 'active']
    );
    console.log(`受影响行数: ${insertRes.affectedRows}`);
    
    // 更新记录
    const updateRes = await connection.updateRecord(
      'UPDATE users SET status = ? WHERE name = ?',
      ['inactive', '张三']
    );
    console.log(`受影响行数: ${updateRes.affectedRows}`);
    
    // 删除记录
    const deletedCount = await connection.deleteRecord(
      'DELETE FROM users WHERE name = ?',
      ['张三']
    );
    console.log(`删除行数: ${deletedCount}`);

    // 提交事务（恢复 autoCommit: true）
    await connection.commit();
  } catch (error) {
    // 异常回滚（安全兜底并恢复 autoCommit: true）
    await connection.rollback();
    console.error('事务执行失败:', error);
    throw error;
  } finally {
    // 务必释放连接回池
    await connection.close();
  }
}
```

## API 参考

### `initializeDmDB(config: any): DBFactory`

初始化并创建基于 `dmdb` 原生连接池的 `DMDBFactory` 实例（同步返回接口工厂）。

### `DMDBFactory`

实现 `DBFactory` 接口的达梦工厂类。

- `createDBConnection(): Promise<DBConnection>` - 从连接池检出连接（首次调用时懒加载创建连接池，内置并发安全与建池失败清缓存重试机制）。
- `close(): Promise<void>` - 关闭底层的 `dmdb` 连接池并重置工厂状态。从未建池时调用也是安全的。

### `DMDBConnection`

实现 `DBConnection` 抽象基类的达梦连接包装类。

> [!NOTE]
> 与 MySQL 不同，达梦底层驱动在执行 DML 时不返回生成的自增主键。因此在达梦中 `InsertResult.insertId` 为 `undefined`。如需获取生成的 ID，建议使用 `RETURNING INTO` 或在执行后执行 `SELECT @@IDENTITY`。

#### 事务方法
- `beginTransaction(): Promise<void>` - 开始事务（设置后续所有语句执行选项 `autoCommit: false`）。
- `commit(): Promise<void>` - 提交当前事务，并在 `finally` 中将连接状态恢复为 `autoCommit: true`。
- `rollback(): Promise<void>` - 安全回滚当前事务（异常被记录不抛出），并在 `finally` 中将连接状态恢复为 `autoCommit: true`。
- `close(): Promise<void>` - 归还连接至连接池，确保事务状态复位。

#### 查询与操作方法
- `fetchData(sql: string, params?: any[]): Promise<Result<any>>` - 执行 SQL 查询并绑定参数。
- `insertRecord<T>(sql: string, params: any[]): Promise<InsertResult<T>>` - 执行 INSERT 并返回 `{ affectedRows, record }`。
- `updateRecord<T>(sql: string, params: any[]): Promise<UpdateResult<T>>` - 执行 UPDATE 并返回 `{ affectedRows, record }`。
- `deleteRecord(sql: string, params: any[]): Promise<number>` - 执行 DELETE 并返回受影响行数。
- `getPlaceholder(index: number): string` - 返回达梦方言占位符 `?`。

## 列别名映射

列名统一转驼峰：全大写标识符先整体转小写，`USER_NAME` 得到 `userName`；SQL 里显式加引号的
别名（如 `"itemCount"`）保持原样。

别名中的点号与双下划线都表示层级，`DEPT__USER_NAME` 与 `DEPT.USER_NAME` 同样映射为
`{ dept: { userName } }`。双下划线只有真正夹在两段非空文本之间时才算分隔符，
因此 `__internal` 这类列名保持为单个键，不会被切成空段。

会写到原型链上的别名（`__proto__`、`constructor`、`prototype`，不分大小写）直接丢弃；
路径中间层若已经是基本类型值，则整条路径跳过，不覆盖原值。

## 日志

日志走 [`@ticatec/logger-api`](https://www.npmjs.com/package/@ticatec/logger-api) 契约。
未注入实现时回退到 console，按 `LOG_LEVEL` 过滤。

事务生命周期与每条语句记在 `debug`，建池与关池记在 `info`。
**绑定参数一律不写入日志**，只有 SQL 文本与参数个数。确需排查时设置
`KEELSON_LOG_SQL_PARAMS=true`；默认关闭，不应出现在生产环境。
连接池配置摘要不含 `password` 与 `connectString`。

## 贡献

本包位于 [Keelson](https://github.com/ticatec/keelson) monorepo，欢迎在该仓库提交 issue 与 PR。

### 开发设置

```bash
git clone https://github.com/ticatec/keelson.git
cd keelson
pnpm install
cd packages/keelson-dm

pnpm build       # 同时构建 CJS 与 ESM 产物（构建前先跑 lint）
pnpm test        # 运行测试
pnpm typecheck   # 对三套配置做类型检查
pnpm lint        # 仅 lint
```

在 monorepo 根目录执行 `pnpm verify`，会对全部包做构建、类型检查与测试。

工作区只支持 pnpm：这里的依赖用 `workspace:*` 声明，npm 不认识这个协议，
`npm install` 会直接以 `EUNSUPPORTEDPROTOCOL` 失败。

测试套件对 `dmdb` 做了 mock，因此克隆后无需可连接的达梦服务也能构建与跑测试。

### 发布

```bash
pnpm publish:public   # prepublishOnly 会先跑 typecheck、test 与 build
```

## 授权协议

MIT —— 详见 [LICENSE](LICENSE) 文件。

## 👨‍💻 作者

**Henry Feng** —— [huili.f@gmail.com](mailto:huili.f@gmail.com)

## 🔗 相关链接

- [GitHub 仓库](https://github.com/ticatec/keelson/tree/main/packages/keelson-dm)
- [NPM 包](https://www.npmjs.com/package/@ticatec/keelson-dm)
- [问题反馈](https://github.com/ticatec/keelson/issues)
- [变更日志](CHANGELOG.md)
