# Changelog

All notable changes to `@ticatec/config-loader` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-09-19

### Added

- **Logging through `@ticatec/logger-api`.** Configuration loading was entirely
  silent: which source was chosen, which files were read, how includes resolved,
  and whether a source came back empty were all invisible. Records now cover the
  loader selection, the resolved local directory, the Consul / Nacos target, each
  `load()` with its elapsed time, each include as it resolves, and `warn` for an
  empty source, a missing Consul key or Nacos data ID, and a path that escapes the
  configuration directory.

  **Configuration values are never logged.** A config file is exactly where
  database passwords and API keys live - this repository's own sample
  `config/db.yaml` has a `password:` line. Records carry file names, the include
  graph, key *counts* and timings, never parsed content, and `CONSUL_TOKEN` is
  reported only as `authenticated: true`.

  One summary is written per `load()` call plus one trace per include, rather than
  one summary per file, which would make a deep include tree unreadable.

  This package runs before the logger is configured - it is what produces
  `loggerConf` - so its first records fall back to the console, filtered by
  `LOG_LEVEL`. The logger proxy picks up the real provider once one is registered.

- 11 new tests (63 -> 74), including one asserting that neither a config value nor
  `CONSUL_TOKEN` can reach the log.
- `lint` script and an `.eslintrc.json`. Without them the monorepo's `pnpm verify`
  never linted this package.
- `CHANGELOG.md`.

### Fixed

- **`typecheck` was checking a configuration the build never used.** The script was
  a bare `tsc --noEmit`, which picks up `tsconfig.json` - and that file targeted
  `es2017`, emitted to `dist`, and had no `include`, while the build runs from
  `tsconfig.cjs.json` / `tsconfig.esm.json` targeting `es2020`. Those two now
  extend a shared base and `typecheck` runs both, so what is checked is what ships.
- **`strict` was off everywhere.** It is now on, together with `isolatedModules`,
  `declarationMap` and `skipLibCheck`; the target moved to `es2022`. The `lib` key
  had been sitting outside `compilerOptions` in all three files, where TypeScript
  ignores it.
- **`getLoader` declared `let` bindings directly inside `switch` cases**, so all
  three shared the one switch block scope - a `no-case-declarations` violation and
  a temporal-dead-zone hazard between cases. Each case now has its own block.
- `ConsulLoader.loadFile` declared `Promise<string>` while returning `null` or
  `undefined` for a missing key. It now checks explicitly and warns.
- `types` points at `lib/cjs/index.d.ts`, matching `main`. It previously pointed at
  the ESM declarations while `main` resolved to the CommonJS build.
- `PostLoader` and `ConfigMode` are exported with `export type`. Exporting a type
  alias in the value list breaks transpile-only toolchains.
- README install instructions now name the actual peers (`@ticatec/logger-api`,
  plus `consul` or `nacos` only when that source is used), and the repository links
  point at the Keelson monorepo instead of the retired standalone repo.

### Changed

- `engines.node` raised from `>=16.0.0` to `>=18.0.0`, matching the other packages.
- `publish-public` renamed to `publish:public`; the unused `dev` script removed.
- `jest.config.js` pins `module: commonjs` for ts-jest. With `tsconfig.json` now on
  `NodeNext`, ts-jest emitted native dynamic `import()`, which Jest's CommonJS
  runtime cannot execute without `--experimental-vm-modules`.

## [1.0.0]

- Earlier releases are not documented here.
