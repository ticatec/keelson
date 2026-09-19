# 5. DAO 层

中文 | [English](AI_PROMPTS_5_DAO.md) · [目录](AI_PROMPTS_CN.md)

SQL，仅此而已。

## 规则

**一个 DAO 一张表的量。** 为了取一个列而 join 第二张表没问题；一个 DAO 拥有两个实体，
那就是两个 DAO。

**不含业务规则。** DAO 不负责判断 ARCHIVED 的订单不能更新。它执行收到的那条 UPDATE，
报告影响了多少行。

**不调用别的 DAO，不调用 repository。** DAO 的依赖只有连接和基类提供的辅助方法。

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
| `quickSearch<T>(sql, params, pageNo, rowCount, booleanFields?)` | 一页结果 |
| `executePaginationQuery(criteria)` | 由 `CommonSearchCriteria` 得到的 `PaginationList` |
| `genID()` | 32 字符的 UUID v7，时间有序，可直接做主键 |
| `toBooleanInt(b)` / `toBooleanChar(b)` | 写入方向：布尔转 `1`/`0`、布尔转 `'T'`/`'F'` |

列名自动转驼峰——`created_at` 变成 `createdAt`。

布尔转换的适用范围比看上去窄，写提示词之前值得知道。`booleanFields` 会把 `'t'`、`'f'`、
`'true'`、`'false'`、`'1'`、`'0'`（不分大小写）转成真正的布尔值——正是它让没有原生布尔
类型的 MySQL 与达梦表现得跟 PostgreSQL 一样。但在 DAO 这一层，它**只是 `quickSearch`
的参数**。`findByPK`、`findFirst`、`listQuery` 都不接受它。

这几个方法要么在 DAO 方法里自己转换，要么通过 `this.getDBConnection()` 拿到连接、
用它的 `listQuery(sql, params, postConstruction, booleanFields)` 重载。
分页的 criteria 查询则在 criteria 类上用 `setBooleanFields(...)` 声明。

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
  updateStatus(id, status): number
  deleteById(id): number

规则：
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

## 提示词 5.2 —— 分页查询

```
给 <Order>DAO 加上：

  searchByCriteria(criteria: <Order>SearchCriteria): Promise<PaginationList<<Order>>>

用 executePaginationQuery(criteria)——criteria 对象自带条件、参数、排序与页大小，
所以 DAO 既不构造条件也不读分页参数。布尔字段在 criteria 类上用 setBooleanFields 声明，
不在这里传。

再加上：

  countByStatus(tenantCode): Promise<Array<{ status: string; count: number }>>

用 GROUP BY，经 listQuery 映射。
```

## 提示词 5.3 —— 与方言无关的 SQL

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

## 提示词 5.4 —— 批量插入

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

## 提示词 5.5 —— 跨表的读取

```
给 <Order>DAO 加上：

  findWithCustomerName(id): Promise<any | null>

LEFT JOIN 到 `customers`，只为取客户名。

这是"一个 DAO 一张表"的边界情形：为读一个列而 join 是可以的，这个 DAO 仍然只拥有
`orders`。不可以的是在这里写一个同时会写 `customers` 的方法——那属于 <Customer>DAO，
由 repository 分别调用两者。

给 join 出来的列起别名，让它映射成清楚的驼峰名——`c.name AS customer_name`
会变成 `customerName`。
```

## 提示词 5.6 —— 执行 schema 文件

```
加一个引导用的 DAO，在启动时执行 <db/schema.sql>，仅限开发环境。

用 executeSQLFile。在注释里写明它会逐条记录执行的语句，所以这个文件里不能有凭据——
一个 INSERT 里带着口令的种子文件，会把那个口令写进日志。

说明它在哪里被调用：<Orders>Server.beforeStart() 里，由环境判断包住，
排在 DBManager.init() 之后。
```

---

背景阅读：[DAO 指南](DAO_GUIDE_CN.md)、[查询条件指南](SEARCH_CRITERIA_CN.md)、
教程第 [2](../../tutorial/02-layers-and-transactions_CN.md) 章。
