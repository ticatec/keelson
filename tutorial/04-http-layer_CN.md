# 4. HTTP 层

中文 | [English](04-http-layer.md) · [教程目录](README_CN.md)

从 socket 到你的 Service 之间的一切：路由怎么声明、控制器怎么把请求映射成一次服务调用、
请求体怎么校验，以及抛出的错误怎么变成状态码。

## 路由

一组路由是一个类。它拥有一个路径前缀和它下面的处理函数。

```typescript
import { CommonRoutes, routerHelper } from '@ticatec/keelson-express';

export default class UserRoutes extends CommonRoutes {
    protected bindRoutes() {
        this.get('/', routerHelper.invokeRestfulAction(req => this.list(req)));
        this.get('/:id', routerHelper.invokeRestfulAction(req => this.find(req)));
        this.post('/', routerHelper.invokeRestfulAction(req => this.create(req)));
    }
    // ...
}
```

在服务端挂载：

```typescript
protected async setupRoutes(): Promise<void> {
    await this.bindRoutes('/users', () => import('./routes/UserRoutes.js'));
}
```

最终路径是 `contextRoot` + 挂载路径 + 路由路径，所以在 `contextRoot: '/api'` 下，
第二个处理函数响应的是 `GET /api/users/:id`。模块的**默认导出**必须是这个类，而且它是
动态 import 的——服务器挂载之前，这个路由文件不会被加载。

## 两种处理函数包装

`invokeRestfulAction(fn)` 用于"返回一个值"的处理函数：

```typescript
routerHelper.invokeRestfulAction(async (req) => {
    return await this.service.find(String(req.params.id));
})
```

返回值被序列化为 JSON。返回 `null` 或 `undefined` 变成 `204 No Content`。抛出的错误交给
错误中间件。你完全不碰 `res`，这意味着你不可能忘记发送响应。

`invokeController(fn)` 用于必须自己控制响应的处理函数——文件下载、流式输出、
非 JSON 的内容类型：

```typescript
routerHelper.invokeController(async (req, res) => {
    const file = await this.service.export(String(req.params.id));
    res.setHeader('Content-Type', 'text/csv');
    res.send(file);
})
```

错误依然替你接住。区别只是响应归你管。

除此之外就是普通的 Express 处理函数——`this.get('/x', (req, res) => {...})` 能用，
只是没有了错误处理。

## 控制器

对于常见的 CRUD 形状，`CommonController<T>` 包住一个 service 并给你现成的处理函数：

```typescript
import { CommonSearchController } from '@ticatec/keelson-express';
import { beanFactory } from '@ticatec/keelson-core';

export class UserController extends CommonSearchController<UserService> {
    constructor() {
        super(beanFactory.createBean<UserService>('UserService')!);
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
另加 `search()`，它把 `req.query` 作为查询条件传给 service。每个方法返回一个处理函数，
路径与动词仍由你决定。

控制器调用的是同名的 service 方法——`createNew()` 调 `service.createNew(...)`——
如果 service 没有这个方法，就抛 `ActionNotFoundError`（404）。这就是控制器不需要接口
约束也能通用的原因：检查发生在调用时，并且以一个干净的 404 结束，而不是
`undefined is not a function`。

### 传给 service 的是什么

默认是登录用户和请求体：

```typescript
protected getCreateNewArguments(req: Request): Array<any> {
    return [this.getLoggedUser(req), req.body];
}
```

service 想要别的东西时覆写它——路径里的租户、某个请求头：

```typescript
export class UserController extends CommonSearchController<UserService> {
    protected override getCreateNewArguments(req: Request): Array<any> {
        return [this.getLoggedUser(req), String(req.params.tenantId), req.body];
    }
}
```

`getLoggedUser(req)` 在代理身份生效时返回被代理的那个用户，否则返回真实用户——第 5 章。

想在校验之前改造请求体，覆写 `buildNewEntry(req)` / `buildUpdatedEntry(req)`。

### `del()` 需要你自己写

`_del()` 默认直接抛 `ActionNotFoundError`，除非你覆写它。删除很少只是"拿 id 调一下
service"——通常有软删标记、级联关系，或者关于谁有权删的规则——所以框架拒绝替你猜。

### 不是 CRUD 的接口

`BaseController<T>` 是 `CommonController` 下面的那一层：它只持有注入进来的 service 和
logger，别的什么都没有。当一个接口有自己的形状时继承它——导出、审批、批量操作——
方法自己写。

在它里面，两个受保护的辅助方法给你和 CRUD 方法一样的延迟派发：

```typescript
import { BaseController } from '@ticatec/keelson-express';
import type { RestfulFunction } from '@ticatec/keelson-express';

