# Changelog

All notable changes to `@ticatec/node-common-library` are documented in this file.

## [4.1.0] - 2026-09-19

### Security

- **Every SQL bind parameter was written to the log.** `CommonDAO` logged
  `{ sql, params }` on find, list, insert, update and delete - and the parameters
  are the real data flowing through each query. A service with debug logging
  enabled copied its entire database traffic into the log store; the reproduction
  used for this fix showed an email address, an Argon2 password hash and a card
  number all landing in a record verbatim. Queries now log the statement and the
  parameter *count*.

  The values remain available for local debugging behind an explicit opt-in,
  `KEELSON_LOG_SQL_PARAMS=true`. It is read on every call so it can be toggled at
  runtime, and only the exact string `true` enables it - `1` and `yes` do not.

  Drivers and DAOs outside this package should build their SQL log context with
  the exported `sqlContext(sql, params)` so the same rule applies to them.

- **`DBManager.init()` logged the whole connection factory**, and a `DBFactory`
  holds the full connection configuration - database password included. It now
  records the factory's class name.

- `Beans.load()` passed the internal loader map as the log context. It now logs
  the registered bean names and their count.

### Changed

- **A DAO's logger category is `'dao'`, was `'controller'`.** The layers are
  Controller -> Service -> Repository -> DAO, so a DAO reporting itself as a
  controller made category-based routing and filtering actively misleading. If
  your logger configuration defines categories, add a `dao` entry - without one
  these records fall back to the root logger.
- `CommonSearchCriteria` now logs under the `'db'` category; it previously had none.
- `Logger` is re-exported with `export type`, and every internal import of it uses
  `import type`. Exporting a type in the value list breaks transpile-only
  toolchains.

### Added

- `sqlContext()` and `SQL_PARAMS_ENV` are exported from the package entry point.
- 15 new tests (44 -> 59), including one asserting that no bind parameter value and
  no factory password can reach the log.


All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [4.0.0] - 2026-09-18

Major modernization pass across core database abstractions, transaction propagation, dialect abstractions, and type safety.

### ⚠️ Breaking Changes

- **`updateRecord<T>()` return type modernized.** Now returns `Promise<UpdateResult<T>>` containing `{ affectedRows: number, record: T | null }` instead of arbitrary `any`.
- **`insertRecord<T>()` return type modernized.** Now returns `Promise<InsertResult<T>>` containing `{ affectedRows: number, record: T | null, insertId?: number | string | null }` instead of arbitrary `any`.
- **`CommonDAO` insert/update query methods updated.** `executeInsertQuery<T>()` now returns `Promise<InsertResult<T>>` and `executeUpdateQuery<T>()` now returns `Promise<UpdateResult<T>>`. Callers extracting the inserted row should access `res.record` or `res.insertId`.
- **Explicit `null` database values preserved.** `setNestObj` and `resultToList` now preserve explicit database `null` values instead of dropping them, aligning `listQuery` and `find` object shapes.
- **`DBConnection.getPlaceholder(idx)` is now abstract.** Subclasses must explicitly define dialect placeholder syntax (e.g. `$1` for PostgreSQL, `?` for MySQL), eliminating silent dialect fallback.
- **`DBFactory.close(): Promise<void>` is now required.** All database factories must implement connection pool shutdown.
- **`StringUtils.genID()` / `StringUtils.uuid()` now return UUID v7 instead of v4.** Values carry a 48-bit millisecond timestamp, are monotonic within the same millisecond, and keep their ordering after `genID()` strips the hyphens — which makes them suitable as database primary keys. Note that a v7 identifier discloses its creation time; generate a random value with `node:crypto` where that matters or where the value must be unguessable.
- **Logging is now contract-based.** The framework logs against `@ticatec/logger-api`, a zero-dependency interface, instead of `@ticatec/logger-pino`. The peer dependency changed accordingly, `Logger` is no longer an alias for pino's type, and pino is no longer implied by using this package. Applications that want pino keep using `@ticatec/logger-pino`, which is now an adapter; applications that want something else install a provider with `setLoggerProvider()`; applications that configure nothing get console output filtered by `LOG_LEVEL`.
- **`getLogger()` no longer throws when logging has not been configured**, and loggers captured in constructors resolve the active provider on every write. The `try/catch` no-op fallback in `DBConnection`'s constructor is gone, and startup ordering between logging setup and object construction no longer matters.
- **`BeanFactory` is now the class export.** It previously resolved to the singleton instance (the same object as `beanFactory`), so `new BeanFactory()` was impossible. Use `beanFactory` for the shared singleton and `BeanFactory` when you need an isolated registry.

### 🚀 New Features

