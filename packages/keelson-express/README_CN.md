# @ticatec/keelson-express

[![npm version](https://badge.fury.io/js/@ticatec%2Fkeelson-express.svg)](https://badge.fury.io/js/@ticatec%2Fkeelson-express)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

一个全面的 TypeScript 库，提供通用类、控制器和中间件，用于构建具有多租户支持的可扩展 Express.js 应用程序。

[English](./README.md) ｜ 中文

## 特性

- 🚀 **Express.js 基础**: 基于 Express.js 5.x 构建，完全支持 TypeScript
- 🏢 **多租户架构**: 内置多租户应用程序支持
- 🔐 **认证与授权**: 用户认证和基于角色的访问控制
- 🎯 **控制器模式**: 预构建的基础控制器，支持常见的 CRUD 操作
- 📝 **数据验证**: 使用 bean-validator 集成数据验证
- 🔄 **错误处理**: 集中式错误处理和日志记录
- 🌐 **国际化**: 通过请求头内置语言支持
- 📊 **日志记录**: 与 `@ticatec/logger-pino` 和 Pino 集成的结构化日志
- 📦 **双模块支持**: 原生同时支持 CommonJS (`lib/cjs`) 与 ESM (`lib/esm`)

## 文档

- **[Controller 使用指南](https://github.com/ticatec/keelson/blob/main/docs/prompts/CONTROLLER_CN.md)** - 控制器使用完整指南，包括 CRUD 和搜索操作

> 🚀 **重大升级说明**：控制器体系已进行全面精简与现代化升级。已废弃并移除原有的 4 个特定子类（`AdminBaseController`、`TenantBaseController`、`AdminSearchController`、`TenantSearchController`），全面统一至 `CommonController` 与 `CommonSearchController`。校验规则现通过直接覆写 `getRules(): ValidationRules` 方法进行声明，无需在构造器中传递。

## 安装

```bash
pnpm add @ticatec/keelson-express
```

### 对等依赖

```json
{
  "peerDependencies": {
    "@ticatec/logger-api": ">=1.0.0",
    "@ticatec/keelson-core": ">=1.0.0",
    "@ticatec/bean-validator": ">=1.1.0",
    "@ticatec/node-exception": ">=2.1.0",
    "express": "^5.0.0"
  }
}
```

```bash
pnpm add @ticatec/logger-api @ticatec/keelson-core @ticatec/bean-validator @ticatec/node-exception express
```

日志实现是可选的。不装任何实现时，`@ticatec/logger-api` 回退到 console，按 `LOG_LEVEL` 过滤。
需要走 pino，就再装 `@ticatec/logger-pino`，并在应用入口注入实现。

## 快速开始

### 1. 创建基础服务器

```typescript
import { BaseServer } from '@ticatec/keelson-express';

class MyServer extends BaseServer {
    protected async loadConfigFile(): Promise<void> {
        // 在此处加载你的配置
        console.log('正在加载配置...');
    }

    protected getWebConf() {
        return {
            port: 3000,
            ip: '0.0.0.0',
            contextRoot: '/api'
        };
    }

    protected async setupRoutes(): Promise<void> {
        // 在此处设置你的路由
        await this.bindRoutes('/users', () => import('./routes/UserRoutes'));
    }
}

// 启动服务器
const server = new MyServer();
BaseServer.startup(server);
```

### 3. 云原生健康检查 (Health Check)

框架内置云原生与 K8s 标准的健康检查子系统，默认自动暴露免认证探针端点：
- `GET /health/live`: 存活探针 (Liveness Probe)，进程在线即返回 HTTP 200。
- `GET /health/ready`: 就绪探针 (Readiness Probe)，汇总所有关键探针，全部正常返回 HTTP 200，任一关键项 DOWN 返回 HTTP 503。
- `GET /health`: 综合健康视图。

注册自定义组件探针（如数据库、Redis）：

```typescript
class MyServer extends BaseServer {
    protected async beforeStart(): Promise<void> {
        // 注册数据库健康检查
        this.registerHealthCheck('database', async () => {
            const isOk = await db.ping();
            return {
                status: isOk ? 'UP' : 'DOWN',
                details: { latencyMs: 5 }
            };
        }, true); // true 表示关键组件，DOWN 时 ready 端点将返回 503

        // 注册非关键组件（如缓存）
        this.registerHealthCheck('redis', async () => {
            return { status: 'UP' };
        }, false);
    }
}
```

### 2. 创建路由

```typescript
import { CommonRoutes, routerHelper } from '@ticatec/keelson-express';

class UserRoutes extends CommonRoutes {

    // 加载额外的用户数据
    protected getUserHook(): ((user: any) => any) | null {
        return async (user) => {
            // 加载用户偏好设置
            user.preferences = await loadPreferences(user.accountCode);
            return user;
        };
    }

    protected bindRoutes() {
        this.get('/profile', routerHelper.invokeRestfulAction(this.getProfile));
        this.post('/update', routerHelper.invokeRestfulAction(this.updateProfile));
    }

    private getProfile = async (req: Request) => {
        // 你的业务逻辑
        return { message: '用户资料' };
    };

    private updateProfile = async (req: Request) => {
        // 你的业务逻辑
        return { message: '资料已更新' };
    };
}

export default UserRoutes;
```

#### 自定义用户钩子

`getUserHook()` 方法允许你在认证后处理和丰富用户数据：

```typescript
import { CommonRoutes } from '@ticatec/keelson-express';

class AdminRoutes extends CommonRoutes {

    // 处理并丰富用户数据
    protected getUserHook(): ((user: any) => any) | null {
        return async (user) => {
            if (user) {
                // 加载管理员特定数据
                user.adminData = await loadAdminData(user.accountCode);
                user.permissions = await loadPermissions(user.accountCode);
                user.settings = await loadSettings(user.accountCode);
            }
            return user;
        };
    }

    protected bindRoutes() {
        this.get('/dashboard', routerHelper.invokeRestfulAction(this.getDashboard));
    }

    private getDashboard = async (req: Request) => {
        // 用户数据已经被丰富
        return {
            dashboard: req['user'].adminData,
            permissions: req['user'].permissions
        };
    };
}
```

#### 需认证路由 (AuthenticatedRoutes)

继承 `AuthenticatedRoutes` 可要求请求必须包含有效登录用户（`user != null`），未登录请求会自动由中间件抛出 `401 UnauthenticatedError`：

```typescript
import { AuthenticatedRoutes, routerHelper } from '@ticatec/keelson-express';

class ProtectedUserRoutes extends AuthenticatedRoutes {
    protected bindRoutes() {
        this.get('/profile', routerHelper.invokeRestfulAction(this.getProfile));
    }

    private getProfile = async (req: Request) => {
        // req['user'] 一定非空
        return req['user'];
    };
}
```

#### Server 级别自定义用户类型 (CustomUserRegistry)

对于有特定扩展属性（如 `userId`, `roles`, `permissions`）的用户模型，可以通过 TypeScript 模块声明扩展（Declaration Merging）在 Server 级别统一绑定：

```typescript
// types/user-registry.d.ts
import { LoggedUser } from '@ticatec/keelson-express';

export interface AppUser extends LoggedUser {
    userId: string;
    roles: string[];
    permissions: string[];
}

declare module '@ticatec/keelson-express' {
    interface CustomUserRegistry {
        user: AppUser;
    }
}
```

绑定后，框架内所有 Controller 的 `this.getLoggedUser(req)`、`CommonController` 参数及 `CommonRoutes` 的用户钩子将**自动推导为 `AppUser` 强类型**，无需在每个 Controller 上编写冗余泛型！

#### 自定义用户验证

`isValidUser()` 方法允许你在认证之外实现自定义验证逻辑：

```typescript
import { CommonRoutes } from '@ticatec/keelson-express';

class VerifiedUserRoutes extends CommonRoutes {

    // 验证用户账户状态
    protected async isValidUser(user: any): Promise<boolean> {
        if (!user) {
            return false;
        }
        // 检查用户账户是否有效
        const account = await database.getAccount(user.accountCode);
        return account && account.status === 'active';
    }

    protected bindRoutes() {
        this.get('/profile', routerHelper.invokeRestfulAction(this.getProfile));
    }

    private getProfile = async (req: Request) => {
        return req['user'];
    };
}
```

**更多示例：**

```typescript
// 检查用户角色
class AdminRoutes extends CommonRoutes {
    protected isValidUser(user: any): boolean {
        return user && user.roles && user.roles.includes('admin');
    }
}

// 租户验证
class TenantRoutes extends CommonRoutes {
    protected async isValidUser(user: any): Promise<boolean> {
        if (!user || !user.tenant) {
            return false;
        }
        const tenant = await database.getTenant(user.tenant.code);
        return tenant && tenant.isActive;
    }
}
```

#### 自定义认证中间件

使用 `getGlobalHandler()` 添加自定义中间件：

```typescript
import { CommonRoutes, routerHelper } from '@ticatec/keelson-express';

class ApiRoutes extends CommonRoutes {

    // 添加自定义全局中间件
    protected getGlobalHandler(): RequestHandler | null {
        return async (req, res, next) => {
            // 检查 API 版本
            const version = req.headers['api-version'];
            if (!version) {
                throw new Error('API version is required');
            }
            next();
        };
    }

    protected bindRoutes() {
        this.get('/data', routerHelper.invokeRestfulAction(this.getData));
    }

    private getData = async (req: Request) => {
        return { data: [] };
    };
}
```

#### 公开路由（无需认证）

```typescript
import { CommonRoutes, routerHelper } from '@ticatec/keelson-express';

class PublicRoutes extends CommonRoutes {

    // 覆写 isValidUser 以允许公开访问（无需认证）
    protected isValidUser(user: any): boolean {
        return true; // 允许无需认证访问
    }

    protected bindRoutes() {
        this.get('/info', routerHelper.invokeRestfulAction(this.getInfo));
    }

    private getInfo = async (req: Request) => {
        return { message: '公开信息' };
    };
}
```

### 3. 创建控制器

```typescript
import { CommonController } from '@ticatec/keelson-express';
import { ValidationRules, StringValidator } from '@ticatec/bean-validator';

interface UserService {
    createNew(user: any, data: any): Promise<any>;
    update(user: any, data: any): Promise<any>;
    search(user: any, query: any): Promise<any>;
}

const userValidationRules: ValidationRules = [
    new StringValidator('name', { required: true, minLen: 2 }),
    new StringValidator('email', {
        required: true,
        format: {
            regex: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
            message: '无效的邮箱格式'
        }
    })
];

class UserController extends CommonController<UserService> {
    constructor(userService: UserService) {
        super(userService);
    }

    // 配置校验规则
    protected getRules(): ValidationRules {
        return userValidationRules;
    }

    // CRUD 方法（createNew, update, del）已继承并自动验证，
    // 默认自动将 [loggedUser, req.body] 透传至服务层方法。

    // 添加自定义方法
    search() {
        return async (req: Request): Promise<any> => {
            const query = req.query;
            this.checkInterface('search');
            return await this.invokeServiceInterface('search', [
                this.getLoggedUser(req),
                query
            ]);
        };
    }
}
```

## 核心类

### BaseServer

抽象基础服务器类，提供：
- Express 应用程序设置
- 配置加载
- 路由绑定
- 错误处理
- 健康检查端点
- 静态文件服务
- **全局用户解析**（非侵入式，适用于所有请求）


**全局中间件顺序：**
```
1. SetNoCache              - 禁用缓存
2. HealthCheck             - /health/live, /health/ready, /health 端点
3. RetrieveUser (全局)     - 从请求头解析用户信息（非侵入式）
4. Routes                  - 所有路由定义
5. ActionNotFound          - 404 处理器
6. Error Handler           - 错误处理
```

### RouterHelper（单例）

中间件工具，用于：
- JSON 响应格式化
- 缓存控制
- 用户认证
- 错误处理
- 请求日志记录

**使用方法：**
```typescript
import { routerHelper } from '@ticatec/keelson-express';

// 使用中间件
routerHelper.setNoCache           // 禁用缓存
routerHelper.checkLoggedUser()    // 要求认证
routerHelper.retrieveUser()       // 解析用户（非侵入式）
routerHelper.actionNotFound()     // 404 处理器
routerHelper.invokeRestfulAction() // 包装异步处理器
routerHelper.invokeController()    // 包装控制器处理器
```

### CommonRoutes

路由定义基类，具有：
- Express 路由器集成
- 灵活的认证控制
- 自定义用户验证检查
- 用户钩子支持
- 全局中间件支持
- 日志记录功能
- 内置的 HTTP 方法辅助方法

**中间件执行顺序：**
```
1. getUserHook()           - 处理并丰富用户数据
2. isValidUser()             - 自定义用户验证
3. getGlobalHandler()      - 自定义中间件
4. bindRoutes()            - 路由定义
```

**关键方法：**
- `getUserHook(): ((user: any) => any) | null` - 处理用户数据
- `isValidUser(user: any): boolean | Promise<boolean>` - 自定义用户验证
- `getGlobalHandler(): RequestHandler | null` - 自定义中间件
- `bindRoutes()` - 定义你的路由

### 控制器层次结构

- **BaseController<T>**: 基础控制器，提供日志记录和登录用户上下文访问
- **CommonController<T>**: 统一 CRUD 控制器，提供自动校验并默认自动透传用户参数 `[loggedUser, req.body]`
- **CommonSearchController<T>**: 搜索控制器，提供开箱即用的搜索查询处理

📚 **[完整控制器使用指南 →](https://github.com/ticatec/keelson/blob/main/docs/prompts/CONTROLLER_CN.md)**

## 架构概览

### 请求处理流程

```
┌─────────────────────────────────────────────────────────────┐
│                    BaseServer 中间件                        │
├─────────────────────────────────────────────────────────────┤
│ 1. SetNoCache              - 禁用缓存                        │
│ 2. HealthCheck             - /health/live, /health/ready    │
│ 3. RetrieveUser (全局)     - 从请求头解析用户信息            │
│ 4. Routes                  - 所有路由定义                    │
│ 5. ActionNotFound          - 404 处理器                      │
│ 6. Error Handler           - 错误处理                        │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│              CommonRoutes 中间件执行顺序                     │
├─────────────────────────────────────────────────────────────┤
│ 1. getUserHook()           - 处理用户数据                    │
│ 2. isValidUser()             - 自定义用户验证                  │
│ 3. getGlobalHandler()      - 自定义中间件                    │
│ 4. bindRoutes()            - 路由定义                        │
└─────────────────────────────────────────────────────────────┘
```

### 配置

#### 应用程序配置

```typescript
import { AppConf } from '@ticatec/keelson-express';

// 初始化配置
AppConf.init({
    database: {
        host: 'localhost',
        port: 5432
    },
    server: {
        port: 3000
    }
});

// 使用配置
const config = AppConf.getInstance();
const dbHost = config.get('database.host');
const serverPort = config.get('server.port');
```

#### 网关架构

此应用程序设计为在 API 网关后工作。网关处理 JWT 令牌或基于会话的身份验证，并通过 HTTP 请求头将经过身份验证的用户信息转发给 Express 应用程序。

##### 架构流程

```
客户端请求 (JWT/Session) → API 网关 → Express 应用程序
                              ↓
                        用户信息请求头
```

##### 网关职责

API 网关应该：

1. **验证请求身份** 使用 JWT 令牌、会话 cookie 或其他身份验证机制
2. **提取用户信息** 从身份验证令牌/会话中
3. **转发用户数据** 作为 HTTP 请求头传递给 Express 应用程序
4. **处理授权** 和速率限制等需求

##### 用户认证请求头

库期望用户信息在请求头中：

```typescript
// 由网关转发的请求头
{
    'user': encodeURIComponent(JSON.stringify({
        accountCode: 'user123',
        name: 'John Doe',
        tenant: { code: 'tenant1', name: '租户一' }
    })),
    'x-language': 'zh'
}
```

#### 用户扮演

库支持用户扮演功能，允许系统特权用户扮演成另外一个用户（包括跨租户操作）来实现错误跟踪和故障排除。

```typescript
// 包含用户扮演的请求头
{
    'user': encodeURIComponent(JSON.stringify({
        // 原始特权用户
        accountCode: 'admin123',
        name: '系统管理员',
        tenant: { code: 'system', name: '系统租户' },

        // 被扮演的用户
        actAs: {
            accountCode: 'user456',
            name: '目标用户',
            tenant: { code: 'client-a', name: '客户 A' }
        }
    })),
    'x-language': 'zh'
}
```

## 多租户支持

库通过 `CommonController` 提供内置的多租户支持：

```typescript
// 标准 / 租户控制器（默认透传登录用户参数）
class ProductController extends CommonController<ProductService> {
    // 自动接收登录用户上下文
    // 所有 CRUD 操作默认将 [loggedUser, req.body] 传递给服务层方法
}

// 平台管理员控制器（跨租户 / 平台级操作）
class SystemController extends CommonController<SystemService> {
    // 根据需要覆写入参构建方法，例如省略 user 参数
    protected getCreateNewArguments(req: Request): Array<any> {
        return [req.body];
    }

    protected getUpdateArguments(req: Request): Array<any> {
        return [req.body];
    }
}
```

## 数据验证

使用 `@ticatec/bean-validator` 进行内置验证：

```typescript
import { ValidationRules, StringValidator, NumberValidator } from '@ticatec/bean-validator';

const rules: ValidationRules = [
    new StringValidator('name', { required: true, minLen: 2, maxLen: 50 }),
    new StringValidator('email', {
        required: true,
        format: {
            regex: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
            message: '无效的邮箱格式'
        }
    }),
    new NumberValidator('age', { required: false, minValue: 18, maxValue: 120 })
];

class UserController extends CommonController<UserService> {
    constructor(service: UserService) {
        super(service);
    }

    protected getRules(): ValidationRules {
        return rules; // 在 createNew() 和 update() 时自动应用验证
    }
}
```

## 错误处理

使用 `@ticatec/node-exception` 进行集中式错误处理：

```typescript
import {
    ActionNotFoundError,
    UnauthenticatedError,
    IllegalParameterError
} from '@ticatec/node-exception';

// 框架会捕获这些错误并按对应状态码渲染
throw new ActionNotFoundError();                     // 404，消息固定
throw new UnauthenticatedError();                    // 401，消息固定
throw new IllegalParameterError('输入数据无效');       // 400，消息由你给出

// 每个构造函数都接受 ErrorOptions，可以保留原始异常：
throw new IllegalParameterError('输入数据无效', { cause: parseError });
```

## API 参考

### 类型

```typescript
// 函数签名
export type RestfulFunction = (req: Request) => any;
export type ControlFunction = (req: Request, res: Response) => any;
export type moduleLoader = () => Promise<any>;

// 用户接口。两个接口都是空的，这是刻意的：框架从不读取用户对象上的任何字段，
// 因此也不声明任何字段，形状由你的应用决定。
export interface CommonUser {}

export interface LoggedUser extends CommonUser {
    actAs?: CommonUser;   // 用于用户扮演
}
```

通过模块增强声明一次自己的用户模型，应用里所有 `getLoggedUser(req)` 与 `req.user`
就都是这个类型：

```typescript
// types/keelson-express.d.ts
import '@ticatec/keelson-express';

interface AppUser {
    accountCode: string;
    name: string;
    isPlatform?: boolean;
    tenant?: { code: string; name: string };
    actAs?: AppUser;
}

declare module '@ticatec/keelson-express' {
    interface CustomUserRegistry {
        user: AppUser;
    }
}
```

`req.user` 已由本包声明在 Express 的 `Request` 上，无需再单独增强 `Express.Request`。

### 用户解析

每个请求在进入路由之前，由 `UserResolver` 解析出调用者。默认实现 `HeaderUserResolver`
读取 API 网关注入的 `user` 头（URL 编码的 JSON）与 `x-language` 头。

> **这个头是被信任的。** 头里是什么，调用者就是谁。因此服务必须只能经由网关访问，
> 而网关要自己设置这个头并剥掉客户端带来的同名头。直接暴露出去，任何客户端都能
> 把自己声明成任何人。

每个环节都是独立方法，改其中一个不必把其余的重写一遍：

```typescript
import { HeaderUserResolver, setUserResolver } from '@ticatec/keelson-express';

class BearerResolver extends HeaderUserResolver {
    protected override userHeader(): string {
        return 'authorization';
    }
    protected override decode(raw: string): unknown {
        return verifyJwt(raw.replace(/^Bearer /, ''));
    }
}

setUserResolver(new BearerResolver());   // 在应用入口调用一次
```

身份来自完全不同的地方时，直接继承 `UserResolver`：

```typescript
import UserResolver, { setUserResolver } from '@ticatec/keelson-express';

class SessionResolver extends UserResolver {
    async resolve(req: Request) {
        return sessions.get(req.cookies.sid);
    }
}

setUserResolver(new SessionResolver());
```

解析器不负责拒绝请求。返回 `undefined` 表示匿名，公开路由正是靠这个保持公开；
头格式不对时会记一条日志并同样按匿名处理。授权是 `isValidUser()` 的职责，
把匿名请求变成 401 的是 `routerHelper.checkLoggedUser()`。

### 后台处理器

```typescript
import { ProcessorManager, CommonProcessor } from '@ticatec/keelson-express';

class MailProcessor extends CommonProcessor<Mail> {
    constructor() { super(30); }                        // 每 30 秒轮询一次
    protected async loadToProcessData(): Promise<Mail[]> { return mailRepo.pending(); }
    protected async processItem(mail: Mail): Promise<void> { await send(mail); }
}

ProcessorManager.getInstance().register(MailProcessor);
ProcessorManager.getInstance().startAll();
```

`BaseServer.shutdown()` 会调用 `ProcessorManager.getInstance().stopAll()`，
停掉定时器并等待还在执行中的任务结束。

## 系统要求

- Node.js >= 18.0.0
- Express ^5.0.0
- TypeScript ^5.0.0（从源码构建时）

## 日志

日志走 [`@ticatec/logger-api`](https://www.npmjs.com/package/@ticatec/logger-api) 契约。
未注入实现时回退到 console，按 `LOG_LEVEL` 过滤。

路由绑定、请求生命周期与处理器轮询记在 `debug`，服务启停记在 `info`。
框架不会把用户标识写进日志：网关注入的 `user` 头不会被回显，`isValidUser()` 校验失败时
记录的是哪条路由、是否处于代理身份状态，而不是被拒的是谁。

请求与响应体只在显式打开时才记录——设置 `Controller.debugEnabled = true`。
这个开关会把 `req.body` 与 `req.query` 打到 `debug` 上，客户端发来的一切（包括凭据）
都在里面，属于开发期的工具，不应出现在生产环境。

## 贡献

本包位于 [Keelson](https://github.com/ticatec/keelson) monorepo，欢迎在该仓库提交 issue 与 PR。

### 开发设置

```bash
git clone https://github.com/ticatec/keelson.git
cd keelson
pnpm install
cd packages/keelson-express

pnpm build       # 同时构建 CJS 与 ESM 产物（构建前先跑 lint）
pnpm test        # 运行测试
pnpm typecheck   # 对三套配置做类型检查
pnpm lint        # 仅 lint
```

在 monorepo 根目录执行 `pnpm verify`，会对全部包做构建、类型检查与测试。

工作区只支持 pnpm：这里的依赖用 `workspace:*` 声明，npm 不认识这个协议，
`npm install` 会直接以 `EUNSUPPORTEDPROTOCOL` 失败。

### 发布

```bash
pnpm publish:public   # prepublishOnly 会先跑 lint、typecheck、test 与 build
```

## 授权协议

MIT —— 详见 [LICENSE](LICENSE) 文件。

## 👨‍💻 作者

**Henry Feng** —— [huili.f@gmail.com](mailto:huili.f@gmail.com)

## 🔗 相关链接

- [GitHub 仓库](https://github.com/ticatec/keelson/tree/main/packages/keelson-express)
- [NPM 包](https://www.npmjs.com/package/@ticatec/keelson-express)
- [问题反馈](https://github.com/ticatec/keelson/issues)
- [变更日志](CHANGELOG.md)
