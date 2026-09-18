# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.3.0] - 2026-09-18

### ⚠️ Breaking Changes

- **`updateRecord<T>()` and `insertRecord<T>()` modernized.** Now return typed structures `UpdateResult<T>` and `InsertResult<T>` containing `{ affectedRows: number, record: T | null }`.
- **`PgDBFactory.close(): Promise<void>` implemented.** Shuts down the underlying `pg.Pool`.
- **`peerDependencies` for `@ticatec/node-common-library` updated to `>=3.3.0`.**

### 🚀 New Features

- **Dialect placeholder support.** Implemented `getPlaceholder(index)` returning `$1`, `$2`...
- **Resource cleanup.** Implemented `close()` on `PgDBFactory` to close pool connections.

### 🐛 Bug Fixes

- **Prevented unhandled rejections on `postConnection`.** Attached `.catch(() => {})` handler to `initPromise` on pool socket connect to avoid terminating Node.js process if unhandled. Real initialization errors are re-thrown when acquiring the connection via `createDBConnection()`.
- **Preserved explicit NULL values.** Fixed row mapping to retain explicit `null` column values from PostgreSQL.
- **Removed duplicate redundant implementations.** Base `DBConnection` methods (`safeLogMeta`, `sanitizeParams`, `setNestObj`) are cleanly inherited.
