# @ticatec/logger-wrapper

[中文文档](README_CN.md) | English

[![Version](https://img.shields.io/npm/v/@ticatec/logger-wrapper)](https://www.npmjs.com/package/@ticatec/logger-wrapper)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **As of v1.0 this package is the optional pino adapter for [`@ticatec/logger-api`](../logger-api).** Keelson packages log against the contract in `logger-api`; install this one, and call `initialize()`, to route those records into pino with file/console appenders and per-category levels. Without it, records go to the console.

A complete [Pino](https://getpino.io) facade driven by a parsed configuration object. Initialise once at startup with a config that describes appenders (destinations) and named loggers (categories); then request child loggers by module name and optional category.

## 🌟 Features

- **Dual ESM / CommonJS**: ships native ES Modules and CommonJS outputs.
- **Config-driven initialisation**: a single `initialize(config)` call builds every pino logger from a typed object — no manual pino setup required.
- **Multiple appenders per logger**: each logger wires its named appenders into a `pino.multistream` (e.g. `console` + `file` + `errorFile` with independent levels).
- **Named categories**: configure `root`, `controller`, `service`, `repository`, `dao`, … and route calls via `getLogger(name, category)`.
- **Strict single-init guard**: calling `initialize()` twice or `getLogger()` before init throws immediately.
- **Process-wide singleton**: designed to live under `peerDependencies` so every library in the same process shares one physical instance.

## 📦 Installation

### Host applications (the "final dish")

Install once — `pino` is bundled as a regular `dependency` of the wrapper, so it comes along automatically:

```bash
pnpm add @ticatec/logger-wrapper
# or npm
npm install @ticatec/logger-wrapper
```

### Sub-libraries / component libraries

Declare `@ticatec/logger-wrapper` in **`devDependencies`** only. No `peerDependencies` entry, no `pino` declaration — your library resolves the wrapper at runtime via Node's module-walk from the host application's top-level `node_modules`.

```json
{
  "devDependencies": {
    "@ticatec/logger-wrapper": "^0.3.0"
  }
}
```

The contract is simple: any application that consumes your library must install `@ticatec/logger-wrapper` itself. The host's single install provides the wrapper (and transitively, `pino`) to every nested `@ticatec/*` library in the dependency tree.

---

## 🚀 Quick Start

### 1. Configure and initialise (host application)

The wrapper takes a **parsed** configuration object — parse your YAML or JSON file however you like and pass the result to `initialize()`.

```typescript
import fs from 'fs';
import YAML from 'yaml';
import { initialize } from '@ticatec/logger-wrapper';

const config = YAML.parse(fs.readFileSync('./config/loggers.yaml', 'utf8'));

// Call exactly once at application boot.
initialize(config);
```

JSON works the same way:

```typescript
import { initialize } from '@ticatec/logger-wrapper';
initialize(JSON.parse(fs.readFileSync('./config/loggers.json', 'utf8')));
```

### 2. Use loggers anywhere

```typescript
import { getLogger } from '@ticatec/logger-wrapper';

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

Validates the config, builds one pino multistream logger per entry, installs `root` as the singleton root, and registers every other entry as a category logger. Throws on a second call or on invalid config.

### `getLogger(name: string, category?: string): Logger`

Returns a cached pino child logger bound to `{ module: name }`.

- If `category` is provided and matches a configured logger, the child's parent is that category logger (its level + appender set).
- Otherwise the parent is `root`.

Cache key is `${category ?? ''}::${name}`, so the same name with different categories returns distinct loggers.

### `resetForTest(): void`

Clears all singleton state. Intended for unit-test `beforeEach` blocks.

### Types

`LoggingConfig`, `LoggerEntry`, `AppenderConfig`, `AppenderOptions`, `AppenderType` are all exported for typing your own config loaders.

---

## 💡 Singleton resolution via Node module walk

Node.js resolves bare specifiers (like `@ticatec/logger-wrapper`) by walking up the directory tree from the importing file until it finds a matching `node_modules` entry. So when:

1. The host application declares `@ticatec/logger-wrapper` as a regular `dependency`, and
2. An intermediate library (e.g. `@ticatec/common-express-server`) imports it without declaring it as a dependency,

…every `import '@ticatec/logger-wrapper'` from inside `node_modules/@ticatec/common-express-server/` walks up to `<app>/node_modules/@ticatec/logger-wrapper/` — the same physical instance the host app initialised. One process, one singleton, no `peerDependencies` plumbing required.

This is why intermediate libraries only need a `devDependencies` entry (for their own local development), and why the wrapper bundles `pino` as a regular `dependency`: the host's single install provides everything.

---

## 📄 License

MIT © [Henry Feng](https://github.com/ticatec)
