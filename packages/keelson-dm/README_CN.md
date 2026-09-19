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
- 📊 **自动映射转化**：支持下划线列名转驼峰、保留加引号的显式驼峰别名、`__` 双下划线多级对象映射、兼容数组与对象行结构，并安全保留 `null` 值
- 🏗️ **双格式导出**：同时支持 CommonJS 和 ESM

## 安装

```bash
npm install @ticatec/keelson-dm
```

### Peer Dependencies

请确保项目中已安装对应对等依赖：

```bash
npm install dmdb @ticatec/keelson-core
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
- `close(): Promise<void>` - 关闭底层的 `dmdb` 连接池并重置工厂状态。

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

## 授权协议

本项目采用 MIT 许可证，详情请参阅 [LICENSE](LICENSE)。
