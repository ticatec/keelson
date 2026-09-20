# 5. DAO 层

中文 | [English](AI_PROMPTS_5_DAO.md) · [目录](README_CN.md)

SQL，仅此而已。

## 规则

**一个 DAO，一张表。** 一个 DAO 只拥有一张表。为了取一个列而 JOIN 第二张表没问题——
订单行上的客户名就是这么来的。拥有两个实体则不行：一个既写 `orders` 又写 `customers`
的 DAO，是两个被粘在一起的 DAO。

**关于 A 表的问题由 A 表的 DAO 回答，哪怕发问的是 B 表。** 这半条才是真正容易破的，
因为破掉的写法读起来更顺。`orders` 多对一地引用 `customers`，还有订单指着它时，
客户不能删。于是总得有人执行：

```sql
select count(*) as cc from orders where customer_id = $1
```

这条语句的 FROM 写的是 `orders`，所以它是 `OrderDAO.countByCustomer(customerId)`——
**不是**塞在 `CustomerDAO` 里、紧挨着它所保护的那条 delete 的 `countReferencingOrders()`。
由 repository 分别调用：先 `OrderDAO` 数，再 `CustomerDAO` 删。

判据是机械的：**FROM 后面是哪张表，就归哪个 DAO。** 不因为"只是个 count"、
"只有一行"、"只有这里用"而破例。

它换来的是"只有一处要改"。哪天 `orders` 加了 `deleted` 标志、所有查它的语句都要跟上
`and deleted = false`，你改 `OrderDAO`，改完就完了。如果那个 count 住在 `CustomerDAO`
里，它会继续把软删除的订单也数进去，于是本该可删的客户一直删不掉——而且没有一个测试会红，
因为 count 照样返回一个数字。

**一张表一条 update 语句，不是一个字段一条。** DAO 里不该有 `updateStatus`、
`updateRemark`、`updateAmount`。只有 `update(order)`，它写入全部可更新字段。
要改一个字段，调用方先把整行读出来，在拿到的对象上改，再写回去：

```typescript
const order = await this.orderDAO.findById(id);
order.status = 'CANCELLED';
await this.orderDAO.update(order);
```

哪些列 `update` 必须放过，是实体的属性，不是调用方的属性——行所属的租户、它的主键、
它的创建时间。这份名单属于 UPDATE 的 SET 子句，只写一次，所有调用方自动继承。
一个只碰 `status` 的 `updateStatus` 是碰巧安全的；真正出事的是下一个
`updateCustomer`——它会悄悄让一行数据换个归属。

代价是多一次 SELECT，而且它就在紧接着要写入的那个事务里——这同时也是"读—改—写"
不会被人插队的原因。换来的是：加一个列时只有一条语句要改、不可更新的列只在一处列出、
以及一个任何写入路径都绕不过去的 `updated_at`（或版本号）更新。

**不含业务规则。** DAO 不负责判断 ARCHIVED 的订单不能更新。它执行收到的那条 UPDATE，
报告影响了多少行。

**不调用别的 DAO，不调用 repository。** DAO 的依赖只有连接和基类提供的辅助方法。
一个需要第二张表的 DAO 的 DAO，是在告诉你这段编排属于上一层。

**不管理连接。** `CommonDAO` 从事务上下文里取连接。永远不要自己开、不要当参数传、
不要提交。

**有意义的错误保持 SQL 的语汇。** DAO 报告驱动的异常或影响行数。把"零行更新"翻译成
`ActionNotFoundError` 是 repository 的职责——只有它知道零行算不算错。

**每个方法都写 JSDoc。** 一个 DAO 方法的签名看不出它动的是哪张表、返回的形状是什么，
JSDoc 能。这是读者最容易需要靠猜的一层，也是猜错就变成一条上了生产的查询的一层。

这同时是抛异常最少的一层——多数 DAO 方法一个 throw 都没有，"抛异常先写日志"这条根本
用不上。确实要抛的地方，规则照旧。

## 辅助方法

