# 4. Repository 层

中文 | [English](AI_PROMPTS_4_REPOSITORY.md) · [目录](AI_PROMPTS_CN.md)

service 与 DAO 之间的桥梁。它装配领域实体、做简单的实体检查，并且管着缓存。

## "简单的实体检查"指什么

由 repository 来做的检查，因为它正是知道"怎么把这个东西取出来"的那一层：

- **是否存在** —— DAO 返回 `null` 就变成 `ActionNotFoundError`
- **状态是否可用** —— ARCHIVED、DISABLED、EXPIRED 变成 `ConflictError`
- **是否属于这个租户** —— 不匹配变成 `ActionNotFoundError`，绝不是 403
- **这个编码是否已被占用** —— 插入前的唯一性探测

形状是一个"返回实体或抛异常"的 `require*` 方法：

```typescript
/**
 * 取出订单并断言它对这个租户可用。
 * @param id - 订单 id。
 * @param tenantCode - 调用者所属租户。
 * @returns 订单。
 * @throws {ActionNotFoundError} 订单不存在，或属于其他租户。
 * @throws {ConflictError} 订单存在但不处于 ACTIVE 状态。
 */
async requireActive(id: string, tenantCode: string): Promise<Order> {
    const order = await this.findById(id);

    if (order == null || order.tenantCode !== tenantCode) {
        this.logger.debug({ orderId: id, tenantCode },
            'Order not found for this tenant');
        throw new ActionNotFoundError();
    }

    if (order.status !== 'ACTIVE') {
        this.logger.warn({ orderId: id, status: order.status },
            'Order is not in ACTIVE state');
        throw new ConflictError('订单不处于可用状态');
    }

    return order;
}
```

这个方法里有三处是约定而不是逻辑：JSDoc 写明了它能抛出的每种异常；每个抛异常的地方
上面都有一条记录原因的日志；租户不匹配那一条用的是 `debug` 而不是 `warn`——
不能让一个在试探 id 的调用者把运维的仪表盘刷满。

于是 service 读起来就是它本该是的那条业务规则，没有判空的噪音：

```typescript
const order = await this.repo.requireActive(id, user.tenantCode);
```

**不**属于这里的是业务规则本身。"只有 ORDER_ADMIN 能取消"是 service 的判断——
它说的是调用者，不是实体。

## Redis 在这一层

模块用到 Redis，就在 repository 里用。不在 service——那会让 service 既懂规则又懂缓存；
也不在 DAO——那会让"从数据库读"这句话变成别的意思。

repository 是唯一知道一个实体是怎么被取出来的那一层，所以也是唯一有资格决定
"这次取数可以跳过"的那一层。

由此得出两条规则：

**写操作在哪个方法里，失效就在哪个方法里。** 一个更新了行的 repository 方法，
在返回之前把对应的键删掉。不要把失效留给调用方。

**失效不是事务性的。** 回滚不会把删掉的键恢复——这无害；但一个在并发读**之前**被删掉的
键，会被那次读用尚未提交的状态填回去。这一点要紧时，就把删除挪到事务提交之后、
由 service 的调用方执行，并在注释里说明。

---

## 提示词 4.1 —— 一个 CRUD 实体的 repository

```
创建 src/repository/<Order>Repository.ts。

默认导出的类，继承 CommonRepository，用一个 private getter 通过 getDAOInstance
解析 <Order>DAO。

普通的取数与持久化：
  findById(id): Promise<<Order> | null>
  create(order): Promise<string>                 返回新 id
  update(order): Promise<void>
  updateStatus(id, status): Promise<void>

会抛异常的实体检查：
  requireById(id, tenantCode): Promise<<Order>>
      不存在，或租户不匹配 -> ActionNotFoundError
  requireActive(id, tenantCode): Promise<<Order>>
      上面那些，外加状态必须为 ACTIVE -> 否则 ConflictError
  requireCodeAvailable(tenantCode, code): Promise<void>
      编码已存在 -> ConflictError

规则：
- 租户不匹配抛 ActionNotFoundError，不是 InsufficientPermissionError——403 等于确认了
  这条记录存在，能让人枚举其他租户的 id
- 这里不写 SQL；每次查询都是一次 DAO 调用
- 不写业务规则；那是 service 的
- 不加 @Transaction()；边界是 service 的

文档与日志：
- 每个方法都写 JSDoc，require* 方法能抛的每种异常都写一行 @throws
- 每个 `throw` 之前都有一条 this.logger 记录为什么，带上 id 与导致它的状态——
  找不到用 debug，状态不对用 warn。不要记录异常对象本身，框架中间件已经记了。
```

