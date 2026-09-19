# 3. Service 层 —— 接口与实现

中文 | [English](AI_PROMPTS_3_SERVICE.md) · [目录](AI_PROMPTS_CN.md)

业务逻辑与事务边界。以接口声明，由类实现。

## 形状

```typescript
// src/service/OrderService.ts —— 契约
export default interface OrderService {
    createNew(user: AppUser, data: Order): Promise<string>;
    cancel(user: AppUser, id: string, reason: string): Promise<void>;
}

// src/service/impl/OrderServiceImpl.ts —— 实现
export default class OrderServiceImpl extends CommonService implements OrderService {
    private get repo(): OrderRepository {
        return this.getRepositoryInstance<OrderRepository>('OrderRepository');
    }

    @Transaction()
    async createNew(user: AppUser, data: Order): Promise<string> { /* ... */ }
}
```

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

**每个会写数据的公开方法都带 `@Transaction()`。** 边界就是 service 方法，而且有且只有
一个地方可能是它。只读方法不需要，除非多次读取必须看到同一个快照。

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
   search(user: AppUser, criteria: any): Promise<PaginationList<<Order>>>

   每个方法都写文档：做什么、会抛哪些异常。

2. src/service/impl/<Order>ServiceImpl.ts —— 默认导出的类，extends CommonService
   并 implements <Order>Service：

   - 一个用 getRepositoryInstance 解析 <Order>Repository 的 private getter
   - createNew、update、cancel 上加 @Transaction()；search 不加
   - 业务规则：
     * createNew：该编码在本租户内不得已存在；状态置为 ACTIVE
     * update：订单必须存在、属于调用者的租户、且处于 DRAFT 状态
     * cancel：订单必须存在、属于调用者的租户、处于 ACTIVE 状态，且调用者必须持有
       ORDER_ADMIN 角色——否则抛 InsufficientPermissionError
   - 存在性、租户归属、状态这三类检查是对 repository 的调用，不是在这里写的查询

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
- 返回 PaginationList<<Order>>
- 不加 @Transaction()——这是读操作

同时生成查询条件类：src/criteria/<Order>SearchCriteria.ts，把查询字段
<status、customerId、createdAt 日期区间、覆盖 code 与 remark 的关键字>映射成条件，
其中租户条件永远取自用户，而不是取自查询参数。

租户条件不是可选的，也不能来自客户端。请在注释里写明这一点。
```

---

下一篇：[Repository 层](AI_PROMPTS_4_REPOSITORY_CN.md)。背景阅读：
[Service 与 Repository 指南](SERVICE_GUIDE_CN.md)、
[查询条件指南](SEARCH_CRITERIA_CN.md)、
教程第 [2](../../tutorial/02-layers-and-transactions_CN.md) 章。
