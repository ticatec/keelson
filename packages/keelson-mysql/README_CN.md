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
npm install @ticatec/keelson-mysql
```

### 对等依赖

请确保安装所需的对等依赖：

```bash
npm install mysql2 @ticatec/keelson-core
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
- `insertRecord(sql: string, params: any[]): Promise<any>` - 执行 INSERT 查询
- `updateRecord(sql: string, params: any[]): Promise<any>` - 执行 UPDATE 查询并返回结果数据
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

## 已知问题和限制

1. **插入/更新返回值**: `insertRecord` 和 `updateRecord` 方法目前调用 `getFirstRow()`，但 INSERT/UPDATE 操作通常不返回行数据。建议对这些操作使用 `executeUpdate()` 方法。

2. **类型安全**: 一些内部方法使用 `any` 类型。建议添加更具体的类型定义以提高类型安全性。

3. **结果结构**: `getRowSet` 和 `getFirstRow` 方法对结果结构的假设可能并不总是与实际的 mysql2 响应格式匹配。

## 贡献

1. Fork 这个仓库
2. 创建您的功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交您的更改 (`git commit -m 'Add some amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 打开一个 Pull Request

## 许可证

该项目使用 MIT 许可证 - 详情请查看 [LICENSE](LICENSE) 文件。

## 支持

- 📧 邮箱: huili.f@gmail.com
- 🐛 问题反馈: [GitHub Issues](https://github.com/ticatec/keelson-mysql/issues)
- 📖 文档: [GitHub 仓库](https://github.com/ticatec/keelson-mysql)

## 相关包

- [@ticatec/keelson-core](https://www.npmjs.com/package/@ticatec/keelson-core) - 核心框架库
- [mysql2](https://www.npmjs.com/package/mysql2) - Node.js 的 MySQL 客户端

## 开发指南

### 本地开发

```bash
# 克隆仓库
git clone https://github.com/ticatec/keelson-mysql.git
cd keelson-mysql

# 安装依赖
npm install

# 构建项目
npm run build
```


### 发布

```bash
# 构建并发布到 npm
npm run build
npm run publish:public
```