- **`UpdateResult<T>` and `InsertResult<T>` interfaces** exported from top-level package.
- **`uuid` dependency reinstated at `^11.1.0`** to provide RFC 9562 UUID v7 generation. The 11.x line is pinned deliberately: `uuid@12` and `uuid@13` are ESM-only and would break this package's CommonJS build.
- **`StringUtils` unit tests added** covering v7 format, intra-millisecond monotonicity, ordering after hyphen removal, timestamp encoding and uniqueness.
- **`CommonSearchCriteria` baseline snapshotting.** Automatically snapshots constructor baseline (`sql`, `params`, `orderBy`) on first query, ensuring clean re-entrancy and preserving tenant isolation parameters across subsequent calls.
- **`safeLogMeta(sql, params)` utility.** Added to `DBConnection` to log SQL queries without leaking sensitive query parameter values into logs.
- **Real ESLint verification.** Added ESLint configuration and `pnpm lint` step enforced in `prebuild`.

### 🐛 Bug Fixes

- **Fixed `TransactionManager` fake transaction bug.** `Propagation.REQUIRED` nested inside `Propagation.NONE` now checks `currentCtx?.isTransaction` and correctly starts a real transactional context.
- **Fixed `executeSQLFile` comment stripping.** Removed incorrect `//` stripping that corrupted URLs inside migration SQL strings.
- **Fixed `quickSearch` `hasMore` calculation.** Corrected condition to `list.length + offset < count` and unified `CommonDAO.quickSearch` delegation.
- **Fixed `CommonSearchCriteria` re-entrancy.** Multiple executions of `query()` or `paginationQuery()` no longer erase constructor-defined baseline state or accumulate duplicate parameters.
- **Fixed `getNextDayStart` DST rollover.** Uses native Date date increment and midnight hour reset to safely handle DST boundaries.
- **Fixed LIKE wildcard escaping.** Correctly escapes `\`, `%`, and `_`.
- **Fixed service aspect duplicate wrapping.** `CommonService` uses `IS_WRAPPED` symbol to prevent duplicate wrapper chains on inherited methods.
- **Removed external relative paths from `tsconfig.json`.**

## [3.1.0] - 2026-07-26

Third review pass. The release focuses on declarative-transaction correctness, type safety of public APIs, defensive defaults for SQL utilities, and the first real unit-test coverage of core logic.

### ⚠️ Breaking Changes

Behavior of public APIs changed in a way that may require caller updates. Review carefully before upgrading from 3.0.x.

- **`executeSQLFile()` now throws by default.** Previously it swallowed per-statement errors and returned a boolean. The new default is `{ stopOnError: true, throwOnError: true }` so a failed migration statement aborts the run with a descriptive `Error`. Pass `{ stopOnError: false }` to restore the old tolerant behavior (still returns `hasError: boolean`).
- **`BeanFactory.createBean<T>()` now returns `T | undefined`.** Callers that relied on the silently-typed `T` must handle the missing-bean case. `CommonService.getRepositoryInstance()` and `CommonRepository.getDAOInstance()` were updated to throw a descriptive error when a bean is not registered.
- **`CommonDAO.convertBooleanFields()` removed.** Use `DBConnection.listQuery()` / `find()` with the `booleanFields` parameter (auto-applies), or call `DBConnection.convertBooleanFields()` directly — its visibility was raised from `protected` to `public`.
- **`DBConnection.buildFieldsMap()` default now applies underscore → camelCase.** Drivers that did not override this method previously got identity mapping; they now get camelCase automatically. Override the method if you need raw column names preserved.
- **`CommonService` / `CommonRepository` / `CommonDAO` / `DBConnection` constructors changed from `protected` to `public`.** Concrete subclasses no longer need to redeclare the constructor just to be instantiable.

### 🚀 New Features

- **`Propagation.REQUIRES_NEW` is now fully implemented.** Calling `@Transaction(Propagation.REQUIRES_NEW)` (nested or top-level) correctly opens an isolated connection and suspends the surrounding context via `AsyncLocalStorage`. Previously this propagation threw `"Unsupported propagation"`.
- **`@Transaction` decorator now supports inheritance.** `CommonService._applyTransactionAspect()` walks the entire prototype chain, records where each method's metadata was declared, and wraps the method on the most-derived prototype. A `WeakSet` guards against double-wrapping. Inherited `@Transaction` methods from abstract parent classes are now correctly aspect-woven with their original propagation — previously they were silently downgraded to `REQUIRED`.
- **Generic types on query methods.** `DBConnection.find<T>()` returns `Promise<T | null>` and `listQuery<T>()` returns `Promise<Array<T>>`, both defaulting to `any` for backward compatibility.
- **`DBManager.getInstance()` fails fast.** Throws a clear `Error('DBManager is not initialized. Please call DBManager.init(factory) first ...')` instead of returning `undefined` and crashing on the next call. `DBManager.resetInstance()` added as a test hook.
- **`executeSQLFile()` options object** (`ExecuteSQLFileOptions`) exposes `stopOnError` and `throwOnError` for fine-grained control over migration failure handling.
- **`BitsBoolean` unsigned 32-bit safety.** All bitwise operations use `>>> 0`; bit-position range tightened to `0–30`; `fromBooleanArray()` capped at 31 elements.

### 🐛 Bug Fixes

- **`TransactionManager.execute()` no longer loses the original error on rollback / close failure.** The original error is re-thrown; secondary failures from `rollback()` and `close()` are logged and swallowed.
- **`CommonDAO.quickSearch()` uses driver-independent pagination.** Replaced hard-coded `offset ${o} limit ${r}` with `conn.getRowSetLimitClause(rowCount, offset)` so non-MySQL/PG drivers work correctly.
- **`CommonSearchCriteria.buildRangeCriteria()` includes the entire end day.** When `toValue` is a `Date` instance, the upper bound is automatically converted via `getEndOfDay()` (exclusive `< nextDay`). Previously the raw value produced `< toValue`, excluding the entire end date.
- **`CommonSearchCriteria.query()` applies `getPostConstructor()`.** Unpaginated queries now run the same post-processing hook as `paginationQuery()`.
- **`CommonSearchCriteria.paginationQuery()` page count uses `Math.ceil()`.** More readable; produces the same result for `count > 0`.
- **`CommonSearchCriteria.queryCount()` guards against `NaN`.** Returns `0` for null results, missing `cc` field, or non-numeric values, matching the behavior of `DBConnection.getCount()`.
- **`DBConnection.getCount()` guards against `NaN`.** Same fix as above.
- **`DBConnection.buildFieldsMap()` default no longer returns `null`.** Returns an empty `Map` (or a camelCase identity map when fields are present), eliminating the NPE in `resultToList` if a subclass forgot to override.
- **`DBConnection.resultToList()` defensively handles missing fields.** Falls back to `{ ...row }` spread when no field map is available; early-returns `[]` when `result.rows` is absent.
- **`getEndOfDay()` returns `null` for invalid dates** and `buildRangeCriteria()` skips the SQL clause when the computed upper bound is empty — avoids generating `field < NULL` (which never matches any row).

### 🧪 Tests

First meaningful test coverage on the framework core. Five suites, fifteen tests:

- `BeanFactory.test.ts` — lazy construction, circular-dependency detection, missing-bean handling
- `TransactionManager.test.ts` — REQUIRED / REQUIRES_NEW / NONE propagation, inherited `@Transaction` from abstract parent, nested REQUIRED→REQUIRES_NEW opens two separate connections, `DBManager` initialization guard
- `CommonSearchCriteria.test.ts` — `buildStarCriteria` wildcard→LIKE, `buildRangeCriteria` Date handling, `Math.ceil` page count, `getPostConstructor` applied in `query()`
- `BitsBoolean.test.ts` — set/get bit positions, `toBooleanArray`, `fromBooleanArray`, unsigned safety
- `Logger.test.ts` — `getLogger` before/after `initialize()`

### 📚 Documentation

- README numbering fixed (the previous release had two `### 2.` and two `### 5.` sections)
- README / README_CN wording aligned
- JSDoc on `executeSQLFile`, `buildFieldsMap`, `getEndOfDay`, `buildRangeCriteria`, `listQuery<T>`, `find<T>` expanded to document new contracts

### 🔧 Internal

- `package.json` devDependency `@ticatec/logger-pino` switched from `file:../logger_warpper` to `^0.1.0` so fresh clones resolve from npm
- `tsconfig.json` paths entry for `@ticatec/logger-pino` keeps local sibling path first for cross-package development, with a `node_modules` fallback for CI / external contributors
- `.gitignore` now excludes `.DS_Store`, `coverage/`, `*.log`, `*.iml`

### ⚠️ Known Limitations (unchanged, called out for clarity)

- `loadAndSplitSQL()` is a lightweight regex splitter — it does not parse string literals or PL/SQL `BEGIN ... END` / `$$ ... $$` blocks. Document your migration files accordingly.
- `tsconfig.json` is still `strict: false`. A full strict-mode pass is planned for a later release.
- The `@Transaction` decorator uses TypeScript's legacy `experimentalDecorators` spec. Migration to ECMAScript stage-3 decorators is tracked as future work.

---

## [3.0.0] - 2026-07-21

- Adopted `@ticatec/logger-pino` as the logging backend
- Dual ESM / CommonJS build