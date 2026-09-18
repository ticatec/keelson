# @ticatec/logger-pino

[中文文档](README_CN.md) | English

[![Version](https://img.shields.io/npm/v/@ticatec/logger-pino)](https://www.npmjs.com/package/@ticatec/logger-pino)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **As of v1.0 this package is the optional pino adapter for [`@ticatec/logger-api`](../logger-api).** Keelson packages log against the contract in `logger-api`; install this one, and call `initialize()`, to route those records into pino with file/console appenders and per-category levels. Without it, records go to the console.

A complete [Pino](https://getpino.io) facade driven by a parsed configuration object. Initialise once at startup with a config that describes appenders (destinations) and named loggers (categories); then request child loggers by module name and optional category.

## 🌟 Features

- **Dual ESM / CommonJS**: ships native ES Modules and CommonJS outputs.
- **Config-driven initialisation**: a single `initialize(config)` call builds every pino logger from a typed object — no manual pino setup required.
- **Multiple appenders per logger**: each logger wires its named appenders into a `pino.multistream` (e.g. `console` + `file` + `errorFile` with independent levels).
- **Named categories**: configure `root`, `controller`, `service`, `repository`, `dao`, … and route calls via `getLogger(name, category)`.
- **Single-init guard**: calling `initialize()` twice throws. Calling `getLogger()` before init does *not* — records simply go to the console until pino is installed.
- **Installs itself as the process-wide provider**: one `initialize()` call routes every Keelson package into pino, however deep it sits in the dependency tree.

## 📦 Installation

### Host applications (the "final dish")

`pino` and [`@ticatec/logger-api`](https://github.com/ticatec/keelson/tree/main/packages/logger-api) are **peer dependencies** — the application installs them alongside this adapter, and so decides which pino 9.x it runs:

```bash
pnpm add @ticatec/logger-pino @ticatec/logger-api pino
# or npm
npm install @ticatec/logger-pino @ticatec/logger-api pino
```

### Libraries should not depend on this package

A library logs against the **contract**, not against pino:

```typescript
import { getLogger } from '@ticatec/logger-api';   // ← not @ticatec/logger-pino
```

That keeps pino out of your library's dependency graph entirely. Whether records end up in pino, in winston, or on the console is the *application's* decision, made by whichever provider it installs at startup. This package is one such provider; it belongs in the application's `dependencies`, nowhere else.

---

## 🚀 Quick Start

### 1. Configure and initialise (host application)

The wrapper takes a **parsed** configuration object — parse your YAML or JSON file however you like and pass the result to `initialize()`.

```typescript
import fs from 'fs';
import YAML from 'yaml';
import { initialize } from '@ticatec/logger-pino';

const config = YAML.parse(fs.readFileSync('./config/loggers.yaml', 'utf8'));

// Call exactly once at application boot.
initialize(config);
```

JSON works the same way:

```typescript
import { initialize } from '@ticatec/logger-pino';
initialize(JSON.parse(fs.readFileSync('./config/loggers.json', 'utf8')));
```

### 2. Use loggers anywhere

```typescript
import { getLogger } from '@ticatec/logger-api';

export class UserController {
  // Routes to the configured `controller` category (level + appenders).
  private readonly logger = getLogger('UserController', 'controller');

  async update(user: User): Promise<void> {
    this.logger.info({ userId: user.id }, 'Updating user');
  }
}

export class AppConf {
  // Omitting the category falls back to `root`.
  private readonly logger = getLogger('AppConf');
}
```

> Application code may import `getLogger` from here, but library code should import it from `@ticatec/logger-api` — same function, no pino in your dependency graph.

---

## 📄 Configuration Schema

The configuration object has two top-level keys: `appenders` (destinations) and `loggers` (categories).

```yaml
# Appender definitions — output destinations.
appenders:
  - name: console
    type: console
    level: info
    options:
      pretty: true           # acknowledged; not yet implemented (raw JSON to stdout)

  - name: file
    type: file
    level: trace
    options:
      filename: logs/app.log
      sync: false            # async writes (default)

  - name: errorFile
    type: file
    level: error
    options:
      filename: logs/error.log
      sync: false

# Logger definitions — each named category.
loggers:
  root:
    level: info
    appenders: [console, file, errorFile]

  controller:
    level: debug
    appenders: [console, file]   # independent from root — no errorFile

  service:
    level: debug
    appenders: [console, file]

  repository:
    level: info
    appenders: [console, file]

  dao:
    level: info
    appenders: [console, file]
```

### Fields

**`appenders[i]`**

| Field     | Type                          | Required | Notes |
|-----------|-------------------------------|----------|-------|
| `name`    | string                        | yes      | Referenced by `loggers.*.appenders`. |
| `type`    | `'console'` \| `'file'`       | yes      | |
| `level`   | string                        | no       | Min level emitted by this appender. Defaults to `'info'`. |
| `options` | object                        | no       | Type-specific options (see below). |

**Appender options**

| Type      | Option     | Default | Notes |
|-----------|------------|---------|-------|
| `console` | `pretty`   | `false` | Acknowledged but not yet implemented — emits raw JSON. |
| `file`    | `filename` | —       | **Required.** Path to the log file. |
| `file`    | `sync`     | `false` | `true` writes synchronously (slower); `false` uses async SonicBoom. |

**`loggers[name]`**

| Field      | Type     | Required | Notes |
|------------|----------|----------|-------|
| `level`    | string   | yes      | Min level emitted by this logger. |
| `appenders`| string[] | yes      | Names referencing `appenders[i].name`. Must be non-empty. |

A `root` entry is required. Any other key becomes a named category accessible via `getLogger(name, '<key>')`.

---

## 🔌 API Reference

### `initialize(config: LoggingConfig): void`

Validates the config, builds one pino multistream logger per entry, installs `root` as the root logger and every other entry as a category logger — then registers this adapter as the process-wide provider via `setLoggerProvider()`. From that point every Keelson package's records flow into pino. Throws on a second call or on invalid config.

### `getLogger(name: string, category?: string): Logger`

Re-exported from `@ticatec/logger-api`, and identical to importing it from there. Returns a `Logger` — the five-method contract — that resolves the active provider on every write. Before `initialize()` it writes to the console; after, to pino.

Because resolution is per-write, a logger captured in a constructor still switches over when `initialize()` runs later. Startup ordering does not matter.

### `getPinoLogger(name: string, category?: string): PinoLogger`

The escape hatch. Returns the raw pino child logger bound to `{ module: name }`, with pino specifics — `level`, `child()`, `bindings()` — intact. Reach for it only when you genuinely need them, and accept the coupling.

- If `category` matches a configured logger, the child's parent is that category logger (its level + appender set); otherwise the parent is `root`.
- Cache key is `${category ?? ''}::${name}`, so the same name under different categories returns distinct loggers.
- **Throws if `initialize()` has not been called** — unlike `getLogger()`, there is no console fallback for a pino-typed return.

### `resetForTest(): void`

Clears all adapter state and removes the provider from `@ticatec/logger-api`. Intended for unit-test `beforeEach` blocks.

### Types

`LoggingConfig`, `LoggerEntry`, `AppenderConfig`, `AppenderOptions`, `AppenderType` are all exported for typing your own config loaders.

---

## 💡 How one `initialize()` reaches every package

Libraries never import this package. They call `getLogger()` from `@ticatec/logger-api`, which looks up whichever provider is currently installed.

`initialize()` installs this adapter as that provider. The registry it writes to is anchored on `Symbol.for('@ticatec/logger-api.registry')`, so it is shared across the CommonJS and ESM builds of `logger-api` alike, and `logger-api` being a peer dependency keeps a single version resolved in the tree. One call at startup, and every `@ticatec/*` package in the process — however deeply nested — starts writing to pino.

Nothing here relies on Node's module-walk resolution, and libraries need no dependency on pino at all.

---

## 📄 License

MIT © [Henry Feng](https://github.com/ticatec)