| 方法 | 返回 |
| --- | --- |
| `findByPK(sql, params)` | 映射好的第一行，或 `null` |
| `findFirst(sql, params)` | 同上，用于非主键查询 |
| `listQuery(sql, params)` | 映射好的全部行 |
| `executeInsertQuery<T>(sql, params)` | `InsertResult<T>`——`affectedRows`、`record`、`insertId` |
| `executeUpdateQuery<T>(sql, params)` | `UpdateResult<T>`——`affectedRows`、`record` |
| `executeDeleteQuery(sql, params)` | 影响行数 |
| `executeCountSQL(sql, params, key?)` | 一个数字，key 默认 `cc` |
| `quickSearch<T>(sql, params, pageNo, rowCount, booleanFields?)` | `QuickSearchResult<T>`——`list`、`hasMore` |
| `executePaginationQuery(criteria)` | 由 `CommonSearchCriteria` 得到的 `PaginationList` |
| `genID()` | 32 字符的 UUID v7，时间有序，可直接做主键 |
| `toBooleanInt(b)` / `toBooleanChar(b)` | 写入方向：布尔转 `1`/`0`、布尔转 `'T'`/`'F'` |

列名自动转驼峰——`created_at` 变成 `createdAt`。

### 写入返回什么

`executeInsertQuery` 与 `executeUpdateQuery` 返回的是类型化结构，而不是驱动自己的那个值：

```typescript
interface InsertResult<T> {
    affectedRows: number;
    record: T | null;                    // 语句返回行时才有值
    insertId?: number | string | null;   // 驱动支持时返回生成的主键
}

interface UpdateResult<T> {
    affectedRows: number;
    record: T | null;
}
```

两者中哪一个有值取决于数据库，而这正是让一个 DAO 在无人察觉的情况下丧失可移植性的细节：

| 驱动 | `record` | `insertId` |
| --- | --- | --- |
| PostgreSQL | 语句以 `RETURNING *` 结尾时返回该行 | 不提供 |
| MySQL | 恒为 `null`——MySQL 没有 `RETURNING` | 返回自增主键 |
| 达梦 | 语句返回行时有值 | 不提供——用 `RETURNING INTO` 或 `SELECT @@IDENTITY` |

所以一个返回 `result.record!.id` 的 DAO，在 PostgreSQL 上工作，在 MySQL 上抛异常。
改成返回调用方能依赖的东西——DAO 自己已经生成的那个 id——并且在相信 `record` 之前
先检查 `affectedRows`。

### join 出来的列变成内嵌对象

别名里带点号，映射出来的不是一个扁平字段名，而是一个对象：

```sql
select o.id, o.customer_id, o.status,
       c.name as "customer.name", c.mode as "customer.mode"
  from orders o
  join customers c on c.id = o.customer_id
```

```json
{ "id": "...", "customerId": "...", "status": "ACTIVE",
  "customer": { "name": "Acme", "mode": "PREPAID" } }
```

于是 `order.customer.name` 直接可达，既不用第二次查询，也不用写映射代码。
每一段各自转驼峰——`"customer.contact_name"` 变成 `customer.contactName`。
优先用这种写法，不要写 `c.name AS customer_name`：扁平的 `customerName` 抹掉了
"这个值来自另一张表"这件事，而且界面再要第二、第三个列时，它没地方放。

引号不是可选的，而且随方言而变：PostgreSQL 用双引号，MySQL 用反引号。别名不加引号，
点号会被折掉，你拿回来的就是一个扁平字段。达梦的别名里根本带不了点号，
所以它的驱动认 `__`（`customer__name`）；决定这件事的钩子是 `splitFieldPath`，
而改这个分隔符是驱动唯一需要重写的东西。criteria 类上声明布尔字段用同样的路径：
`setBooleanFields('customer.isActive')`。

映射器有两件事不做。路径里出现 `__proto__`、`constructor`、`prototype` 的那一段会被丢弃，
不会赋值。它也不会覆盖一个已经是标量的中间层——所以同一条语句里不要既 select `"customer"`
又 select `"customer.name"`，后落地的那个会被悄悄丢掉。

