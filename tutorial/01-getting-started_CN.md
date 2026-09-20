# 1. 起步

中文 | [English](01-getting-started.md) · [教程目录](README_CN.md)

读完这一章，你会有一个连上 PostgreSQL、能响应请求、能报告自身健康状况的服务。
自己写的代码大约六十行。

## 什么是 Keelson？

**Keelson**（龙骨内板）是造船工程中紧固在龙骨之上、贯穿整条船体底部的关键内纵梁。它将全船的肋骨牢固锁紧为一个坚不可摧的整体——平时你从外面看不到它，但没有它整个船体结构便无法承载。

在 Node.js 与 Express 生态中，Keelson 是一个专为**企业级关系型数据库应用**设计的 TypeScript 业务开发框架。它适合这类典型的后端服务：大部分接口在一个事务内读写几张表、租户与用户信息从请求透传、业务的核心是严谨的领域规则而非重复的基础设施拼装。

### 核心设计哲学

Keelson 对应用程序的骨架有明确的主张，而在其他各处保持极度的精简与克制：

- **不造笨重的 ORM，拥抱原生 SQL**：SQL 历经数十年检验，是与关系数据库对话最精确、性能最透明的语言。在 Keelson 中，你直接书写带有参数绑定的原生 SQL，复杂查询由强类型的动态查询构造器辅助完成，没有黑盒生成的低效关联。
- **基于上下文隐式贯穿的声明式事务**：事务在 Service 层声明一次，通过 Node.js 原生的 `AsyncLocalStorage` 隐式向下贯穿。不论调用栈多深、横跨多少个 Repository 和 DAO，它们自动共享同一个数据库连接与事务上下文，**无需在函数签名间层层手工传递连接对象**。
- **轻量显式的依赖注入（BeanFactory）**：摒弃繁重复杂的全局元数据扫描与魔术装配。组件通过名称显式注册、按需惰性单例实例化，彻底解耦模块初始化顺序，杜绝循环依赖引起的隐蔽启动故障。

### 严格的四层分层架构

Keelson 将后端业务逻辑严格划分在四层之中，各层各司其职，仅向下单向依赖：

| 层级 | 职责与约定 | 关键技术 / 约束 |
| :--- | :--- | :--- |
| **Web 层** (`routes` + `controller`) | HTTP 路由映射与**所有边界参数校验** | 基于 `@ticatec/bean-validator` 声明式校验，下游永不重复校验入参结构 |
| **Service 层** | 核心业务逻辑与**唯一的事务边界** | 写操作使用 `@Transaction()`，读操作使用 `@Transaction(Propagation.NONE)` |
| **Repository 层** | 领域实体组装、简单状态检查与缓存管理 | 数据与业务的桥梁，Redis 缓存归此层管理，绝不向上或向下泄露 |
| **DAO 层** | 单表纯 SQL 数据读写 | 绝无业务规则，从事务上下文自动拾取数据库连接 |

---

## 安装

```bash
pnpm add @ticatec/keelson-express @ticatec/keelson-core \
         @ticatec/bean-validator @ticatec/node-exception \
         @ticatec/logger-api reflect-metadata

pnpm add @ticatec/keelson-pg pg          # 或 keelson-mysql + mysql2、keelson-dm + dmdb
pnpm add -D typescript @types/node @types/express
```

Keelson 同时提供 CommonJS 与 ESM 产物。下面的示例用 ESM——`package.json` 里
`"type": "module"`，`tsconfig.json` 里模块解析用 `NodeNext`，相对导入即使源文件是 `.ts`
也要写 `.js` 后缀。最后这条常让人意外：这是 Node 对 ESM 的要求，TypeScript 刻意不去改写它。

`@Transaction` 是一个要读参数元数据的装饰器，所以 `tsconfig.json` 里这两项不是可选的：

```json
{
  "compilerOptions": {
    "target": "es2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "strict": true
  }
}
```

并且 `reflect-metadata` 必须在任何用到装饰器的代码之前导入一次：

