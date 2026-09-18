# @ticatec/node-exception

中文 | [English](./README.md)

[![Version](https://img.shields.io/npm/v/@ticatec/node-exception)](https://www.npmjs.com/package/@ticatec/node-exception)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-≥18.0.0-green)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue)](https://www.typescriptlang.org/)

生产就绪的 Express 错误处理中间件，具有标准化的 HTTP 错误类型、集中式异常管理和自动内容协商的 REST API 支持。类型安全，日志通过 `@ticatec/logger-api` 契约注入。

## 🚀 功能特性

- **🎯 标准化错误类型**：十种预定义错误类覆盖常见 HTTP 场景
- **🔧 Express 中间件**：零配置的即插即用错误处理中间件
- **📋 一致响应格式**：统一的错误响应格式，包含完整的请求上下文
- **🎨 内容协商**：自动响应格式化（JSON、HTML、纯文本）
- **🔍 开发支持**：开发环境中包含堆栈跟踪信息
- **📝 内置日志**：5xx 与未知错误通过 `@ticatec/logger-api` 记录并带完整堆栈；4xx 记 `debug` 级
- **📘 TypeScript 优先**：完整的 TypeScript 支持和类型定义
- **🌐 客户端 IP 检测**：从请求中解析客户端地址（遵循 `trust proxy`）
- **⚡ 极轻依赖**：运行时仅依赖 `@ticatec/logger-api` 这一零依赖日志契约
- **✨ 类型安全**：增强的类型安全，带有 null 检查和严格类型
- **🛡️ Null 安全**：可选属性自动提供默认值
- **🔄 双模块格式**：通过条件 `exports` 同时发布 ESM 与 CommonJS 两种构建产物

## 📦 安装

```bash
npm install @ticatec/node-exception @ticatec/logger-api
```

`@ticatec/logger-api` 是 peer dependency——本包记录错误日志所依赖的零依赖日志契约，详见 [日志](#-日志)。

## 🔄 模块系统

本库**同时发布 ESM 和 CommonJS** 两套构建产物，通过 Node 的条件 `exports` 自动选择，无需任何额外配置 —— 直接按你的项目风格导入即可。

### ESM（例如 `package.json` 中设置了 `"type": "module"`）

```javascript
import { handleError, AppError, UnauthenticatedError } from '@ticatec/node-exception';
```

### CommonJS

```javascript
const { handleError, AppError, UnauthenticatedError } = require('@ticatec/node-exception');
```

**子路径导入**同样支持两种格式：

```javascript
// ESM
import HttpError from '@ticatec/node-exception/HttpError';
import { toHtml } from '@ticatec/node-exception/utils';

// CommonJS
const HttpError = require('@ticatec/node-exception/HttpError');
const { toHtml } = require('@ticatec/node-exception/utils');
```

> ℹ️ **混用导入方式是安全的。** 当前容器保存在 `globalThis` 上，键为 `Symbol.for('@ticatec/node-exception.state')`，因此 CommonJS 构建与 ESM 构建共享同一个容器。通过 `require()` 注册的容器，对以 `import` 加载本包的代码同样可见，反之亦然。

## 🔧 快速开始

```javascript
import express from 'express';
import { handleError, AppError, UnauthenticatedError } from '@ticatec/node-exception';

const app = express();

// API 路由
app.get('/api/protected', (req, res, next) => {
    try {
        if (!req.headers.authorization) {
            throw new UnauthenticatedError();
        }
        res.json({ message: '成功!' });
    } catch (error) {
        next(error);
    }
});

// 错误处理中间件（必须注册在最后）
// 直接注册即可：Express 靠形参个数识别错误中间件，而把 next 一并传入，
// 响应已开始发送时处理器才能委派出去。
app.use(handleError);

app.listen(3000, () => {
    console.log('服务器运行在端口 3000');
});
```

## 📚 错误类型及用法

### 🔑 AppError
用于业务逻辑错误的通用应用程序错误，支持自定义错误代码。

```javascript
// 数据库错误
throw new AppError(1001, "数据库连接失败");

// 业务逻辑错误
throw new AppError(2001, "账户余额不足");

// 验证错误
throw new AppError(3001, "用户邮箱已存在");
```

### 🚫 UnauthenticatedError
用于身份验证失败（HTTP 401）。

```javascript
// 缺少身份验证
if (!req.headers.authorization) {
    throw new UnauthenticatedError();
}

// 无效令牌
if (!isValidToken(token)) {
    throw new UnauthenticatedError();
}
```

### 🔒 InsufficientPermissionError
用于授权失败（HTTP 403）。

```javascript
// 基于角色的访问控制
if (!user.hasRole('admin')) {
    throw new InsufficientPermissionError();
}

// 资源所有权
if (resource.ownerId !== user.id) {
    throw new InsufficientPermissionError();
}
```

### ❌ IllegalParameterError
用于输入验证失败（HTTP 400）。

```javascript
// 邮箱验证
if (!isValidEmail(email)) {
    throw new IllegalParameterError("无效的邮箱格式");
}

// 必填字段验证
if (!userId) {
    throw new IllegalParameterError("用户 ID 必填");
}

// 范围验证
if (age < 0 || age > 150) {
    throw new IllegalParameterError("年龄必须在 0 到 150 之间");
}
```

### 🔍 ActionNotFoundError
用于不存在的路由或资源（HTTP 404）。

```javascript
// 路由未找到
if (!routeExists(req.path)) {
    throw new ActionNotFoundError();
}

// 资源未找到
if (!user) {
    throw new ActionNotFoundError();
}
```

### ⚡ ConflictError
用于请求与资源当前状态冲突的场景（HTTP 409）。

```javascript
// 唯一性冲突
if (await users.existsByEmail(email)) {
    throw new ConflictError("该邮箱已被注册");
}

// 乐观锁冲突
if (order.version !== payload.version) {
    throw new ConflictError("订单已被他人修改");
}
```

### 🚧 TooManyRequestsError
用于客户端超出限流或配额的场景（HTTP 429）。

```javascript
if (!rateLimiter.tryConsume(req.ip)) {
    res.set('Retry-After', '60');   // Retry-After 属于响应，不属于错误对象
    throw new TooManyRequestsError();
}
```

> 参数校验失败请继续使用 `IllegalParameterError`（400）。本库不单独提供 422 类型——
> 400 与 422 的边界在实践中本就模糊，两个语义重叠的类只会导致使用上的不一致。

### ⏱️ TimeoutError
用于请求超时（HTTP 408）。

```javascript
// 数据库查询超时
if (Date.now() - startTime > TIMEOUT_LIMIT) {
    throw new TimeoutError();
}

// API 请求超时
const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new TimeoutError()), 5000);
});
```

### 🌐 ProxyError
用于代理服务器问题（HTTP 502）。

```javascript
// 代理服务器故障
if (!proxyResponse.ok) {
    throw new ProxyError();
}

// 网关错误
if (!upstreamServer.isHealthy()) {
    throw new ProxyError();
}
```

### 🚫 ServiceUnavailableError
用于服务不可用（HTTP 503）。

```javascript
// 服务维护
if (isMaintenanceMode()) {
    throw new ServiceUnavailableError();
}

// 服务器过载
if (activeConnections > maxConnections) {
    throw new ServiceUnavailableError();
}
```

## 🎨 响应格式与内容协商

响应格式依据 `Accept` 头的 q 值权重选定：

| 客户端发送 | 响应格式 |
|---|---|
| `application/json` | JSON |
| `*/*`（curl 及多数 HTTP 库） | JSON |
| 浏览器的 `text/html,...,*/*;q=0.8` | HTML |
| `text/html` | HTML |
| `text/plain` | 纯文本 |
| 无可接受类型 | JSON |

JSON 是默认格式：未表达偏好的客户端拿到 JSON，HTML 只留给真正要页面的客户端。
所有响应都会附带 `X-Content-Type-Options: nosniff`。

### JSON 响应（默认）
```json
{
    "code": -1,
    "client": "192.168.1.50",
    "path": "/api/users",
    "method": "GET",
    "timestamp": 1699123456789,
    "message": "Unauthenticated user is accessing the system.",
    "stack": "Error: ... (仅开发环境)"
}
```

> `code` 是**应用级错误码，不是 HTTP 状态码**。除 `AppError` 会带上你传入的码之外，
> 其余错误一律为 `-1`。HTTP 状态码在响应状态行里。

### HTML 响应
返回给浏览器，以及任何偏好 `text/html` 的客户端。注意页面内容是英文——
下面是库的真实输出，未作翻译；需要中文页面请在自定义
[HTTP 容器](#自定义-http-容器)里替换 `sendError`：

```html
<!DOCTYPE html>
<html>
<head>
    <title>Error -1</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .error-container { border: 1px solid #ccc; padding: 20px; border-radius: 5px; }
        h1 { color: #d32f2f; }
        div { margin: 10px 0; }
        .stack { background: #f5f5f5; padding: 10px; border-radius: 3px; font-family: monospace; white-space: pre-wrap; }
    </style>
</head>
<body>
    <div class="error-container">
        <h1>Error Code: -1</h1>
        <div><strong>Client:</strong> 192.168.1.50</div>
        <div><strong>Method:</strong> GET</div>
        <div><strong>Path:</strong> /api/users</div>
        <div><strong>Timestamp:</strong> 1699123456789</div>
        <div><strong>Message:</strong> Unauthenticated user is accessing the system.</div>
    </div>
</body>
</html>
```

所有插值字段均做 HTML 转义；堆栈块仅在开发环境下追加。

### 纯文本响应
当客户端请求 `text/plain` 时返回（同样是库的真实输出）：
```
Code: -1
Client: 192.168.1.50
Method: GET
Path: /api/users
Timestamp: 1699123456789
Message: Unauthenticated user is accessing the system.
---Stack Trace---
UnauthenticatedError: Unauthenticated user is accessing the system.
    at ... (仅开发环境)
```

## 📊 响应字段

| 字段 | 类型 | 描述 |
|-------|------|-------------|
| `code` | number | 应用级错误码，**不是** HTTP 状态码。除 `AppError` 外一律为 `-1` |
| `client` | string | 客户端 IP 地址（如果不可用默认为 'unknown'）|
| `path` | string | 完整的请求路径（baseUrl + path）|
| `method` | string | HTTP 方法（GET、POST、PUT、DELETE 等）|
| `timestamp` | number | Unix 时间戳（毫秒）|
| `message` | string \| null | 人类可读的错误消息 |
| `stack` | string | 堆栈跟踪（仅开发环境）|

## 📝 日志

经过 `handleError` 的错误会通过
[`@ticatec/logger-api`](https://www.npmjs.com/package/@ticatec/logger-api)
（框架的零依赖日志契约）记录下来：

| 错误类型 | 级别 | 内容 |
|---|---|---|
| 非 `HttpError`（乃至非 `Error`） | `error` | 错误本身，**含完整堆栈** |
| `statusCode >= 500` 的 `HttpError` | `error` | 错误本身，**含完整堆栈** |
| 4xx 的 `HttpError` | `debug` | 错误本身及其映射到的状态码 |

划分依据是**状态码等级，而非错误类型**。5xx 意味着服务端出了故障：`AppError`（恒为 500）、
`ProxyError`（502）、`ServiceUnavailableError`（503），以及你自己定义的任何返回 >= 500 的子类。
生产环境下客户端拿不到堆栈，因此这条日志是唯一能说明**为什么失败、挂在哪一行**的东西——
少了它，线上故障在 access log 里就只剩一行冰冷的 `POST /pay 500`。

4xx 是客户端的问题——登录被拒、参数不合法、路由不存在——在真实流量下用 `error` 级记录它们
会把真正要紧的日志淹掉。因此记在 `debug`：排查时可见，生产环境静默。

非 `HttpError` 的错误都是意料之外抵达这里的，而这条日志往往是它留下的唯一线索。

```
2026-09-18T02:07:50.894Z ERROR [ErrorHandler] Unhandled error on GET /api/orders SyntaxError: Expected property name or '}' in JSON at position 1
    at JSON.parse (<anonymous>)
    at /srv/app/routes/orders.js:24:19
    ...
```

### 选择日志实现

`@ticatec/logger-api` 是 **peer dependency**。未注入任何 provider 时，它退回写控制台，
并按环境变量 `LOG_LEVEL` 过滤（`trace` | `debug` | `info` | `warn` | `error` | `silent`，
默认 `info`）——因此零配置即可用。

若要接入真正的日志库，在组合根处（服务启动之前）注册一次 provider：

```typescript
import { setLoggerProvider } from '@ticatec/logger-api';
import { initialize, getPinoLogger } from '@ticatec/logger-pino';

initialize({
    appenders: [{ name: 'out', type: 'console', level: 'debug' }],
    loggers: { root: { level: 'debug', appenders: ['out'] } }
});
setLoggerProvider(getPinoLogger);
```

```json
{"level":50,"module":"ErrorHandler","msg":"Unhandled error on GET /api/orders",
 "err":{"type":"SyntaxError","message":"...","stack":"SyntaxError: ...\n    at JSON.parse ..."}}
```

日志不会影响错误响应：即使 provider 抛异常，也会被吞掉，响应照常发出。

## 🔍 开发环境 vs 生产环境

只有当**服务端**运行在开发环境时，响应中才会包含堆栈跟踪。环境判定完全来自服务端配置，
绝不采信客户端发来的任何内容：

1. Express 的 `env` 应用设置（`app.set('env', ...)`，其默认值为 `process.env.NODE_ENV || 'development'`）
2. 当请求上没有挂载 Express 应用时，退回读取 `process.env.NODE_ENV`
3. 两者都未设置时，默认为 `development`

`development`、`dev`、`test` 会启用堆栈跟踪，其他取值一律关闭。

```bash
# 生产环境：响应中不含堆栈跟踪
NODE_ENV=production node server.js
```

```javascript
// 也可以在应用上显式设置
app.set('env', 'production');
```

> 🔒 **安全提示**：2.1.0 之前的版本从 `env` **请求头**读取该值，任何客户端只要发送
> `env: development` 就能让服务端吐出完整堆栈。如果你还在使用 2.0.0 或更早版本，请尽快升级。
> 另需注意：当时该请求头是启用堆栈跟踪的**唯一**途径，因此如果你的开发工具链依赖它，
> 请改用 `NODE_ENV` 或 `app.set('env')`。

## 🚦 HTTP 状态码映射

| 错误类型 | HTTP 状态 | 使用场景 |
|----------|-----------|----------|
| `UnauthenticatedError` | 401 Unauthorized | 缺少或无效的身份验证 |
| `InsufficientPermissionError` | 403 Forbidden | 权限/授权不足 |
| `IllegalParameterError` | 400 Bad Request | 无效的输入参数或验证 |
| `ActionNotFoundError` | 404 Not Found | 不存在的路由或资源 |
| `ConflictError` | 409 Conflict | 唯一性冲突、乐观锁冲突 |
| `TooManyRequestsError` | 429 Too Many Requests | 限流与配额 |
| `TimeoutError` | 408 Request Timeout | 网络请求或操作超时 |
| `AppError` | 500 Internal Server Error | 业务逻辑或应用程序错误 |
| `ProxyError` | 502 Bad Gateway | 代理服务器或网关问题 |
| `ServiceUnavailableError` | 503 Service Unavailable | 服务维护或过载 |
| 其他错误 | 500 Internal Server Error | 意外的系统错误 |

## 💡 高级用法

### 自定义 HTTP 容器
为不同框架创建自定义 HTTP 适配器：

```typescript
import { setHttpContainer } from '@ticatec/node-exception';
import type { HttpContainer, ErrorResponse } from '@ticatec/node-exception';

class CustomContainer implements HttpContainer {
    getRemoteIp(req: any): string {
        return req.ip || 'unknown';
    }

    getPath(req: any): string {
        return req.originalUrl;
    }

    isDevelopment(_req: any): boolean {
        // 只能从服务端配置解析。一旦从客户端可控的地方读取——请求头、查询参数、
        // Cookie——调用方就能自行打开堆栈泄露的开关。
        return process.env.NODE_ENV === 'development';
    }

    sendError(req: any, res: any, statusCode: number, data: ErrorResponse): void {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.status(statusCode).json(data);
    }
}

// 在组合根处调用一次，且须在服务器开始接收请求之前。
setHttpContainer(new CustomContainer());
```

`ExpressContainer`（默认实现）与 `getHttpContainer()` 同样是导出的，因此自定义容器
可以继承默认实现而非从头重写，测试也能在结束后恢复原状：

```typescript
import { setHttpContainer, getHttpContainer, ExpressContainer } from '@ticatec/node-exception';
import type { ErrorResponse } from '@ticatec/node-exception';

class AuditingContainer extends ExpressContainer {
    sendError(req: any, res: any, statusCode: number, data: ErrorResponse): void {
        metrics.increment('http.error', { status: statusCode });
        super.sendError(req, res, statusCode, data);
    }
}

const previous = getHttpContainer();
setHttpContainer(new AuditingContainer());
// ……之后，例如在测试的 teardown 里
setHttpContainer(previous);
```

### 错误码规范
系统地组织您的错误代码：

```javascript
// 身份验证错误：1000-1999
const AUTH_ERRORS = {
    INVALID_TOKEN: 1001,
    EXPIRED_TOKEN: 1002,
    MISSING_TOKEN: 1003
};

// 验证错误：2000-2999
const VALIDATION_ERRORS = {
    INVALID_EMAIL: 2001,
    WEAK_PASSWORD: 2002,
    REQUIRED_FIELD: 2003
};

// 业务逻辑错误：3000-3999
const BUSINESS_ERRORS = {
    INSUFFICIENT_BALANCE: 3001,
    DUPLICATE_EMAIL: 3002,
    LIMIT_EXCEEDED: 3003
};

throw new AppError(AUTH_ERRORS.INVALID_TOKEN, "身份验证令牌无效");
```

## 🔧 TypeScript 集成

完整的 TypeScript 支持和全面的类型定义：

```typescript
import {
    AppError,
    UnauthenticatedError,
    InsufficientPermissionError,
    IllegalParameterError,
    ActionNotFoundError,
    ConflictError,
    handleError
} from '@ticatec/node-exception';
import { Request, Response, NextFunction } from 'express';

// 类型安全的错误中间件
const errorHandler = (
    err: AppError | Error,
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    handleError(err, req, res, next);
};

// 带有正确类型的自定义错误
class CustomValidationError extends IllegalParameterError {
    constructor(field: string, value: any) {
        super(`无效的 ${field}: ${value}`);
    }
}

// 保留底层失败原因
try {
    await orders.insert(order);
} catch (cause) {
    throw new ConflictError('订单号已存在', { cause });
}
```

## 🏗️ 架构

库使用模块化架构，职责清晰分离：

- **错误类** (`HttpError.ts`)：带有堆栈跟踪支持的标准化错误类型
- **错误处理器** (`handleError.ts`)：中心错误处理和响应逻辑
- **HTTP 容器** (`HttpContainer.ts`)：框架无关的 HTTP 抽象
- **响应类型** (`ErrorResponse.ts`)：标准化的响应结构
- **工具** (`utils.ts`)：带有 XSS 保护的响应格式化助手

日志走 `@ticatec/logger-api` 契约而非某个具体日志库，因此本包不与应用选用的
日志实现绑定。

## 📋 要求

- **Node.js**：≥18.0.0
- **Peer 依赖**：`@ticatec/logger-api`（≥1.0.0，其本身零依赖）
- 除此之外无任何运行时依赖

## 🆕 最新改进

### 双 ESM / CommonJS 支持
- ✅ 同时输出 ESM（`lib/esm/`）与 CommonJS（`lib/cjs/`）两套构建产物
- ✅ 条件 `exports` 映射自动选择正确的格式
- ✅ 每个输出目录的 `package.json` 标记确保模块类型解析正确
- ✅ 源码更新为显式 `.js` 扩展名（兼容 NodeNext）

### 版本 2.1.0
- 🔒 **安全**：开发环境判定不再读取 `env` 请求头，此前任何客户端都可借此强制泄露堆栈
- 🔒 **安全**：HTML 错误页所有字段均做 HTML 转义（此前 `client`、`path`、`method`、`code`
  为原样插值；在开启 `trust proxy` 时，`client` 取自 `X-Forwarded-For`）
- 🔒 错误响应统一附带 `X-Content-Type-Options: nosniff`
- ✅ 响应已开始发送时，`handleError` 改为委派给 `next(err)`
- ✅ 容器状态锚定到 `globalThis`，CJS 与 ESM 共享同一实例
- ✅ `HttpContainer` 与 `ErrorResponse` 以类型方式导出（兼容 `isolatedModules`）
- ✅ 每个子路径导出都补全了按条件区分的 `types`
- 📝 错误统一经 `@ticatec/logger-api` 记录：5xx 与未知错误 `error` 级并带完整堆栈，4xx 记 `debug` 级
- 🐛 重写内容协商：浏览器的 `*/*;q=0.8` 会让 `req.accepts('json')` 返回 `'json'`，
  导致 HTML 错误页在现实中永不触发
- 🐛 响应已发出且调用方未传 `next` 时，`handleError` 不再抛出 `ERR_HTTP_HEADERS_SENT`
- ✨ 所有错误类构造函数均接受 `ErrorOptions`，`{ cause }` 错误链得以保留
- ✨ 新增错误类型：`ConflictError`（409）与 `TooManyRequestsError`（429）
- ✅ 新增 104 个测试，上述每一项均有回归用例
- ✅ 启用 `strict` 与 `isolatedModules`

### 版本 2.0.0
- ✅ 增强类型安全，使用严格的 TypeScript 类型
- ✅ 修复文本响应格式中的 bug（客户端 IP 显示）
- ✅ 改进 HTML 错误页面，专业样式
- ✅ 添加 null 安全和默认值
- ✅ 移除 @ts-ignore，改进错误处理
- ✅ 修复错误消息中的语法和拼写错误
- ✅ 使用 JSDoc 注释改进代码文档

## 🤝 贡献

本包位于 [Keelson](https://github.com/ticatec/keelson) monorepo，欢迎在该仓库提交 issue 与 PR。

### 开发设置
```bash
git clone https://github.com/ticatec/keelson.git
cd keelson
pnpm install
cd packages/node-exception

pnpm build       # 同时构建 CJS 与 ESM 产物（构建前先跑 lint）
pnpm test        # 运行测试
pnpm typecheck   # 对两套配置进行类型检查
pnpm lint        # 仅 lint
```

在 monorepo 根目录执行 `pnpm verify`，会对全部包做类型检查、测试与构建。

## 📄 许可证

MIT © [Henry Feng](https://github.com/henryfeng)

## 🔗 链接

- **源码**：[github.com/ticatec/keelson/tree/main/packages/node-exception](https://github.com/ticatec/keelson/tree/main/packages/node-exception)
- **npm 包**：[@ticatec/node-exception](https://www.npmjs.com/package/@ticatec/node-exception)
- **问题反馈**：[github.com/ticatec/keelson/issues](https://github.com/ticatec/keelson/issues)
- **变更日志**：[CHANGELOG.md](./CHANGELOG.md)