布尔转换的适用范围比看上去窄，写提示词之前值得知道。`booleanFields` 会把 `'t'`、`'f'`、
`'true'`、`'false'`、`'1'`、`'0'`（不分大小写）转成真正的布尔值——正是它让没有原生布尔
类型的 MySQL 与达梦表现得跟 PostgreSQL 一样。但在 DAO 这一层，它**只是 `quickSearch`
的参数**。`findByPK`、`findFirst`、`listQuery` 都不接受它。

这几个方法要么在 DAO 方法里自己转换，要么通过 `this.getDBConnection()` 拿到连接、
用它的 `listQuery(sql, params, postConstruction, booleanFields)` 重载。
分页的 criteria 查询则在 criteria 类上用 `setBooleanFields(...)` 声明。

---

## 分页

两套机制，回答的是不同的问题。按"界面上要不要显示总数"来选。

| | `executePaginationQuery(criteria)` | `quickSearch(sql, params, pageNo, rowCount)` |
| --- | --- | --- |
| 返回 | `PaginationList`——`count`、`pages`、`hasMore`、`list` | `QuickSearchResult<T>`——`list`、`hasMore` |
| 往返次数 | 两次——先 COUNT，再取当页 | 一次 |
| 查询条件 | 由 criteria 类构造 | 你自己写进 SQL |
| 布尔字段 | criteria 上的 `setBooleanFields()` | 第五个参数 |
| 适用 | 带页码器的查询界面："共 142 条，第 3/6 页" | 无限滚动、选择器、联想输入 |

`PaginationList` **没有类型参数**——它的 `list` 是 `Array<any>`。写
`Promise<PaginationList>`，不要写 `Promise<PaginationList<Order>>`，后者编译不过。
`QuickSearchResult<T>` 是泛型的，它的 list 有类型。

### criteria 路线

三个部件：拥有 SQL 的 criteria 类、一行的 DAO 方法、把请求里的原始 criteria 直接透传的
调用方。

```typescript
// src/dao/criteria/OrderSearchCriteria.ts
import { CommonSearchCriteria } from '@ticatec/keelson-core';

const BASE_SQL = `
    SELECT o.id, o.code, o.status, o.amount, o.currency, o.is_urgent, o.created_at,
           c.name AS "customer.name"
      FROM orders o
      LEFT JOIN customers c ON c.id = o.customer_id
     WHERE o.tenant_code = $1`;

export default class OrderSearchCriteria extends CommonSearchCriteria {

    constructor(tenantCode: string, criteria?: any) {
        super(criteria);
        this.sql = BASE_SQL;                            // 基线
        this.params = [tenantCode];                     // 基线
        this.orderBy = 'ORDER BY o.created_at DESC';    // 基线——不要写进 this.sql
        this.setBooleanFields('isUrgent');
    }

    protected buildDynamicQuery(): void {
        this.addWildcardCriteria(this.criteria?.code, 'o.code');
        this.addEqualsCriteria(this.criteria?.status, 'o.status');
        this.addEqualsCriteria(this.criteria?.customerId, 'o.customer_id');
        this.addRangeCriteria(this.criteria?.createdFrom, this.criteria?.createdTo,
                              'o.created_at');
    }
}
```

```typescript
// src/dao/OrderDAO.ts
/**
 * 执行订单查询界面的分页查询。
 * @param criteria - 已构造好的 OrderSearchCriteria，自带条件、排序与分页边界
 * @returns 请求的那一页，以及匹配总数与总页数
 */
async searchByCriteria(criteria: OrderSearchCriteria): Promise<PaginationList> {
    return this.executePaginationQuery(criteria);
}
```

```typescript
// src/repository/OrderRepository.ts —— criteria 对象来自请求，原样传入
const criteria = new OrderSearchCriteria(user.tenantCode, params);
return this.orderDAO.searchByCriteria(criteria);
```

`page` 与 `pageSize` 由基类构造函数从那个原始对象上读取。它们不是 DAO 的参数，
上面任何一处签名里都不会出现。

| 字段 | 默认值 | 越界时 |
| --- | --- | --- |
| `page` | `1` | 小于 `1` → `1` |
| `pageSize` | `25` | 小于 `1` → `25`；大于 `1000` → `1000` |

两者的处理并不一样：`pageSize` 小于 1 是回落到默认值 25，不是回落到 1。

