# 5. 身份与访问控制

中文 | [English](05-identity.md) · [教程目录](README_CN.md)

`req.user` 从哪来、怎么把它标注成你自己的用户模型，以及一个请求可能在哪三个地方被挡回去。

## 默认方式：网关告诉你调用者是谁

Keelson 假定自己部署在一个已经完成认证的 API 网关之后，网关把认证结果作为请求头注入。
`HeaderUserResolver` 读的就是它：

- `user` —— URL 编码的 JSON，描述调用者
- `x-language` —— 可选，会被写到用户对象的 `language` 上

```
user: %7B%22accountCode%22%3A%22U1%22%2C%22name%22%3A%22Ada%22%7D
```

变成 `req.user = { accountCode: 'U1', name: 'Ada', language: 'zh-CN' }`。

> **这个头是被完全信任的。** 头里是什么，调用者就是谁。只有当服务除了经由网关之外
> 无法被访问，并且网关**剥掉客户端带来的同名头**再设置自己的，这才是安全的。
> 一旦服务被直接暴露——一条配错的 ingress、一个调试端口、同事在 pod 里 curl 一下——
> 任何客户端都能把自己声明成任何人，包括管理员。
>
> 如果你无法保证这一点，就别用默认解析器，换一个验签的。

这个阶段不拒绝任何请求。没有 `user` 头的请求就是没有 `req.user`，公开路由正是靠这个
保持公开。头格式不对时会记一条日志并同样按匿名处理——一个乱码的头不是认证失败，
是没有身份。

## 替换解析器

只改其中一步，继承 `HeaderUserResolver`：

```typescript
import { HeaderUserResolver, setUserResolver } from '@ticatec/keelson-express';

class BearerResolver extends HeaderUserResolver {
    protected override userHeader(): string {
        return 'authorization';
    }
    protected override decode(raw: string): unknown {
        return verifyJwt(raw.replace(/^Bearer /, ''));   // token 不合法就抛
    }
}
```

其余环节——读头、语言头、注入语言——照旧。从 `decode()` 抛异常是可以的：它会被记录，
请求按匿名继续，随后由路由层在需要用户时拒绝它。

身份完全不来自请求头时，直接继承 `UserResolver`：

```typescript
import { UserResolver, setUserResolver } from '@ticatec/keelson-express';
import { Request } from 'express';

class SessionResolver extends UserResolver {
    async resolve(req: Request) {
        const sid = req.cookies?.sid;
        return sid ? await sessions.get(sid) : undefined;
    }
}
```

在应用入口注册一次，服务启动之前：

```typescript
protected async beforeStart(): Promise<void> {
    setUserResolver(new SessionResolver());
}
```

解析器从不拒绝请求。返回 `undefined` 表示匿名；鉴权是下面另一件事。

## 把用户标注成自己的模型

`CommonUser` 与 `LoggedUser` 刻意是空的——框架从不读取用户对象上的任何字段，因此也
不声明任何字段。你的应用通过增强 `CustomUserRegistry` 声明一次形状：

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

从此 `req.user` 与 `getLoggedUser(req)` 在任何地方都是 `AppUser` 类型，不需要任何
类型断言。`req.user` 已由本包声明在 Express 的 `Request` 上，你不必自己去增强
`Express.Request`。

## 代理身份

用户对象上的 `actAs` 字段表示"这个管理员正在以那个用户的身份操作"。由此引出两条规则。

`getLoggedUser(req)` 在存在 `actAs` 时返回**被代理的那个用户**，否则返回真实用户。
业务代码因此操作的始终是"这个请求正在代表谁"，而不需要知道代理身份这回事：

```typescript
protected getCreateNewArguments(req: Request): Array<any> {
    return [this.getLoggedUser(req), req.body];   // 有 actAs 时就是 actAs
}
```

`isValidUser()` 拿到的同样是 `actAs`（如果有）。这正是你要的——要问的是**被代理的那个
账号**能不能做这件事——但也意味着真实管理员在这一步没有被再次检查。如果你的规则需要
同时判断两者，直接读 `req.user`。

## 鉴权：三个位置，三个问题

**1. 这组路由需要用户吗？**

```typescript
export default class UserRoutes extends AuthenticatedRoutes { /* ... */ }
```

`AuthenticatedRoutes` 拒绝没有用户的请求——`401`。`CommonRoutes` 是开放的。

**2. 这个用户能进这组路由吗？**

```typescript
export default class AdminRoutes extends CommonRoutes {
    protected override async isValidUser(user: RegisteredUser): Promise<boolean> {
        if (user == null) {
            return false;
        }
        const account = await accounts.find(user.accountCode);
        return account?.status === 'active' && account.role === 'admin';
    }
}
```

返回 false 得到 `401`。抛异常则交给中间件，所以当 `403` 才是诚实的答案时——"你确实是
你说的那个人，但你依然不能"——就抛 `InsufficientPermissionError()`。

这个检查每个请求执行一次，在任何处理函数之前。它适合粗粒度的问题：账号是否启用、
租户是否开通、角色是否匹配这组路由。

**3. 这个用户能对这条记录做这件事吗？**

这属于 Service，因为它需要那条记录：

```typescript
@Transaction()
async updateOrder(user: AppUser, order: Order): Promise<void> {
    const existing = await this.orders.findById(order.id);
    if (existing == null) {
        throw new ActionNotFoundError();
    }
    if (existing.tenantCode !== user.tenant?.code) {
        throw new ActionNotFoundError();      // 不是 403——理由见下
    }
    await this.orders.update(order);
}
```

注意对"属于别的租户的记录"返回的是 `404`。`403` 会确认这条记录存在，让人得以枚举其他
租户的 id。就当它不存在来回答——从那个调用方的视角看，它确实不存在。

## 在检查之前充实用户

`getUserHook()` 在 `isValidUser()` 之前运行，可以替换 `req.user`：

```typescript
protected override getUserHook() {
    return async (user: RegisteredUser) => {
        (user as AppUser).permissions = await permissions.load((user as AppUser).accountCode);
        return user;
    };
}
```

它对这组路由的每个请求都执行，也就是每个请求一次数据库往返。要么加缓存（第 8 章），
要么把这些数据折叠进网关注入的那个头里。

## 什么不会被记录

框架不会把用户标识写进日志。`user` 头不会被回显，`isValidUser()` 失败时记录的是哪条
路由、是否处于代理身份状态——而不是被拒的是谁。

这是刻意的默认值，不是疏漏：一份点名每个调用者的 debug 日志，就是一个没人规划过的
个人数据存储。需要按用户追踪请求，在你自己的中间件里加，由你来决定保留策略。

---

下一章：[日志与健康检查](06-logging-and-health_CN.md)。
