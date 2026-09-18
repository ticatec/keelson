# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.3.0] - 2026-09-18

Major modernization pass aligning with `@ticatec/node-common-library@3.3.0`.

### ⚠️ Breaking Changes

- **Version bumped from 2.1.0 to 3.3.0** to align with node-common-library ecosystem.
- **Dual module build.** Added `"type": "module"`, dual CJS/ESM compilation outputs (`lib/cjs` and `lib/esm`), and explicit package exports.
- **`insertRecord<T>()` modernized.** Now returns `InsertResult<T>` (`{ affectedRows: number, record: null, insertId?: number | string | null }`) extracting `insertId` from `ResultSetHeader`.
- **`updateRecord<T>()` modernized.** Now returns `UpdateResult<T>` (`{ affectedRows: number, record: null }`).
- **Preserved column casing.** Removed destructive `toLowerCase()` conversion in `buildFieldsMap` and `getFirstRow`, allowing exact column names and camelCase aliases to be preserved.
- **`peerDependencies` for `@ticatec/node-common-library` updated to `>=3.3.0`.**

### 🚀 New Features

- **DDL execution support in `executeSQL()`.** Changed internal execution from `client.execute()` (prepared statement protocol) to `client.query()` so `executeSQLFile()` can execute `CREATE TABLE` and migration DDL statements.
- **Implemented `getPlaceholder()`.** Returns MySQL standard placeholder `?` for prepared queries.
- **Implemented `MysqlDBFactory.close(): Promise<void>`.** Closes the connection pool and frees resources via `pool.end()`.
- **Exported classes.** Top-level exports now include `MysqlDBConnection` and `MysqlDBFactory` alongside `initializeMySQL`.
- **Full test suite and ESLint.** Added Jest unit tests and ESLint enforcement.
