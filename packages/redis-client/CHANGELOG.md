# Changelog

All notable changes to `@ticatec/redis-client` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-09-19

### Security

- **The Redis password was written into the log.** The constructor logged the
  whole `RedisOptions` object at `debug` level, and that object carries
  `password`, `username`, `sentinelPassword` and TLS key material - so enabling
  debug logging in production copied the Redis credentials into the log store.
  The connection record is now built from an allow-list of safe fields (host,
  port, db, whether TLS and auth are configured, sentinel count, sentinel master
  name), so a future `ioredis` option cannot leak by default either.

- **Cached values were written into the log.** `getObject` and `lrangeObject`
  logged the raw payload whenever an entry failed to parse as JSON. A cache holds
  user records, tokens and sessions; that record copied them into the log store.
  Both now log the key, the index where applicable, and the byte length - never
  the content.

### Added

- `init()` warns when it is called a second time for a name that already exists.
  The new `conf` was silently discarded while the caller had every reason to think
  the connection had been reconfigured.
- `CachedDataManager.register()` warns when a class is registered twice. The
  previous instance was silently replaced, leaving both registrants believing
  theirs was live.
- `getOrSet` logs a cache miss and an in-flight join at `debug`, by key. Cache
  stampede protection is one of this package's jobs; until now there was no way to
  see it working.
- 10 new tests (14 -> 24), including a regression test for each item above.
- `lint` script and an `.eslintrc.json`. Without them the monorepo's `pnpm verify`
  never linted this package.
- `CHANGELOG.md`.

### Changed

- `strict` and `isolatedModules` are enabled, the target moved from `es2020` to
  `es2022`, and `tsconfig.cjs.json` / `tsconfig.esm.json` now extend
  `tsconfig.json`. They were standalone, so `strict` never applied to the build.
  The `lib` key had also been sitting outside `compilerOptions`, where TypeScript
  ignores it.
- `types` points at `lib/cjs/index.d.ts`, matching `main`. It previously pointed
  at the ESM declarations while `main` resolved to the CommonJS build.
- `engines.node` raised from `>=16.0.0` to `>=18.0.0`, matching the other packages.
- `publish-public` renamed to `publish:public`, matching the other packages.
- The description and keywords no longer claim Pino integration - logging goes
  through the `@ticatec/logger-api` contract, and Pino is one possible provider.
- README install instructions corrected: the peer dependencies are `ioredis` and
  `@ticatec/logger-api`. They previously told readers to install
  `@ticatec/logger-pino` and `pino`, neither of which this package requires.

### Removed

- The `pino` dev dependency. Nothing imported it.

## [1.1.0]

- Earlier releases are not documented here.
