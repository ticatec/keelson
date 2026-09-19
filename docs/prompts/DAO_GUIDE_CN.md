# DAO 层开发指南

中文 | [English](DAO_GUIDE.md)

本指南说明如何使用 `@ticatec/keelson-core` 编写与维护数据访问对象（DAO）。

## 📚 目录

1. [DAO 核心概念](#dao-核心概念)
2. [使用内置便捷方法编写 DAO](#使用内置便捷方法编写-dao)
3. [内置查询方法速查表](#内置查询方法速查表)
4. [写入结果：InsertResult 与 UpdateResult](#写入结果insertresult-与-updateresult)
5. [上下文连接解析 (`getDBConnection`)](#上下文连接解析-getdbconnection)
6. [分页查询 (`executePaginationQuery` 与 `quickSearch`)](#分页查询-executepaginationquery-与-quicksearch)
7. [SQL 方言与占位符](#sql-方言与占位符)
8. [最佳实践](#最佳实践)

---

## DAO 核心概念

DAO 封装单表或语句级别的数据库访问。所有 DAO 均继承 `CommonDAO`：

```typescript
import { CommonDAO } from '@ticatec/keelson-core';

export interface User {
  id: string;
  name: string;
  email: string;
}

export class UserDAO extends CommonDAO {
  async findById(id: string): Promise<User | null> {
    return await this.findByPK('SELECT * FROM users WHERE id = $1', [id]);
  }
}
```

`CommonDAO` 的构造函数为 `protected`，只能通过子类使用。若子类没有自己的状态需要初始化，无需声明构造函数。

> 下述所有便捷方法都从外层事务上下文解析连接。在 `@Transaction` 服务方法或 `TransactionManager.execute()` 之外调用 DAO 方法会抛出
> `No database connection available. Ensure you are inside a @Transaction or using TransactionManager.execute().`

---

## 使用内置便捷方法编写 DAO

`CommonDAO` 提供了一组执行包装方法，子类无需手工解析连接：

```typescript
import { CommonDAO } from '@ticatec/keelson-core';
import type {
  CommonSearchCriteria, PaginationList, InsertResult, QuickSearchResult
} from '@ticatec/keelson-core';

export class UserDAO extends CommonDAO {

  // 按主键查询单条记录
  async findById(id: string): Promise<User | null> {
    const sql = 'SELECT * FROM users WHERE id = $1';
    return await this.findByPK(sql, [id]);
  }

  // 查询多条记录
  async listByStatus(status: string): Promise<Array<User>> {
    const sql = 'SELECT * FROM users WHERE status = $1 ORDER BY created_at DESC';
    return await this.listQuery(sql, [status]);
  }

  // 插入 —— 返回 InsertResult<User>
  async createUser(user: User): Promise<InsertResult<User>> {
    const sql = 'INSERT INTO users (id, name, email) VALUES ($1, $2, $3) RETURNING *';
    return await this.executeInsertQuery<User>(sql, [user.id || this.genID(), user.name, user.email]);
  }

  // 更新 —— 返回 UpdateResult<User>，对外暴露受影响行数
  async updateUser(user: User): Promise<number> {
    const sql = 'UPDATE users SET name = $1, email = $2 WHERE id = $3';
    const result = await this.executeUpdateQuery<User>(sql, [user.name, user.email, user.id]);
    return result.affectedRows;
  }

  // 删除 —— 直接返回受影响行数
  async deleteById(id: string): Promise<number> {
    const sql = 'DELETE FROM users WHERE id = $1';
    return await this.executeDeleteQuery(sql, [id]);
  }

  // 结合 CommonSearchCriteria 的动态分页查询
  async searchUsers(criteria: CommonSearchCriteria): Promise<PaginationList> {
    return await this.executePaginationQuery(criteria);
  }
}
```

---

## 内置查询方法速查表

下列成员均为 `protected` —— 它们是 DAO 内部的工具箱，不属于对外暴露的接口。

| 方法 | 返回类型 | 说明 |
| --- | --- | --- |
| `findFirst(sql, params?)` | `Promise<any>` | 执行查询并返回首条匹配记录，无匹配则返回 `null` |
| `findByPK(sql, params?)` | `Promise<any>` | `findFirst` 的别名，用于主键查询 |
| `listQuery(sql, params?)` | `Promise<any>` | 执行查询并将所有匹配记录作为数组返回 |
| `executeInsertQuery<T>(sql, params?)` | `Promise<InsertResult<T>>` | 执行 `INSERT` 语句 |
| `executeUpdateQuery<T>(sql, params?)` | `Promise<UpdateResult<T>>` | 执行 `UPDATE` 语句 |
| `executeDeleteQuery(sql, params?)` | `Promise<number>` | 执行 `DELETE` 语句并返回受影响行数 |
| `executePaginationQuery(criteria)` | `Promise<PaginationList>` | 结合 `CommonSearchCriteria` 执行统计与分页查询 |
| `quickSearch<T>(sql, params?, pageNo?, rowCount?, booleanFields?)` | `Promise<QuickSearchResult<T>>` | 方言无关的轻量级快速分页查询 |
| `executeCountSQL(sql, params, key?)` | `Promise<number>` | 执行 `count(*)` 查询并解析计数值（`key` 默认 `'cc'`） |
| `getDBConnection()` | `Promise<DBConnection>` | 获取当前事务上下文绑定的连接；无上下文时抛错 |
| `genID()` | `string` | 32 位无连字符 UUID v7 —— 时间有序，适合直接做主键 |
| `getBooleanValue(val)` | `number` | 将布尔值转换为 `1` / `0` |
| `getBoolean(val)` | `string` | 将布尔值转换为 `'T'` / `'F'` |
| `logger` | `Logger` | 以具体 DAO 类名命名的日志器 |

> **日志说明。** 这些方法只记录语句与参数个数，不记录参数的值——参数里装的是每条
> 查询真正流动的数据。本地排查时可设 `KEELSON_LOG_SQL_PARAMS=true` 把值一并记录，
> 生产环境请勿开启。DAO 的日志使用 `dao` 这个 category。


---

## 写入结果：InsertResult 与 UpdateResult

从 v4 起，插入与更新方法返回类型化结构，而不再是驱动相关的任意值：

```typescript
interface InsertResult<T> {
  affectedRows: number;
  record: T | null;                        // 语句返回行时才有值
  insertId?: number | string | null;       // 驱动支持时返回自增主键
}

interface UpdateResult<T> {
  affectedRows: number;
  record: T | null;
}
```

`record` 与 `insertId` 的实际取值取决于数据库：

| 驱动 | `record` | `insertId` |
| --- | --- | --- |
| PostgreSQL | 语句以 `RETURNING *` 结尾时返回该行 | 不提供 |
| MySQL | 恒为 `null`（MySQL 没有 `RETURNING`） | 返回自增主键 |
| 达梦 | 语句返回行时有值 | 不提供 —— 需使用 `RETURNING INTO` 或 `SELECT @@IDENTITY` |

取值前先校验，并让 DAO 对外返回有意义的结构：

```typescript
async createUser(user: User): Promise<string> {
  const id = user.id || this.genID();
  const result = await this.executeInsertQuery<User>(
    'INSERT INTO users (id, name, email) VALUES ($1, $2, $3) RETURNING *',
    [id, user.name, user.email]
  );
  if (result.affectedRows === 0) {
    throw new Error('创建用户失败');
  }
  return result.record?.id ?? id;
}
```

---

## 上下文连接解析 (`getDBConnection`)

在带 `@Transaction` 的 Service 方法内部，DAO 无需通过参数逐层传递 `DBConnection`。内置便捷方法与 `await this.getDBConnection()` 都会取出外层 `AsyncLocalStorage` 上下文绑定的连接，因此整条调用链上的语句共享同一个事务：

```typescript
export class AccountDAO extends CommonDAO {
  async transfer(fromId: string, toId: string, amount: number): Promise<void> {
    // 两条语句运行在同一个事务连接上
    await this.executeUpdateQuery('UPDATE accounts SET balance = balance - $1 WHERE id = $2', [amount, fromId]);
    await this.executeUpdateQuery('UPDATE accounts SET balance = balance + $1 WHERE id = $2', [amount, toId]);
  }
}
```

---

## 分页查询 (`executePaginationQuery` 与 `quickSearch`)

### 1. 使用 `CommonSearchCriteria` 的完整动态查询

涉及动态过滤、联表与排序时使用 `executePaginationQuery(criteria)`。请在 criteria 的**构造函数**里设置基础 SQL、基础参数与 `orderBy`，`buildDynamicQuery()` 保持纯追加 —— 构造函数中的值会被快照为基线并在每次执行前恢复，因此同一实例可以反复执行：

```typescript
const BASE_SQL = `
    SELECT u.*, d.name AS "dept.name"
      FROM users u
      LEFT JOIN departments d ON d.id = u.dept_id
     WHERE u.tenant_code = $1`;

export class UserSearchCriteria extends CommonSearchCriteria {
  constructor(tenantCode: string, criteria?: any) {
    super(criteria);
    this.sql = BASE_SQL;
    this.params = [tenantCode];
    this.orderBy = 'ORDER BY u.created_at DESC';
  }

  protected buildDynamicQuery(): void {
    this.addWildcardCriteria(this.criteria?.keyword, 'u.name');
    this.addEqualsCriteria(this.criteria?.status, 'u.status');
  }
}

// 在 DAO 中：
async search(criteria: UserSearchCriteria): Promise<PaginationList> {
  return await this.executePaginationQuery(criteria);
}
```

完整的构建器参考见 [SEARCH_CRITERIA_CN.md](SEARCH_CRITERIA_CN.md)。

### 2. 使用 `quickSearch` 的轻量分页

`quickSearch<T>()` 会把你的 SQL 包进统计查询、套用驱动的 limit/offset 子句，并转换指定的布尔字段：

```typescript
async getRecentUsers(pageNo: number = 1): Promise<QuickSearchResult<User>> {
  const sql = 'SELECT * FROM users WHERE is_active = $1 ORDER BY created_at DESC';
  return await this.quickSearch<User>(sql, [true], pageNo, 20, ['isActive']);
}
```

它返回 `{ list, hasMore }` —— 不含总数。当调用方只需要判断"还有没有下一页"时，这比 `executePaginationQuery` 更省开销。

---

## SQL 方言与占位符

DAO 手写的 SQL 是方言相关的 —— PostgreSQL 用 `$1, $2`，MySQL 与达梦用 `?`。只有 `CommonSearchCriteria` 会通过连接的 `getPlaceholder(index)` 替你生成占位符。

如果某个 DAO 需要跨方言复用，请从连接获取占位符：

```typescript
async findByIds(ids: string[]): Promise<Array<User>> {
  const conn = await this.getDBConnection();
  const holes = ids.map((_, i) => conn.getPlaceholder(i + 1)).join(', ');
  return await this.listQuery(`SELECT * FROM users WHERE id IN (${holes})`, ids);
}
```

---

## 最佳实践

- DAO 保持无状态，这样单个实例可以安全地通过 `beanFactory` 共享。
- 优先使用内置便捷方法而非手工解析连接 —— 它们的日志输出一致，也省去样板代码。
- 不要把业务逻辑放进 DAO。校验、领域编排与事务边界属于 Service 层。
- 主键统一用 `genID()`：UUID v7 时间有序，插入集中在索引的同一区域，不像随机 v4 那样四处散落。
- 绝不把用户输入拼进 SQL，一律作为参数传入 —— 便捷方法会把参数交给驱动的预处理语句路径。
- DAO 对外返回有意义的结构（实体、ID、计数），不要把 `InsertResult` / `UpdateResult` 一路透传到 Service 层。
