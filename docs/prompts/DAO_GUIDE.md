# DAO Layer Development Guide

[中文文档](DAO_GUIDE_CN.md) | English

This guide explains how to create and maintain Data Access Objects (DAOs) with `@ticatec/keelson-core`.

## 📚 Table of Contents

1. [DAO Core Concepts](#dao-core-concepts)
2. [Creating Your DAO with Built-in Helpers](#creating-your-dao-with-built-in-helpers)
3. [Built-in Query Methods Reference](#built-in-query-methods-reference)
4. [Write Results: InsertResult and UpdateResult](#write-results-insertresult-and-updateresult)
5. [Context Connection Resolution (`getDBConnection`)](#context-connection-resolution-getdbconnection)
6. [Paginated Queries (`executePaginationQuery` & `quickSearch`)](#paginated-queries-executepaginationquery--quicksearch)
7. [SQL Dialects and Placeholders](#sql-dialects-and-placeholders)
8. [Best Practices](#best-practices)

---

## DAO Core Concepts

A DAO encapsulates single-table or statement-level database access. All DAOs extend `CommonDAO`:

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

`CommonDAO` has a `protected` constructor, so it can only be used through a subclass. The subclass needs no constructor of its own unless it has state to initialise.

> Every helper below resolves its connection from the surrounding transaction context. A DAO method called outside a `@Transaction` service method or `TransactionManager.execute()` throws
> `No database connection available. Ensure you are inside a @Transaction or using TransactionManager.execute().`

---

## Creating Your DAO with Built-in Helpers

`CommonDAO` provides execution wrappers so subclasses never resolve connections by hand:

```typescript
import { CommonDAO } from '@ticatec/keelson-core';
import type {
  CommonSearchCriteria, PaginationList, InsertResult, QuickSearchResult
} from '@ticatec/keelson-core';

export class UserDAO extends CommonDAO {

  // Single record by primary key
  async findById(id: string): Promise<User | null> {
    const sql = 'SELECT * FROM users WHERE id = $1';
    return await this.findByPK(sql, [id]);
  }

  // Multiple records
  async listByStatus(status: string): Promise<Array<User>> {
    const sql = 'SELECT * FROM users WHERE status = $1 ORDER BY created_at DESC';
    return await this.listQuery(sql, [status]);
  }

  // Insert — returns InsertResult<User>
  async createUser(user: User): Promise<InsertResult<User>> {
    const sql = 'INSERT INTO users (id, name, email) VALUES ($1, $2, $3) RETURNING *';
    return await this.executeInsertQuery<User>(sql, [user.id || this.genID(), user.name, user.email]);
  }

  // Update — returns UpdateResult<User>; expose the affected count to callers
  async updateUser(user: User): Promise<number> {
    const sql = 'UPDATE users SET name = $1, email = $2 WHERE id = $3';
    const result = await this.executeUpdateQuery<User>(sql, [user.name, user.email, user.id]);
    return result.affectedRows;
  }

  // Delete — returns the affected count directly
  async deleteById(id: string): Promise<number> {
    const sql = 'DELETE FROM users WHERE id = $1';
    return await this.executeDeleteQuery(sql, [id]);
  }

  // Dynamic pagination through CommonSearchCriteria
  async searchUsers(criteria: CommonSearchCriteria): Promise<PaginationList> {
    return await this.executePaginationQuery(criteria);
  }
}
```

---

## Built-in Query Methods Reference

All members below are `protected` — they are the DAO's toolkit, not part of its public surface.

| Method | Return Type | Description |
| --- | --- | --- |
| `findFirst(sql, params?)` | `Promise<any>` | Executes a query and returns the first matching row, or `null` |
| `findByPK(sql, params?)` | `Promise<any>` | Alias of `findFirst`, for primary-key lookups |
| `listQuery(sql, params?)` | `Promise<any>` | Executes a query and returns all matching rows as an array |
| `executeInsertQuery<T>(sql, params?)` | `Promise<InsertResult<T>>` | Executes an `INSERT` |
| `executeUpdateQuery<T>(sql, params?)` | `Promise<UpdateResult<T>>` | Executes an `UPDATE` |
| `executeDeleteQuery(sql, params?)` | `Promise<number>` | Executes a `DELETE` and returns the affected row count |
| `executePaginationQuery(criteria)` | `Promise<PaginationList>` | Runs a `CommonSearchCriteria` count + page query |
| `quickSearch<T>(sql, params?, pageNo?, rowCount?, booleanFields?)` | `Promise<QuickSearchResult<T>>` | Dialect-independent lightweight paginated query |
| `executeCountSQL(sql, params, key?)` | `Promise<number>` | Executes a `count(*)` query and parses the value (`key` defaults to `'cc'`) |
| `getDBConnection()` | `Promise<DBConnection>` | Returns the connection bound to the current transaction context; throws if there is none |
| `genID()` | `string` | 32-character UUID v7 without dashes — time-ordered, suitable as a primary key |
| `getBooleanValue(val)` | `number` | Converts a boolean to `1` / `0` |
| `getBoolean(val)` | `string` | Converts a boolean to `'T'` / `'F'` |
| `logger` | `Logger` | Logger scoped to the concrete DAO class name |

> **Logging.** These helpers log the statement and the parameter count, never the
> parameter values - the parameters carry the real data of every query. Set
> `KEELSON_LOG_SQL_PARAMS=true` to include the values while debugging locally, and
> never in production. DAO records use the `dao` logger category.


---

## Write Results: InsertResult and UpdateResult

Since v4, the insert and update helpers return a typed structure instead of a driver-specific value:

```typescript
interface InsertResult<T> {
  affectedRows: number;
  record: T | null;                        // populated when the statement returns a row
  insertId?: number | string | null;       // generated auto-increment key, where the driver supplies one
}

interface UpdateResult<T> {
  affectedRows: number;
  record: T | null;
}
```

What actually lands in `record` and `insertId` depends on the database:

| Driver | `record` | `insertId` |
| --- | --- | --- |
| PostgreSQL | the row, when the statement ends with `RETURNING *` | not supplied |
| MySQL | always `null` (MySQL has no `RETURNING`) | the auto-increment key |
| Dameng | the row, when the statement returns one | not supplied — use `RETURNING INTO` or `SELECT @@IDENTITY` |

Check before dereferencing, and let the DAO expose a meaningful shape to its caller:

```typescript
async createUser(user: User): Promise<string> {
  const id = user.id || this.genID();
  const result = await this.executeInsertQuery<User>(
    'INSERT INTO users (id, name, email) VALUES ($1, $2, $3) RETURNING *',
    [id, user.name, user.email]
  );
  if (result.affectedRows === 0) {
    throw new Error('Failed to create user');
  }
  return result.record?.id ?? id;
}
```

---

## Context Connection Resolution (`getDBConnection`)

Inside a `@Transaction` service method, DAOs do not receive a `DBConnection` argument. The built-in helpers and `await this.getDBConnection()` both pull the connection bound to the surrounding `AsyncLocalStorage` context, so every statement in the call tree shares the same transaction:

```typescript
export class AccountDAO extends CommonDAO {
  async transfer(fromId: string, toId: string, amount: number): Promise<void> {
    // Both statements run on the same ambient transaction connection
    await this.executeUpdateQuery('UPDATE accounts SET balance = balance - $1 WHERE id = $2', [amount, fromId]);
    await this.executeUpdateQuery('UPDATE accounts SET balance = balance + $1 WHERE id = $2', [amount, toId]);
  }
}
```

---

## Paginated Queries (`executePaginationQuery` & `quickSearch`)

### 1. Full dynamic query with `CommonSearchCriteria`

Use `executePaginationQuery(criteria)` for dynamic filters, joins and sorting. Set the base SQL, base parameters and `orderBy` in the criteria's **constructor**; keep `buildDynamicQuery()` purely additive — the constructor values are snapshotted as a baseline and restored before every run, so one instance can be executed repeatedly:

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

// In the DAO:
async search(criteria: UserSearchCriteria): Promise<PaginationList> {
  return await this.executePaginationQuery(criteria);
}
```

See [SEARCH_CRITERIA.md](SEARCH_CRITERIA.md) for the full builder reference.

### 2. Lightweight pagination with `quickSearch`

`quickSearch<T>()` wraps your SQL in a count query, applies the driver's limit/offset clause, and coerces the listed boolean fields:

```typescript
async getRecentUsers(pageNo: number = 1): Promise<QuickSearchResult<User>> {
  const sql = 'SELECT * FROM users WHERE is_active = $1 ORDER BY created_at DESC';
  return await this.quickSearch<User>(sql, [true], pageNo, 20, ['isActive']);
}
```

It returns `{ list, hasMore }` — no total count, which is what makes it cheaper than `executePaginationQuery` when the caller only needs "is there another page".

---

## SQL Dialects and Placeholders

The SQL a DAO writes by hand is dialect-specific — `$1, $2` on PostgreSQL, `?` on MySQL and Dameng. Only `CommonSearchCriteria` generates placeholders for you, through the connection's `getPlaceholder(index)`.

If a DAO must work across dialects, get the placeholder from the connection:

```typescript
async findByIds(ids: string[]): Promise<Array<User>> {
  const conn = await this.getDBConnection();
  const holes = ids.map((_, i) => conn.getPlaceholder(i + 1)).join(', ');
  return await this.listQuery(`SELECT * FROM users WHERE id IN (${holes})`, ids);
}
```

---

## Best Practices

- Keep DAOs stateless so a single instance can be shared safely through `beanFactory`.
- Prefer the built-in helpers over resolving the connection by hand — they log consistently and avoid boilerplate.
- Keep business logic out of DAOs. Validation, domain orchestration and transaction boundaries belong to the Service layer.
- Use `genID()` for primary keys: UUID v7 is time-ordered, so inserts stay local in the index instead of scattering the way random v4 values do.
- Never interpolate user input into SQL. Pass it as a parameter — the helpers forward parameters to the driver's prepared-statement path.
- Return a meaningful shape from the DAO (an entity, an id, a count) rather than leaking `InsertResult` / `UpdateResult` all the way up to the Service layer.
