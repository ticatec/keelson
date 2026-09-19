# 1. 起步

中文 | [English](01-getting-started.md) · [教程目录](README_CN.md)

读完这一章，你会有一个连上 PostgreSQL、能响应请求、能报告自身健康状况的服务。
自己写的代码大约六十行。

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
