# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **`strict` is on.** The build configs (`tsconfig.cjs.json` / `tsconfig.esm.json`)
  did not extend `tsconfig.json` - they were standalone - so nothing in the base
  config ever applied to what shipped: not `strict`, not `skipLibCheck`, not
  `declarationMap` or `sourceMap`, and `lib` was written outside `compilerOptions`
  where TypeScript ignores it. Editors and `ts-jest` read the base config while the
  build read a different one, so what you saw while editing was not what was
  compiled. Both configs now extend the base, and `strict` is enabled there.

  Decorators are unaffected: `experimentalDecorators` and `emitDecoratorMetadata`
  govern decorator syntax and metadata emission, `strict` governs type checking.
  `@Transaction` is a method decorator and injects no fields, so
  `strictPropertyInitialization` has nothing to complain about - it produced zero
  errors here.

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
