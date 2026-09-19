# 1. 模块初始化与访问控制

中文 | [English](AI_PROMPTS_1_MODULE.md) · [目录](AI_PROMPTS_CN.md)

把一个 Keelson 模块立起来：服务类、它的生命周期、数据库、bean 注册，以及决定谁能进来。

## 这一层负责什么

`BaseServer` 按固定顺序调用四个钩子，每个钩子里放什么不是风格问题：

| 钩子 | 该放什么 |
| --- | --- |
| `loadConfigFile()` | 加载配置、初始化日志、`AppConf.init()` |
| `beforeStart()` | 数据库、用户解析器、bean 注册、健康检查、后台处理器 |
| `getWebConf()` | 从配置里返回 `{ port, ip, contextRoot }`——纯读取 |
| `setupRoutes()` | `bindRoutes()` 调用，别的不放 |

任何一个请求可能碰到的东西，必须在 `beforeStart()` 结束前就位。Express 应用在它之后才
存在，所以 `bindRoutes()` 不可能更早被调用。

## 访问控制分两层，回答的是不同的问题

**调用者是谁？** —— `UserResolver`。默认实现读取 API 网关注入的 `user` 头。
它从不拒绝任何人；没有头就是没有 `req.user`。

**这个调用者能进这组路由吗？** —— 路由类上的 `isValidUser()`，或者对于单纯
"必须登录"的情况，直接继承 `AuthenticatedRoutes`。

针对单条记录的权限两者都不是，它属于 service——因为它需要那条记录。

---

## 提示词 1.1 —— 搭出服务类骨架

```
为一个 Keelson 模块创建入口与服务类。

模块名：<orders>
数据库：<PostgreSQL，用 @ticatec/keelson-pg>
上下文根：<"/api">

产出：

1. src/main.ts
   - 第一行是 `import 'reflect-metadata';`
   - 用 @ticatec/logger-pino 按加载到的日志配置初始化日志
   - `BaseServer.startup(new <Orders>Server());`
   - SIGTERM 与 SIGINT 的处理：调用 server.shutdown() 后 process.exit(0)

2. src/<Orders>Server.ts —— 继承 BaseServer 的类：
   - 一个调用 super() 的 public 构造函数（BaseServer 的是 protected，所以这是必需的）
   - loadConfigFile()：用 @ticatec/config-loader 的
     loadConfig('local', 'app.yaml', 'logger.yaml')，初始化日志，再 AppConf.init(appConf)
   - getWebConf()：返回 AppConf.getInstance()!.get('web')
   - beforeStart()：DBManager.init(initializePg(AppConf.getInstance()!.get('database')))
   - setupRoutes()：暂时留空，用注释标出 bindRoutes 的调用形状

3. config/app.yaml 与 config/logger.yaml，形状要与上面的调用对得上

暂时不要注册任何 bean，也不要加路由。
```

## 提示词 1.2 —— 注册 bean

```
在 <Orders>Server.beforeStart() 里加上 bean 注册。

用 Beans.getInstance() 配合懒加载器按以下顺序注册，这样每个模块只在首次使用时被导入：

  <OrderDAO>          -> ./dao/<OrderDAO>.js
  <OrderRepository>   -> ./repository/<OrderRepository>.js
  <OrderService>      -> ./service/impl/<OrderServiceImpl>.js

注意 service 是以**接口名**（<OrderService>）注册的，而加载器指向的是**实现**模块。
最后调用 `await beans.load()`。

每个加载器对应的模块，默认导出必须是那个类。

注册要排在 DBManager.init() 之后，排在任何可能解析 bean 的代码之前。
```

## 提示词 1.3 —— 默认的网关解析器

