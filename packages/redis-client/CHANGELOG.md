# Changelog

All notable changes to `@ticatec/redis-client` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-09-19

### Fixed

- **A dropped subscription connection took the process down.** `createSubClient`
  derives the subscriber with `duplicate()`, which clones the connection options
  but never the listeners - so the subscriber had a `message` handler and no
  `error` handler. A Node `EventEmitter` with no `'error'` listener throws
  `Unhandled 'error' event` and terminates the process, and a server reload, a
  network blip or an evicted subscription all raise one. The subscriber now has
  its own error listener that logs instead.

- **The singleton registry split between the CommonJS and ESM builds.**
  `RedisClient.instances` and `CachedDataManager.instance` were class statics, so
  a process that called `init()` through `import` and `getInstance()` through
  `require()` got two separate registries - the second threw "has not been
  initialized", and the cache manager became two independent pools. Both are now
  anchored to `globalThis` under `Symbol.for('@ticatec/redis-client.instances')`
  and `Symbol.for('@ticatec/redis-client.cached-data-manager')`, matching the
  other packages in the monorepo.

- **`getOrSet` could not read back its own writes.** It stored through `set()`,
  which serialises objects but stores a string verbatim, and read through
  `getObject()`, which always `JSON.parse`s. So a cached `'active'` never parsed:
  every call was a miss that re-ran `fetchFn`. Worse, a string that happens to be
  a JSON literal came back as a different type - a cached `'123'` was returned as
  the number `123` on the second call. `getOrSet` now writes through a new
  `setObject()`, symmetric with `getObject()`. `AbstractCachedData.save()` had the
  same asymmetry against its own `load()` and was changed with it. `set()` and
  `get()` keep their existing behaviour.

- **A closed client stayed in the registry.** After `close()`, `getInstance(name)`
  kept handing out the dead client and `init(conf, name)` returned it rather than
  reconnecting, so every subsequent command failed while the caller believed it
  had a fresh connection. `close()` now unregisters the instance, `init()` replaces
  a closed one, and `closeInstance(name)` does both in a step. `subscribe()` on a
  closed client throws instead of deriving a subscriber that `close()` would never
  clean up, and `close()` now tears the subscriber down before the main
  connection, so a failing `quit()` cannot leak it.

- **`hsetnx` discarded the Redis answer.** `HSETNX` returns 1 or 0 and is normally
  used as a lightweight lock or an idempotency marker; the wrapper returned
  `Promise<void>`, leaving the caller no way to know whether it won. It now returns
  `Promise<boolean>`.

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

- **Connection URLs.** `create()` and `init()` accept a `redis://` / `rediss://`
  string as well as a `RedisOptions` object, which is what `REDIS_URL` holds in
  most container and PaaS setups. Credentials embedded in the URL are redacted in
  the log the same way as those in an options object, and a string that is not a
  redis URL is reported as `{ connection: 'url', parsed: false }` rather than
  having its contents echoed.
- `CachedDataConstructor` accepts an abstract constructor, so an abstract base
  class can be used as the registration token for a concrete implementation - the
  common pattern, which previously failed to compile.
- `MessageHandler`, `RedisConnection`, `GetKey` and `CachedDataConstructor` are
  exported as types.
- `init()` warns when it is called a second time for a name that already exists.
  The new `conf` was silently discarded while the caller had every reason to think
  the connection had been reconfigured.
- `CachedDataManager.register()` warns when a class is registered twice. The
  previous instance was silently replaced, leaving both registrants believing
  theirs was live.
- `getOrSet` logs a cache miss and an in-flight join at `debug`, by key. Cache
  stampede protection is one of this package's jobs; until now there was no way to
  see it working.
- 36 new tests (14 -> 50), including a regression test for each item above.
- `lint` script and an `.eslintrc.json`. Without them the monorepo's `pnpm verify`
  never linted this package.
- `CHANGELOG.md`.

### Changed

- Copyright holder in `LICENSE` is **Ticatec** across every package in the monorepo. It
  had been split between `Henry Feng` and `Ticatec` (and one lowercase `ticatec`). Each
  file keeps its own year, which is the year that package was first published, not the
  year of this edit. The npm `author` field still names Henry Feng with his email - the
  author of the code and the holder of the copyright are two different fields, and only
  the second one was ambiguous.

- The npm `author` field gained the `url` the other packages already carried
  (`github.com/ticatec`).

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

- **`ioredis-mock` is no longer a runtime dependency.** It is 7.2 MB and depends on
  `fengari`, a Lua VM written in JavaScript, to emulate Redis' `EVAL` - and it was a
  static top-level import in `dependencies`, so every production install downloaded
  it, shipped it, and loaded it into memory. Measured on `require()` of the package
  with no mock ever used: 108 modules and 271 ms before, 62 modules and 171 ms after;
  41 of those modules were the mock and its Lua VM. It is now a dev dependency,
  resolved at call time from the **application's** working directory - so the mock
  belongs to whoever writes the tests. A production install that reaches
  `create(null)` gets an explanatory error instead of a silently working fake.
  Applications using the mock add it to their own devDependencies:
  `pnpm add -D ioredis-mock`.
- The `pino` dev dependency. Nothing imported it.

## [1.1.0]

- Earlier releases are not documented here.