export class ReportController extends BaseController<ReportService> {

    constructor(service: ReportService) {
        super(service);          // BaseController 的构造函数是 protected，自己声明一个 public 的
    }

    exportCsv(): RestfulFunction {
        return async (req) => this.service.exportCsv(
            this.getLoggedUser(req), String(req.query.month)
        );
    }
}
```

这里的 service 是有类型的，直接调就行。延迟派发的那一对——`checkInterface(name)`
在方法不存在时抛 `ActionNotFoundError`，`invokeServiceInterface(name, args)` 负责调用——
在上一层的 `CommonController` 上，正是它让 CRUD 方法能对一个没有接口约束的 service
保持通用。需要它们就继承 `CommonController`。

`RestfulFunction` 接收请求、返回一个值——它不是 Express 的处理函数，所以绑定的时候
一样要过 `routerHelper.invokeRestfulAction(...)`。

## 校验

声明规则，控制器会在调用 service 之前执行它们。

```typescript
import { StringValidator, NumberValidator, ValidationRules } from '@ticatec/bean-validator';

protected getCreateRules(): ValidationRules {
    return [
        new StringValidator('name', { required: true, maxLen: 64 }),
        new StringValidator('email', {
            required: true,
            maxLen: 128,
            format: { regex: /^[^@\s]+@[^@\s]+\.[^@\s]+$/, message: '邮箱格式不正确' }
        }),
        new NumberValidator('age', { minValue: 0, maxValue: 150 })
    ];
}
```

`getCreateRules()` 与 `getUpdateRules()` 都回落到 `getRules()`，所以新建和更新形状一致
时，覆写 `getRules()` 一次即可。但它们不一致的情况比你以为的多——更新通常要求一个
新建时不该出现的 `id`——所以它们是两个独立的钩子。

校验失败抛出 `IllegalParameterError`，错误中间件把它渲染成带校验消息的 `400`。
校验器同时也做净化：字符串默认 `trim`，另有 `toLowerCase` / `toUpperCase` 可用。

校验只覆盖规则提到的字段。没有规则的字段原样穿过，所以一个读 `body.isAdmin` 的 service
会老老实实读到客户端发来的任何值。要么把你打算接受的每个字段都声明出来，要么在
`buildNewEntry()` 里显式构造实体。

## 错误

在调用树的任何位置抛出，中间件把类型映射成状态码：

| 抛出 | 状态码 |
| --- | --- |
| `IllegalParameterError(message)` | 400 |
| `UnauthenticatedError()` | 401 |
| `InsufficientPermissionError()` | 403 |
| `ActionNotFoundError()` | 404 |
| `ConflictError(message)` | 409 |
| `TimeoutError()` | 408 |
| `TooManyRequestsError()` | 429 |
| `AppError(message?)` | 500 |
| `ProxyError()` | 502 |
| `ServiceUnavailableError()` | 503 |

只有那些消息本身要给调用方看的才接受 message 参数。`ActionNotFoundError` 与
`UnauthenticatedError` 的消息是固定的——告诉一个未认证的调用方认证**为什么**失败，
正是账号枚举漏洞的造法。

每个构造函数也接受 `ErrorOptions`，原始异常因此得以保留：

```typescript
throw new IllegalParameterError('日期区间不合法', { cause: parseError });
```

不是 `HttpError` 的异常一律变成 500 并返回一个通用响应体。堆栈只在非生产环境包含；
`NODE_ENV=production` 会剥掉它。

响应按 `Accept` 做内容协商——默认 JSON，客户端要 HTML 或纯文本就给对应格式。
所有插值进去的内容都做了 HTML 转义。

记录什么：5xx 带栈记 `error`，4xx 记 `debug`。客户端发了个不合法的请求不是线上事故，
把它记成 warning 正是仪表盘被噪音淹没的原因。你的处理函数不需要自己记录错误——
中间件看到它的时候，它已经被记下来了。

## 路由组与认证

`CommonRoutes` 默认开放。`AuthenticatedRoutes` 拒绝没有用户的请求：

```typescript
export default class UserRoutes extends AuthenticatedRoutes { /* ... */ }
```

更细的控制覆写 `isValidUser()`——第 5 章。

---

深入参考：[keelson-express 的 README](../packages/keelson-express/README_CN.md)（控制器
与路由）、[bean-validator 的 README](../packages/bean-validator/README_CN.md)（每个校验器
与选项），以及 [web 层提示词](../docs/prompts/AI_PROMPTS_2_WEB_CN.md)（规则）。

下一章：[身份与访问控制](05-identity_CN.md)。