### 四个会踩到的点

**基础 SQL 会被套进子查询，所以它必须经得起这么套。** 计数执行的是
`select count(*) as cc from (<this.sql>) a`。这正是 `ORDER BY` 要放在 `this.orderBy`
而不是 `this.sql` 的原因——在被计数的子查询里，它轻则是一次没人看的排序，重则在某些
方言下直接语法错误。同理，基础 SQL 里绝不能带 LIMIT / OFFSET：基类会在 `this.orderBy`
之后追加对应方言的限量子句。

**`buildDynamicQuery()` 必须是纯追加的。** 构造函数里的 `sql` / `params` / `orderBy`
会在第一次执行时被快照，之后每次执行前都先还原，所以同一个实例可以反复执行。
只能往 `this.sql` 追加、往 `this.params` push，绝不能重新赋值——一次重新赋值就会
悄悄把构造函数里设的租户过滤条件丢掉。

**翻到尾页之后只花一次查询，不是两次。** 当 `offset >= count` 时，基类直接返回空列表，
不再执行取页的查询。`page=10000000` 是廉价的，你不需要为它加保护。安全上要紧的是
`pageSize` 的 1000 上限，正是它挡住了 `pageSize=999999` 把一个分页接口变成整表导出。

**`hasMore` 与 `pages` 是算出来的，不是查出来的。** `hasMore` 即 `offset + pageSize <
count`，`pages` 即 `ceil(count / pageSize)`，无匹配时分别是 `false` 与 `0`。
不要在上层重新算一遍。

### quickSearch 路线

一次往返，没有总数。条件由你自己写，布尔字段是第五个参数，而不是 criteria 类上的声明。

```typescript
/**
 * 租户范围内按订单号的联想输入。一次往返——不返回总数。
 * @param tenantCode - 查询所限定的租户
 * @param keyword - 与订单号做前缀匹配的关键字
 * @param pageNo - 从 1 开始的页码，默认 1
 * @param rowCount - 每页行数，默认 25
 * @returns 至多 rowCount 行，以及是否还有下一页
 */
async searchByKeyword(tenantCode: string, keyword: string,
                      pageNo: number = 1, rowCount: number = 25): Promise<QuickSearchResult<Order>> {
    const sql = `SELECT o.id, o.code, o.status, o.is_urgent
                   FROM orders o
                  WHERE o.tenant_code = $1 AND o.code LIKE $2`;
    return this.quickSearch<Order>(sql, [tenantCode, `${keyword}%`],
                                   pageNo, rowCount, ['isUrgent']);
}
```

`quickSearch` 会自己追加限量子句，所以上面的 SQL 不带 LIMIT——也不带 ORDER BY，
除非你自己写一个；对选择器来说通常应该写。

---

## 提示词 5.1 —— 一张表的 DAO

```
创建 src/dao/<Order>DAO.ts，默认导出的类，继承 CommonDAO。

表 `orders`：
  id             varchar(36) 主键
  tenant_code    varchar(32) not null
  code           varchar(32) not null
  customer_id    varchar(36) not null
  amount         numeric(14,2) not null
  currency       char(3) not null
  status         varchar(16) not null
  remark         varchar(500)
  is_urgent      boolean not null default false
  created_at     timestamptz not null default now()

方法：
  findById(id)
  findByCode(tenantCode, code)
  listByCustomer(tenantCode, customerId)
  insert(order): InsertResult<<Order>>          -- RETURNING *，id 缺失时用 genID()
  update(order): number                          -- 影响行数
  deleteById(id): number

规则：
- 这个 DAO 只拥有 `orders`。任何 FROM 后面不是 `orders` 的语句都属于别的 DAO——
  指出来，不要加在这里。
- 不要加 updateStatus、updateRemark 或任何其他单列更新。`update(order)` 写入全部可更新
  字段；要改一个字段的调用方自己先读出整行、改掉、再调 update。把不可更新的列——
  id、tenant_code、created_at——在语句上方的注释里列清楚，并把它们排除在 SET 子句之外。
- PostgreSQL 占位符（$1、$2 …）
- 显式列出字段，不要 SELECT *，需要 RETURNING * 的地方除外
- `is_urgent` 必须以真正的布尔值返回。注意 listQuery 与 findByPK 都不接受 booleanFields
  参数——只有 quickSearch 接受——所以要么在 DAO 方法里自己转换，要么用
  this.getDBConnection() 拿到连接、用它的 listQuery 重载。请说明你选了哪种以及为什么。
- 不含业务规则、不做验证、不翻译异常——数据库说什么就返回什么

文档：
- 每个方法都写 JSDoc：查的是什么、每个 @param、@returns 描述返回的形状
- DAO 很少自己抛异常；确实要抛的地方（不支持的入参、属于调用方错误而非空操作的空批次），
  抛之前先记一条原因
```

