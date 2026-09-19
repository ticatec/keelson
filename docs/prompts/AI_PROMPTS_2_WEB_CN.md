# 2. Web 层 —— 路由与控制器

中文 | [English](AI_PROMPTS_2_WEB.md) · [目录](AI_PROMPTS_CN.md)

把一个 HTTP 请求变成一次 service 调用的那一层。它的第二个职责——也是最容易滑掉的
那个——是**所有**边界验证都在这里完成。

## 验证规则

对输入**形状**的每一条约束都声明在控制器上，别处一概没有：

- 必填 / 非空
- 数值的最大值与最小值
- 字符串长度，最小与最大
- 格式——邮箱、手机号、正则
- 枚举取值
- 日期范围

一个开头写着 `if (!data.name) throw new IllegalParameterError(...)` 的 service，
是由不相信这条规则的人写的。把那个检查删掉，改成一条规则。

service 仍然要检查的，是验证规则不可能知道的东西：编码是否唯一、状态迁移是否合法、
这个调用者能不能这么干。那些需要数据库或调用者信息，所以它们不是边界验证。

把这条线画清楚的实际理由：验证规则是声明式的、摆在边界上，所以"这个接口接受什么输入"
是一个文件就能读完的事。一旦散落各处，没人能不读四层代码就回答这个问题。

## 控制器不能做什么

不写 SQL，不碰 repository，不碰 DAO，不碰 `getDBConnection`。它按名字解析自己的
service、做验证、把请求映射成入参、返回。其余一切属于下游。

---

## 提示词 2.1 —— 一个 CRUD 实体的 Web 层

```
为 <Order> 创建 Web 层。

Service 接口（已定义，不要重写）：

  interface <OrderService> {
      createNew(user: AppUser, data: <Order>): Promise<string>;
      update(user: AppUser, data: <Order>): Promise<void>;
      search(user: AppUser, criteria: any): Promise<PaginationList<<Order>>>;
  }

实体字段及其约束：

  code        字符串，必填，最长 32，仅大写字母与数字
  customerId  字符串，必填，最长 36
  amount      数值，必填，0 到 1000000
  currency    字符串，必填，取值 CNY USD EUR 之一
  remark      字符串，可选，最长 500
  dueDate     日期，可选，不能早于今天

产出两个文件：

1. src/controller/<Order>Controller.ts
   - 继承 CommonSearchController<<OrderService>>
   - public 构造函数解析 service：
     super(beanFactory.createBean<<OrderService>>('<OrderService>')!)
   - getCreateRules()：上面每一条约束
   - getUpdateRules()：同上，外加 `id` 必填——并且 `code` **不**必填，
     因为更新不应当允许改动编码

2. src/routes/<Order>Routes.ts
   - 继承 AuthenticatedRoutes
   - 默认导出
   - 绑定 POST / -> createNew()，PUT / -> update()，GET / -> search()

使用 @ticatec/bean-validator 的 StringValidator、NumberValidator、DateValidator、
EnumValidator。除了 getCreateRules/getUpdateRules，别处一律不要写验证。

文档：
- 控制器的每个公开方法、以及你覆写的每个 protected 方法都写 JSDoc——
  getCreateRules、getUpdateRules、getCreateNewArguments 这些都是扩展点，
  要说清楚各自返回什么、与默认实现有何不同
- 路由类上写一段类级 JSDoc，列出它绑定的路径
```

## 提示词 2.2 —— 自定义 service 入参

```
<Order> 的 service 方法不是 (user, body) 这个形状。覆写 <Order>Controller 的参数映射：

  createNew  -> [user, 路径参数 :tenantId 取到的 tenantCode, req.body]
  update     -> [user, 路径参数 :id 取到的 id, req.body]

覆写 getCreateNewArguments(req) 与 getUpdateArguments(req)。

Express 5 里路由参数的类型是 `string | string[]`——每个都用 String(...) 包一层，
不要用 `as string` 断言。

getLoggedUser(req) 在代理身份生效时返回被代理的用户，用它，不要直接读 req.user。
```

## 提示词 2.3 —— 一个非 CRUD 的接口

```
给 <Order>Routes 加一个不符合 CommonController 形状的接口：

  POST /<:id>/cancel   请求体：{ reason: string }   -> <OrderService>.cancel(user, id, reason)

要求：
- 用 bean-validator 的规则集验证请求体：reason 必填，最长 200 字符。
  显式执行这套规则，因为这条路径不走 CommonController 的规则。
- 按控制器同样的方式解析 service
- 用 routerHelper.invokeRestfulAction 包装处理函数
- 成功时不返回任何内容，让框架回 204
- 处理函数写 JSDoc：做什么、@param、以及它自己会抛出的异常的 @throws
- 如果处理函数自己抛异常（校验器表达不了的规则），先记一条为什么

请说明这套验证规则放在哪里、怎么被调用——因为它不是 CommonController 的方法。
```

## 提示词 2.4 —— 自己控制响应的接口

```
给 <Order>Routes 加一个导出接口：

  GET /export  ->  一个 CSV 文件

要求：
- 用 routerHelper.invokeController 而不是 invokeRestfulAction，因为响应不是 JSON
- 设置 Content-Type 为 text/csv，并带上带文件名的 Content-Disposition
- 调用 service 之前先验证查询参数（日期区间必填，跨度最多 90 天）
- 让异常向外传播，invokeController 会接住并交给错误中间件

CSV 内容由 service 以字符串返回，控制器不负责拼装。
```

## 提示词 2.5 —— 验证之前改造请求体

```
客户端发来的是<扁平的点号键 / 与实体字段名不同的载荷>，而 service 期待<嵌套的实体>。

在 <Order>Controller 上覆写 buildNewEntry(req) 与 buildUpdatedEntry(req)，把进来的
请求体映射成实体形状。验证规则是对着映射结果跑的，所以规则按实体的字段名声明，
不是按客户端的。

不要接受实体没有声明的字段：逐字段显式构造对象，不要展开 req.body。没有验证规则的字段
会原样穿过，所以一次展开就是 `isAdmin: true` 抵达 service 的通道。
```

## 提示词 2.6 —— 需要自定义检查的验证规则

```
给 <Order>Controller 加上这几条内置校验器不够用的规则：

- `code` 既要符合格式又要是大写——用 StringValidator 的 `format`（{ regex, message }）
  配合 toUpperCase: true
- `dueDate` 必须至少在 <3> 天之后——用 DateValidator 的按天边界选项
- `items` 必须是非空数组、最多 <50> 项，每项含 productId 与至少为 1 的 quantity——
  用 ArrayValidator 嵌套 ObjectValidator

不要用 `check` 选项去查数据库。针对已存储数据的唯一性检查是 repository 的职责，
不是验证规则——一个会连数据库的校验器，会让每个请求在事务还没开始之前就先来一次往返。
```

---

下一篇：[Service 层](AI_PROMPTS_3_SERVICE_CN.md)。背景阅读：
[控制器指南](CONTROLLER_CN.md)、[数据校验指南](BEAN_VALIDATION_CN.md)、
教程第 [4](../../tutorial/04-http-layer_CN.md) 章。
