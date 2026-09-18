# @ticatec/node-common-library

中文 | [English](README.md)

一个完整的 Node.js 数据库访问框架，提供数据库连接管理、SQL 执行、声明式事务、分页查询与动态查询构建的健壮抽象。

[![Version](https://img.shields.io/npm/v/@ticatec/node-common-library)](https://www.npmjs.com/package/@ticatec/node-common-library)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **v4.0.0 包含破坏性变更。** 如果你从 3.x 升级，请先阅读[从 3.x 迁移](#-从-3x-迁移)。

## 🌟 特性

- **ESM / CommonJS 双格式**：单个包同时提供原生 ES 模块与 CommonJS，Node 会根据你的项目自动选择
- **多数据库支持**：实现 `DBConnection` 抽象类与 `DBFactory` 接口即可适配任意数据库（现成驱动：`@ticatec/pg-common-library`、`@ticatec/mysql-common-library`、`@ticatec/dm-common-library`）
- **方言无关的 SQL 构建**：参数占位符由驱动通过 `getPlaceholder(index)` 生成，同一份 `CommonSearchCriteria` 代码在 PostgreSQL 下产出 `$1`、在 MySQL / 达梦下产出 `?`
- **声明式事务**：给 Service 方法加 `@Transaction(propagation)` 注解，由 `TransactionManager` 基于 `AsyncLocalStorage` 完成提交 / 回滚，活动连接自动透传，无需层层传参
- **分页查询**：内置 `PaginationList` 结果结构与可重入的 `CommonSearchCriteria` 动态查询构建器
- **SQL 文件执行**：`executeSQLFile()` 剥离注释并逐条执行语句，默认在第一条失败时中止
- **字段转换**：自动下划线 → 驼峰、通过 `"profile.isActive"` 别名生成嵌套对象、保留显式 `null`、`1`/`0`/`T`/`F` → 布尔值转换
- **惰性 Bean 工厂**：`beanFactory.register(name, Class)` + `beanFactory.createBean<T>(name)` 返回单例代理，首次访问时才真正构造，从而在模块加载阶段打破循环依赖
- **乐观锁**：`OptimisticLockException` 用于报告并发更新冲突

## 📦 安装

```bash
pnpm add @ticatec/node-common-library @ticatec/logger-api reflect-metadata
# 再加上你使用的数据库驱动，例如
pnpm add @ticatec/pg-common-library pg
```

`@ticatec/logger-api` 是 **peer dependency**，需要显式安装。它是零依赖的日志契约，**不会**引入任何日志库。只有当你需要结构化输出时才另外装一个（见[日志](#日志)）。

本包以 ESM/CJS 双格式发布，使用方无需任何额外配置：CommonJS 项目里 `require()` 可用，ESM / TypeScript 项目里 `import` 可用。

```typescript
// ESM / TypeScript
import { DBManager, beanFactory, CommonService, CommonDAO } from '@ticatec/node-common-library';

// CommonJS
const { DBManager, beanFactory, CommonService, CommonDAO } = require('@ticatec/node-common-library');
```

### 环境要求

| | |
| --- | --- |
| Node.js | `>= 18` |
| Peer 依赖 | `@ticatec/logger-api >= 1.0.0` |
| 运行时依赖 | `reflect-metadata`（`@Transaction` 装饰器需要） |

## 🚀 快速上手

### 1. 日志（可选）

无需任何配置 —— 框架面向 `@ticatec/logger-api` 契约写日志，未注入 provider 时记录走 console，按 `LOG_LEVEL` 过滤（默认 `info`）。

想把日志接入真正的日志库，在启动时注入一次 provider 即可。用 pino 的话有现成适配器：

```typescript
import { initialize } from '@ticatec/logger-wrapper';

initialize({
    appenders: [
        { name: 'console', type: 'console', level: process.env.LOG_LEVEL || 'info' }
    ],
    loggers: {
        root: { level: process.env.LOG_LEVEL || 'info', appenders: ['console'] }
    }
});
```

其他日志库用 `setLoggerProvider()` 几行就能适配 —— 见 [logger-api 的 README](https://github.com/ticatec/keelson/tree/main/packages/logger-api)。

> 顺序无关。`CommonDAO`、`CommonService`、`CommonRepository`、`CommonSearchCriteria` 和 `Beans` 都在构造函数里获取 logger，但捕获到的 logger 在每次写入时才解析当前 provider —— 因此在这些对象已经存在之后再注入 provider，同样生效。

### 2. 初始化数据库管理器

使用现成的驱动包，或自行实现 `DBFactory`（见[编写自定义驱动](#-编写自定义驱动)）。`DBManager.init()` 在应用启动时调用一次。

```typescript
import { DBManager } from '@ticatec/node-common-library';
import { initializePg } from '@ticatec/pg-common-library';

DBManager.init(initializePg({
    host: 'localhost',
    port: 5432,
    database: 'app',
    user: 'app',
    password: '***'
}));
```

应用关闭时，通过工厂释放连接池：

```typescript
await dbFactory.close();
```

### 3. 注册 DAO、Repository 与 Service

默认导出的 `beanFactory` 是单例注册表。`register(name, Class)` **不会**立即实例化；`createBean(name)` 返回一个惰性代理，内部实例在首次访问时构造，之后复用。

```typescript
import { beanFactory } from '@ticatec/node-common-library';
import { UserDAO } from './dao/UserDAO';
import { UserRepository } from './repository/UserRepository';
import { UserService } from './service/UserService';

beanFactory.register('UserDAO', UserDAO);
beanFactory.register('UserRepository', UserRepository);
beanFactory.register('UserService', UserService);
```

需要动态 / 代码分割式注册时使用 `Beans`，它登记异步加载器并一次性解析注入 `beanFactory`：

```typescript
import { Beans } from '@ticatec/node-common-library';

const beans = Beans.getInstance();
beans.register('UserDAO', () => import('./dao/UserDAO.js'));
beans.register('UserService', () => import('./service/UserService.js'));

await beans.load();   // 各模块的 default 导出会被注册进 beanFactory
```

### 4. 编写 DAO

`CommonDAO` 提供 `getDBConnection()`，返回绑定在外层 `@Transaction` 上下文中的连接。写操作方法返回类型化的 `InsertResult<T>` / `UpdateResult<T>` 结构。

```typescript
import { CommonDAO } from '@ticatec/node-common-library';
import type { InsertResult } from '@ticatec/node-common-library';

export class UserDAO extends CommonDAO {

    async createUser(user: User): Promise<InsertResult<User>> {
        const sql = 'INSERT INTO users (id, name, email) VALUES ($1, $2, $3) RETURNING *';
        return await this.executeInsertQuery<User>(sql, [this.genID(), user.name, user.email]);
    }

    async findUserById(id: string): Promise<User | null> {
        const sql = 'SELECT * FROM users WHERE id = $1';
        return await this.findByPK(sql, [id]);
    }

    async updateUser(user: User): Promise<number> {
        const sql = 'UPDATE users SET name = $1, email = $2 WHERE id = $3';
        const result = await this.executeUpdateQuery<User>(sql, [user.name, user.email, user.id]);
        return result.affectedRows;
    }

    async deleteUser(id: string): Promise<number> {
        const sql = 'DELETE FROM users WHERE id = $1';
        return await this.executeDeleteQuery(sql, [id]);
    }
}
```

> 你手写的 SQL 是方言相关的 —— PostgreSQL 用 `$1, $2`，MySQL 和达梦用 `?`。只有 `CommonSearchCriteria` 会替你生成占位符。

### 5. 编写 Repository

Repository 继承 `CommonRepository`，通过 `getDAOInstance<T>(name)` 协调多个 DAO：

```typescript
import { CommonRepository } from '@ticatec/node-common-library';
import type { UserDAO } from './dao/UserDAO';

export class UserRepository extends CommonRepository {
    async createUser(user: User): Promise<string> {
        const userDAO = this.getDAOInstance<UserDAO>('UserDAO');
        const result = await userDAO.createUser(user);
        if (result.affectedRows === 0 || result.record == null) {
            throw new Error('创建用户失败');
        }
        return result.record.id;
    }
}
```

### 6. 编写带 `@Transaction` 的 Service

Service 方法加 `@Transaction()` 注解，继承 `CommonService`，通过 `getRepositoryInstance<T>(name)` 获取 Repository：

```typescript
import { CommonService, Transaction, Propagation } from '@ticatec/node-common-library';
import type { UserRepository } from './repository/UserRepository';

export class UserService extends CommonService {

    @Transaction()
    async registerUser(user: User): Promise<string> {
        const repo = this.getRepositoryInstance<UserRepository>('UserRepository');
        return await repo.createUser(user);
    }

    @Transaction(Propagation.REQUIRES_NEW)
    async writeAuditLog(entry: AuditEntry): Promise<void> {
        const repo = this.getRepositoryInstance<AuditRepository>('AuditRepository');
        await repo.append(entry);
    }
}
```

> `@Transaction` 本身只记录元数据，真正的织入发生在 `CommonService` 的构造函数里。把装饰器用在**不继承** `CommonService` 的类上不会生效。

### 7. 用 `CommonSearchCriteria` 做动态查询

在**构造函数**里设置基础 SQL、基础参数和 `orderBy`；在 `buildDynamicQuery()` 里追加动态条件。构造函数设置的值会在首次执行时被快照为基线，之后每次执行前自动恢复，因此同一个实例可以反复执行而不会重复拼接条件。

```typescript
import { CommonSearchCriteria } from '@ticatec/node-common-library';
import type { PaginationList } from '@ticatec/node-common-library';

const BASE_SQL = `
    SELECT u.id, u.name, u.email, u.created_at, p.is_active AS "profile.isActive"
      FROM users u
      LEFT JOIN profiles p ON p.user_id = u.id
     WHERE u.tenant_code = $1 AND u.deleted = false`;

class UserSearchCriteria extends CommonSearchCriteria {
    constructor(tenantCode: string, criteria?: any) {
        super(criteria);
        this.sql = BASE_SQL;            // 基线
        this.params = [tenantCode];     // 基线
        this.orderBy = 'ORDER BY u.created_at DESC';
        this.setBooleanFields('profile.isActive');
    }

    protected buildDynamicQuery(): void {
        this.addWildcardCriteria(this.criteria?.name, 'u.name');                       // 含 '*' 走 LIKE，否则 =
        this.addEqualsCriteria(this.criteria?.email, 'u.email');                       // 精确匹配
        this.addRangeCriteria(this.criteria?.dateFrom, this.criteria?.dateTo, 'u.created_at');
    }
}

// 在 @Transaction 或 TransactionManager.execute 上下文内：
const result: PaginationList = await new UserSearchCriteria('TENANT_A', {
    name: 'John*',
    page: 1,
    pageSize: 20
}).paginationQuery(conn);

console.log(`总计: ${result.count}, 页数: ${result.pages}`);
```

`addXxxCriteria()` 内部的占位符通过连接的 `getPlaceholder(index)` 生成，所以同一个类无需修改即可用于 PostgreSQL、MySQL 和达梦。`BASE_SQL` 里你自己写的占位符由你负责；手工追加 SQL 片段时请使用 `this.getPlaceholder(this.params.length)`：

```typescript
protected buildDynamicQuery(): void {
    if (this.criteria?.categoryPath) {
        this.params.push(`${this.criteria.categoryPath}%`);
        this.sql += ` AND pc.query_path LIKE ${this.getPlaceholder(this.params.length)}`;
    }
}
```

## 🏗️ 核心组件

### CommonDAO

数据访问对象的抽象基类。子类可用的成员（均为 `protected`）：

| 成员 | 用途 |
| --- | --- |
| `getDBConnection()` | 返回绑定在外层事务上下文中的连接；无上下文时抛错 |
| `findFirst(sql, params?)` | 执行查询并返回首行，无结果返回 `null` |
| `findByPK(sql, params?)` | `findFirst` 的别名 |
| `listQuery(sql, params?)` | 执行查询并返回全部匹配行 |
| `executeInsertQuery<T>(sql, params?)` | 执行 `INSERT`，返回 `InsertResult<T>` |
| `executeUpdateQuery<T>(sql, params?)` | 执行 `UPDATE`，返回 `UpdateResult<T>` |
| `executeDeleteQuery(sql, params?)` | 执行 `DELETE`，返回受影响行数 |
| `executePaginationQuery(criteria)` | 执行 `CommonSearchCriteria` 分页查询，返回 `PaginationList` |
| `quickSearch<T>(sql, params?, pageNo?, rowCount?, booleanFields?)` | 方言无关的快速分页查询，返回 `QuickSearchResult<T>` |
| `executeCountSQL(sql, params, key?)` | 执行 `count(*)` 查询并返回数字（`key` 默认 `'cc'`） |
| `genID()` | 32 位无连字符 UUID v7 —— 时间有序，适合直接做主键 |
| `getBooleanValue(b)` / `getBoolean(b)` | `1`/`0` 与 `'T'`/`'F'` 转换辅助方法 |
| `logger` | 以子类名命名的日志器 |

### CommonRepository

Repository 层抽象基类 —— 协调多个 DAO、组装 PO/DTO。

| 成员 | 用途 |
| --- | --- |
| `getDAOInstance<T>(name)` | 返回已注册的 DAO 代理；未注册时抛出描述性错误 |
| `genID()` | 32 位无连字符 UUID v7 |
| `genUUID()` | 标准 36 位带连字符 UUID v7 |
| `logger` | 以子类名命名的日志器 |

### CommonService

Service 抽象基类。构造函数会遍历原型链，把每个带 `@Transaction` 注解的方法包装进 `TransactionManager.execute(propagation, …)`。包装是幂等的 —— 父类已包装过的继承方法不会被二次包装。

| 成员 | 用途 |
| --- | --- |
| `@Transaction(propagation?)` | 开启事务上下文的方法装饰器 |
| `getDBConnection()` | 返回当前事务的连接 |
| `getRepositoryInstance<T>(name)` | 返回已注册的 Repository 代理；未注册时抛错 |
| `logger` | 以子类名命名的日志器 |

### 事务传播行为

定义在 `Propagation` 中：

- `REQUIRED`（默认）—— 加入外层**事务**，若无则新开一个。用 `NONE` 开启的上下文不是事务性的，因此嵌套的 `REQUIRED` 调用会真正开启自己的事务，而不是静默复用自动提交的连接。
- `REQUIRES_NEW` —— 始终开启独立的连接与事务，并挂起外层上下文
- `NONE` —— 在全新的非事务连接上执行（语句自动提交）

不使用装饰器时，可直接调用 `TransactionManager.execute(propagation, fn)`：

```typescript
import { TransactionManager, Propagation } from '@ticatec/node-common-library';

await TransactionManager.execute(Propagation.REQUIRED, async (conn) => {
    // 正常返回则提交，抛异常则回滚，最终始终关闭连接
});

// 在该回调内部的任意位置：
const conn = TransactionManager.getCurrentConnection();   // DBConnection | undefined
```

### DBConnection

定义驱动必须实现的数据库原语，以及框架在其之上构建的共用查询能力。

**基类已提供**（驱动直接继承）：

- **读取**：`find<T>()`（单行）、`listQuery<T>()`（多行）、`executeCountSQL()`、`quickSearch<T>()`
- **Criteria 辅助**：`executePaginationSQL(criteria)`、`queryByCriteria(criteria)`
- **SQL 文件**：`executeSQLFile(path, options?)`
- **工具方法**：`convertBooleanFields(data, fields)`、`sanitizeParams(params)`、`getRowSetLimitClause(rowCount, offset)`
- **结果整形**：自动下划线 → 驼峰、通过 `"parent.child.field"` 别名生成嵌套结构、保留显式 `null`、布尔值转换

**必须由驱动实现的部分** —— 见[编写自定义驱动](#-编写自定义驱动)。

#### `executeSQLFile(path, options?)`

读取 `.sql` 文件，剥离 `/* … */` 与 `-- …` 注释，按语句结束分号切分，逐条执行。

```typescript
await conn.executeSQLFile('./migrations/001_init.sql');
// 默认 { stopOnError: true, throwOnError: true } → 第一条失败即中止并抛出异常

const hasError = await conn.executeSQLFile('./migrations/001_init.sql', {
    stopOnError: false            // 继续执行，若有失败则返回 true
});
```

| 选项 | 默认值 | 作用 |
| --- | --- | --- |
| `stopOnError` | `true` | 在第一条失败的语句处停止 |
| `throwOnError` | `true` | 抛出包含文件名与失败语句的 `Error`（仅当 `stopOnError` 为 `true` 时生效） |

> 这是面向标准 DDL/DML 迁移脚本的轻量切分器，不解析 PL/SQL 块，也不处理字符串字面量内部的分号。

#### 布尔字段自动转换

```typescript
// 普通字段
const user = await conn.find(
    'SELECT * FROM users WHERE id = $1',
    [id],
    null,
    ['isActive', 'isVerified']          // 就地转换
);

// 通过 SQL 别名转换嵌套字段
const userWithProfile = await conn.find(
    `SELECT u.*, p.is_active AS "profile.isActive"
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id
      WHERE u.id = $1`,
    [id],
    null,
    ['profile.isActive']                // 沿点号路径深入
);
```

### CommonSearchCriteria / SearchCriteria

动态查询构建器。`CommonSearchCriteria` 是基类；`SearchCriteria` 是向后兼容的空别名 —— 新代码请使用 `CommonSearchCriteria`。

其构造函数为 `protected constructor(criteria?: any)`，因此只能通过子类使用 —— 请在子类中声明 `public` 构造函数并调用 `super(criteria)`。

构造函数会从传入的 criteria 对象读取 `page` 与 `pageSize` 并做边界收敛：`page` 强制 `>= 1`，`pageSize` 收敛到 `1 … 1000`（默认 `25`）。

| 成员 | 用途 |
| --- | --- |
| `buildDynamicQuery()` | **抽象方法。** 覆写以追加 `and …` 子句并 push 参数 |
| `addEqualsCriteria(value, field)` | 值非空时追加 `field = <占位符>` |
| `addWildcardCriteria(text, field)` | 含 `*` 通配符走 `LIKE`，否则 `=` |
| `addRangeCriteria(from, to, field)` | 追加 `field >= …` 和/或 `field < …`；`Date` 类型的上界会推进到次日零点 |
| `getPlaceholder(index)` | 当前连接的方言占位符（`$N` / `?`） |
| `escapePercentage(s)` / `replaceWildStar(s)` | 转义 `\`、`%`、`_`；`replaceWildStar` 额外把 `*` 映射为 `%` |
| `toWildSQL(s)` / `wrapLikeMatch(s)` / `includeStar(s)` / `isNotEmpty(v)` | 字符串辅助方法 |
| `getNextDayStart(d)` | 日期区间的排他上界 —— 次日本地零点，夏令时安全 |
| `setBooleanFields(...fields)` | 设置需要转换为布尔值的结果字段 |
| `getPostProcessor()` | 覆写以返回逐行的后置处理回调 |
| `paginationQuery(conn)` | 返回 `PaginationList` —— `{ count, hasMore, list, pages }` |
| `query(conn)` | 非分页执行，返回全部匹配行 |

**可重入性。** `paginationQuery()` 与 `query()` 都会在首次使用时快照 `sql`、`params`、`orderBy`，并在后续每次调用 `buildDynamicQuery()` 之前恢复。请把基础 SQL 与基础参数放在构造函数里，`buildDynamicQuery()` 保持纯追加。

### BeanFactory

`beanFactory` 是默认导出的单例；`BeanFactory` 类也一并导出，便于创建独立注册表。

```typescript
import { beanFactory, BeanFactory } from '@ticatec/node-common-library';

beanFactory.register('UserDAO', UserDAO);

// 返回一个 Proxy；名称未注册时返回 undefined。
// 真实实例在首次属性访问时构造，此后复用。
const userDAO = beanFactory.createBean<UserDAO>('UserDAO');

// 独立注册表，例如用于测试
const testRegistry = new BeanFactory();
```

该代理可打破循环依赖：相互引用的 A 与 B 注册后不再在模块加载阶段触发 `ReferenceError` —— 在真正调用代理上的方法之前，两者都不会被构造。真实的构造环路会被检测并报告为 `Circular dependency detected: A -> B -> A`。

### DBManager

```typescript
DBManager.init(factory);        // 启动时调用一次，重复调用会被忽略
DBManager.getInstance();        // 未调用 init() 时抛错
await DBManager.getInstance().connect();   // → DBConnection
DBManager.resetInstance();      // 测试钩子
```

## 🔌 编写自定义驱动

一个驱动需要提供两样东西：`DBConnection` 的子类和 `DBFactory` 的实现。

```typescript
import { DBConnection, DBFactory, Field, FieldType } from '@ticatec/node-common-library';
import type { InsertResult, UpdateResult } from '@ticatec/node-common-library';

class MyDBConnection extends DBConnection {

    // --- 方言 ---
    getPlaceholder(index: number): string { return `$${index}`; }   // MySQL / 达梦返回 '?'

    // --- 事务 ---
    async beginTransaction(): Promise<void> { /* … */ }
    async commit(): Promise<void> { /* … */ }
    async rollback(): Promise<void> { /* … */ }
    async close(): Promise<void> { /* 归还连接池 */ }

    // --- 写入 ---
    async executeUpdate(sql: string, params: any[]): Promise<number> { /* … */ }
    async insertRecord<T = any>(sql: string, params: any[]): Promise<InsertResult<T>> { /* … */ }
    async updateRecord<T = any>(sql: string, params: any[]): Promise<UpdateResult<T>> { /* … */ }
    async deleteRecord(sql: string, params: any[]): Promise<number> { /* … */ }

    // --- 原生执行 / 读取（protected） ---
    protected async executeSQL(sql: string): Promise<any> { /* executeSQLFile 走这条路径 */ }
    protected async fetchData(sql: string, params?: any[]): Promise<any> { /* … */ }

    // --- 结果解析 ---
    getFields(result: any): Array<Field> { /* … */ }
    protected getRowSet(result: any): Array<any> { /* 行数组 */ }
    protected getAffectRows(result: any): number { /* … */ }
    protected getFirstRow(result: any): any { /* 映射后的首行，或 null */ }
}

class MyDBFactory implements DBFactory {
    async createDBConnection(): Promise<DBConnection> { /* … */ }
    async close(): Promise<void> { /* pool.end() */ }
}
```

**必须实现的成员**一览：

| 成员 | 可见性 | 说明 |
| --- | --- | --- |
| `getPlaceholder(index)` | public | **4.0.0 起为抽象方法。** PostgreSQL 用 `$N`，MySQL / 达梦用 `?` |
| `beginTransaction()` / `commit()` / `rollback()` / `close()` | public | `close()` 把连接归还连接池 |
| `executeUpdate()` / `insertRecord<T>()` / `updateRecord<T>()` / `deleteRecord()` | public | 插入 / 更新方法返回 `InsertResult<T>` / `UpdateResult<T>` |
| `executeSQL(sql)` | protected | `executeSQLFile()` 使用的原生执行路径 —— 必须支持 DDL |
| `fetchData(sql, params?)` | protected | 返回驱动的原始结果；`getRowSet` / `getFields` 会读取它 |
| `getFields(result)` | public | 字段元数据 |
| `getRowSet(result)` | protected | 行数组 —— `resultToList()` 会调用它，必须返回真实数据 |
| `getAffectRows(result)` | protected | 受影响行数 |
| `getFirstRow(result)` | protected | 映射后的首行，或 `null` |
| `DBFactory.close()` | public | **4.0.0 起为必选** —— 关闭连接池 |

**可选覆写：** `getRowSetLimitClause(rowCount, offset)`（默认 ` limit N offset M`）、`toCamel(name)`、`buildFieldsMap(fields)`、`setNestObj(obj, field, value)`、`resultToList(result)`、`getBoolean(value)`。

**驱动可用的辅助能力：** `this.logger`、`this.safeLogMeta(sql, params)`（只记录语句与参数**个数**，绝不记录参数值）、`this.sanitizeParams(params)`（把 `undefined` 映射为 `null`）、`this.toCamel(name)`。

## 🔧 进阶特性

### 批处理

```typescript
import type { BatchRecord, BatchRecords } from '@ticatec/node-common-library';

const batch: BatchRecords<User> = [
    { recNo: 1, data: { name: 'User 1', email: 'u1@x.com' }, error: null },
    { recNo: 2, data: { name: 'User 2', email: 'u2@x.com' }, error: null }
];

for (const record of batch) {
    try {
        await userDAO.createUser(record.data);
    } catch (err) {
        record.error = err;
    }
}
```

### 用 `BitsBoolean` 做位压缩标志

```typescript
import { BitsBoolean } from '@ticatec/node-common-library';

class UserPermissions extends BitsBoolean {
    constructor(value = 0) { super(value); }
    setCanRead(v: boolean)  { this.setBitValue(0, v); }
    getCanRead(): boolean   { return this.getBitValue(0); }
    setCanWrite(v: boolean) { this.setBitValue(1, v); }
    getCanWrite(): boolean  { return this.getBitValue(1); }
}

BitsBoolean.fromBooleanArray([true, false, true]);   // → 5（最多 31 个元素）
new UserPermissions(5).toBooleanArray(3);            // → [true, false, true]
```

位序号限定在 `0 … 30`，越界会抛错。所有运算均为无符号 32 位。

### 字符串工具

```typescript
import { StringUtils } from '@ticatec/node-common-library';

StringUtils.genID();               // 32 位 UUID v7，无连字符
StringUtils.uuid();                // 标准带连字符的 UUID v7
StringUtils.isEmpty('   ');        // true
StringUtils.isString('abc');       // true
StringUtils.isNumber('123');       // true
StringUtils.parseNumber('abc', 0); // 0（回退值）
StringUtils.leftPad('45', '0', 4); // '0045'
```

`genID()` 与 `uuid()` 返回的是 **UUID v7**。v7 在前导位中携带 48 位毫秒时间戳，且同一毫秒内单调递增，因此循环中连续生成的标识符严格有序 —— `genID()` 去掉连字符后仍保持这一顺序。这使它非常适合做数据库主键：插入集中在 B-tree 索引的同一区域，而不像随机 v4 那样四处散落。

```typescript
StringUtils.genID();   // 01a0b1ab1d6674899b3f9a4d28db4410
StringUtils.genID();   // 01a0b1ab1d6674899b3f9e1c0bb70631   ← 排序在上一个之后
```

> v7 标识符会暴露自身的生成时间。如果这一点有影响，或者该值必须不可猜测（令牌、密码重置链接），请改用 `node:crypto` 自行生成随机值。

### 日志

本库面向零依赖契约 [`@ticatec/logger-api`](https://www.npmjs.com/package/@ticatec/logger-api) 写日志。记录最终由哪个库接收，由应用决定 —— 用 `setLoggerProvider()` 注入，或直接使用 [`@ticatec/logger-wrapper`](https://www.npmjs.com/package/@ticatec/logger-wrapper) 里的 pino 适配器。未注入时输出到 console，按 `LOG_LEVEL` 过滤（默认 `info`）。

```typescript
import { getLogger } from '@ticatec/node-common-library';
import type { Logger } from '@ticatec/node-common-library';

const log: Logger = getLogger('MyService');
log.info({ userId }, 'user logged in');
```

框架的每个基类都已暴露以具体子类名命名的 `logger`，因此很少需要直接调用 `getLogger()`。驱动通过 `safeLogMeta()` 记录 SQL —— 只记录语句文本和参数个数，**绝不**记录参数值。

## 📋 API 参考

### 类

- **`DBManager`** —— `init(factory)`、`getInstance()`、`connect()`、`resetInstance()`
- **`DBConnection`** —— 驱动抽象基类
- **`CommonDAO`** / **`CommonRepository`** / **`CommonService`** —— 四层架构基类
- **`CommonSearchCriteria`** —— 动态查询构建器；构造函数为 `protected`，需继承使用
- **`SearchCriteria`** —— **已废弃。** 仅为向后兼容保留的空子类（`abstract class SearchCriteria extends CommonSearchCriteria {}`），不附加任何行为；新代码请直接继承 `CommonSearchCriteria`
- **`TransactionManager`** —— `execute(propagation, fn)`、`getCurrentConnection()`
- **`BeanFactory`** —— 注册表类；**`beanFactory`** 是默认单例实例
- **`Beans`** —— `getInstance()`、`register(name, loader)`、`load()`
- **`BitsBoolean`** —— 位压缩布尔标志
- **`StringUtils`** —— `isEmpty`、`genID`、`uuid`、`leftPad`、`isString`、`isNumber`、`parseNumber`

### 装饰器

- **`@Transaction(propagation?: Propagation)`** —— 标记方法参与声明式事务，默认 `Propagation.REQUIRED`。它只通过 `reflect-metadata` 记录元数据，真正的织入由 `CommonService` 构造函数完成，因此用在不继承 `CommonService` 的类上不会生效。

### 函数

- **`getLogger(name: string, category?: string): Logger`** —— 转出自 `@ticatec/logger-api`，返回的 logger 在每次写入时解析已注入的 provider，未注入时回落到 console。`name` 通常取类名或模块名；`category` 用于分组（框架内部使用 `'db'`、`'service'`、`'repository'`、`'controller'`）。不会抛错，也不要求预先初始化。

### 接口（仅类型）

- **`DBFactory`** —— `createDBConnection(): Promise<DBConnection>`、`close(): Promise<void>`
- **`InsertResult<T>`** —— `{ affectedRows: number, record: T | null, insertId?: number | string | null }`
- **`UpdateResult<T>`** —— `{ affectedRows: number, record: T | null }`
- **`PaginationList`** —— `{ count, hasMore, list, pages }`
- **`QuickSearchResult<T>`** —— `{ list: T[], hasMore: boolean }`
- **`ExecuteSQLFileOptions`** —— `{ stopOnError?: boolean, throwOnError?: boolean }`
- **`Field`** —— `{ name, type: FieldType, length? }`
- **`BaseDAO<T, K>`** —— 按主键的 `createNew`、`update`、`find`
- **`BaseCRUDDAO<T, K>`** —— 在 `BaseDAO` 基础上增加 `remove`
- **`BatchRecord<T>`** / **`BatchRecords<T>`** —— 批处理记录结构

### 类型（仅类型）

- **`PostConstructionFun`** —— `(obj: any) => void`，由 `find()` / `listQuery()` 使用
- **`Logger`** —— 转出自 `@ticatec/logger-api`，含五个级别方法（`trace`、`debug`、`info`、`warn`、`error`）

### 枚举

- **`FieldType`** —— `Text`、`Number`、`Date`
- **`Propagation`** —— `REQUIRED`、`REQUIRES_NEW`、`NONE`

### 异常

- **`OptimisticLockException`** —— 继承 `Error`，通过 `.entity` 携带冲突实体

```typescript
import { OptimisticLockException } from '@ticatec/node-common-library';

try {
    await userDAO.updateUser(user);
} catch (err) {
    if (err instanceof OptimisticLockException) {
        console.warn('并发修改冲突:', err.entity);
    }
}
```

## 🔀 从 3.x 迁移

| 变更 | 3.x | 4.0.0 |
| --- | --- | --- |
| `insertRecord()` / `executeInsertQuery()` | 返回插入的行（或驱动相关的值） | 返回 `InsertResult<T>` —— 读取 `result.record`、`result.affectedRows`、`result.insertId` |
| `updateRecord()` / `executeUpdateQuery()` | 返回更新后的行（或驱动相关的值） | 返回 `UpdateResult<T>` —— 读取 `result.record`、`result.affectedRows` |
| `DBConnection.getPlaceholder(index)` | 不存在 | **抽象方法** —— 所有驱动必须实现 |
| `DBFactory.close()` | 不存在 | **必选** —— 所有工厂必须实现 |
| `BeanFactory` 导出 | 绑定到单例实例 | 现在是**类**；单例请用 `beanFactory` |
| 日志 | `@ticatec/logger-wrapper`（pino）作为 peer dependency | 改为 `@ticatec/logger-api` —— 零依赖契约。pino 变为可选，需要时才装 `logger-wrapper` |
| `StringUtils.genID()` / `uuid()` | UUID v4（`crypto.randomUUID()`） | **UUID v7** —— 时间有序且单调递增，适合直接做主键 |
| `NULL` 列 | 从映射对象中被丢弃 | 保留为 `null`，且 `find()` 与 `listQuery()` 行为一致 |

另有两处行为变更没有改变签名，如果你依赖它们请重新确认：

- **`Propagation.NONE` 不再泄漏非事务上下文。** 从 `NONE` 上下文中调用的 `REQUIRED` 方法现在会真正开启事务，而不是静默复用自动提交的连接。
- **`CommonSearchCriteria` 现在可重入。** 构造函数里设置的 `sql` / `params` / `orderBy` 会被快照并在每次执行前恢复，同一实例执行两次不再重复拼接条件与参数。

调用点的升级通常是这样的：

```typescript
// 3.x
const row = await this.executeInsertQuery(sql, params);
return row.id;

// 4.0.0
const result = await this.executeInsertQuery<User>(sql, params);
return result.record?.id;          // MySQL 自增表也可用 result.insertId
```

## 🛠️ 构建与发布

| 脚本 | 作用 |
| --- | --- |
| `pnpm build` | 清空 `lib/`，编译 CommonJS 到 `lib/cjs/`、ESM 到 `lib/esm/`，并复制标记用的 `package.json` |
| `pnpm typecheck` | 对 `tsconfig.cjs.json` 与 `tsconfig.esm.json` 执行 `tsc --noEmit` |
| `pnpm test` | 运行 Jest 测试套件 |
| `pnpm lint` | 对 `src/**/*.ts` 执行 ESLint（`prebuild` 也会自动调用） |
| `pnpm clean` | 删除 `lib/` |
| `pnpm publish-public` | 以 public 权限发布到 npm |

`prepublishOnly` 会依次执行 `typecheck && test && build`，因此类型检查或测试失败会阻止发布。

双格式构建依赖 `package.json` 里的 `exports` 映射：`.` 条目把 `import` 路由到 `lib/esm/index.js`、`require` 路由到 `lib/cjs/index.js`，类型由 `lib/cjs/index.d.ts` 提供。同时保留了向后兼容的 `./lib/db/Field` 子路径。

## 📝 依赖说明

| 包 | 类型 | 用途 |
| --- | --- | --- |
| `reflect-metadata` | dependency | `@Transaction` 装饰器的元数据存储 |
| `uuid` | dependency（`^11.1.0`） | `StringUtils.genID()` / `StringUtils.uuid()` 的 UUID v7 生成 |
| `@ticatec/logger-api` | peer dependency（`>= 1.0.0`） | 各基类使用的零依赖日志契约 |

`uuid` 锁定在 11.x —— 12.x 与 13.x 已改为纯 ESM，会导致本包的 CommonJS 构建无法加载。

## 🤝 参与贡献

1. Fork 本仓库
2. 创建特性分支（`git checkout -b feature/AmazingFeature`）
3. 提交修改（`git commit -m 'Add some AmazingFeature'`）
4. 推送分支（`git push origin feature/AmazingFeature`）
5. 发起 Pull Request

## 📄 授权协议

本项目采用 MIT 许可证，详情请参阅 [LICENSE](LICENSE)。

## 👨‍💻 作者

**Henry Feng** —— [huili.f@gmail.com](mailto:huili.f@gmail.com)

## 📖 专题指南

| 指南 | 内容 |
| --- | --- |
| [DAO 层](docs/DAO_GUIDE_CN.md) | 编写 DAO、内置查询方法、`InsertResult` / `UpdateResult`、分页、占位符 |
| [Service 与 Repository 层](docs/SERVICE_GUIDE_CN.md) | 四层架构、`@Transaction`、传播行为、`TransactionManager` |
| [依赖注入](docs/DEPENDENCY_INJECTION_GUIDE_CN.md) | `beanFactory`、惰性代理、`Beans` 加载器、循环依赖 |
| [查询条件构建](docs/SEARCH_CRITERIA_CN.md) | 动态查询构建器完整参考 —— 基线契约、条件方法、生成的 SQL |

## 🔗 相关链接

- [GitHub 仓库](https://github.com/ticatec/node-common-library)
- [NPM 包](https://www.npmjs.com/package/@ticatec/node-common-library)
- [变更日志](CHANGELOG.md)
