# Keelson

中文 | [English](README.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

面向 Node.js 与 Express 的企业级 TypeScript 框架：四层数据访问、声明式事务、依赖注入、
请求校验、标准化错误处理，以及带健康探针与后台处理器的服务骨架。

Keelson（内龙骨）是压在船体龙骨之上、纵贯全长的那根梁。它把肋骨连成整体，承担纵向载荷。
平时看不见它，少了它什么也撑不住。

## 它解决什么问题

Keelson 面向的是跟关系型数据库打交道的业务服务：大多数接口就是在一个事务里读写几张表，
租户信息从请求里来，真正值得动脑子的是业务规则，不是这些管道。

它对应用的形状有明确主张——四层、一次服务调用一个事务、依赖按名字解析——除此之外刻意保持
轻薄。它不是 ORM，SQL 要你自己写；也不是靠装饰器和元数据扫描的 DI 容器，你注册类，拿回
懒加载的单例。

## 一个核心想法

事务在 **Service** 层打开，通过 `AsyncLocalStorage` 沿调用树往下传。下面的每个 DAO——
无论嵌套多深、跨多少个 Repository——拿到的都是同一个连接，不需要任何人把它当参数传递，
也不需要任何一层知道自己是不是在事务里。

```typescript
@Transaction()
async registerUser(user: User): Promise<string> {
    const existing = await this.userRepo.findByEmail(user.email);   // 同一个连接
    if (existing) {
        throw new Error('User already exists');                     // 回滚
    }
    return await this.userRepo.save(user);                          // 同一个连接
}
```

抛异常即回滚，正常返回即提交。`@Transaction(Propagation.REQUIRES_NEW)` 开一个独立事务，
外层回滚它照样提交——典型场景是那条无论如何都要留下的审计记录。

## 架构

```
┌─────────────────────────────────────────────┐
│  Controller / Router                        │  keelson-express
│  HTTP 处理、校验、错误映射                    │  bean-validator · node-exception
└───────────────────┬─────────────────────────┘
                    │
┌───────────────────▼─────────────────────────┐
│  Service                                    │  keelson-core
│  业务逻辑、@Transaction 事务边界              │
└───────────────────┬─────────────────────────┘
                    │
┌───────────────────▼─────────────────────────┐
│  Repository                                 │  keelson-core
│  领域持久化、DAO 聚合                         │
└───────────────────┬─────────────────────────┘
                    │
┌───────────────────▼─────────────────────────┐
│  DAO                                        │  keelson-core
│  SQL 执行、结果映射                           │  + pg / mysql / dm 驱动
└───────────────────┬─────────────────────────┘
                    │
              ┌─────▼─────┐
              │  数据库    │
              └───────────┘
```

每一层只跟紧邻的下一层对话。Service 不直接碰 DAO，必须经由 Repository。这条规矩是事务
边界能站得住的前提——如果 Service 可以直接调 DAO，边界就变成"谁最后记得加在哪儿"。

## 一个请求，从头到尾

**DAO** —— 只有 SQL。占位符用各自方言（PostgreSQL 是 `$1`，MySQL 与达梦是 `?`）；
动态拼 SQL 时用 `getPlaceholder(i)` 拿到当前方言的写法。

```typescript
export class UserDAO extends CommonDAO {
    async findByEmail(email: string): Promise<User | null> {
        return await this.findByPK('SELECT * FROM users WHERE email = $1', [email]);
    }

    async save(user: User): Promise<InsertResult<User>> {
        return await this.executeInsertQuery<User>(
            'INSERT INTO users (id, name, email) VALUES ($1, $2, $3) RETURNING *',
            [user.id || this.genID(), user.name, user.email]
        );
    }
}
```

**Repository** —— 聚合 DAO，用领域语言说话。

```typescript
export class UserRepository extends CommonRepository {
    private get userDAO(): UserDAO {
        return this.getDAOInstance<UserDAO>('UserDAO');
    }

    async findByEmail(email: string): Promise<User | null> {
        return this.userDAO.findByEmail(email);
    }
}
```

**Service** —— 业务规则与事务边界。

```typescript
export class UserService extends CommonService {
    private get userRepo(): UserRepository {
        return this.getRepositoryInstance<UserRepository>('UserRepository');
    }

    @Transaction()
    async registerUser(user: User): Promise<string> {
        if (await this.userRepo.findByEmail(user.email)) {
            throw new IllegalParameterError('该邮箱已被注册');
        }
        return await this.userRepo.save(user);
    }
}
```

**Controller 与路由** —— `CommonController` 把 CRUD 映射到 service，按声明的规则校验
请求体，并把抛出的 `HttpError` 变成对应状态码。

```typescript
export class UserController extends CommonSearchController<UserService> {
    constructor() {
        super(beanFactory.createBean<UserService>('UserService')!);
    }

    protected getCreateRules(): ValidationRules {
        return [
            new StringValidator('name', { required: true, maxLen: 64 }),
            new StringValidator('email', {
                required: true,
                maxLen: 128,
                format: { regex: /^[^@\s]+@[^@\s]+\.[^@\s]+$/, message: '邮箱格式不正确' }
            })
        ];
    }
}

export default class UserRoutes extends AuthenticatedRoutes {
    private controller = new UserController();

    protected bindRoutes() {
        this.post('/', routerHelper.invokeRestfulAction(this.controller.createNew()));
        this.put('/', routerHelper.invokeRestfulAction(this.controller.update()));
        this.get('/', routerHelper.invokeRestfulAction(this.controller.search()));
    }
}
```

`CommonController` 提供 `createNew()`、`update()`、`del()`；`CommonSearchController`
另加 `search()`，它把 `req.query` 作为查询条件交给 service。每个方法返回的都是一个处理
函数，路径与 HTTP 动词由你决定。不在这个形状里的接口，就是普通路由配普通处理函数。

**装配与启动** —— 注册类，指定数据库，启动。

```typescript
import BaseServer, { AppConf } from '@ticatec/keelson-express';
import { DBManager, beanFactory } from '@ticatec/keelson-core';
import { initializePg } from '@ticatec/keelson-pg';

class MyServer extends BaseServer {
    public constructor() {
        super();   // BaseServer 的构造函数是 protected，子类需要自己声明一个公开的
    }

    protected async loadConfigFile(): Promise<void> {
        AppConf.init(await loadYourConfig());
    }

    protected getWebConf() {
        return AppConf.getInstance()!.get('web');
    }

    protected async beforeStart(): Promise<void> {
        DBManager.init(initializePg(AppConf.getInstance()!.get('database')));

        beanFactory.register('UserDAO', UserDAO);
        beanFactory.register('UserRepository', UserRepository);
        beanFactory.register('UserService', UserService);

        this.registerHealthCheck('database', async () => ({
            status: await pingDatabase() ? 'UP' : 'DOWN'
        }));
    }

    protected async setupRoutes(): Promise<void> {
        await this.bindRoutes('/users', () => import('./routes/UserRoutes.js'));
    }
}

BaseServer.startup(new MyServer());
```

`beanFactory.register()` 不会构造任何东西。`createBean<T>(name)` 返回的是代理，真正的
实例在首次访问时才构造并从此缓存。正因为如此，Service 引用 Repository、Repository 引用
DAO 时，不存在需要操心的初始化顺序。它的返回类型是 `T | undefined`——名字没注册过时是
`undefined`，所以上面有个 `!`；层内的 `getDAOInstance()` 与 `getRepositoryInstance()`
则是直接抛错，并告诉你漏注册的是哪个。

本文件中的每段示例代码都对着已发布的类型编译通过。

## 包一览

全部发布在 `@ticatec/*` 作用域下。每个包都同时提供 CommonJS 与 ESM 产物及 TypeScript
类型声明，面向 Node 18+，且开启了 `strict`。

### 框架

| 包 | 版本 | 职责 |
| --- | --- | --- |
| [keelson-express](packages/keelson-express) | 1.0.0 | `BaseServer`、控制器、路由、健康探针、后台处理器、用户解析 |
| [keelson-core](packages/keelson-core) | 1.0.0 | 四层数据访问——`CommonDAO` / `CommonRepository` / `CommonService`、`@Transaction`、`BeanFactory`、`CommonSearchCriteria`、分页 |

### 数据库驱动

keelson-core 的 `DBConnection` / `DBFactory` 契约实现。选一个装上，上面各层不会再提到它。

| 包 | 版本 | 数据库 |
| --- | --- | --- |
| [keelson-pg](packages/keelson-pg) | 1.0.0 | PostgreSQL |
| [keelson-mysql](packages/keelson-mysql) | 1.0.0 | MySQL |
| [keelson-dm](packages/keelson-dm) | 1.0.0 | 达梦 (DM8) |

### 独立库

Keelson 用到它们，但它们都不依赖 Keelson，在任何 Node 项目里单独用都成立。

| 包 | 版本 | 职责 |
| --- | --- | --- |
| [logger-api](packages/logger-api) | 1.0.0 | 零依赖的日志契约——库面向它输出，应用注入具体实现 |
| [logger-pino](packages/logger-pino) | 1.0.0 | `logger-api` 的 pino 实现，支持 appender 与按分类设级别 |
| [bean-validator](packages/bean-validator) | 1.1.0 | 请求体与 DTO 的声明式校验 |
| [node-exception](packages/node-exception) | 2.1.0 | HTTP 错误类型与渲染它们的 Express 错误中间件 |
| [config-loader](packages/config-loader) | 1.1.0 | 本地 YAML/JSON、Nacos、Consul 三种配置源，同一套接口 |
| [redis-client](packages/redis-client) | 1.2.0 | ioredis 封装，支持具名实例与缓存辅助方法 |

## 贯穿所有包的约定

**日志面向契约，不面向具体库。** 各个包调用 `@ticatec/logger-api` 的
`getLogger(name, category)`，从不引入日志库本身。不注入任何实现时回退到 console 并按
`LOG_LEVEL` 过滤；装上 `@ticatec/logger-pino` 并在应用入口注入一次，就得到结构化 JSON、
appender 与按分类的级别控制。框架内没有任何一处直接写 `console`。

**默认不把凭据和载荷写进日志。** 连接配置只记摘要，不含口令与连接串。SQL 只记语句与参数
**个数**，绝不记录绑定值——确需排查时设置 `KEELSON_LOG_SQL_PARAMS=true`。请求体与响应体
只在设置 `Controller.debugEnabled = true` 后才记录。这两个开关都是开发期工具，文档里也是
这么写的。

**错误自带状态码。** 在调用树的任何位置抛出 `@ticatec/node-exception` 的
`IllegalParameterError`、`UnauthenticatedError`、`InsufficientPermissionError`、
`ActionNotFoundError`、`ConflictError` 等，错误中间件会渲染成对应状态码，按 `Accept` 在
JSON / HTML / 文本之间协商，并且只在非生产环境显示堆栈。5xx 带栈记 error，4xx 记 debug
——客户端发了个不合法的参数，不是一次线上事故。

**用户来自解析器，而不是写死的请求头。** 默认的 `HeaderUserResolver` 读取 API 网关注入的
`user` 头。这个头是被**信任**的，所以服务必须部署在网关之后，由网关设置它并剥掉客户端带
来的同名头。用 `setUserResolver()` 可以换成自己的实现——bearer token、cookie、session
存储——各路由照常从 `req.user` 拿到结果。

**健康探针开箱即用。** `/health/live`、`/health/ready` 与 `/health` 自动挂载且免认证。
用 `registerHealthCheck()` 注册自己的指示器；关键组件 DOWN 会让就绪探针返回 503，
非关键组件返回 200 DEGRADED。生产环境下响应会省略 details 并泛化错误字符串，探针不会
变成内部信息的出口。

**双模块格式，同一份状态。** 每个包都同时发布 CJS 与 ESM。`DBManager`、事务上下文、
`beanFactory`、`AppConf`、`ProcessorManager` 这些单例都以 `Symbol.for()` 为键锚定在
`globalThis` 上——即使一个进程同时加载了两份产物，拿到的仍是同一个，而不是两个各说各话的。

## 快速开始

```bash
pnpm add @ticatec/keelson-express @ticatec/keelson-core \
         @ticatec/bean-validator @ticatec/node-exception \
         @ticatec/logger-api reflect-metadata

# 再加上你的数据库驱动
pnpm add @ticatec/keelson-pg pg
```

`@Transaction` 依赖 `reflect-metadata`，需要在最前面导入一次：

```typescript
import 'reflect-metadata';
```

先读[教程](tutorial/README_CN.md)——九章，一章一个主题，各章独立成篇，
讲的是这些部件为什么长成这样、怎么拼在一起。

需要单个层的完整细节时，查这几份参考手册：

| 指南 | 内容 |
| --- | --- |
| [DAO 层](docs/prompts/DAO_GUIDE_CN.md) | 编写 DAO、查询辅助方法、`InsertResult` / `UpdateResult`、分页、占位符 |
| [Service 与 Repository](docs/prompts/SERVICE_GUIDE_CN.md) | 四层架构、`@Transaction`、传播行为、`TransactionManager` |
| [依赖注入](docs/prompts/DEPENDENCY_INJECTION_GUIDE_CN.md) | `beanFactory`、懒加载代理、`Beans` 加载器、循环依赖 |
| [查询条件](docs/prompts/SEARCH_CRITERIA_CN.md) | 动态查询构造器——基线契约、条件辅助方法、生成的 SQL |
| [控制器](docs/prompts/CONTROLLER_CN.md) | CRUD 与搜索控制器、校验规则、参数映射 |
| [数据校验](docs/prompts/BEAN_VALIDATION_CN.md) | 各类校验器、选项、自定义检查、多语言消息 |
| [AI 提示词](docs/prompts/AI_PROMPTS_CN.md) | 可粘贴进 AI 会话的分层规则块，以及按层组织的提示词 |

去掉 `_CN` 后缀即是英文版。

## 包重命名

五个包在首个 Keelson 版本之前完成了改名。属于框架自身的层用上了框架的名字；独立库保持
原名，因为它们脱离 Keelson 也成立。

| 原名 | 现名 | 旧名下最后一个版本 |
| --- | --- | --- |
| `@ticatec/node-common-library` | `@ticatec/keelson-core` | 3.2.5 |
| `@ticatec/pg-common-library` | `@ticatec/keelson-pg` | 3.1.0 |
| `@ticatec/mysql-common-library` | `@ticatec/keelson-mysql` | 2.1.0 |
| `@ticatec/dm-common-library` | `@ticatec/keelson-dm` | 1.0.2 |
| `@ticatec/common-express-server` | `@ticatec/keelson-express` | 2.0.1 |

每个都从 **1.0.0** 重新开始：npm 上换了名字就是一个新包，有自己的发布历史，沿用旧编号
是虚构的。

迁移就是把依赖名与导入路径做一次查找替换——没有任何导出改过名字或签名：

```diff
-import { CommonDAO, Transaction } from '@ticatec/node-common-library';
+import { CommonDAO, Transaction } from '@ticatec/keelson-core';
```

只有一处行为变化需要搜索而不是替换：`CommonRoutes.userCheck()` 已删除。它自
`common-express-server@0.5.4` 起就没有调用点，靠覆写它做授权的路由其实早就静默失去了这道
检查；请把方法体搬进 `isValidUser()`。其余变更见各包的 CHANGELOG。

旧名会在 npm 上标记废弃并指向各自的替代包——见 [DEPRECATIONS.md](DEPRECATIONS.md)。

## 在本仓库中开发

pnpm workspace。包之间的依赖用 `workspace:*` 声明，因此一切都对着本地源码构建。

```bash
pnpm install
pnpm build        # 按依赖图拓扑顺序构建
pnpm typecheck
pnpm test
pnpm verify       # build && typecheck && test —— 必须先 build，
                  # 因为跨包类型来自各包构建出的 lib/
```

单个包：

```bash
pnpm --filter @ticatec/keelson-core test
```

工作区只支持 pnpm：`workspace:*` 不是 npm 实现的协议，`npm install` 会直接以
`EUNSUPPORTEDPROTOCOL` 失败。

## 授权协议

MIT —— 详见 [LICENSE](LICENSE)。

## 👨‍💻 作者

**Henry Feng** —— [huili.f@gmail.com](mailto:huili.f@gmail.com)

## 🔗 相关链接

- [GitHub 仓库](https://github.com/ticatec/keelson)
- [问题反馈](https://github.com/ticatec/keelson/issues)
