# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-09-19

### Renamed

This package was `@ticatec/pg-common-library`. It is now **`@ticatec/keelson-pg`**, and the
version restarts at 1.0.0 because a new name on npm is a new package with its own
publish history. The last release under the old name was
`@ticatec/pg-common-library@3.1.0`; the work that had accumulated
locally as 4.0.0 ships here as 1.0.0.

To migrate, change the dependency and the import specifier - nothing else:

```diff
-"@ticatec/pg-common-library": "^3.1.0"
+"@ticatec/keelson-pg": "^1.0.0"
```

```diff
-import { ... } from '@ticatec/pg-common-library';
+import { ... } from '@ticatec/keelson-pg';
```

Every export keeps its name and signature. The old package will be deprecated on
npm with a pointer here.

### Fixed

- **An idle connection dying no longer kills the process.** `pg` registers an
  `idleListener` on every pooled client's socket; when the connection is cut - a
  database restart, an idle reaper on the server, a firewall timeout - that listener
  calls `pool.emit('error', ...)`. An `EventEmitter` with no `'error'` listener
  throws, and this throw happens inside a socket event callback where no `try`/`catch`
  of yours can reach it, so Node exits with an `uncaughtException`. Reproduced: the
  process exited with code 1 and the statement after the emit never ran. The factory
  now attaches the listener that the `pg` documentation requires and logs the error.

- **`close()` is idempotent.** `pg` rejects a second `pool.end()` with
  `Called end on pool more than once`, so two shutdown paths - or a shutdown hook that
  runs twice - turned an orderly shutdown into a failure. Repeated calls are now no-ops.

- **`getFields()` no longer reports every column as `Text`.** `getFieldType()` ignored
  its argument and returned a constant, which is a value that happens to be right for
  text columns and wrong for everything else. It now reads `dataTypeID`, the type OID
  that `pg` puts on each field, and maps the built-in numeric and temporal types.
  `FieldType` has no boolean member, so `bool` still maps to `Text`; boolean coercion
  goes through the `booleanFields` argument of `listQuery()` / `find()`, not through
  this metadata.

### Added

- **`PgDBConnection` and `PgDBFactory` are exported.** Only `initializePg()` was
  reachable, so there was no way to subclass the connection to adjust a dialect
  detail - `@ticatec/keelson-mysql` and `@ticatec/keelson-dm` both export theirs.

- **Pool lifecycle logging through `@ticatec/logger-api`.** Creation and shutdown are
  logged. The configuration summary never carries credentials: `password` and
  `connectionString` are reduced to a single `authenticated` boolean, and a test
  asserts the serialized metadata contains neither the password nor the URL.

### Removed

- **The `buildFieldsMap()` override**, which was line-for-line the base implementation.

- **The `getBoolean()` override.** It existed only to add `'true'` and `'false'` to the
  strings the base class recognised. That is not a PostgreSQL dialect detail - any
  driver can read those words out of a text column - so the rule moved into
  `@ticatec/keelson-core`, where it is now also case-insensitive. The override had not
  handled `'TRUE'` / `'FALSE'` either.

### Changed

- Copyright holder in `LICENSE` is **Ticatec** across every package in the monorepo. It
  had been split between `Henry Feng` and `Ticatec` (and one lowercase `ticatec`). Each
  file keeps its own year, which is the year that package was first published, not the
  year of this edit. The npm `author` field still names Henry Feng with his email - the
  author of the code and the holder of the copyright are two different fields, and only
  the second one was ambiguous.

- **README tails unified across the three drivers.** `License` is followed by `Author`
  and `Links` (source, npm, issues, changelog), matching `@ticatec/keelson-core`.
  `Related Packages` is gone - `Installation` and `Peer Dependencies` already name those
  packages at the top, where a reader looks for them, and a second list at the bottom only
  goes stale. `CHANGELOG.md` is now in `files`, so the link resolves inside the published
  tarball too.

- Both READMEs gained the Contributing / development-setup section the rest of the
  monorepo carries, including the note that the workspace is pnpm-only (`workspace:*` is
  not a protocol npm implements, so `npm install` fails with `EUNSUPPORTEDPROTOCOL`).

- `prepublishOnly` now runs the test suite, matching the other two drivers.

- The four transaction-lifecycle log calls pass a context object first
  (`logger.debug({}, '...')`), matching `@ticatec/keelson-mysql` and
  `@ticatec/keelson-dm`. Both shapes are part of the `@ticatec/logger-api` contract, so
  this is consistency across the driver family rather than a fix.

- `pino` is gone from `devDependencies`; nothing in the source or the tests referenced
  it. The tests drive logging through a `@ticatec/logger-api` provider.

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

### ⚠️ Breaking Changes

- **`updateRecord<T>()` and `insertRecord<T>()` modernized.** Now return typed structures `UpdateResult<T>` and `InsertResult<T>` containing `{ affectedRows: number, record: T | null }`.
- **`PgDBFactory.close(): Promise<void>` implemented.** Shuts down the underlying `pg.Pool`.
- **`peerDependencies` for `@ticatec/keelson-core` updated to `>=3.3.0`.**

### 🚀 New Features

- **Dialect placeholder support.** Implemented `getPlaceholder(index)` returning `$1`, `$2`...
- **Resource cleanup.** Implemented `close()` on `PgDBFactory` to close pool connections.

### 🐛 Bug Fixes

- **Prevented unhandled rejections on `postConnection`.** Attached `.catch(() => {})` handler to `initPromise` on pool socket connect to avoid terminating Node.js process if unhandled. Real initialization errors are re-thrown when acquiring the connection via `createDBConnection()`.
- **Preserved explicit NULL values.** Fixed row mapping to retain explicit `null` column values from PostgreSQL.
- **Removed duplicate redundant implementations.** Base `DBConnection` methods (`safeLogMeta`, `sanitizeParams`, `setNestObj`) are cleanly inherited.
