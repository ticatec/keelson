# @ticatec/logger-api

[中文文档](README_CN.md) | English

The logging contract shared by every [Keelson](https://github.com/ticatec/keelson) package. **Zero dependencies.**

Framework packages log against a minimal `Logger` interface. Your application decides which logging library actually backs it — and if it decides nothing, records go to the console.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Why

A library that hard-wires a logging library imposes it on every consumer. Before this package, `Logger` was an alias for pino's type, so pino was effectively mandatory across the whole framework — and its full generic surface leaked into every class that declared a `logger` field, for the sake of four methods.

This package is the seam. Packages depend on the interface; applications supply the implementation.

## Installation

```bash
pnpm add @ticatec/logger-api
```

It is a **peer dependency** of the framework packages, so install it once at the application level. That matters: the package holds the provider registry, and two copies in one process would mean two registries and an injection that only takes effect in one of them.

## The contract

```typescript
interface LogFn {
    (msg: string, ...args: unknown[]): void;
    (obj: unknown, msg?: string, ...args: unknown[]): void;
}

interface Logger {
    trace: LogFn;
    debug: LogFn;
    info:  LogFn;
    warn:  LogFn;
    error: LogFn;
}
```

> The string overload is declared first on purpose. `obj: unknown` also accepts a string, so the other order would shadow it and make an editor suggest `obj: unknown` for the common `logger.info('...')` call.

Five methods, two call shapes, nothing else — no `child()`, no transports, no configuration. Anything richer belongs to the logging library behind the provider.

```typescript
logger.info('user logged in');
logger.debug({ sql, paramCount }, 'Executing SQL update');
```

## Usage

### In a library

```typescript
import { getLogger } from '@ticatec/logger-api';
import type { Logger } from '@ticatec/logger-api';

export class OrderService {
    private readonly logger: Logger = getLogger('OrderService', 'service');

    async place(order: Order): Promise<void> {
        this.logger.debug({ orderId: order.id }, 'placing order');
    }
}
```

That is the whole integration. No initialisation, no configuration, no dependency on a logging library.

### In an application

Install a provider once at startup:

```typescript
import { setLoggerProvider } from '@ticatec/logger-api';
import winston from 'winston';

const root = winston.createLogger({ /* … */ });

setLoggerProvider((name, category) => {
    const child = root.child({ module: name, category });
    return {
        trace: (...a: any[]) => child.silly(...a),
        debug: (...a: any[]) => child.debug(...a),
        info:  (...a: any[]) => child.info(...a),
        warn:  (...a: any[]) => child.warn(...a),
        error: (...a: any[]) => child.error(...a)
    };
});
```

For pino, use the ready-made adapter instead — [`@ticatec/logger-wrapper`](https://github.com/ticatec/keelson/tree/main/packages/logger-wrapper) ships one, with file/console appenders and per-category levels:

```typescript
import { initialize } from '@ticatec/logger-wrapper';

initialize({
    appenders: [{ name: 'console', type: 'console', level: 'info' }],
    loggers: { root: { level: 'info', appenders: ['console'] } }
});
```

Install nothing, and the console fallback handles it.

## Ordering does not matter

`getLogger()` returns a thin indirection that resolves the active provider **on every write**, caching the underlying logger until the provider changes. So a logger captured in a constructor — the pattern every Keelson base class uses — still routes correctly if the provider is installed later:

```typescript
const logger = getLogger('OrderService');   // no provider yet → console
logger.info('early');                       // → console

setLoggerProvider(pinoProvider);
logger.info('late');                        // → pino, same logger object
```

This removes a whole class of startup-ordering bugs. Lazily constructed beans, module-level singletons and test harnesses all stop caring when logging was configured.

## One registry per process

The provider registry is anchored on `Symbol.for('@ticatec/logger-api.registry')` rather than held in module scope.

That matters because this package ships both a CommonJS and an ESM build. A process can end up loading both — an application importing the ESM entry while some transitive dependency `require()`s the CommonJS one — and those are two module instances with two sets of module-scoped variables. With state in module scope, a provider installed through one build would be invisible to the other, and half the process would silently fall back to the console. The global symbol gives both instances the same registry.

Installing it as a **peer dependency** covers the other half of the problem: one resolved version in the tree, rather than several copies at different versions.

## The console fallback

Used whenever no provider is installed. One line per record, filtered by `LOG_LEVEL` (default `info`, `silent` suppresses everything):

```
2026-09-18T00:22:59.446Z INFO  [service/OrderService] application started
2026-09-18T00:22:59.449Z DEBUG [service/OrderService] executing query {"sql":"select 1","paramCount":0}
2026-09-18T00:22:59.449Z ERROR [service/OrderService] database unreachable Error: connection timed out
    at ...
```

It handles `Error` context objects by printing the stack, and survives circular references. It is a sensible default for getting started and for tests — not a production logging solution. Install a provider for that.

## API

| Export | Purpose |
| --- | --- |
| `getLogger(name, category?)` | Returns a `Logger` for a source. `name` is usually the class or module name; `category` groups related loggers (the framework uses `'db'`, `'service'`, `'repository'`, `'controller'`) |
| `setLoggerProvider(provider \| null)` | Installs the process-wide implementation. `null` restores the console fallback |
| `resetLoggerProvider()` | Clears the provider. Intended for tests |
| `hasLoggerProvider()` | Whether a provider is installed |
| `createConsoleLogger(name, category?)` | The console fallback, exported so it can be composed or used directly |

### Types

| Type | Shape |
| --- | --- |
| `Logger` | The five-method contract |
| `LogFn` | One logging call — `(msg, ...args)` or `(obj, msg?, ...args)` |
| `LoggerProvider` | `(name: string, category?: string) => Logger` |
| `LogLevel` | `'trace' \| 'debug' \| 'info' \| 'warn' \| 'error' \| 'silent'` |

## Testing against it

The contract is small enough to fake inline:

```typescript
import { setLoggerProvider, resetLoggerProvider } from '@ticatec/logger-api';

const records: unknown[][] = [];
beforeEach(() => {
    resetLoggerProvider();
    setLoggerProvider(() => {
        const noop = () => {};
        return { trace: noop, debug: noop, info: noop, warn: noop,
                 error: (...a: unknown[]) => { records.push(a); } };
    });
});
```

## License

MIT — see [LICENSE](LICENSE).

## Author

**Henry Feng** — [huili.f@gmail.com](mailto:huili.f@gmail.com)