## 提示词 5.2 —— 带 criteria 类的分页查询

```
订单查询界面提交：code（可含 *）、status、customerId、createdFrom、createdTo、
page、pageSize。

创建 src/dao/criteria/<Order>SearchCriteria.ts，继承 CommonSearchCriteria：

- public constructor(tenantCode: string, criteria?: any)，内部调用 super(criteria)
- 在构造函数里设定基线：this.sql（对 `orders` 的 SELECT，为取客户名 LEFT JOIN
  `customers`）、this.params = [tenantCode]、
  this.orderBy = 'ORDER BY o.created_at DESC'
- ORDER BY 不要写进 this.sql，this.sql 里也绝不能出现 LIMIT / OFFSET——基类会把
  this.sql 套进计数子查询，并追加对应方言的限量子句
- 结果里的布尔字段用 setBooleanFields(...) 声明，不在 DAO 调用处传
- buildDynamicQuery()：code 用 addWildcardCriteria，status 与 customerId 用
  addEqualsCriteria，created_at 区间用 addRangeCriteria。纯追加——绝不重新赋值
  this.sql 或 this.params，否则构造函数里设的租户过滤条件会丢。

然后给 <Order>DAO 加上：

  searchByCriteria(criteria: <Order>SearchCriteria): Promise<PaginationList>

方法体只有一行：executePaginationQuery(criteria)。

约束：
- PaginationList 不是泛型。Promise<PaginationList<<Order>>> 编译不过。
- page 与 pageSize 由基类构造函数从原始 criteria 对象上读取。不要把它们加成方法参数，
  也不要自己做边界处理——page 小于 1 会变成 1，pageSize 小于 1 会回落到默认值 25，
  大于 1000 会被压到 1000。
- 不要在这个方法之上的任何一层重新计算 count / pages / hasMore；它们返回时已经填好。

给出 repository 一侧用请求对象构造 criteria 的调用，以及 DAO 方法上描述返回形状的
JSDoc。
```

## 提示词 5.3 —— 不带总数的快速查询

```
给 <Order>DAO 加一个订单选择器用的联想输入：

  searchByKeyword(tenantCode, keyword, pageNo = 1, rowCount = 25): Promise<QuickSearchResult<<Order>>>

用 quickSearch(sql, params, pageNo, rowCount, booleanFields)。

要求：
- 对 `code` 做前缀匹配，按租户限定
- 显式列出字段——id、code、status、is_urgent——选择器不显示的一个都不要查
- booleanFields 传 ['isUrgent']；这是 DAO 里唯一接受它的辅助方法
- 不要写 LIMIT、不要写 OFFSET：quickSearch 会自己追加限量子句
- 要写 ORDER BY，并说明一个没有 ORDER BY 的选择器，为什么翻页之间的行序会变

在注释里解释为什么这里用 quickSearch 而不是 executePaginationQuery：选择器显示的是
"加载更多"，从来不是"第 3/6 页"，所以那次 COUNT 查询查了也是白查。
```

## 提示词 5.4 —— 与方言无关的 SQL

```
<Order>DAO 要同时跑在 PostgreSQL、MySQL 与达梦上。

把那些在运行时才拼出参数列表的查询——listByIds(ids) 里的 IN 列表——改成向连接索要
占位符，而不是写死 $1 / ?：

  const conn = await this.getDBConnection();
  const placeholders = ids.map((_, i) => conn.getPlaceholder(i + 1)).join(', ');

getPlaceholder 从 1 开始计数。

固定语句保持原样，并解释为什么：占位符从不变化的语句，写成什么样就读成什么样，
过度泛化的代价大于收益。

指出剩下的语句里哪些不可移植——RETURNING * 只有 PostgreSQL 有——
并给出 MySQL 下用 InsertResult 的 insertId 的替代写法。
```

