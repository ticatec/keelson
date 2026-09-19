# @ticatec/node-common-library

[中文文档](README_CN.md) | English

A comprehensive Node.js database access framework providing robust abstractions for database connection management, SQL execution, declarative transaction handling, pagination, and dynamic query building.

[![Version](https://img.shields.io/npm/v/@ticatec/node-common-library)](https://www.npmjs.com/package/@ticatec/node-common-library)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **v4.0.0 contains breaking changes.** If you are upgrading from 3.x, read [Migrating from 3.x](#-migrating-from-3x) first.

## 🌟 Features

- **Dual ESM / CommonJS**: ships native ES modules and CommonJS from one package — Node picks the right format automatically based on your project
- **Multi-database Support**: adapt to any database by implementing the `DBConnection` abstract class and the `DBFactory` interface (ready-made drivers: `@ticatec/pg-common-library`, `@ticatec/mysql-common-library`, `@ticatec/dm-common-library`)
- **Dialect-neutral SQL building**: parameter placeholders are produced by the driver through `getPlaceholder(index)`, so `CommonSearchCriteria` emits `$1` on PostgreSQL and `?` on MySQL / Dameng from the same builder code
- **Declarative Transactions**: annotate service methods with `@Transaction(propagation)` — commit / rollback is handled by `TransactionManager` using `AsyncLocalStorage`, so the active connection is propagated without being passed around
- **Paginated Queries**: built-in `PaginationList` result and the re-entrant `CommonSearchCriteria` dynamic query builder
- **SQL File Execution**: `executeSQLFile()` strips comments and runs each statement, aborting on the first failure by default
- **Field Transformation**: automatic underscore → camelCase, nested object hydration via `"profile.isActive"` aliases, explicit `null` preservation, and `1`/`0`/`T`/`F` → boolean coercion
- **Lazy Bean Factory**: `beanFactory.register(name, Class)` + `beanFactory.createBean<T>(name)` returns a singleton proxy that defers construction until first use, breaking circular-dependency cycles at module load time
- **Optimistic Locking**: `OptimisticLockException` for concurrent-update conflict reporting

## 📦 Installation

```bash
pnpm add @ticatec/node-common-library @ticatec/logger-api reflect-metadata
# plus the driver for your database, e.g.
pnpm add @ticatec/pg-common-library pg
```

`@ticatec/logger-api` is a **peer dependency** — install it explicitly. It is a zero-dependency logging contract; it does **not** pull in a logging library. Add one only if you want structured output (see [Logging](#logging)).

The package is published as dual ESM/CJS. Consumers do not need any extra configuration — `require()` works in CommonJS projects and `import` works in ESM / TypeScript projects.

```typescript
// ESM / TypeScript
import { DBManager, beanFactory, CommonService, CommonDAO } from '@ticatec/node-common-library';

// CommonJS
const { DBManager, beanFactory, CommonService, CommonDAO } = require('@ticatec/node-common-library');
```

### Requirements

| | |
| --- | --- |
| Node.js | `>= 18` |
| Peer dependency | `@ticatec/logger-api >= 1.0.0` |
| Runtime dependency | `reflect-metadata` (required by the `@Transaction` decorator) |

## 🚀 Quick Start

### 1. Logging (optional)

Nothing to do — the framework logs against the `@ticatec/logger-api` contract, and without a provider installed records go to the console, filtered by `LOG_LEVEL` (default `info`).

To route them into a real logging library, install a provider once at startup. For pino, use the ready-made adapter:

```typescript
import { initialize } from '@ticatec/logger-pino';

initialize({
    appenders: [
        { name: 'console', type: 'console', level: process.env.LOG_LEVEL || 'info' }
    ],
    loggers: {
        root: { level: process.env.LOG_LEVEL || 'info', appenders: ['console'] }
    }
});
```

For anything else, adapt it in a few lines with `setLoggerProvider()` — see the [logger-api README](https://github.com/ticatec/keelson/tree/main/packages/logger-api).

> Ordering does not matter. `CommonDAO`, `CommonService`, `CommonRepository`, `CommonSearchCriteria` and `Beans` all acquire their logger in the constructor, but a captured logger resolves the active provider on every write — so installing the provider after those objects exist works exactly as well.

### 2. Initialize the database manager

Use one of the driver packages, or implement `DBFactory` yourself (see [Writing a custom driver](#-writing-a-custom-driver)). Call `DBManager.init()` exactly once at application startup.

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

On shutdown, release the pool through the factory:

```typescript
await dbFactory.close();
```

### 3. Register DAOs, Repositories and Services

The default export `beanFactory` is a singleton registry. `register(name, Class)` does **not** instantiate the class — `createBean(name)` returns a lazy proxy whose underlying instance is built on first access and reused thereafter.

```typescript
import { beanFactory } from '@ticatec/node-common-library';
import { UserDAO } from './dao/UserDAO';
import { UserRepository } from './repository/UserRepository';
import { UserService } from './service/UserService';

beanFactory.register('UserDAO', UserDAO);
beanFactory.register('UserRepository', UserRepository);
beanFactory.register('UserService', UserService);
```

For dynamic / code-split registration use `Beans`, which registers async loaders and resolves them into `beanFactory` in one pass:

```typescript
import { Beans } from '@ticatec/node-common-library';

const beans = Beans.getInstance();
beans.register('UserDAO', () => import('./dao/UserDAO.js'));
beans.register('UserService', () => import('./service/UserService.js'));

await beans.load();   // each module's default export is registered into beanFactory
```

### 4. Create a DAO

`CommonDAO` exposes `getDBConnection()`, which returns the connection bound to the surrounding `@Transaction` context. Writing methods return the typed `InsertResult<T>` / `UpdateResult<T>` structures.

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

> The SQL you write is dialect-specific — `$1, $2` on PostgreSQL, `?` on MySQL and Dameng. Only `CommonSearchCriteria` generates placeholders for you.

### 5. Create a Repository

Repositories extend `CommonRepository` and coordinate DAOs via `getDAOInstance<T>(name)`:

```typescript
import { CommonRepository } from '@ticatec/node-common-library';
import type { UserDAO } from './dao/UserDAO';

export class UserRepository extends CommonRepository {
    async createUser(user: User): Promise<string> {
        const userDAO = this.getDAOInstance<UserDAO>('UserDAO');
        const result = await userDAO.createUser(user);
        if (result.affectedRows === 0 || result.record == null) {
            throw new Error('Failed to create user');
        }
        return result.record.id;
    }
}
```

### 6. Create a Service with `@Transaction`

Service methods are annotated with `@Transaction()`. Services extend `CommonService` and access repositories via `getRepositoryInstance<T>(name)`:

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

> `@Transaction` only records metadata — the actual wrapping happens in the `CommonService` constructor. Putting the decorator on a class that does **not** extend `CommonService` has no effect.

### 7. Dynamic search with `CommonSearchCriteria`

Set the base SQL, base parameters and `orderBy` in the **constructor**; append dynamic conditions in `buildDynamicQuery()`. The constructor values are snapshotted as a baseline on first execution and restored before every subsequent run, so a single instance can be executed repeatedly without duplicating conditions.

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
        this.sql = BASE_SQL;            // baseline
        this.params = [tenantCode];     // baseline
        this.orderBy = 'ORDER BY u.created_at DESC';
        this.setBooleanFields('profile.isActive');
    }

    protected buildDynamicQuery(): void {
        this.addWildcardCriteria(this.criteria?.name, 'u.name');                       // '*' → LIKE, otherwise =
        this.addEqualsCriteria(this.criteria?.email, 'u.email');                       // exact match
        this.addRangeCriteria(this.criteria?.dateFrom, this.criteria?.dateTo, 'u.created_at');
    }
}

// inside a @Transaction or TransactionManager.execute context:
const result: PaginationList = await new UserSearchCriteria('TENANT_A', {
    name: 'John*',
    page: 1,
    pageSize: 20
}).paginationQuery(conn);

console.log(`Total: ${result.count}, Pages: ${result.pages}`);
```

Placeholders inside `addXxxCriteria()` are generated through the connection's `getPlaceholder(index)`, so the same class works unchanged against PostgreSQL, MySQL and Dameng. Placeholders you write yourself inside `BASE_SQL` are your responsibility; use `this.getPlaceholder(this.params.length)` when appending raw fragments:

```typescript
protected buildDynamicQuery(): void {
    if (this.criteria?.categoryPath) {
        this.params.push(`${this.criteria.categoryPath}%`);
        this.sql += ` AND pc.query_path LIKE ${this.getPlaceholder(this.params.length)}`;
    }
}
```

## 🏗️ Core Components

### CommonDAO

Abstract base class for Data Access Objects. Members available to subclasses (all `protected`):

| Member | Purpose |
| --- | --- |
| `getDBConnection()` | Returns the connection bound to the surrounding transaction context; throws if there is none |
| `findFirst(sql, params?)` | Executes a query and returns the first row or `null` |
| `findByPK(sql, params?)` | Alias of `findFirst` |
| `listQuery(sql, params?)` | Executes a query and returns all matching rows |
| `executeInsertQuery<T>(sql, params?)` | Executes an `INSERT`, returns `InsertResult<T>` |
| `executeUpdateQuery<T>(sql, params?)` | Executes an `UPDATE`, returns `UpdateResult<T>` |
| `executeDeleteQuery(sql, params?)` | Executes a `DELETE`, returns the affected row count |
| `executePaginationQuery(criteria)` | Runs a `CommonSearchCriteria` and returns `PaginationList` |
| `quickSearch<T>(sql, params?, pageNo?, rowCount?, booleanFields?)` | Dialect-independent paginated query returning `QuickSearchResult<T>` |
| `executeCountSQL(sql, params, key?)` | Runs a `count(*)` query and returns a number (`key` defaults to `'cc'`) |
| `genID()` | 32-character UUID v7 without dashes — time-ordered, suitable as a primary key |
| `getBooleanValue(b)` / `getBoolean(b)` | `1`/`0` and `'T'`/`'F'` coercion helpers |
| `logger` | Logger scoped to the subclass name |

### CommonRepository

Abstract base class for the repository tier — coordinates DAOs, assembles POs/DTOs.

| Member | Purpose |
| --- | --- |
| `getDAOInstance<T>(name)` | Returns the registered DAO proxy; throws a descriptive error when the bean is not registered |
| `genID()` | 32-character UUID v7 without dashes |
| `genUUID()` | Canonical 36-character UUID v7 with dashes |
| `logger` | Logger scoped to the subclass name |

### CommonService

Abstract service base class. The constructor walks the prototype chain and wraps every method annotated with `@Transaction` so the body runs inside `TransactionManager.execute(propagation, …)`. Wrapping is idempotent — an inherited method that a parent class already wrapped is not wrapped twice.

| Member | Purpose |
| --- | --- |
| `@Transaction(propagation?)` | Method decorator that opens a transactional context |
| `getDBConnection()` | Returns the connection of the current transaction |
| `getRepositoryInstance<T>(name)` | Returns the registered repository proxy; throws when it is not registered |
| `logger` | Logger scoped to the subclass name |

### Transaction propagation

Defined in `Propagation`:

- `REQUIRED` (default) — join the surrounding **transaction**, or start a new one if there is none. A context opened with `NONE` is not transactional, so a nested `REQUIRED` call starts a real transaction of its own rather than silently joining a non-transactional connection.
- `REQUIRES_NEW` — always open an independent connection and transaction, suspending the surrounding context
- `NONE` — run on a fresh, non-transactional connection (statements auto-commit)

For ad-hoc use without the decorator, call `TransactionManager.execute(propagation, fn)` directly:

```typescript
import { TransactionManager, Propagation } from '@ticatec/node-common-library';

await TransactionManager.execute(Propagation.REQUIRED, async (conn) => {
    // conn is committed on resolve, rolled back on throw, and always closed
});

// Anywhere inside that callback:
const conn = TransactionManager.getCurrentConnection();   // DBConnection | undefined
```

### DBConnection

Abstract class defining the database primitives a driver must implement, plus the shared query helpers the framework builds on top of them.

**Provided by the base class** (drivers inherit these):

- **Reads**: `find<T>()` (single row), `listQuery<T>()` (many rows), `executeCountSQL()`, `quickSearch<T>()`
- **Criteria helpers**: `executePaginationSQL(criteria)`, `queryByCriteria(criteria)`
- **SQL files**: `executeSQLFile(path, options?)`
- **Utilities**: `convertBooleanFields(data, fields)`, `sanitizeParams(params)`, `getRowSetLimitClause(rowCount, offset)`
- **Result shaping**: automatic underscore → camelCase, nested paths via `"parent.child.field"` aliases, explicit `null` preservation, boolean coercion

**Must be implemented by a driver** — see [Writing a custom driver](#-writing-a-custom-driver).

#### `executeSQLFile(path, options?)`

Reads a `.sql` file, strips `/* … */` and `-- …` comments, splits on statement-terminating semicolons, and executes each statement in order.

```typescript
await conn.executeSQLFile('./migrations/001_init.sql');
// default: { stopOnError: true, throwOnError: true } → aborts and throws on the first failure

const hasError = await conn.executeSQLFile('./migrations/001_init.sql', {
    stopOnError: false            // keep going, return true if anything failed
});
```

| Option | Default | Effect |
| --- | --- | --- |
| `stopOnError` | `true` | Stop at the first failing statement |
| `throwOnError` | `true` | Throw an `Error` naming the file and the failing statement (only applies when `stopOnError` is `true`) |

> This is a lightweight splitter for standard DDL/DML migrations. It does not parse PL/SQL blocks or semicolons inside string literals.

#### Boolean field auto-conversion

```typescript
// Simple fields
const user = await conn.find(
    'SELECT * FROM users WHERE id = $1',
    [id],
    null,
    ['isActive', 'isVerified']          // converted in place
);

// Nested fields via SQL aliasing
const userWithProfile = await conn.find(
    `SELECT u.*, p.is_active AS "profile.isActive"
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id
      WHERE u.id = $1`,
    [id],
    null,
    ['profile.isActive']                // walks the dotted path
);
```

### CommonSearchCriteria / SearchCriteria

Dynamic query builder. `CommonSearchCriteria` is the base class; `SearchCriteria` is a thin backward-compatible alias — prefer `CommonSearchCriteria` in new code.

The constructor is `protected constructor(criteria?: any)`, so the class can only be used through a subclass — declare your own `public` constructor and call `super(criteria)` from it.

It reads `page` and `pageSize` from the incoming criteria object and clamps them: `page` is forced to `>= 1`, `pageSize` to the range `1 … 1000` (default `25`).

| Member | Purpose |
| --- | --- |
| `buildDynamicQuery()` | **Abstract.** Override to append `and …` clauses and push params |
| `addEqualsCriteria(value, field)` | Appends `field = <placeholder>` when the value is non-empty |
| `addWildcardCriteria(text, field)` | `*` wildcards → `LIKE`, otherwise `=` |
| `addRangeCriteria(from, to, field)` | Appends `field >= …` and/or `field < …`; a `Date` upper bound is advanced to the start of the next day |
| `getPlaceholder(index)` | Dialect placeholder for the active connection (`$N` / `?`) |
| `escapePercentage(s)` / `replaceWildStar(s)` | Escape `\`, `%` and `_`; `replaceWildStar` additionally maps `*` → `%` |
| `toWildSQL(s)` / `wrapLikeMatch(s)` / `includeStar(s)` / `isNotEmpty(v)` | String helpers |
| `getNextDayStart(d)` | Exclusive upper bound for date ranges — next local midnight, DST-safe |
| `setBooleanFields(...fields)` | Sets which result fields to coerce to boolean |
| `getPostProcessor()` | Override to return a per-row post-construction callback |
| `paginationQuery(conn)` | Returns `PaginationList` — `{ count, hasMore, list, pages }` |
| `query(conn)` | Non-paginated run returning every matching row |

**Re-entrancy.** `paginationQuery()` and `query()` both snapshot `sql`, `params` and `orderBy` on first use and restore them before calling `buildDynamicQuery()` on every subsequent call. Set your base SQL and base parameters in the constructor; keep `buildDynamicQuery()` purely additive.

### BeanFactory

`beanFactory` is the default-export singleton; the `BeanFactory` class is also exported if you need a separate registry.

```typescript
import { beanFactory, BeanFactory } from '@ticatec/node-common-library';

beanFactory.register('UserDAO', UserDAO);

// Returns a Proxy, or undefined when nothing is registered under that name.
// The real instance is constructed on first property access and reused thereafter.
const userDAO = beanFactory.createBean<UserDAO>('UserDAO');

// An isolated registry, e.g. for tests
const testRegistry = new BeanFactory();
```

The proxy breaks circular dependencies: registering A and B that reference each other no longer triggers a `ReferenceError` at module load — neither is built until something actually calls a method on its proxy. A genuine construction cycle is detected and reported as `Circular dependency detected: A -> B -> A`.

### DBManager

```typescript
DBManager.init(factory);        // once at startup; subsequent calls are ignored
DBManager.getInstance();        // throws if init() has not been called
await DBManager.getInstance().connect();   // → DBConnection
DBManager.resetInstance();      // test hook
```

## 🔌 Writing a custom driver

A driver supplies two things: a `DBConnection` subclass and a `DBFactory`.

```typescript
import { DBConnection, DBFactory, Field, FieldType } from '@ticatec/node-common-library';
import type { InsertResult, UpdateResult } from '@ticatec/node-common-library';

class MyDBConnection extends DBConnection {

    // --- dialect ---
    getPlaceholder(index: number): string { return `$${index}`; }   // '?' for MySQL / Dameng

    // --- transactions ---
    async beginTransaction(): Promise<void> { /* … */ }
    async commit(): Promise<void> { /* … */ }
    async rollback(): Promise<void> { /* … */ }
    async close(): Promise<void> { /* release back to the pool */ }

    // --- writes ---
    async executeUpdate(sql: string, params: any[]): Promise<number> { /* … */ }
    async insertRecord<T = any>(sql: string, params: any[]): Promise<InsertResult<T>> { /* … */ }
    async updateRecord<T = any>(sql: string, params: any[]): Promise<UpdateResult<T>> { /* … */ }
    async deleteRecord(sql: string, params: any[]): Promise<number> { /* … */ }

    // --- raw / reads (protected) ---
    protected async executeSQL(sql: string): Promise<any> { /* used by executeSQLFile */ }
    protected async fetchData(sql: string, params?: any[]): Promise<any> { /* … */ }

    // --- result introspection ---
    getFields(result: any): Array<Field> { /* … */ }
    protected getRowSet(result: any): Array<any> { /* the row array */ }
    protected getAffectRows(result: any): number { /* … */ }
    protected getFirstRow(result: any): any { /* mapped first row, or null */ }
}

class MyDBFactory implements DBFactory {
    async createDBConnection(): Promise<DBConnection> { /* … */ }
    async close(): Promise<void> { /* pool.end() */ }
}
```

**Required members**, at a glance:

| Member | Visibility | Notes |
| --- | --- | --- |
| `getPlaceholder(index)` | public | **Abstract since 4.0.0.** `$N` for PostgreSQL, `?` for MySQL / Dameng |
| `beginTransaction()` / `commit()` / `rollback()` / `close()` | public | `close()` releases the connection back to the pool |
| `executeUpdate()` / `insertRecord<T>()` / `updateRecord<T>()` / `deleteRecord()` | public | The insert/update variants return `InsertResult<T>` / `UpdateResult<T>` |
| `executeSQL(sql)` | protected | Raw execution path used by `executeSQLFile()` — must support DDL |
| `fetchData(sql, params?)` | protected | Returns the driver's raw result; `getRowSet` / `getFields` read it |
| `getFields(result)` | public | Field metadata |
| `getRowSet(result)` | protected | The row array — `resultToList()` calls this, so it must return real rows |
| `getAffectRows(result)` | protected | Affected row count |
| `getFirstRow(result)` | protected | Mapped first row, or `null` |
| `DBFactory.close()` | public | **Required since 4.0.0** — shuts the pool down |

**Optional overrides:** `getRowSetLimitClause(rowCount, offset)` (defaults to ` limit N offset M`), `toCamel(name)`, `buildFieldsMap(fields)`, `setNestObj(obj, field, value)`, `resultToList(result)`, `getBoolean(value)`.

**Helpers available to your driver:** `this.logger`, `this.safeLogMeta(sql, params)` (logs the statement and the parameter *count*, never the values), `this.sanitizeParams(params)` (maps `undefined` → `null`), `this.toCamel(name)`.

## 🔧 Advanced Features

### Batch processing

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

### Bit-packed flags via `BitsBoolean`

```typescript
import { BitsBoolean } from '@ticatec/node-common-library';

class UserPermissions extends BitsBoolean {
    constructor(value = 0) { super(value); }
    setCanRead(v: boolean)  { this.setBitValue(0, v); }
    getCanRead(): boolean   { return this.getBitValue(0); }
    setCanWrite(v: boolean) { this.setBitValue(1, v); }
    getCanWrite(): boolean  { return this.getBitValue(1); }
}

BitsBoolean.fromBooleanArray([true, false, true]);   // → 5 (max 31 elements)
new UserPermissions(5).toBooleanArray(3);            // → [true, false, true]
```

Bit positions are limited to `0 … 30`; anything outside that range throws. All operations are unsigned 32-bit.

### String utilities

```typescript
import { StringUtils } from '@ticatec/node-common-library';

StringUtils.genID();               // 32-char UUID v7, no dashes
StringUtils.uuid();                // canonical UUID v7 with dashes
StringUtils.isEmpty('   ');        // true
StringUtils.isString('abc');       // true
StringUtils.isNumber('123');       // true
StringUtils.parseNumber('abc', 0); // 0 (fallback)
StringUtils.leftPad('45', '0', 4); // '0045'
```

`genID()` and `uuid()` return **UUID v7**. A v7 value carries a 48-bit millisecond timestamp in its leading bits and is monotonic within the same millisecond, so identifiers generated in a tight loop stay strictly increasing — and they keep that ordering after `genID()` strips the hyphens. That makes them well suited as database primary keys: inserts stay local in the B-tree index instead of scattering the way random v4 values do.

```typescript
StringUtils.genID();   // 01a0b1ab1d6674899b3f9a4d28db4410
StringUtils.genID();   // 01a0b1ab1d6674899b3f9e1c0bb70631   ← sorts after the previous one
```

> A v7 identifier discloses its creation time. Where that matters, or where the value must be unguessable (tokens, password-reset links), generate a random value yourself with `node:crypto` instead.

### Logging

The library logs against [`@ticatec/logger-api`](https://www.npmjs.com/package/@ticatec/logger-api), a zero-dependency contract. Which library actually receives the records is the application's choice — install a provider with `setLoggerProvider()`, or use the pino adapter in [`@ticatec/logger-pino`](https://www.npmjs.com/package/@ticatec/logger-pino). With no provider installed, output goes to the console at `LOG_LEVEL` (default `info`).

```typescript
import { getLogger } from '@ticatec/node-common-library';
import type { Logger } from '@ticatec/node-common-library';

const log: Logger = getLogger('MyService');
log.info({ userId }, 'user logged in');
```

Every framework base class exposes a `logger` already scoped to the concrete subclass name, so you rarely need `getLogger()` directly. SQL is logged by the drivers through `safeLogMeta()`, which records the statement text and the parameter count but **never** the parameter values.

### Logging and sensitive data

Every layer logs through the `@ticatec/logger-api` contract. Two things are
deliberately kept out of the records:

**SQL bind parameters.** The parameters carry the real data flowing through every
query - email addresses, password hashes, national IDs, card numbers. A DAO query
logs the statement and the parameter *count*, never the values:

```
DEBUG [dao/OrderDAO] Executing find query {"sql":"select * from users where email=$1 and pwd=$2","paramCount":2}
```

Set `KEELSON_LOG_SQL_PARAMS=true` to include the values while debugging locally.
It is read on every call, so it can be toggled at runtime, and only the exact
string `true` enables it - `1` or `yes` will not. Never enable it in production:
turning on debug logging would otherwise copy your entire database traffic into
the log store, which is usually the most widely readable, longest-retained and
most easily exported system you own.

**The connection factory.** `DBManager.init(factory)` records the factory's class
name only. A `DBFactory` holds the full connection configuration, database
password included.

Use `sqlContext(sql, params)` when you log a statement from your own driver or DAO;
it applies the same rule.

```typescript
import { getLogger, sqlContext } from '@ticatec/node-common-library';

const logger = getLogger('MyDriver', 'db');
logger.debug(sqlContext(sql, params), 'Executing statement');
```

## 📋 API Reference

### Classes

- **`DBManager`** — `init(factory)`, `getInstance()`, `connect()`, `resetInstance()`
- **`DBConnection`** — abstract driver base class
- **`CommonDAO`** / **`CommonRepository`** / **`CommonService`** — the four-tier base classes
- **`CommonSearchCriteria`** — dynamic query builder; `protected` constructor, extend it
- **`SearchCriteria`** — **deprecated.** An empty subclass kept for backward compatibility (`abstract class SearchCriteria extends CommonSearchCriteria {}`). It adds no behaviour; extend `CommonSearchCriteria` directly in new code
- **`TransactionManager`** — `execute(propagation, fn)`, `getCurrentConnection()`
- **`BeanFactory`** — registry class; **`beanFactory`** is the default singleton instance
- **`Beans`** — `getInstance()`, `register(name, loader)`, `load()`
- **`BitsBoolean`** — bit-packed boolean flags
- **`StringUtils`** — `isEmpty`, `genID`, `uuid`, `leftPad`, `isString`, `isNumber`, `parseNumber`

### Decorators

- **`@Transaction(propagation?: Propagation)`** — marks a method for declarative transaction handling. Defaults to `Propagation.REQUIRED`. It only records metadata via `reflect-metadata`; the `CommonService` constructor performs the actual wrapping, so the decorator has no effect on a class that does not extend `CommonService`.

### Functions

- **`sqlContext(sql: string, params?: any[]): object`** — builds the log context for a SQL statement: the statement and `paramCount`, with the parameter values included only when `KEELSON_LOG_SQL_PARAMS=true`. Use it whenever you log a statement.
- **`getLogger(name: string, category?: string): Logger`** — re-exported from `@ticatec/logger-api`. Returns a logger that resolves the installed provider on every write, falling back to the console when there is none. `name` is conventionally the class or module name; `category` groups related loggers (the framework uses `'db'`, `'dao'`, `'service'` and `'repository'`). Never throws, and never requires prior initialisation.

### Interfaces (type-only)

- **`DBFactory`** — `createDBConnection(): Promise<DBConnection>`, `close(): Promise<void>`
- **`InsertResult<T>`** — `{ affectedRows: number, record: T | null, insertId?: number | string | null }`
- **`UpdateResult<T>`** — `{ affectedRows: number, record: T | null }`
- **`PaginationList`** — `{ count, hasMore, list, pages }`
- **`QuickSearchResult<T>`** — `{ list: T[], hasMore: boolean }`
- **`ExecuteSQLFileOptions`** — `{ stopOnError?: boolean, throwOnError?: boolean }`
- **`Field`** — `{ name, type: FieldType, length? }`
- **`BaseDAO<T, K>`** — `createNew`, `update`, `find` by key
- **`BaseCRUDDAO<T, K>`** — extends `BaseDAO` with `remove`
- **`BatchRecord<T>`** / **`BatchRecords<T>`** — batch processing record shapes

### Types (type-only)

- **`PostConstructionFun`** — `(obj: any) => void`, used by `find()` / `listQuery()`
- **`Logger`** — re-exported from `@ticatec/logger-api`; five level methods (`trace`, `debug`, `info`, `warn`, `error`)

### Enums

- **`FieldType`** — `Text`, `Number`, `Date`
- **`Propagation`** — `REQUIRED`, `REQUIRES_NEW`, `NONE`

### Errors

- **`OptimisticLockException`** — extends `Error`; carries the conflicting entity on `.entity`

```typescript
import { OptimisticLockException } from '@ticatec/node-common-library';

try {
    await userDAO.updateUser(user);
} catch (err) {
    if (err instanceof OptimisticLockException) {
        console.warn('concurrent edit on', err.entity);
    }
}
```

## 🔀 Migrating from 3.x

| Change | Before (3.x) | After (4.0.0) |
| --- | --- | --- |
| `insertRecord()` / `executeInsertQuery()` | returned the inserted row (or a driver-specific value) | returns `InsertResult<T>` — read `result.record`, `result.affectedRows`, `result.insertId` |
| `updateRecord()` / `executeUpdateQuery()` | returned the updated row (or a driver-specific value) | returns `UpdateResult<T>` — read `result.record`, `result.affectedRows` |
| `DBConnection.getPlaceholder(index)` | did not exist | **abstract** — every driver must implement it |
| `DBFactory.close()` | did not exist | **required** — every factory must implement it |
| `BeanFactory` export | was bound to the singleton instance | is the **class**; use `beanFactory` for the singleton |
| Logging | `@ticatec/logger-wrapper` (pino) as a peer dependency | `@ticatec/logger-api` — a zero-dependency contract. pino is now optional; install `@ticatec/logger-pino` (the renamed adapter) only if you want it |
| `StringUtils.genID()` / `uuid()` | UUID v4 (`crypto.randomUUID()`) | **UUID v7** — time-ordered and monotonic, suitable as a primary key |
| `NULL` columns | dropped from mapped objects | preserved as `null`, consistently across `find()` and `listQuery()` |
| DAO query logs | `{ sql, params }` — every bind parameter value | `{ sql, paramCount }`; values only with `KEELSON_LOG_SQL_PARAMS=true` |
| DAO logger category | `'controller'` | `'dao'` — add a `dao` category to your logger config, or it falls back to root |
| `DBManager.init()` log | the whole factory object, password included | the factory class name |

Two more behaviours changed without changing a signature — worth re-reading if you depend on them:

- **`Propagation.NONE` no longer leaks a non-transactional context.** A `REQUIRED` method called from inside a `NONE` context now opens a real transaction instead of silently joining the auto-commit connection.
- **`CommonSearchCriteria` is re-entrant.** `sql` / `params` / `orderBy` set in the constructor are snapshotted and restored before each run, so executing the same instance twice no longer duplicates conditions or parameters.

Upgrading a call site usually looks like this:

```typescript
// 3.x
const row = await this.executeInsertQuery(sql, params);
return row.id;

// 4.0.0
const result = await this.executeInsertQuery<User>(sql, params);
return result.record?.id;          // or result.insertId on MySQL / auto-increment tables
```

## 🛠️ Build & publish

| Script | What it does |
| --- | --- |
| `pnpm build` | Cleans `lib/`, compiles CommonJS to `lib/cjs/`, ESM to `lib/esm/`, copies the marker `package.json` files |
| `pnpm typecheck` | `tsc --noEmit` against both `tsconfig.cjs.json` and `tsconfig.esm.json` |
| `pnpm test` | Runs the Jest suite |
| `pnpm lint` | ESLint over `src/**/*.ts` (also runs automatically via `prebuild`) |
| `pnpm clean` | Removes `lib/` |
| `pnpm publish-public` | Publishes to npm with public access |

`prepublishOnly` runs `typecheck && test && build`, so a failing type check or test blocks publishing.

The dual build relies on the `exports` map in `package.json`: the `.` entry routes `import` to `lib/esm/index.js` and `require` to `lib/cjs/index.js`, with `lib/cjs/index.d.ts` providing types. A backwards-compatible `./lib/db/Field` subpath is also exposed for legacy consumers.

## 📝 Dependencies

| Package | Kind | Why |
| --- | --- | --- |
| `reflect-metadata` | dependency | Metadata storage for the `@Transaction` decorator |
| `uuid` | dependency (`^11.1.0`) | UUID v7 generation for `StringUtils.genID()` / `StringUtils.uuid()` |
| `@ticatec/logger-api` | peer dependency (`>= 1.0.0`) | Zero-dependency logging contract used by every base class |

`uuid` is pinned to the 11.x line because 12.x and 13.x are ESM-only, which would break this package's CommonJS build.

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

## 👨‍💻 Author

**Henry Feng** — [huili.f@gmail.com](mailto:huili.f@gmail.com)

## 📖 In-depth Guides

| Guide | Covers |
| --- | --- |
| [DAO Layer](docs/DAO_GUIDE.md) | Writing DAOs, the built-in query helpers, `InsertResult` / `UpdateResult`, pagination, placeholders |
| [Service & Repository Layers](docs/SERVICE_GUIDE.md) | The 4-tier architecture, `@Transaction`, propagation, `TransactionManager` |
| [Dependency Injection](docs/DEPENDENCY_INJECTION_GUIDE.md) | `beanFactory`, lazy proxies, `Beans` loaders, circular dependencies |
| [Search Criteria](docs/SEARCH_CRITERIA.md) | The dynamic query builder in full — baseline contract, condition helpers, generated SQL |

## 🔗 Links

- [GitHub Repository](https://github.com/ticatec/node-common-library)
- [NPM Package](https://www.npmjs.com/package/@ticatec/node-common-library)
- [CHANGELOG](CHANGELOG.md)
