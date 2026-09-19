# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-09-19

### Renamed

This package was `@ticatec/dm-common-library`. It is now **`@ticatec/keelson-dm`**, and the
version restarts at 1.0.0 because a new name on npm is a new package with its own
publish history. The last release under the old name was
`@ticatec/dm-common-library@1.0.2`; the work that had accumulated
locally as 4.0.0 ships here as 1.0.0.

To migrate, change the dependency and the import specifier - nothing else:

```diff
-"@ticatec/dm-common-library": "^1.0.2"
+"@ticatec/keelson-dm": "^1.0.0"
```

```diff
-import { ... } from '@ticatec/dm-common-library';
+import { ... } from '@ticatec/keelson-dm';
```

Every export keeps its name and signature. The old package will be deprecated on
npm with a pointer here.

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

### Changed
- Aligned with `@ticatec/keelson-core@3.3.0`.
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