## 提示词 4.2 —— 由多个 DAO 装配出的实体

```
<Order> 存在三张表里，而 service 永远不该知道这件事。

扩展 <Order>Repository：

  findFullById(id): Promise<<OrderDetail> | null>

它加载：
  - 通过 <Order>DAO 取订单头
  - 通过 <OrderItem>DAO 取明细行
  - 通过 <Address>DAO 取收货地址

并返回一个 <OrderDetail> 对象。订单头不存在时直接返回 null，不去调另外两个。

为每个 DAO 加一个 private getter。<OrderDetail> 类型定义在 src/types/ 下。

这就是 repository 这一层存在的理由：service 要一个订单，拿到的就是一个订单，
而不是三份需要它自己拼起来的查询结果。
```

## 提示词 4.3 —— 加上缓存

```
用 @ticatec/redis-client 给 <Order>Repository 加上 Redis 缓存。

要求：
- 一个返回 RedisClient.getInstance() 的 private getter
- 一个 private key(id) 方法生成 `<order>:${id}`——键的拼法只有这一处
- findById：先查缓存，未命中再走 DAO，把结果以 <300> 秒 TTL 存入并返回。不要缓存 null。
- update / updateStatus：返回之前把键删掉
- 在 TTL 上写一句注释，说明这个实体能接受多久的陈旧

不要在 DAO 里缓存，也不要在 service 里缓存。

值要经过 JSON 往返，所以 Date 回来会变成字符串。如果 <Order> 有日期字段，
读取时还原它们，并在注释里说明。
```

## 提示词 4.4 —— 跨事务的缓存失效

```
<Order>Repository.update() 会删掉缓存键，但它运行在 service 的事务内部，所以一次回滚
会留下一个被删掉的键，而一次并发读可能用尚未提交的状态把它填回去。

给出两种方案以及各自适用的场合：

1. 在 repository 方法内部删——简单，适用于"短暂的陈旧可以接受、写期间读很少"的场景
2. 先从事务返回，再由 service 的调用方删——适用于"陈旧值会被看到且是错的"的场景

为 <Order> 实现方案 2，并在 repository 方法上留一句注释，说明它为什么不自己失效。
```

## 提示词 4.5 —— cache-aside 读取

```
给 <Customer>Repository 加一个读穿透辅助方法，用于那些很少变化、但几乎每个请求都要读的
数据：

  findProfile(id): Promise<<CustomerProfile> | null>

用 redis.getOrSet，TTL <600> 秒。

在注释里写明 getOrSet 不负责的两件事：热点键在高负载下过期时，它不会阻止多个并发取数；
它也不会还原被 JSON 丢掉的类型。

说明这个实体撞上的是哪一个，以及你为此做了什么。
```

## 提示词 4.6 —— 分页查询

```
给 <Order>Repository 加上：

  queryByCriteria(criteria: <Order>SearchCriteria): Promise<PaginationList<<Order>>>

它委托给 DAO 的分页辅助方法，返回框架的 PaginationList。criteria 对象是 service 构造的；
repository 不构造 criteria，也不读 req.query。

再加一个 findRecent(tenantCode, limit)，返回不分页的普通列表，给<仪表盘>用。
```

---

下一篇：[DAO 层](AI_PROMPTS_5_DAO_CN.md)。背景阅读：
[Service 与 Repository 指南](SERVICE_GUIDE_CN.md)、
教程第 [2](../../tutorial/02-layers-and-transactions_CN.md)、
[8](../../tutorial/08-config-and-cache_CN.md) 章。