```
本服务部署在一个 API 网关之后，网关完成认证并把结果作为 `<x-auth-user>` 请求头注入，
内容是 URL 编码的 JSON。

1. 在 src/types/user-registry.d.ts 里定义应用的用户模型：

   interface AppUser {
       accountCode: string;
       name: string;
       tenantCode: string;
       roles: string[];
       actAs?: AppUser;
   }

   通过增强 '@ticatec/keelson-express' 的 CustomUserRegistry 注册它，使得 req.user 与
   getLoggedUser(req) 在任何地方都是 AppUser 类型，不需要任何断言。

2. 如果头名不是默认的 `user`，继承 HeaderUserResolver 并**只**覆写 userHeader()——
   解码与语言头保持原样。

3. 在 beforeStart() 里用 setUserResolver() 安装它，排在路由设置之前。

4. 在解析器上方的注释里写明部署要求：这个头是被完全信任的，所以服务必须除了经由网关
   之外不可达，并且网关必须剥掉客户端带来的同名头。
```

## 提示词 1.4 —— 验签的解析器

```
不要用默认解析器：本服务可被直接访问，必须自己验证调用者，而不是信任某个请求头。

创建 src/auth/<Jwt>UserResolver.ts：

1. 继承 HeaderUserResolver
2. 覆写 userHeader() 返回 'authorization'
3. 覆写 decode(raw)：去掉开头的 'Bearer '，用 <jose> 验证 token，把 claims 映射成 AppUser
4. 验证失败就让它抛——框架会记录并把请求按匿名处理，随后由路由层拒绝

在 beforeStart() 里用 setUserResolver() 安装。

不要在解析器内部拒绝请求，也不要在验证失败时返回一个填了一半的用户对象。
```

## 提示词 1.5 —— 非请求头来源的解析器

```
调用者的身份来自<会话 cookie / 数据库里的会话存储>，不是请求头。

创建 src/auth/<Session>UserResolver.ts，继承 UserResolver（那个抽象基类，不是
HeaderUserResolver），只实现一个 resolve(req) 方法，返回用户或 undefined。

用具名导入：`import { UserResolver } from '@ticatec/keelson-express'`——
这个包的默认导出是 BaseServer。

返回 undefined 表示匿名；公开路由正是靠这个保持公开。
```

## 提示词 1.6 —— 路由组鉴权

```
定义 <orders> 这组路由的访问规则。

要求：
- <所有调用者必须已认证且属于某个租户>
- <带 ORDER_ADMIN 角色的调用者才能访问 /admin 子组>

生成路由类：

1. <Order>Routes 继承 AuthenticatedRoutes —— 匿名调用者得到 401，
   然后覆写 isValidUser(user) 做 <return user.tenantCode != null>
2. <Order>AdminRoutes 继承 CommonRoutes —— 覆写 isValidUser(user) 检查角色，
   并且抛 InsufficientPermissionError() 而不是返回 false，让调用者拿到 403 而不是 401

代理身份生效时，isValidUser 拿到的是 actAs 用户。不要把针对单条记录的权限检查写在
这里——那属于 service。
```

## 提示词 1.7 —— 健康检查与后台处理器

```
在 <Orders>Server.beforeStart() 的 DBManager.init() 之后加上：

1. 一个名为 'database' 的关键健康检查：取一个连接、执行 SELECT 1、在 finally 里关闭。
   关键的含义是：失败会把这个 pod 移出负载均衡。

2. 一个名为 'cache' 的非关键健康检查：按 Redis ping 的结果返回 UP/DOWN。
   非关键的含义是：失败时报 DEGRADED 并返回 200——缓存冷了是慢，不是坏。

3. 用 ProcessorManager.getInstance() 注册 <OrderExpiryProcessor> 并调用 startAll()。
   注册必须排在数据库与 bean 之后，因为处理器可能在启动后一秒内就跑第一个 tick。

用 this.registerHealthCheck(name, indicator, isCritical, timeoutMs)。超时默认 3000ms，
要设得比探针自己的超时更短。
```

---

下一篇：[Web 层](AI_PROMPTS_2_WEB_CN.md)。背景阅读：教程第
[1](../../tutorial/01-getting-started_CN.md)、[5](../../tutorial/05-identity_CN.md)、
[6](../../tutorial/06-logging-and-health_CN.md) 章。
