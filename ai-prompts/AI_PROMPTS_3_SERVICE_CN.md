# 3. Service 层 —— 接口与实现

中文 | [English](AI_PROMPTS_3_SERVICE.md) · [目录](AI_PROMPTS_CN.md)

业务逻辑与事务边界。以接口声明，由类实现。

## 形状

```typescript
// src/service/OrderService.ts —— 契约
export default interface OrderService {

    /**
     * 在调用者所属租户内创建订单，返回其 id。
     * @param user - 操作用户；订单创建在该用户的租户下。
     * @param data - 待创建的订单。字段形状已在 Web 层校验。
     * @returns 新订单的 id。
     * @throws {ConflictError} 该订单编码在本租户内已存在。
     */
    createNew(user: AppUser, data: Order): Promise<string>;

    /**
     * 取消一个处于 ACTIVE 状态的订单。
     * @param user - 操作用户；必须持有 ORDER_ADMIN 角色。
     * @param id - 订单 id。
     * @param reason - 取消原因，自由文本，会记录在取消记录上。
     * @throws {ActionNotFoundError} 订单不存在，或属于其他租户。
     * @throws {ConflictError} 订单不处于 ACTIVE 状态。
     * @throws {InsufficientPermissionError} 调用者没有 ORDER_ADMIN 角色。
     */
    cancel(user: AppUser, id: string, reason: string): Promise<void>;
}

// src/service/impl/OrderServiceImpl.ts —— 实现
export default class OrderServiceImpl extends CommonService implements OrderService {

    private get repo(): OrderRepository {
        return this.getRepositoryInstance<OrderRepository>('OrderRepository');
    }

    @Transaction()
    async cancel(user: AppUser, id: string, reason: string): Promise<void> {
        const order = await this.repo.requireActive(id, user.tenantCode);

        if (!user.roles.includes('ORDER_ADMIN')) {
            this.logger.warn({ orderId: id, roles: user.roles },
                'Rejecting cancel: caller lacks ORDER_ADMIN');
            throw new InsufficientPermissionError();
        }

        await this.repo.cancel(order.id, reason);
    }
}
```

接口上每个方法都写明 `@throws`，每个抛异常的地方先记一条"为什么"，而实现类不重复接口
上的 JSDoc——契约只在一个地方有文档。

以**接口名**注册，指向**实现**：

```typescript
beans.register('OrderService', () => import('./service/impl/OrderServiceImpl.js'));
```

以接口类型解析，于是 service 包之外的任何代码都不依赖具体类：

```typescript
beanFactory.createBean<OrderService>('OrderService')!
```

控制器和其他 service 看到的就是这个接口。它也是你想知道"这个模块能做什么"时该打开的
文件——不用被每个方法的方法体挡住视线。

## 规则

**每个会碰数据库的公开方法都带 `@Transaction` 装饰器——只读的也要。** 边界就是 service
方法，而且有且只有一个地方可能是它。

写操作，以及多次读取必须看到同一个快照的读操作，用 `@Transaction()`。普通的读操作用
`@Transaction(Propagation.NONE)`——它借一条连接给这个方法、用完还回去，中间不执行
`BEGIN`。

读操作唯一**不能**做的，是什么都不加。`CommonDAO` 不从池里自取连接，它从环境上下文里读；
没有上下文，这个方法之下的每一条查询都会在运行时抛：

```
No database connection available. Ensure you are inside a @Transaction or using TransactionManager.execute().
```

建立这个上下文的正是装饰器。`NONE` 是"要连接、不要事务"的说法——它不是优化，是底线。

**靠抛异常回滚。** 不写 `try`/`catch`/`rollback`。被装饰方法之下任何位置抛出的异常都会
让整个事务回滚——包括那个同时也是 400 的 `IllegalParameterError`。

**不写 SQL，不碰 `req`，不碰 `res`。** 一个接受 `Request` 参数的 service，
是一个换了名字的控制器。

**不做输入形状的验证。** 那在 Web 层做完了。这里该有的是需要调用者或数据库才能判断的
业务规则——对具体记录的权限、状态迁移是否合法、金额是否对得上。

**非数据库的副作用放在边界之外。** 发邮件、投消息、写缓存都不会回滚。从事务方法返回，
在调用方做这些事。

---

## 提示词 3.1 —— 一个 CRUD 实体的接口与实现

