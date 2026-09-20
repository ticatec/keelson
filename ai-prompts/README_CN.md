# Keelson AI 提示词

中文 | [English](README.md)

用来驱动 AI 助手按本框架的约定写代码，而不是让它自己发明一套。会话开始时先贴一次下面的
规则块，然后贴你正在写的那一层的提示词。

| # | 层 | 文件 |
| --- | --- | --- |
| 1 | 模块初始化与访问控制 | [AI_PROMPTS_1_MODULE_CN.md](AI_PROMPTS_1_MODULE_CN.md) |
| 2 | Web 层 —— 路由与控制器 | [AI_PROMPTS_2_WEB_CN.md](AI_PROMPTS_2_WEB_CN.md) |
| 3 | Service 层 —— 接口与实现 | [AI_PROMPTS_3_SERVICE_CN.md](AI_PROMPTS_3_SERVICE_CN.md) |
| 4 | Repository 层 | [AI_PROMPTS_4_REPOSITORY_CN.md](AI_PROMPTS_4_REPOSITORY_CN.md) |
| 5 | DAO 层 | [AI_PROMPTS_5_DAO_CN.md](AI_PROMPTS_5_DAO_CN.md) |
| 附 | 动态查询与分页条件构建 | [SEARCH_CRITERIA_CN.md](SEARCH_CRITERIA_CN.md) |

## 规则块

先贴这个。后面所有提示词都假定助手已经拿到它。

```
你正在为一个基于 Keelson 框架（@ticatec/keelson-express、@ticatec/keelson-core）的应用
编写 TypeScript 代码。严格遵守以下规则——它们是这个代码库的约定，不是建议。

分层 —— 四层，每层只调用紧邻的下一层：

  Web（routes + controller） -> Service -> Repository -> DAO -> 数据库

  控制器绝不调用 repository 或 DAO。
  service 绝不调用 DAO。
  DAO 绝不调用另一个 DAO，也绝不调用 repository。

各类工作归属：

  Web 层        边界验证——全部。必填、最大/最小值、字符串长度、格式、枚举取值、
                日期范围。用 @ticatec/bean-validator 的规则声明在控制器上。
                下游任何一层都不再重复验证输入的形状。
                另外：把请求映射成 service 的入参，仅此而已。

  Service       业务逻辑，以及事务边界（@Transaction）。
                以接口声明契约；由一个 extends CommonService 并 implements 该接口的
                类实现。
                每一个会碰数据库的方法都要加装饰器——写用 @Transaction()，
                读用 @Transaction(Propagation.NONE)。不加就意味着上下文里没有连接，
                DAO 会在运行时抛异常。
                不写 SQL。不碰 req/res。不做输入形状的验证。

  Repository    service 与 DAO 之间的桥梁。做简单的实体检查：是否存在、状态是否可用、
                是否属于这个租户。用一个或多个 DAO 装配出领域实体。缓存归它管——
                用到 Redis 就在这一层用，不在 service，也不在 DAO。

  DAO           SQL，仅此而已。一张表的量。不含业务规则。

异常 —— 任何一层都可以抛，框架把类型映射成状态码：

  IllegalParameterError(msg)      400    UnauthenticatedError()          401
  InsufficientPermissionError()   403    ActionNotFoundError()           404
  TimeoutError()                  408    ConflictError(msg)              409
  TooManyRequestsError()          429    AppError(msg?)                  500

  绝不返回错误对象或 { success: false } 这样的包装。直接抛。
  记录存在但属于别的租户时，抛 ActionNotFoundError 而不是 InsufficientPermissionError
  ——403 等于确认了这条记录存在。

装配：

  类在 BaseServer.beforeStart() 里用 beanFactory（或用 Beans 注册懒加载器）按名字注册。
  层内部用 this.getRepositoryInstance<T>(name) 或 this.getDAOInstance<T>(name) 解析，
  写成 private getter，不要写成字段。

基类来自哪个包 —— 不要猜导入：

  @ticatec/keelson-core      CommonService、CommonRepository、CommonDAO、CommonSearchCriteria、
                             Transaction、Propagation、TransactionManager、beanFactory、Beans、
                             DBManager、getLogger；类型 PaginationList、QuickSearchResult、
                             InsertResult、UpdateResult、DBConnection
  @ticatec/keelson-express   Controller、BaseController、CommonController、
                             CommonSearchController、CommonRoutes、AuthenticatedRoutes、
                             routerHelper、UserResolver、HeaderUserResolver、
                             setUserResolver、getUserResolver、AppConf、
                             HealthCheckRegistry、CommonProcessor、ProcessorManager；
                             类型 LoggedUser、CommonUser、CustomUserRegistry、
                             RegisteredUser、RestfulFunction
  @ticatec/bean-validator    StringValidator、NumberValidator、DateValidator、
                             BooleanValidator、EnumValidator、ObjectValidator、ArrayValidator、
                             CommonValidator、setLocaleMessage；类型 ValidationRules
  @ticatec/node-exception    上面 ERRORS 表里的每一种异常

  其中两个是默认导出，不是具名导出：
      import BaseServer from '@ticatec/keelson-express';
      import beanValidator from '@ticatec/bean-validator';

  每个包只有一个入口。没有深层子路径导入——
  '@ticatec/keelson-express/common/BaseController' 解析不了。

JSDOC —— 必须写，不是可选：

  service / repository / dao 接口上的每个方法都要写 JSDoc：做什么、每个 @param、
  @returns，以及它可能抛出的每种异常的 @throws。
  web controller 的每个公开方法都要写 JSDoc。
  实现类里的每个 protected 方法都要写 JSDoc——那些是扩展点，子类作者没法从方法体里
  读出你的意图。

  私有方法、以及只用来解析 bean 的 getter 不需要。

  接口是别人用来了解"这个模块能做什么"的那个文件。如果它的 JSDoc 回答不了
  "这个方法会抛什么、什么时候抛"，这个接口就还没写完。

抛异常 —— 每个 throw 之前先写日志：

  每个 `throw` 之前，写一条记录**为什么**的日志，带上导致这个判断的输入：

      if (order.status !== 'ACTIVE') {
          this.logger.warn({ orderId: order.id, status: order.status },
              'Rejecting cancel: order is not active');
          throw new ConflictError('订单不处于可用状态');
      }

  级别：运维可能关心的 4xx（冲突、权限不足）用 warn；例行的（找不到、入参不合法）
  用 debug；5xx 用 error。

  记录的是原因与它的输入，**不是异常对象本身**——框架的错误中间件已经记过异常了
  （5xx 带栈，4xx 记 debug），再记一遍会让一件事在日志里出现两条。

  不记敏感信息这条依然成立：id、状态、状态迁移可以；口令、token、完整请求体、
  用户标识不行。

日志：

  用每个基类都提供的 this.logger。绝不用 console.*。
  异常作为上下文参数传入：logger.error(err, 'message')，绝不是 { err }。
  绝不记录口令、token、绑定参数值、请求体、用户标识。

TypeScript：

  strict 开启。ESM + NodeNext，所以相对导入即使源文件是 .ts 也要写 .js 后缀。
  reflect-metadata 在入口文件最前面导入一次。
  纯类型导入用 `import type`——isolatedModules 开启，尤其是 express 的 `Request`
  必须用 type-only 导入，因为它与一个 DOM 全局同名。
  Express 5 里路由参数的类型是 `string | string[]`，用 String(...) 包一层，不要断言。

表名、列名、需求里没提到的字段，先问，不要自己编。

占位符：

  `<尖括号>` 里的是占位符。每一个都要换成真实的实体名并使用正确的大小写——
  <Order>ServiceImpl 写成 OrderServiceImpl，<order> 写成 order。
  产出的代码里不允许出现不是 TypeScript 泛型、也不是比较运算符的 `<` 或 `>`。
```

