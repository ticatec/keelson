# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-09-18

Renamed from `@ticatec/logger-wrapper` and repositioned as the pino **adapter** for `@ticatec/logger-api`, rather than the framework's logging solution.

> `@ticatec/logger-wrapper` is deprecated. Replace it with `@ticatec/logger-pino` and read the breaking changes below — the package no longer exports pino's type, and libraries should no longer depend on it at all.

### ⚠️ Breaking Changes

- **Renamed.** `@ticatec/logger-wrapper` → `@ticatec/logger-pino`. The old name conveyed neither that the package belongs to the `logger-api` ecosystem nor that it is pino-specific, and left no sensible name for a second adapter.
- **`Logger` is no longer an alias for pino's type.** It is now re-exported from `@ticatec/logger-api` — five level methods, nothing else. Code that reached for pino specifics through this type (`level`, `child()`, `bindings()`) must use the new `getPinoLogger()` instead. pino's own type is still exported, as `PinoLogger`.
- **`getLogger()` no longer throws before `initialize()`.** It is re-exported from `@ticatec/logger-api` and resolves the active provider on every write, so records go to the console until pino is installed. The auto-fallback initialisation that used to happen inside `getLogger()` is gone with it.
- **Libraries should no longer depend on this package.** They depend on `@ticatec/logger-api` and log against the contract; this adapter belongs in the application's `dependencies`. The previous model — libraries declaring it in `devDependencies` and relying on Node's module-walk to find the host's copy — is obsolete.
- **`@ticatec/logger-api` is now a peer dependency** (`>=1.0.0`).

### 🚀 New Features

- **`getPinoLogger(name, category?)`** — the escape hatch, returning the raw pino child logger with `level`, `child()` and `bindings()` intact. Throws if `initialize()` has not run.
- **`initialize()` installs the process-wide provider.** One call at startup routes every `@ticatec/*` package into pino, however deeply nested, without any of them importing pino or this package.
- **Ordering no longer matters.** A logger captured in a constructor — which every Keelson base class does — switches over to pino when `initialize()` runs later.

### 🐛 Bug Fixes

- **Appender destinations are built once and shared.** They were constructed per logger entry, so a config where `root`, `controller` and `service` all name the same file appender opened that file three times — three independent `sonic-boom` buffers writing to one path, which wastes descriptors and interleaves lines under load. Verified: `pino.destination` is now called once per appender regardless of how many loggers reference it.
- **`category` now reaches the log payload.** It selected the parent logger (level and appenders) but was never bound onto the child, so records carried only `module` and downstream systems could not aggregate on `category`. Child bindings are now `{ module, category }` when a category is given.
- **Adapter state moved to `Symbol.for('@ticatec/logger-pino.state')`.** `initialize()` through the ESM build left the CommonJS build believing it was uninitialised, so `getPinoLogger()` there threw. `@ticatec/logger-api` already guarded its registry this way; this package now does the same.
- **Invalid levels fail at validation.** `validateConfig` only checked that `level` was a string, so a typo such as `'warning'` or `'inf'` passed and surfaced later as an opaque error from inside pino. Levels are now checked against pino's set.
- **Removed dead `isFallbackInitialized`** — a leftover from the auto-fallback behaviour that moved to `@ticatec/logger-api`; it was read in three places but never set to `true`.
- **Error messages say `logger-pino`**, not `LoggerWrapper`.

### 🔧 Tooling

- `engines.node` raised to `>=18.0.0`, matching pino 9's own requirement (it said `>=16.0.0`).
- TypeScript `strict: true` and `target: es2022` across the source and both build configurations, aligning with `@ticatec/logger-api`.
- Added `lint` and `prebuild` scripts with the shared ESLint configuration.

- **`resetForTest()` now also removes the provider** from `@ticatec/logger-api`, so a test that initialises the adapter cannot leak pino into an unrelated suite.
