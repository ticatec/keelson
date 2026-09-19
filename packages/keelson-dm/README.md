# @ticatec/keelson-dm

A Dameng (达梦 8) database connection driver for `@ticatec/keelson-core`, providing connection pooling, transaction management, typed results, and async/await support.

[![npm version](https://badge.fury.io/js/@ticatec%2Fkeelson-dm.svg)](https://badge.fury.io/js/@ticatec%2Fkeelson-dm)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[中文文档](README_CN.md) | English

## Features

- 🔄 **Transaction Management**: Full support for `beginTransaction`, `commit`, and `rollback` operations
- 🏊 **Connection Pooling**: Built-in connection pooling via `dmdb`
- ⚡ **Async/Await Support**: Fully Promise-based API for modern TypeScript and JavaScript
- 🛡️ **Type Safety**: Returns typed `InsertResult<T>` and `UpdateResult<T>` structures
- 🔍 **Parameter Safety**: Uses `?` positional parameter binding
- 📊 **Result Mapping**: Automatic column-to-camelCase conversion, nested object mapping (`__` or `.`) with prototype-chain guards, and defensive row parsing (supporting both array and object formats)
- 🏗️ **Dual Build**: CommonJS and ECMAScript Module (ESM) export support

## Installation

```bash
npm install @ticatec/keelson-dm
```

### Peer Dependencies

Make sure to install the required peer dependencies:

```bash
npm install dmdb @ticatec/keelson-core
```

## Quick Start

### 1. Initialize Connection Factory

```typescript
import { initializeDmDB } from '@ticatec/keelson-dm';

const dbFactory = initializeDmDB({
  connectString: 'dm://SYSDBA:SYSDBA@localhost:5236',
  poolMax: 10,
  poolMin: 1
});
```

### 2. Basic Query Operations

```typescript
async function performDatabaseOperations() {
  const connection = await dbFactory.createDBConnection();
  
  try {
    // Begin transaction
    await connection.beginTransaction();
    
    // Fetch data
    const users = await connection.fetchData(
      'SELECT * FROM users WHERE status = ?', 
      ['active']
    );
    console.log('Active users:', users.rows);
    
    // Insert record with typed result
    const insertRes = await connection.insertRecord(
      'INSERT INTO users (name, status) VALUES (?, ?)',
      ['John Doe', 'active']
    );
    console.log(`Inserted rows: ${insertRes.affectedRows}`);
    
    // Update record
    const updateRes = await connection.updateRecord(
      'UPDATE users SET status = ? WHERE name = ?',
      ['inactive', 'John Doe']
    );
    console.log(`Updated rows: ${updateRes.affectedRows}`);
    
    // Delete record
    const deletedCount = await connection.deleteRecord(
      'DELETE FROM users WHERE name = ?',
      ['John Doe']
    );
    console.log(`Deleted rows: ${deletedCount}`);

    // Commit transaction
    await connection.commit();
  } catch (error) {
    // Rollback on error
    await connection.rollback();
    console.error('Transaction failed:', error);
    throw error;
  } finally {
    // Always close connection
    await connection.close();
  }
}
```

## API Reference

### `initializeDmDB(config: any): DBFactory`

Initializes and creates a `DMDBFactory` instance backed by a `dmdb` connection pool.

### `DMDBFactory`

Factory class implementing `DBFactory`.

- `createDBConnection(): Promise<DBConnection>` - Acquires a connection from the pool (creates the pool lazily on first access with race-condition guards).
- `close(): Promise<void>` - Closes the underlying `dmdb` connection pool and resets factory state. Safe to call when no pool was ever created.

### `DMDBConnection`

Connection class implementing `DBConnection`.

> [!NOTE]
> Unlike MySQL, Dameng driver does not return generated auto-increment primary keys in DML execution result. Therefore `InsertResult.insertId` is `undefined` in Dameng. To retrieve generated IDs, consider using `RETURNING INTO` or `SELECT @@IDENTITY`.

#### Transaction Methods
- `beginTransaction(): Promise<void>` - Starts a transaction (explicitly sets statement execution `autoCommit: false`).
- `commit(): Promise<void>` - Commits the current transaction and restores `autoCommit: true`.
- `rollback(): Promise<void>` - Rolls back the current transaction safely and restores `autoCommit: true`.
- `close(): Promise<void>` - Closes and returns the connection to the pool.

#### Query Methods
- `fetchData(sql: string, params?: any[]): Promise<Result<any>>` - Executes a SQL query with parameter binding.
- `insertRecord<T>(sql: string, params: any[]): Promise<InsertResult<T>>` - Executes INSERT and returns `{ affectedRows, record }`.
- `updateRecord<T>(sql: string, params: any[]): Promise<UpdateResult<T>>` - Executes UPDATE and returns `{ affectedRows, record }`.
- `deleteRecord(sql: string, params: any[]): Promise<number>` - Executes DELETE and returns affected row count.
- `getPlaceholder(index: number): string` - Returns `?` for SQL binding.

## Column Alias Mapping

Column names are converted to camelCase: an all-uppercase identifier is lowercased first, so
`USER_NAME` becomes `userName`, while a quoted alias such as `"itemCount"` is left alone.

A dot or a double underscore in the alias builds a nested object - `DEPT__USER_NAME` and
`DEPT.USER_NAME` both map to `{ dept: { userName } }`. The double underscore only counts as a
separator when it actually sits between two non-empty segments, so a name like `__internal`
stays a single key rather than being split into empty segments.

Aliases that would write to the prototype chain (`__proto__`, `constructor`, `prototype`, in
any case) are dropped, and a path whose intermediate segment is already a primitive is left
alone rather than overwriting it.

## Logging

Logging goes through the [`@ticatec/logger-api`](https://www.npmjs.com/package/@ticatec/logger-api)
contract. With no provider installed it falls back to the console, filtered by `LOG_LEVEL`.

The transaction lifecycle and every statement are logged at `debug`; pool creation and shutdown
at `info`. **Bind parameters are never written to the log** - only the statement text and the
parameter count. When tracing a problem needs the values, set `KEELSON_LOG_SQL_PARAMS=true`;
it is off by default and belongs nowhere near production. The pool configuration summary never
carries `password` or `connectString`.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