## 提示词 5.5 —— 批量插入

```
给 <Order>DAO 加上：

  insertBatch(orders: Array<<Order>>): Promise<number>

要求：
- 一条语句带多组 VALUES，不是循环逐条插入
- 占位符用 getPlaceholder 生成，保持语句可移植
- 返回影响行数
- 处理空数组：直接返回 0，不碰数据库
- 每条语句最多 <500> 行，并在注释里说明超出之后会怎样——多数驱动有参数个数上限，
  PostgreSQL 是 65535

调用方在事务里，部分失败会整体回滚。不要加 try/catch。
```

## 提示词 5.6 —— 跨表的读取

```
给 <Order>DAO 加上：

  findWithCustomer(id): Promise<<Order> | null>

LEFT JOIN 到 `customers`，取客户的名称与模式。

给 join 出来的列起带点号的别名，让它们映射成内嵌对象而不是几个扁平字段：

  select o.id, o.code, o.status, o.customer_id,
         c.name as "customer.name", c.mode as "customer.mode"
    from orders o
    left join customers c on c.id = o.customer_id
   where o.id = $1

结果上带着 order.customer.name 与 order.customer.mode。双引号是必须的——没有它
PostgreSQL 会把别名折叠，点号就丢了。不要写 `c.name AS customer_name`：扁平的
customerName 藏起了值的来源，而且第二个列没地方放。

在注释里写明达梦上的分隔符是 `__`（customer__name），因为那个方言的别名里带不了点号，
以及驱动的 splitFieldPath 钩子正是让两边表现一致的东西。

这同时也是"一个 DAO，一张表"的边界情形：为读几个列而 join 是可以的，这个 DAO 仍然只拥有
`orders`。不可以的是在这里写一个同时会写 `customers` 的方法——那属于 <Customer>DAO，
由 repository 分别调用两者。

在 <Order> 类型上声明这个内嵌结构，让调用方拿到类型；并且同一条语句里不要既 select
"customer" 又 select "customer.name"——落在标量上的那一个会被映射器丢掉。
```

## 提示词 5.7 —— 引用检查该放在哪个 DAO

```
`orders.customer_id` 多对一地引用 `customers.id`。只要还有订单引用某个客户，
该客户就不能被删除。

实现这个检查，每个部件按它的 FROM 是哪张表来安放：

  <Order>DAO.countByCustomer(customerId): Promise<number>
      select count(*) as cc from orders where customer_id = <占位符>
      用 executeCountSQL。它读的是 `orders`，所以住在 <Order>DAO。

  <Customer>DAO.deleteById(id): Promise<number>
      只有那条 DELETE。不含计数，不含前置检查。

  <Customer>Repository.delete(id)
      先调 <Order>DAO.countByCustomer，非零时抛 ConflictError，消息里带上这个数字。
      抛之前先把原因和它的输入记进日志。之后才调 <Customer>DAO.deleteById。

不要把 countByCustomer（或者叫 countReferencingOrders）放进 <Customer>DAO，哪怕它
只在那里用。在 repository 方法的注释里写明理由：对 `orders` 的 SQL 集中在一个文件里，
`orders` 将来加软删除标志时只有一条查询要改——放在 <Customer>DAO 里的那份副本会继续
把已删除的订单数进去，于是悄悄挡住一次本该成功的删除。

两次调用在同一个事务里，所以在当前隔离级别下，计数不会在检查与删除之间失效。
在注释里说明当前配置的隔离级别下这一点是否成立；若不成立，真正的保证是 schema 里的
哪条约束。
```

---

背景阅读：[keelson-core 的 README](../../packages/keelson-core/README_CN.md)、
[查询条件指南](SEARCH_CRITERIA_CN.md)、
教程第 [2](../../tutorial/02-layers-and-transactions_CN.md) 章。