## 怎么用

每个分层文件里的提示词是按实际写代码的顺序排的：先搭骨架，再处理具体情形。它们是可以
原样粘贴的——只有 `<尖括号>` 里的占位符需要你替换。

这些提示词是刻意"过度指定"的。只给一句"帮我写个商品的 service"，助手会产出一坨看着
像那么回事、但把上面每一条约定都无视掉的代码；给出接口名、方法签名和分层规则，
它产出的才是你能直接合并的东西。

## 怎么验收

三个检查能拦住助手在这里犯的大部分错误：

1. **strict 下能编译吗？** 违反约定的写法大多同时也是类型错误——`createBean` 漏了 `!`、
   裸用 `req.params.id`、service 返回了错误的形状。
2. **有没有哪一层越过下一层？** 在生成的文件里搜一下 service 里有没有 `DAO`、
   控制器里有没有 `getDBConnection`。
3. **Web 层以下有没有验证？** service 里出现 `if (!data.name) throw`，说明助手没有相信
   第 2 条规则。把它删掉，改成控制器上的规则。
4. **每个 `throw` 上面都有日志吗？** 在文件里搜 `throw new`，逐个看它上面那行。
   这是助手最常漏掉的一条，因为漏了之后代码本身看不出任何毛病。
5. **每个接口方法都写了 `@throws` 吗？** 一个会抛 `ConflictError` 却没说的接口方法，
   就是一个等着发生的调用方 bug。
