# @ticatec/logger-pino

[中文文档](README_CN.md) | English

[![Version](https://img.shields.io/npm/v/@ticatec/logger-pino)](https://www.npmjs.com/package/@ticatec/logger-pino)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[Pino](https://getpino.io) 的完整封装，由解析后的配置对象驱动。在启动时调用一次 `initialize(config)` —— 配置中描述了 appender（输出目的地）与命名 logger（分类），随后通过模块名和可选的分类来获取 child logger。

## 🌟 特性

> **自 v1.0 起，本包是 [`@ticatec/logger-api`](../logger-api) 的可选 pino 适配器。** Keelson 各包面向 `logger-api` 的契约写日志；装上本包并调用 `initialize()`，即可把这些记录接入 pino，获得文件/控制台 appender 与分类级别。不装则走 console。

- **同时支持 ESM 与 CommonJS**：原生支持 ES Modules 和 CommonJS 产物。
- **配置驱动初始化**：一次 `initialize(config)` 调用即可根据类型化对象构建出所有 pino logger，无需手动设置 pino。
- **每个 logger 支持多 appender**：每个 logger 通过 `pino.multistream` 串联自己声明的 appender（例如 `console` + `file` + `errorFile`，各自独立级别）。
- **命名分类**：可配置 `root`、`controller`、`service`、`repository`、`dao` 等，通过 `getLogger(name, category)` 路由调用。分类同时会写入日志记录，便于下游按它聚合。
- **每个 appender 一条流**：appender 只构建一次并被共享，因此多个 logger 引用同一个 `file` appender 时，走的是同一个文件句柄和同一个缓冲区，而不是每个 logger 各开一份。
- **单次初始化拦截**：二次调用 `initialize()` 会抛错；但初始化前调用 `getLogger()` **不会** —— 在 pino 装上之前，记录直接走 console。
- **自注册为进程级 provider**：一次 `initialize()` 即可把所有 Keelson 包接入 pino，无论它们在依赖树里嵌套多深。

## 📦 安装

### 终端业务应用（"最终的菜"）

`pino` 与 [`@ticatec/logger-api`](https://github.com/ticatec/keelson/tree/main/packages/logger-api) 都是 **peer dependency** —— 由应用与本适配器一同安装，因此 pino 9.x 的具体版本由应用决定：

```bash
pnpm add @ticatec/logger-pino @ticatec/logger-api pino
# 或 npm
npm install @ticatec/logger-pino @ticatec/logger-api pino
```

### 基础库不应依赖本包

基础库面向**契约**写日志，而不是面向 pino：

```typescript
import { getLogger } from '@ticatec/logger-api';   // ← 不是 @ticatec/logger-pino
```

这样 pino 完全不会进入你这个库的依赖图。记录最终落到 pino、winston 还是 console，是**应用**的决定，取决于它在启动时注入了哪个 provider。本包就是其中一个 provider，它只应出现在应用的 `dependencies` 里。

---

## 🚀 快速开始

### 1. 配置并初始化（主应用）

封装库接收的是**已解析**的配置对象 —— 你可以按自己喜欢的方式解析 YAML 或 JSON 文件，然后把结果传给 `initialize()`。

```typescript
import fs from 'fs';
import YAML from 'yaml';
import { initialize } from '@ticatec/logger-pino';

const config = YAML.parse(fs.readFileSync('./config/loggers.yaml', 'utf8'));

// 在应用启动入口完成唯一一次初始化
initialize(config);
```

JSON 文件同理：

```typescript
import { initialize } from '@ticatec/logger-pino';
initialize(JSON.parse(fs.readFileSync('./config/loggers.json', 'utf8')));
```

### 2. 在任意位置使用 logger

```typescript
import { getLogger } from '@ticatec/logger-api';

export class UserController {
  // 路由到配置中的 `controller` 分类（其级别 + appender）
  private readonly logger = getLogger('UserController', 'controller');

  async update(user: User): Promise<void> {
    this.logger.info({ userId: user.id }, '更新用户信息');
  }
}

export class AppConf {
  // 省略 category 参数则回退到 `root`
  private readonly logger = getLogger('AppConf');
}
```

> 应用代码可以从这里 import `getLogger`，但库代码应当从 `@ticatec/logger-api` 导入 —— 同一个函数，而且 pino 不会进入你的依赖图。

`module` 与 `category` 都会落入日志记录：

```json
{"level":30,"time":1789694519706,"pid":5,"hostname":"app","module":"UserController","category":"controller","msg":"Updating user"}
{"level":30,"time":1789694519706,"pid":5,"hostname":"app","module":"AppConf","msg":"Loaded"}
```

---

## 📄 配置 Schema

配置对象包含两个顶层字段：`appenders`（输出目的地）和 `loggers`（分类）。

```yaml
# Appender 定义 —— 输出目的地
appenders:
  - name: console
    type: console
    level: info
    options:
      pretty: true           # 已识别但尚未实现，当前以原始 JSON 输出到 stdout

  - name: file
    type: file
    level: trace
    options:
      filename: logs/app.log
      sync: false            # 异步写入（默认）

  - name: errorFile
    type: file
    level: error
    options:
      filename: logs/error.log
      sync: false

# Logger 定义 —— 每个命名分类
loggers:
  root:
    level: info
    appenders: [console, file, errorFile]

  controller:
    level: debug
    appenders: [console, file]   # 与 root 独立 —— 不写 errorFile

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

### 字段说明

**`appenders[i]`**

| 字段      | 类型                          | 必填 | 说明 |
|-----------|-------------------------------|------|------|
| `name`    | string                        | 是   | 被 `loggers.*.appenders` 引用。 |
| `type`    | `'console'` \| `'file'`       | 是   | |
| `level`   | 级别字符串                     | 否   | 该 appender 输出的最低级别，默认 `'info'`。 |
| `options` | object                        | 否   | 与 type 相关的选项（见下）。 |

**Appender 选项**

| Type      | 选项      | 默认值 | 说明 |
|-----------|-----------|--------|------|
| `console` | `pretty`  | `false` | 已识别但尚未实现，输出原始 JSON。 |
| `file`    | `filename`| —      | **必填**。日志文件路径。 |
| `file`    | `sync`    | `false` | `true` 同步写入（更慢）；`false` 使用异步 SonicBoom。 |

级别取值必须是 `trace`、`debug`、`info`、`warn`、`error`、`fatal`、`silent` 之一。其它值会被 `initialize()` 拒绝 —— 像 `'warning'`、`'inf'` 这类拼写错误会在校验阶段报出清晰的错误，而不是等到 pino 内部才抛。

**`loggers[name]`**

| 字段       | 类型     | 必填 | 说明 |
|------------|----------|------|------|
| `level`    | 级别字符串   | 是   | 该 logger 输出的最低级别。 |
| `appenders`| string[] | 是   | 引用 `appenders[i].name`，不能为空。 |

`root` 条目为必填。其它任意键都会成为命名分类，可通过 `getLogger(name, '<键名>')` 访问。

---

## 🔌 API 参考

### `initialize(config: LoggingConfig): void`

校验配置，为每个条目构建一个 pino multistream logger，将 `root` 安装为根 logger、其它条目注册为分类 logger —— 然后通过 `setLoggerProvider()` 把本适配器注册为进程级 provider。此后所有 Keelson 包的记录都流入 pino。重复调用或配置非法时抛错。

### `getLogger(name: string, category?: string): Logger`

转出自 `@ticatec/logger-api`，与直接从那里导入完全等价。返回的是 `Logger`（五方法契约），它在每次写入时解析当前 provider：`initialize()` 之前写到 console，之后写到 pino。

正因为解析是逐次进行的，在构造函数里捕获的 logger 在 `initialize()` 之后依然会自动切换过去 —— 启动顺序无关紧要。

### `getPinoLogger(name: string, category?: string): PinoLogger`

逃生口。返回原始 pino child logger —— 绑定 `{ module: name, category }`，未传 category 时为 `{ module: name }` —— 保留 `level`、`child()`、`bindings()` 等 pino 专有能力。只在确实需要它们时使用，并接受由此带来的耦合。

- 当 `category` 匹配某个已配置的 logger 时，child 的父级就是该分类 logger（继承其 level + appender 集合）；否则父级为 `root`。
- 缓存 key 为 `${category ?? ''}::${name}`，因此同名 + 不同分类会返回不同的 logger。
- **未调用 `initialize()` 时抛错** —— 与 `getLogger()` 不同，返回 pino 类型的场景没有 console 兜底。

### `resetForTest(): void`

清空适配器的全部状态，并从 `@ticatec/logger-api` 中摘除 provider。用于单元测试的 `beforeEach`。

### 类型

`LoggingConfig`、`LoggerEntry`、`AppenderConfig`、`AppenderOptions`、`AppenderType` 全部导出，便于类型化自定义配置加载器。

---

## 💡 一次 `initialize()` 如何覆盖所有包

基础库从不 import 本包。它们调用 `@ticatec/logger-api` 的 `getLogger()`，由后者查找当前注入的 provider。

`initialize()` 做的就是把本适配器注册为那个 provider。它写入的注册表挂在 `Symbol.for('@ticatec/logger-api.registry')` 上，因此 `logger-api` 的 CommonJS 与 ESM 两套构建共享同一份；而 `logger-api` 作为 peer dependency，保证依赖树里只解析出一个版本。启动时调用一次，进程内所有 `@ticatec/*` 包 —— 无论嵌套多深 —— 就都开始写入 pino 了。

这里不依赖 Node 的模块向上查找机制，基础库也完全不需要依赖 pino。

---

## 📄 许可证

MIT © [Henry Feng](https://github.com/ticatec)
