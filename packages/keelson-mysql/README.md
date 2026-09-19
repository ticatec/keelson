# @ticatec/keelson-mysql

A MySQL database connection implementation for the `@ticatec/keelson-core` framework, providing connection pooling, transaction management, and async/await support.

[![npm version](https://badge.fury.io/js/@ticatec%2Fkeelson-mysql.svg)](https://badge.fury.io/js/@ticatec%2Fkeelson-mysql)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[中文文档](README_CN.md) | English

## Features

- 🔄 **Transaction Management**: Full support for BEGIN, COMMIT, and ROLLBACK operations
- 🏊 **Connection Pooling**: Built-in MySQL connection pooling with mysql2
- ⚡ **Async/Await Support**: Promise-based API for modern JavaScript/TypeScript
- 🛡️ **Type Safety**: Full TypeScript support with proper type definitions
- 🔍 **Query Operations**: Support for SELECT, INSERT, UPDATE, DELETE operations
- 📊 **Result Mapping**: Automatic field mapping and camelCase conversion
- 🏗️ **Extensible Design**: Clean interface implementation following DBConnection pattern

## Installation

```bash
npm install @ticatec/keelson-mysql
```

### Peer Dependencies

Make sure to install the required peer dependencies:

```bash
npm install mysql2 @ticatec/keelson-core
```

## Quick Start

### 1. Initialize Connection Factory

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
    
    // Insert record
    await connection.insertRecord(
      'INSERT INTO users (name, email, status) VALUES (?, ?, ?)',
      ['John Doe', 'john@example.com', 'active']
    );
    
    // Update record
    const affectedRows = await connection.executeUpdate(
      'UPDATE users SET last_login = NOW() WHERE email = ?',
      ['john@example.com']
    );
    console.log(`Updated ${affectedRows} rows`);
    
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

### `initializeMySQL(config): DBFactory`

Creates a MySQL database factory with connection pooling.

**Parameters:**
- `config`: MySQL connection configuration object (mysql2 PoolOptions)

**Returns:** `DBFactory` instance

### `MysqlDBFactory`

Factory class that implements the `DBFactory` interface.

#### Methods

- `createDBConnection(): Promise<DBConnection>` - Creates a new database connection from the pool
- `close(): Promise<void>` - Closes the pool and releases every resource. Idempotent - later calls are no-ops

### `MysqlDBConnection`

Database connection class that implements the `DBConnection` interface.

#### Transaction Methods

- `beginTransaction(): Promise<void>` - Starts a database transaction
- `commit(): Promise<void>` - Commits the current transaction
- `rollback(): Promise<void>` - Rolls back the current transaction
- `close(): Promise<void>` - Releases the connection back to the pool

#### Query Methods

- `fetchData(sql: string, params?: any[]): Promise<{rows: any[], fields: any[]}>` - Executes SELECT queries
- `executeUpdate(sql: string, params: any[]): Promise<number>` - Executes UPDATE/DELETE queries, returns affected row count
- `insertRecord<T>(sql: string, params: any[]): Promise<InsertResult<T>>` - Executes INSERT, returning `{ affectedRows, record: null, insertId }`
- `updateRecord<T>(sql: string, params: any[]): Promise<UpdateResult<T>>` - Executes UPDATE, returning `{ affectedRows, record: null }`
- `deleteRecord(sql: string, params: any[]): Promise<number>` - Executes DELETE queries

#### Utility Methods

- `getFields(result: any): Field[]` - Extracts field metadata from query results
- `getRowSet(result: any): any[]` - Extracts row data from query results
- `getAffectRows(result: any): number` - Gets the number of affected rows
- `getFirstRow(result: any): any | null` - Gets the first row from query results

## Configuration Options

The `config` parameter accepts all mysql2 PoolOptions. Common options include:

```typescript
interface MySQLConfig {
  host?: string;           // Database host (default: 'localhost')
  port?: number;           // Database port (default: 3306)
  user?: string;           // Database username
  password?: string;       // Database password
  database?: string;       // Database name
  connectionLimit?: number; // Maximum connections in pool (default: 10)
  queueLimit?: number;     // Maximum queued requests (default: 0)
  acquireTimeout?: number; // Connection acquisition timeout (ms)
  timeout?: number;        // Query timeout (ms)
  reconnect?: boolean;     // Auto-reconnect on connection loss
  ssl?: any;              // SSL configuration
}
```

## Error Handling

The library includes built-in error handling:

```typescript
try {
  const connection = await dbFactory.createDBConnection();
  await connection.beginTransaction();
  
  // Your database operations here
  
  await connection.commit();
} catch (error) {
  if (connection) {
    await connection.rollback(); // Automatic rollback on error
  }
  console.error('Database operation failed:', error);
} finally {
  if (connection) {
    await connection.close(); // Always clean up connections
  }
}
```

## Logging

Logging goes through the [`@ticatec/logger-api`](https://www.npmjs.com/package/@ticatec/logger-api)
contract. With no provider installed it falls back to the console, filtered by `LOG_LEVEL`.

Connection acquisition, the transaction lifecycle and every statement are logged at `debug`;
pool creation and shutdown at `info`. **Bind parameters are never written to the log** - only
the statement text and the parameter count. When tracing a problem needs the values, set
`KEELSON_LOG_SQL_PARAMS=true`; it is off by default and belongs nowhere near production.
The pool configuration summary never carries `password` or `uri`.

## Known Issues & Limitations

1. **Insert/update do not return the row**: MySQL has no `RETURNING` clause, so `record` is always `null` on `insertRecord` and `updateRecord`; the new primary key comes back as `insertId`. When only the affected-row count matters, `executeUpdate()` is the more direct call.

2. **Type Safety**: Some internal methods use `any` types. Consider adding more specific type definitions for better type safety.

3. **Result Structure**: The `getRowSet` and `getFirstRow` methods make assumptions about result structure that may not always match the actual mysql2 response format.

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

- 📧 Email: huili.f@gmail.com
- 🐛 Issues: [GitHub Issues](https://github.com/ticatec/keelson/issues)
- 📖 Documentation: [GitHub Repository](https://github.com/ticatec/keelson/tree/main/packages/keelson-mysql)

## Related Packages

- [@ticatec/keelson-core](https://www.npmjs.com/package/@ticatec/keelson-core) - Core framework library
- [mysql2](https://www.npmjs.com/package/mysql2) - MySQL client for Node.js