```typescript
// src/main.ts —— 整个程序的第一行
import 'reflect-metadata';
```

漏了它，`@Transaction` 会在启动时直接抛错，而不是悄悄地不生效——这正是你想要的失败方式。

## 最小的服务

四个文件。从最底下往上看。

**`src/dao/GreetingDAO.ts`** —— 只有 SQL。

```typescript
import { CommonDAO } from '@ticatec/keelson-core';

export interface Greeting {
    id: string;
    text: string;
}

export class GreetingDAO extends CommonDAO {
    async findById(id: string): Promise<Greeting | null> {
        return await this.findByPK('SELECT id, text FROM greetings WHERE id = $1', [id]);
    }
}
```

`findByPK` 返回映射好的第一行，没有就是 `null`。列名自动转驼峰：`created_at` 变成
`createdAt`。你没有打开过连接——DAO 从当前作用域里的事务拿连接，这正是第 2 章的主题。

**`src/repository/GreetingRepository.ts`** —— 聚合 DAO。

```typescript
import { CommonRepository } from '@ticatec/keelson-core';
import { GreetingDAO, Greeting } from '../dao/GreetingDAO.js';

export class GreetingRepository extends CommonRepository {
    private get dao(): GreetingDAO {
        return this.getDAOInstance<GreetingDAO>('GreetingDAO');
    }

    async findById(id: string): Promise<Greeting | null> {
        return this.dao.findById(id);
    }
}
```

一个 DAO 上面套一个 Repository，在这个规模下看着纯属多余，确实也是。等到某个用例要动
两张表时它就不多余了——第 2 章。

**`src/service/GreetingService.ts`** —— 业务规则与事务边界。

```typescript
import { CommonService, Transaction } from '@ticatec/keelson-core';
import { ActionNotFoundError } from '@ticatec/node-exception';
import { GreetingRepository } from '../repository/GreetingRepository.js';
import { Greeting } from '../dao/GreetingDAO.js';

export class GreetingService extends CommonService {
    private get repo(): GreetingRepository {
        return this.getRepositoryInstance<GreetingRepository>('GreetingRepository');
    }

    @Transaction()
    async get(id: string): Promise<Greeting> {
        const greeting = await this.repo.findById(id);
        if (greeting == null) {
            throw new ActionNotFoundError();      // 变成 404
        }
        return greeting;
    }
}
```

**`src/routes/GreetingRoutes.ts`** —— HTTP 暴露面。

```typescript
import { CommonRoutes, routerHelper } from '@ticatec/keelson-express';
import { beanFactory } from '@ticatec/keelson-core';
import { GreetingService } from '../service/GreetingService.js';

export default class GreetingRoutes extends CommonRoutes {
    private get service(): GreetingService {
        return beanFactory.createBean<GreetingService>('GreetingService')!;
    }

    protected bindRoutes() {
        this.get('/:id', routerHelper.invokeRestfulAction(
            req => this.service.get(String(req.params.id))
        ));
    }
}
```

那个 `String(...)` 不是装饰。Express 5 把路由参数的类型定为 `string | string[]`——
通配段可以匹配多个值——所以把 `req.params.id` 直接传给 `string` 形参在 `strict` 下编译
不过。包一层，或者用带类型标注的解构;但别用 `as string`，那会把真的是数组的情况
一起蒙混过去。

`invokeRestfulAction` 接受一个"输入请求、返回值"的函数。返回值被序列化为 JSON；
返回 `null` 变成 `204 No Content`；抛出的错误交给错误中间件，带着正确的状态码回来。
你完全不碰 `res`。

## 启动

