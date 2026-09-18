# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.3.0] - 2026-09-18

### Changed
- Aligned with `@ticatec/node-common-library@3.3.0`.
- Refactored transaction management using wrapper-level `#inTransaction` state and top-priority `ExecuteOptions.autoCommit` to guarantee connection pool isolation and prevent data loss.
- Modernized `insertRecord` and `updateRecord` to return typed structures (`InsertResult<T>` and `UpdateResult<T>`).
- Implemented `deleteRecord` and `executeSQL` abstract methods from `DBConnection`.
- Implemented `getPlaceholder(_index: number): string` returning `?` for Dameng database dialect.
- Implemented `DMDBFactory.close(): Promise<void>` and race-condition-safe lazy pool initialization with failure recovery.
- Replaced deprecated `log4js` usage with `this.logger` and `this.safeLogMeta()`.
- Aligned metadata parsing with real dmdb `dbTypeName` and added multi-result set defensive guards.
- Updated `toCamel` to preserve explicit quoted camelCase aliases while transforming default UPPER_SNAKE columns.
- Added defensive result set parsing supporting both array-of-values and object-rows, with safe `null` preservation.
- Migrated package to dual CJS/ESM compilation and comprehensive TypeScript declarations.
- Added comprehensive unit test suite with 100% typecheck validation and ESLint configuration.
