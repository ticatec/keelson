# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-09-18

Initial release. Extracted from `@ticatec/logger-pino` so that Keelson packages depend on a logging *contract* rather than on pino.

### 🚀 Features

- **`Logger` contract** — five level methods (`trace`, `debug`, `info`, `warn`, `error`), each accepting both `(msg, ...args)` and `(obj, msg?, ...args)`. No `child()`, no transports, no configuration.
- **`setLoggerProvider(provider)`** — installs the process-wide logging implementation. Any library can be adapted in a few lines; `@ticatec/logger-pino` ships a pino adapter.
- **Lazy resolution.** `getLogger()` resolves the active provider on every write, caching the underlying logger until the provider changes. A logger captured in a constructor therefore still routes correctly when the provider is installed later — which removes the startup-ordering constraint the framework previously had.
- **Console fallback.** With no provider installed, records go to the console, one line per record, filtered by `LOG_LEVEL` (default `info`). Handles `Error` context objects and circular references.
- **One registry per process.** The provider registry is anchored on `Symbol.for('@ticatec/logger-api.registry')`, so the CommonJS and ESM builds of this package share it. Module-scoped state would have given each build its own registry — the dual package hazard — and a provider installed through one would have been invisible to the other.
- **Strict TypeScript** across the source and both build configurations.
- **Zero dependencies**, dual CJS/ESM build with per-condition type declarations (`import` resolves the ESM `.d.ts`, `require` the CJS one).
