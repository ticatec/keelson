# @ticatec/logger-api

中文 | [English](README.md)

[Keelson](https://github.com/ticatec/keelson) 各包共用的日志契约。**零依赖。**

框架包只面向一个极小的 `Logger` 接口写日志；由应用决定背后到底用哪个日志库 —— 如果什么都不决定，记录就走 console。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 为什么需要它

一个库如果把日志库写死，就等于把它强加给每一个使用方。在这个包出现之前，`Logger` 是 pino 类型的别名 —— pino 事实上成了整个框架的强制依赖，而且它庞大的泛型类型渗进了每一个声明 `logger` 字段的类，代价只是为了用其中四个方法。

这个包就是那道接缝：包依赖接口，应用提供实现。

## 安装

```bash
pnpm add @ticatec/logger-api
```

它是各框架包的 **peer dependency**，在应用层安装一次即可。这一点很关键：本包持有 provider 注册表，一个进程里装两份就会有两个注册表，注入只会对其中一个生效。

## 契约

```typescript
interface LogFn {
    (obj: unknown, msg?: string, ...args: unknown[]): void;
    (msg: string, ...args: unknown[]): void;
}

interface Logger {
    trace: LogFn;
    debug: LogFn;
    info:  LogFn;
    warn:  LogFn;
    error: LogFn;
}
```

五个方法、两种调用形态，再无其他 —— 没有 `child()`、没有 transport、没有配置。更丰富的能力属于 provider 背后的日志库，不属于这个接口。

```typescript
logger.info('用户已登录');
logger.debug({ sql, paramCount }, '执行 SQL 更新');
```

## 用法

### 在库里

```typescript
import { getLogger } from '@ticatec/logger-api';
import type { Logger } from '@ticatec/logger-api';

export class OrderService {
    private readonly logger: Logger = getLogger('OrderService', 'service');

    async place(order: Order): Promise<void> {
        this.logger.debug({ orderId: order.id }, '正在下单');
    }
}
```

这就是全部接入工作。不需要初始化、不需要配置、不依赖任何日志库。

### 在应用里

启动时注入一次 provider：

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

用 pino 的话，直接使用现成的适配器 —— [`@ticatec/logger-wrapper`](../logger-wrapper) 提供了文件/控制台 appender 与分类级别：

```typescript
import { initialize } from '@ticatec/logger-wrapper';

initialize({
    appenders: [{ name: 'console', type: 'console', level: 'info' }],
    loggers: { root: { level: 'info', appenders: ['console'] } }
});
```

什么都不装，则由 console 兜底。

## 顺序无关

`getLogger()` 返回的是一层很薄的间接对象，**每次写入时**才解析当前 provider，并把解析结果缓存到 provider 变更为止。因此在构造函数里捕获的 logger —— Keelson 每个基类都是这么做的 —— 即使 provider 是之后才注入的，也依然路由正确：

```typescript
const logger = getLogger('OrderService');   // 尚无 provider → console
logger.info('early');                       // → console

setLoggerProvider(pinoProvider);
logger.info('late');                        // → pino，还是同一个 logger 对象
```

这消除了一整类启动顺序问题。惰性构造的 Bean、模块级单例、测试夹具，都不再需要关心日志是什么时候配置好的。

## 进程内只有一个注册表

provider 注册表挂在 `Symbol.for('@ticatec/logger-api.registry')` 上，而不是放在模块作用域里。

原因是本包同时提供 CommonJS 与 ESM 两套构建。一个进程可能把两者都加载进来 —— 应用 import 了 ESM 入口，而某个间接依赖 `require()` 了 CommonJS 入口 —— 这是两个模块实例、两套模块级变量。如果状态放在模块作用域，通过其中一个构建注入的 provider 对另一个就是不可见的，进程的一半会静默回落到 console。挂在全局符号上，两个实例共享同一个注册表。

以 **peer dependency** 安装则覆盖了问题的另一半：依赖树里只解析出一个版本，而不是多份不同版本的副本。

## console 兜底实现

未注入 provider 时使用。每条记录一行，按 `LOG_LEVEL` 过滤（默认 `info`，`silent` 全部静默）：

```
2026-09-18T00:22:59.446Z INFO  [service/OrderService] 应用启动
2026-09-18T00:22:59.449Z DEBUG [service/OrderService] 执行查询 {"sql":"select 1","paramCount":0}
2026-09-18T00:22:59.449Z ERROR [service/OrderService] 数据库不可达 Error: 连接超时
    at ...
```

context 是 `Error` 时打印堆栈，遇到循环引用也不会抛。它是为"开箱即用"和测试准备的合理默认值，**不是**生产日志方案 —— 生产环境请注入 provider。

## API

| 导出 | 用途 |
| --- | --- |
| `getLogger(name, category?)` | 返回某个来源的 `Logger`。`name` 通常取类名或模块名；`category` 用于分组（框架内部使用 `'db'`、`'service'`、`'repository'`、`'controller'`） |
| `setLoggerProvider(provider \| null)` | 注入进程级实现；传 `null` 恢复 console 兜底 |
| `resetLoggerProvider()` | 清除 provider，供测试使用 |
| `hasLoggerProvider()` | 是否已注入 provider |
| `createConsoleLogger(name, category?)` | console 兜底实现本身，导出以便组合或直接使用 |

### 类型

| 类型 | 形态 |
| --- | --- |
| `Logger` | 五方法契约 |
| `LogFn` | 单次日志调用 —— `(msg, ...args)` 或 `(obj, msg?, ...args)` |
| `LoggerProvider` | `(name: string, category?: string) => Logger` |
| `LogLevel` | `'trace' \| 'debug' \| 'info' \| 'warn' \| 'error' \| 'silent'` |

## 针对它做测试

契约小到可以就地伪造：

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

## 授权协议

MIT —— 详见 [LICENSE](LICENSE)。

## 作者

**Henry Feng** —— [huili.f@gmail.com](mailto:huili.f@gmail.com)