```typescript
// src/main.ts
import 'reflect-metadata';
import BaseServer, { AppConf } from '@ticatec/keelson-express';
import { DBManager, beanFactory } from '@ticatec/keelson-core';
import { initializePg } from '@ticatec/keelson-pg';

import { GreetingDAO } from './dao/GreetingDAO.js';
import { GreetingRepository } from './repository/GreetingRepository.js';
import { GreetingService } from './service/GreetingService.js';

class GreetingServer extends BaseServer {
    public constructor() {
        super();
    }

    protected async loadConfigFile(): Promise<void> {
        AppConf.init({
            web: { port: 3000, ip: '0.0.0.0', contextRoot: '/api' },
            database: {
                host: 'localhost', port: 5432,
                database: 'demo', user: 'demo', password: process.env.DB_PASSWORD,
                max: 10
            }
        });
    }

    protected getWebConf(): any {
        return AppConf.getInstance()!.get('web');
    }

    protected async beforeStart(): Promise<void> {
        DBManager.init(initializePg(AppConf.getInstance()!.get('database')));

        beanFactory.register('GreetingDAO', GreetingDAO);
        beanFactory.register('GreetingRepository', GreetingRepository);
        beanFactory.register('GreetingService', GreetingService);
    }

    protected async setupRoutes(): Promise<void> {
        await this.bindRoutes('/greetings', () => import('./routes/GreetingRoutes.js'));
    }
}

BaseServer.startup(new GreetingServer());
```

`BaseServer` 按固定顺序调用这些方法：`loadConfigFile()`、`beforeStart()`、
`getWebConf()`，然后创建 Express 应用、挂载健康检查、调用 `setupRoutes()`、开始监听。
凡是必须在第一个请求到达之前就绪的东西——数据库、bean 注册——都放进 `beforeStart()`。

`public constructor() { super(); }` 是必须的：`BaseServer` 的构造函数是 `protected`，
不自己声明一个，`new GreetingServer()` 编译不过。

## 不用要就有的东西

```
GET /api/greetings/abc     你的路由
GET /health/live           进程活着就返回 200
GET /health/ready          所有关键检查通过返回 200，否则 503
GET /health                与 /health/ready 相同
```

健康检查端点挂在你的路由之前且免认证，这正是 Kubernetes 对探针的要求。
第 6 章讲怎么注册自己的检查项。

日志什么都不装就能用：`@ticatec/logger-api` 回退到 console，按 `LOG_LEVEL` 过滤。
用 `LOG_LEVEL=debug` 跑起来，你会看到路由注册、连接池创建、每条语句的执行——
但看不到绑定参数值，原因在第 6 章。

## 配置真正该从哪来

上面的示例把配置写死，是为了把代码收在一个文件里。真实服务用
`@ticatec/config-loader` 从 YAML 文件、Nacos 或 Consul 加载，那是第 8 章。
形状不变：你传给 `AppConf.init()` 的是什么，`AppConf.getInstance()!.get()` 读到的就是
什么，嵌套用点号：

```typescript
AppConf.getInstance()!.get('web.port');        // 3000
AppConf.getInstance()!.get('nope.nothing');    // undefined，不抛异常
```

注意那个 `!`。`getInstance()` 的返回类型是 `AppConf | null`——`init()` 之前是 null——
而在一个只会在 `loadConfigFile()` 之后运行的方法里，这个断言是诚实的。

## 起不来的时候

**`Cannot read properties of undefined (reading 'init')`，或启动时的装饰器报错**
—— `reflect-metadata` 没有最先导入。它必须是入口文件的第一行，排在任何会引入
`@Transaction` 类的 import 之前。

**`DBManager is not initialized`** —— 有代码在 `DBManager.init()` 之前调用了 DAO。
检查 `init` 是不是写在了 `setupRoutes()` 而不是 `beforeStart()` 里。

**`Express application is not created yet`** —— 在 `setupRoutes()` 之外调用了
`bindRoutes()`。`BaseServer` 创建应用之前，它并不存在。

**某个没注册过的 bean 名** —— `getDAOInstance('GreetingDAO')` 会抛错并指名道姓。
返回 `undefined` 的是 `beanFactory.createBean()`；两者为何不同，第 3 章解释。

---

下一章：[分层与事务](02-layers-and-transactions_CN.md) —— 四层架构换来了什么，
以及让它们协同工作的那一个机制。
