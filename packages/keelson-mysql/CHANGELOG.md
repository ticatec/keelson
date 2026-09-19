# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-09-19

### Renamed

This package was `@ticatec/mysql-common-library`. It is now **`@ticatec/keelson-mysql`**, and the
version restarts at 1.0.0 because a new name on npm is a new package with its own
publish history. The last release under the old name was
`@ticatec/mysql-common-library@2.1.0`; the work that had accumulated
locally as 4.0.0 ships here as 1.0.0.

To migrate, change the dependency and the import specifier - nothing else:

```diff
-"@ticatec/mysql-common-library": "^2.1.0"
+"@ticatec/keelson-mysql": "^1.0.0"
```

```diff
-import { ... } from '@ticatec/mysql-common-library';
+import { ... } from '@ticatec/keelson-mysql';
```

Every export keeps its name and signature. The old package will be deprecated on
npm with a pointer here.

## [Unreleased]

### Fixed

- **The published tarball carried no licence text.** `package.json` declares
  `"license": "MIT"` and lists `LICENSE` in `files`, but the file did not exist in the
  package - every other package in the repository has one. Added.

- **`getFields()` no longer reports every column as `Text`.** The type was hard-coded,
  which is a value that happens to be right for string columns and wrong for everything
  else. It now reads `columnType`, the MySQL protocol column-type code that `mysql2`
  puts on each field, and maps the numeric and temporal codes.

### Added

- **Transaction and statement logging through `@ticatec/logger-api`.**
  `beginTransaction()`, `commit()`, `rollback()`, `close()` and `executeSQL()` were
  silent while `@ticatec/keelson-pg` logged all of them, so the same application
  produced a different trace depending on which database it ran against. Bind
  parameters are never in the message - only the statement and the parameter count.

- **Pool lifecycle logging.** Creation and shutdown are logged. The configuration
  summary never carries credentials: `password` and `uri` are reduced to a single
  `authenticated` boolean, and a test asserts the serialized metadata contains neither
  the password nor the URL.

- **`close()` is idempotent.** `mysql2` tolerates a second `end()`, but the factory now
  ends the pool once and logs once, matching the other two drivers.

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

Major modernization pass aligning with `@ticatec/keelson-core@3.3.0`.

### ⚠️ Breaking Changes

- **Version bumped from 2.1.0 to 3.3.0** to align with keelson-core ecosystem.
- **Dual module build.** Added `"type": "module"`, dual CJS/ESM compilation outputs (`lib/cjs` and `lib/esm`), and explicit package exports.
- **`insertRecord<T>()` modernized.** Now returns `InsertResult<T>` (`{ affectedRows: number, record: null, insertId?: number | string | null }`) extracting `insertId` from `ResultSetHeader`.
- **`updateRecord<T>()` modernized.** Now returns `UpdateResult<T>` (`{ affectedRows: number, record: null }`).
- **Preserved column casing.** Removed destructive `toLowerCase()` conversion in `buildFieldsMap` and `getFirstRow`, allowing exact column names and camelCase aliases to be preserved.
- **`peerDependencies` for `@ticatec/keelson-core` updated to `>=3.3.0`.**

### 🚀 New Features

- **DDL execution support in `executeSQL()`.** Changed internal execution from `client.execute()` (prepared statement protocol) to `client.query()` so `executeSQLFile()` can execute `CREATE TABLE` and migration DDL statements.
- **Implemented `getPlaceholder()`.** Returns MySQL standard placeholder `?` for prepared queries.
- **Implemented `MysqlDBFactory.close(): Promise<void>`.** Closes the connection pool and frees resources via `pool.end()`.
- **Exported classes.** Top-level exports now include `MysqlDBConnection` and `MysqlDBFactory` alongside `initializeMySQL`.
- **Full test suite and ESLint.** Added Jest unit tests and ESLint enforcement.
