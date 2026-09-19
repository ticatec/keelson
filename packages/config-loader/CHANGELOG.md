# Changelog

All notable changes to `@ticatec/config-loader` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-09-19

### Added

- **`close()` on every loader.** `NacosConfigClient` keeps heartbeats and a cluster
  process running, so a process that had read its configuration could not exit.
  `BaseLoader.close()` is a no-op by default, `NacosConfigLoader` overrides it, and
  `loadConfig()` calls it in a `finally` - configuration is read once at startup, so
  the connection should not outlive the read.
- **A configurable local configuration directory.** `LocalFileLoader` hardcoded
  `process.cwd()/config`. It now takes an optional root, falling back to
  `CONFIG_DIR` and then to the old default - Kubernetes mounts a ConfigMap wherever
  it likes, and a monorepo may share one directory across packages. Path-traversal
  protection applies to whichever root is in effect.
- **`LocalFileLoader` is exported from the package entry point.** It needs no
  optional peer, so there is no reason to make callers go through `getLoader`.
  `ConsulLoader` and `NacosConfigLoader` stay behind `getLoader`'s dynamic import,
  so their optional peers are only required when that source is actually used.
- **Read failures carry context.** A failure inside `loadFile` (missing file,
  permissions, an unreachable KV store) propagated raw, so the caller saw a bare
  `ENOENT` with no indication of which file or which source. It is now wrapped as
  `Failed to read configuration '<file>' via <Loader>: <reason>`, with the original
  error attached as `cause`.
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

- 28 new tests (63 -> 91), including one asserting that neither a config value nor
  `CONSUL_TOKEN` can reach the log, and a regression test for each item above.
- `lint` script and an `.eslintrc.json`. Without them the monorepo's `pnpm verify`
  never linted this package.
- `CHANGELOG.md`.

### Fixed

- **A unit test started a real Nacos client and hung the test run.** The logging
  suite constructed `NacosConfigLoader` without mocking `nacos`, so
  `NacosConfigClient` started heartbeats, long-polling and a cluster child process
  against `127.0.0.1:8848`. After the run those kept calling `require`, producing
  `You are trying to import a file after the Jest environment has been torn down`,
  and Jest never exited - the run had to be killed. `nacos` and `consul` are now
  mocked there, and `close()` (below) gives the loader a way to release the client.
- **A path assertion in the same suite failed on macOS.** `os.tmpdir()` returns
  `/var/...`, a symlink to `/private/var/...`, and `process.cwd()` reports the
  resolved path - which is what `LocalFileLoader` uses. The test now canonicalises
  the temporary directory with `fs.realpathSync`.
- **The documented deep-import paths could not work.** Both READMEs showed
  `await import('@ticatec/config-loader/dist/lib/nacos/NacosConfigLoader')`. There
  is no `dist/` directory (the builds are `lib/cjs` and `lib/esm`), and the
  `exports` map publishes only the entry point, so any such path fails with
  `ERR_PACKAGE_PATH_NOT_EXPORTED`. The examples now use the supported API, and the
  note explains why there are no deep paths.
- **`loadConfig`'s post-processor only ever reached the logger file** while the
  README's own Quick Start implied it transformed the application config. A fifth
  parameter, `appPostLoader`, now covers the application file; the four-argument
  form behaves exactly as before.

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

- Copyright holder in `LICENSE` is **Ticatec** across every package in the monorepo. It
  had been split between `Henry Feng` and `Ticatec` (and one lowercase `ticatec`). Each
  file keeps its own year, which is the year that package was first published, not the
  year of this edit. The npm `author` field still names Henry Feng with his email - the
  author of the code and the holder of the copyright are two different fields, and only
  the second one was ambiguous.

- The npm `author` field gained the `url` the other packages already carried
  (`github.com/ticatec`).

- `engines.node` raised from `>=16.0.0` to `>=18.0.0`, matching the other packages.
- `publish-public` renamed to `publish:public`; the unused `dev` script removed.
- `jest.config.js` pins `module: commonjs` for ts-jest. With `tsconfig.json` now on
  `NodeNext`, ts-jest emitted native dynamic `import()`, which Jest's CommonJS
  runtime cannot execute without `--experimental-vm-modules`.

## [1.0.0]

- Earlier releases are not documented here.
