# @ticatec/node-exception

中文 | [English](./README.md)

[![Version](https://img.shields.io/npm/v/@ticatec/node-exception)](https://www.npmjs.com/package/@ticatec/node-exception)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-≥14.0.0-green)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue)](https://www.typescriptlang.org/)

生产就绪的 Express 错误处理中间件，具有标准化的 HTTP 错误类型、集中式异常管理和自动内容协商的 REST API 支持。类型安全、零依赖核心。

## 🚀 功能特性

- **🎯 标准化错误类型**：八种预定义错误类覆盖常见 HTTP 场景
- **🔧 Express 中间件**：零配置的即插即用错误处理中间件
- **📋 一致响应格式**：统一的错误响应格式，包含完整的请求上下文
- **🎨 内容协商**：自动响应格式化（JSON、HTML、纯文本）
- **🔍 开发支持**：开发环境中包含堆栈跟踪信息
- **📘 TypeScript 优先**：完整的 TypeScript 支持和类型定义
- **🌐 IP 检测**：自动检测客户端和服务器 IP 地址
- **⚡ 零依赖**：运行时无任何依赖
- **✨ 类型安全**：增强的类型安全，带有 null 检查和严格类型
- **🛡️ Null 安全**：可选属性自动提供默认值
- **🔄 双模块格式**：通过条件 `exports` 同时发布 ESM 与 CommonJS 两种构建产物

## 📦 安装

```bash
npm install @ticatec/node-exception
```

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

> ⚠️ **混用导入方式**：`setHttpContainer()` 修改的是模块级单例。CJS 与 ESM 是两个独立的模块实例，通过 `require()` 设置的容器对 `import` 引入的代码不可见，反之亦然。同一应用请选择其中一种导入方式。

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

// 错误处理中间件（必须是最后一个中间件）
app.use((err, req, res, next) => {
    handleError(err, req, res);
});

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

库会根据 `Accept` 请求头自动处理内容协商：

### JSON 响应（默认）
```json
{
    "code": -1,
    "client": "192.168.1.50",
    "path": "/api/users",
    "method": "GET",
    "timestamp": 1699123456789,
    "message": "未认证的用户正在访问系统。",
    "stack": "Error: ...（仅开发环境）"
}
```

### HTML 响应
当请求 `Accept: text/html` 时，返回专业样式的 HTML5 页面：

```html
<!DOCTYPE html>
<html>
<head>
    <title>错误 401</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .error-container { border: 1px solid #ccc; padding: 20px; border-radius: 5px; }
        h1 { color: #d32f2f; }
        .stack { background: #f5f5f5; padding: 10px; font-family: monospace; }
    </style>
</head>
<body>
    <div class="error-container">
        <h1>错误代码：401</h1>
        <div><strong>客户端：</strong> 192.168.1.50</div>
        <div><strong>方法：</strong> GET</div>
        <div><strong>路径：</strong> /api/users</div>
        <div><strong>时间戳：</strong> 1699123456789</div>
        <div><strong>消息：</strong> 未认证的用户正在访问系统。</div>
    </div>
</body>
</html>
```

### 纯文本响应
当请求 `Accept: text/plain` 时：
```
代码：401
客户端：192.168.1.50
方法：GET
路径：/api/users
时间戳：1699123456789
消息：未认证的用户正在访问系统。
---堆栈跟踪---
Error: UnauthenticatedError...
```

## 📊 响应字段

| 字段 | 类型 | 描述 |
|-------|------|-------------|
| `code` | number | 应用程序特定的错误代码（通用错误为 -1）|
| `client` | string | 客户端 IP 地址（如果不可用默认为 'unknown'）|
| `path` | string | 完整的请求路径（baseUrl + path）|
| `method` | string | HTTP 方法（GET、POST、PUT、DELETE 等）|
| `timestamp` | number | Unix 时间戳（毫秒）|
| `message` | string \| null | 人类可读的错误消息 |
| `stack` | string | 堆栈跟踪（仅开发环境）|

## 🔍 开发环境 vs 生产环境

堆栈跟踪会自动包含在开发环境中：

```javascript
// 通过设置请求头启用开发模式
fetch('/api/users', {
    headers: {
        'env': 'development' // 或 'dev'
    }
});
```

## 🚦 HTTP 状态码映射

| 错误类型 | HTTP 状态 | 使用场景 |
|----------|-----------|----------|
| `UnauthenticatedError` | 401 Unauthorized | 缺少或无效的身份验证 |
| `InsufficientPermissionError` | 403 Forbidden | 权限/授权不足 |
| `IllegalParameterError` | 400 Bad Request | 无效的输入参数或验证 |
| `ActionNotFoundError` | 404 Not Found | 不存在的路由或资源 |
| `TimeoutError` | 408 Request Timeout | 网络请求或操作超时 |
| `AppError` | 500 Internal Server Error | 业务逻辑或应用程序错误 |
| `ProxyError` | 502 Bad Gateway | 代理服务器或网关问题 |
| `ServiceUnavailableError` | 503 Service Unavailable | 服务维护或过载 |
| 其他错误 | 500 Internal Server Error | 意外的系统错误 |

## 💡 高级用法

### 自定义 HTTP 容器
为不同框架创建自定义 HTTP 适配器：

```javascript
import { setHttpContainer, HttpContainer } from '@ticatec/node-exception';

class CustomContainer implements HttpContainer {
    getRemoteIp(req) {
        return req.connection.remoteAddress;
    }

    getPath(req) {
        return req.originalUrl;
    }

    isDevelopment(req) {
        return process.env.NODE_ENV === 'development';
    }

    sendError(req, res, statusCode, data) {
        res.status(statusCode).json(data);
    }
}

setHttpContainer(new CustomContainer());
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
    handleError(err, req, res);
};

// 带有正确类型的自定义错误
class CustomValidationError extends IllegalParameterError {
    constructor(field: string, value: any) {
        super(`无效的 ${field}: ${value}`);
    }
}
```

## 🏗️ 架构

库使用模块化架构，职责清晰分离：

- **错误类** (`HttpError.ts`)：带有堆栈跟踪支持的标准化错误类型
- **错误处理器** (`handleError.ts`)：中心错误处理和响应逻辑
- **HTTP 容器** (`HttpContainer.ts`)：框架无关的 HTTP 抽象
- **响应类型** (`ErrorResponse.ts`)：标准化的响应结构
- **工具** (`utils.ts`)：带有 XSS 保护的响应格式化助手

## 📋 要求

- **Node.js**: ≥14.0.0
- **npm**: ≥6.0.0
- 无运行时依赖

## 🆕 最新改进

### 双 ESM / CommonJS 支持
- ✅ 同时输出 ESM（`lib/esm/`）与 CommonJS（`lib/cjs/`）两套构建产物
- ✅ 条件 `exports` 映射自动选择正确的格式
- ✅ 每个输出目录的 `package.json` 标记确保模块类型解析正确
- ✅ 源码更新为显式 `.js` 扩展名（兼容 NodeNext）

### 版本 2.0.0
- ✅ 增强类型安全，使用严格的 TypeScript 类型
- ✅ 修复文本响应格式中的 bug（客户端 IP 显示）
- ✅ 改进 HTML 错误页面，专业样式
- ✅ 添加 null 安全和默认值
- ✅ 移除 @ts-ignore，改进错误处理
- ✅ 修复错误消息中的语法和拼写错误
- ✅ 使用 JSDoc 注释改进代码文档

## 🤝 贡献

我们欢迎贡献！详情请参阅我们的[贡献指南](https://github.com/ticatec/node-exception/blob/main/CONTRIBUTING.md)。

### 开发设置
```bash
git clone https://github.com/ticatec/node-exception.git
cd node-exception
npm install
npm run build       # 同时构建 CJS 与 ESM 产物
npm run build:cjs   # 仅构建 CommonJS 产物
npm run build:esm   # 仅构建 ESM 产物
npm run typecheck   # 对两套配置进行类型检查
```

## 📄 许可证

MIT © [Henry Feng](https://github.com/henryfeng)

## 🔗 链接

- **GitHub 仓库**: [https://github.com/ticatec/node-exception](https://github.com/ticatec/node-exception)
- **npm 包**: [https://www.npmjs.com/package/@ticatec/node-exception](https://www.npmjs.com/package/@ticatec/node-exception)
- **问题反馈**: [https://github.com/ticatec/node-exception/issues](https://github.com/ticatec/node-exception/issues)
- **文档**: [https://docs.ticatec.com/node-exception](https://docs.ticatec.com/node-exception)