```
为 <Order> 创建 service 层。

产出两个文件。

1. src/service/<Order>Service.ts —— 接口，默认导出：

   createNew(user: AppUser, data: <Order>): Promise<string>
   update(user: AppUser, data: <Order>): Promise<void>
   cancel(user: AppUser, id: string, reason: string): Promise<void>
   search(user: AppUser, criteria: any): Promise<PaginationList>

   每个方法都写文档：做什么、会抛哪些异常。

2. src/service/impl/<Order>ServiceImpl.ts —— 默认导出的类，extends CommonService
   并 implements <Order>Service：

   - 一个用 getRepositoryInstance 解析 <Order>Repository 的 private getter
   - createNew、update、cancel 上加 @Transaction()；search 上加
     @Transaction(Propagation.NONE)——绝不能不加，否则 DAO 找不到连接
   - 业务规则：
     * createNew：该编码在本租户内不得已存在；状态置为 ACTIVE
     * update：订单必须存在、属于调用者的租户、且处于 DRAFT 状态
     * cancel：订单必须存在、属于调用者的租户、处于 ACTIVE 状态，且调用者必须持有
       ORDER_ADMIN 角色——否则抛 InsufficientPermissionError
   - 存在性、租户归属、状态这三类检查是对 repository 的调用，不是在这里写的查询

文档与日志：
- **接口**上的每个方法都写 JSDoc，含 @param、@returns，以及它可能抛出的每种异常的
  @throws
- 实现类不重复接口的 JSDoc；它自己新增的 protected 方法要写
- 实现类里每个 `throw` 之前都有一条 this.logger，记录为什么，带上导致这个判断的
  id 与状态——运维关心的 4xx 用 warn，例行的用 debug。不要记录异常对象本身，
  框架已经记了。

不做字段形状的验证——那是 Web 层的事。不写 SQL。不要捕获后重新抛出，
让异常自然传播以便事务回滚。
```

## 提示词 3.2 —— 跨多个 repository 的方法

```
给 <Order>ServiceImpl 加上：

  transfer(user: AppUser, orderId: string, toCustomerId: string): Promise<void>

它必须在一个事务里：
1. 通过 <Order>Repository 加载订单，要求其 ACTIVE 且属于调用者的租户
2. 通过 <Customer>Repository 加载目标客户，要求其 ACTIVE
3. 更新订单的客户
4. 通过 <Audit>Repository 写一条审计记录

为每个 repository 加一个 private getter。四步都在同一个 @Transaction() 里——
要么全成，要么全不成。

同时把这个方法以相同签名加进 <Order>Service.ts 接口。
```

## 提示词 3.3 —— 回滚之后仍然保留的审计记录

```
给 <Order>ServiceImpl 加上：

  recordAttempt(user: AppUser, orderId: string, outcome: string): Promise<void>

它必须在调用方的事务回滚之后依然提交——一次失败的尝试，正是审计要留下的东西。

用 @Transaction(Propagation.REQUIRES_NEW)。

在注释里写明两个后果：外层事务占着第一个连接时它会再取第二个，所以不能放在循环里调用；
以及它看不到外层事务尚未提交的数据。
```

## 提示词 3.4 —— 不能放进事务的副作用

```
订单确认后要发一封确认邮件，并往 <Kafka> 投一条消息。

给出正确的结构：事务性的 service 方法只做数据库的活儿然后返回，副作用由调用方在之后执行。

在注释里解释为什么邮件不能放进 @Transaction()——回滚不会把已发出的邮件撤回，
于是一个没能提交的订单已经告诉客户它成功了。

如果这个副作用必须可靠，就在事务内写一条 outbox 记录，由后台处理器抽取投递；
把这个变体也一并给出。
```

## 提示词 3.5 —— service 调用另一个 service

```
<Order>ServiceImpl 在 createNew 期间需要 <Inventory>Service 预占库存。

要求：
- 在 private getter 里用
  beanFactory.createBean<<Inventory>Service>('<Inventory>Service')! 解析，类型是接口
- 调用发生在 <Order>ServiceImpl 的 @Transaction() 内部；预占方法自己的 @Transaction()
  会加入这个事务而不是另开一个，所以任何一处失败两边一起回滚
- 如果两个 service 互相引用，解析都保持在 getter 里——懒加载代理能处理这个环，
  但在构造函数里使用对方不行

明确说明最终提交的是哪一个事务。
```

## 提示词 3.6 —— 分页查询

```
在 <Order>ServiceImpl 上实现 search。

- 入参是控制器从 req.query 原样传来的 criteria 对象
- 它构造一个 CommonSearchCriteria 子类并交给 repository
- 返回 PaginationList
- 加 @Transaction(Propagation.NONE)——读操作要连接但不要事务。不能不加：CommonDAO 是从
  装饰器建立的上下文里解析连接的，没有上下文，查询会在运行时抛异常。

同时生成查询条件类：src/criteria/<Order>SearchCriteria.ts，把查询字段
<status、customerId、createdAt 日期区间、覆盖 code 与 remark 的关键字>映射成条件，
其中租户条件永远取自用户，而不是取自查询参数。

租户条件不是可选的，也不能来自客户端。请在注释里写明这一点。
```

---

下一篇：[Repository 层](AI_PROMPTS_4_REPOSITORY_CN.md)。背景阅读：
[keelson-core 的 README](../../packages/keelson-core/README_CN.md)、
[查询条件指南](SEARCH_CRITERIA_CN.md)、
教程第 [2](../../tutorial/02-layers-and-transactions_CN.md) 章。
