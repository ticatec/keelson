# @ticatec/logger-wrapper

[中文文档](README_CN.md) | English

[![Version](https://img.shields.io/npm/v/@ticatec/logger-wrapper)](https://www.npmjs.com/package/@ticatec/logger-wrapper)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[Pino](https://getpino.io) 的完整封装，由解析后的配置对象驱动。在启动时调用一次 `initialize(config)` —— 配置中描述了 appender（输出目的地）与命名 logger（分类），随后通过模块名和可选的分类来获取 child logger。

## 🌟 特性

> **自 v1.0 起，本包是 [`@ticatec/logger-api`](../logger-api) 的可选 pino 适配器。** Keelson 各包面向 `logger-api` 的契约写日志；装上本包并调用 `initialize()`，即可把这些记录接入 pino，获得文件/控制台 appender 与分类级别。不装则走 console。

- **同时支持 ESM 与 CommonJS**：原生支持 ES Modules 和 CommonJS 产物。
- **配置驱动初始化**：一次 `initialize(config)` 调用即可根据类型化对象构建出所有 pino logger，无需手动设置 pino。
- **每个 logger 支持多 appender**：每个 logger 通过 `pino.multistream` 串联自己声明的 appender（例如 `console` + `file` + `errorFile`，各自独立级别）。
- **命名分类**：可配置 `root`、`controller`、`service`、`repository`、`dao` 等，通过 `getLogger(name, category)` 路由调用。
- **严格的单次初始化拦截**：二次调用 `initialize()` 或者在初始化前调用 `getLogger()` 都会立即抛错。
- **进程级单例**：通过 `peerDependencies` 部署，确保同一进程内所有基础库共享同一个物理实例。

## 📦 安装

### 终端业务应用（"最终的菜"）

安装一次即可 —— `pino` 已作为封装库的常规 `dependency` 打包，会自动随之安装：

```bash
pnpm add @ticatec/logger-wrapper
# 或 npm
npm install @ticatec/logger-wrapper
```

### 基础库 / 组件库

仅在 **`devDependencies`** 中声明 `@ticatec/logger-wrapper`。不需要 `peerDependencies`，也不需要单独声明 `pino` —— 你的库在运行时通过 Node 模块向上查找机制，从宿主应用顶层 `node_modules` 中解析封装库。

```json
{
  "devDependencies": {
    "@ticatec/logger-wrapper": "^0.3.0"
  }
}
```

约定很简单：任何使用你库的应用，必须自行安装 `@ticatec/logger-wrapper`。宿主应用的这一次安装会同时为整条 `@ticatec/*` 依赖链提供封装库（以及传递性地提供 `pino`）。

---

## 🚀 快速开始

### 1. 配置并初始化（主应用）

封装库接收的是**已解析**的配置对象 —— 你可以按自己喜欢的方式解析 YAML 或 JSON 文件，然后把结果传给 `initialize()`。

```typescript
import fs from 'fs';
import YAML from 'yaml';
import { initialize } from '@ticatec/logger-wrapper';

const config = YAML.parse(fs.readFileSync('./config/loggers.yaml', 'utf8'));

// 在应用启动入口完成唯一一次初始化
initialize(config);
```

JSON 文件同理：

```typescript
import { initialize } from '@ticatec/logger-wrapper';
initialize(JSON.parse(fs.readFileSync('./config/loggers.json', 'utf8')));
```

### 2. 在任意位置使用 logger

```typescript
import { getLogger } from '@ticatec/logger-wrapper';

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
| `level`   | string                        | 否   | 该 appender 输出的最低级别，默认 `'info'`。 |
| `options` | object                        | 否   | 与 type 相关的选项（见下）。 |

**Appender 选项**

| Type      | 选项      | 默认值 | 说明 |
|-----------|-----------|--------|------|
| `console` | `pretty`  | `false` | 已识别但尚未实现，输出原始 JSON。 |
| `file`    | `filename`| —      | **必填**。日志文件路径。 |
| `file`    | `sync`    | `false` | `true` 同步写入（更慢）；`false` 使用异步 SonicBoom。 |

**`loggers[name]`**

| 字段       | 类型     | 必填 | 说明 |
|------------|----------|------|------|
| `level`    | string   | 是   | 该 logger 输出的最低级别。 |
| `appenders`| string[] | 是   | 引用 `appenders[i].name`，不能为空。 |

`root` 条目为必填。其它任意键都会成为命名分类，可通过 `getLogger(name, '<键名>')` 访问。

---

## 🔌 API 参考

### `initialize(config: LoggingConfig): void`

校验配置，为每个条目构建一个 pino multistream logger，将 `root` 安装为单例根，并将其它条目注册为分类 logger。重复调用或配置非法时抛错。

### `getLogger(name: string, category?: string): Logger`

返回一个被缓存的 pino child logger，自动绑定 `{ module: name }`。

- 当 `category` 被传入且匹配某个已配置的 logger 时，child 的父级就是该分类 logger（继承其 level + appender 集合）。
- 否则父级为 `root`。

缓存 key 为 `${category ?? ''}::${name}`，因此同名 + 不同分类会返回不同的 logger。

### `resetForTest(): void`

清空所有单例状态。用于单元测试的 `beforeEach`。

### 类型

`LoggingConfig`、`LoggerEntry`、`AppenderConfig`、`AppenderOptions`、`AppenderType` 全部导出，便于类型化自定义配置加载器。

---

## 💡 通过 Node 模块向上查找实现单例

Node.js 解析 bare specifier（例如 `@ticatec/logger-wrapper`）时，会从导入文件所在位置沿目录树向上查找，直到找到匹配的 `node_modules` 条目。因此当：

1. 宿主应用把 `@ticatec/logger-wrapper` 声明为常规 `dependency`，并且
2. 中间库（例如 `@ticatec/common-express-server`）导入它却不声明为依赖时，

……从 `node_modules/@ticatec/common-express-server/` 内部发起的 `import '@ticatec/logger-wrapper'` 都会向上找到 `<app>/node_modules/@ticatec/logger-wrapper/` —— 也就是宿主应用初始化的同一个物理实例。整个进程只有一个单例，完全不需要 `peerDependencies` 的额外声明。

正因如此，中间库只需要在 `devDependencies` 中声明（供本地开发使用），而封装库把 `pino` 作为常规 `dependency` 打包：宿主应用的一次安装就提供了所有内容。

---

## 📄 许可证

MIT © [Henry Feng](https://github.com/ticatec)
