# 动态条件分页查询框架

中文 | [English](SEARCH_CRITERIA.md)

## 概述

`CommonSearchCriteria` 用于为动态查询界面构建参数化、方言无关的 SQL。你只需声明一次基础查询，再按传入 criteria 对象实际携带的字段追加条件，统计、分页、行映射与后置处理都由基类完成。

## 核心特性

- **动态条件** —— 精确匹配、区间、通配符三类辅助方法，值为空时自动跳过
- **方言无关的占位符** —— PostgreSQL 下为 `$1`，MySQL 与达梦下为 `?`，由当前连接生成
- **分页** —— 页码与每页条数从 criteria 对象读取，并收敛到安全范围
- **通配符** —— `*` 转换为 SQL 的 `%`，同时转义用户输入中的 `\`、`%`、`_`
- **SQL 注入防护** —— 所有值都以参数绑定；只有你自己书写的列名会被拼接
- **可重入** —— 构造函数中的基线会被快照并恢复，同一实例可反复执行
- **扩展点** —— 可覆写行后置处理器、声明布尔字段、必要时追加原始片段

---

## 架构

### 基类：`CommonSearchCriteria`

提供公共查询与分页逻辑的抽象类，子类实现 `buildDynamicQuery()`。

`SearchCriteria` 是为向后兼容保留的空子类（`abstract class SearchCriteria extends CommonSearchCriteria {}`），不附加任何行为 —— 新代码请直接继承 `CommonSearchCriteria`。

#### 构造函数

```typescript
protected constructor(criteria?: any)
```

构造函数为 `protected`，因此只能通过子类使用 —— 请在子类中声明 `public` 构造函数并调用 `super(criteria)`。

它从 `criteria` 读取两个字段并做边界收敛：

| 字段 | 默认值 | 收敛范围 |
| --- | --- | --- |
| `page` | `1` | `>= 1` |
| `pageSize` | `25` | `1 … 1000` |

正因为有这层收敛，恶意的 `pageSize=999999` 无法把分页接口变成全表导出，负数 `page` 也不会生成 `offset -25` 这样的语法错误。

#### 受保护属性

```typescript
protected readonly logger: Logger;      // 以具体子类名命名
protected conn?: DBConnection;          // 每次执行前设置，为 getPlaceholder() 提供依据
protected sql: string;                  // 正在构建的查询（初始为 ''）
protected orderBy: string;              // ORDER BY 子句（初始为 ''）
protected params: Array<any>;           // 绑定参数
protected criteria: any;                // 传入的 criteria 对象
protected booleanFields?: Array<string>; // 通过 setBooleanFields() 设置
```

`page` 与 `pageSize` 是私有的 —— 如需使用请从 `criteria` 中读取。

### 基线契约

请在**构造函数**中设置 `sql`、`params` 和 `orderBy`。首次执行时它们会被快照为基线；此后每次执行前先恢复基线，再运行 `buildDynamicQuery()`。因此：

- `buildDynamicQuery()` 必须是**纯追加**的 —— 向 `sql` 追加、向 `params` push
- 同一实例可以执行任意多次，不会重复拼接条件
- 基础参数（租户码、归属人 ID 等）在每次执行中都会保留

```typescript
const criteria = new ProductSearchCriteria('tenant001', { name: 'iPhone*' });
await criteria.paginationQuery(conn);   // → ... AND p.tenant_code = $1 AND p.name LIKE $2
await criteria.paginationQuery(conn);   // → 完全相同；无重复子句，无多余参数
```

---

## 方法参考

### 抽象方法

```typescript
protected abstract buildDynamicQuery(): any
```

在其中追加本查询支持的条件。每次执行调用一次，在基线恢复之后。

### 条件构建方法

值为空时（由 `isNotEmpty()` 判定）各构建方法自动跳过，因此可以无条件调用。返回值为下一个参数序号。

#### `addEqualsCriteria(value, field)`

```typescript
protected addEqualsCriteria(value: any, field: string): number
```

追加 `and <field> = <占位符>`。

```typescript
this.addEqualsCriteria(this.criteria?.status, 'p.status');
```

#### `addWildcardCriteria(text, field)`

```typescript
protected addWildcardCriteria(text: string, field: string): number
```

`text` 含 `*` 时追加 `and <field> like <占位符>` 并把 `*` 转为 `%`；否则追加 `and <field> = <占位符>`。输入中字面量的 `\`、`%`、`_` 会被转义 —— 用户搜索 `a_b` 匹配的是字面字符串，而不是"任意三个字符"。

```typescript
this.addWildcardCriteria(this.criteria?.name, 'p.name');
// 'iPhone*' → and p.name like $n   （参数 'iPhone%'）
// 'iPhone'  → and p.name = $n      （参数 'iPhone'）
```

#### `addRangeCriteria(fromValue, toValue, field)`

```typescript
protected addRangeCriteria(fromValue: any, toValue: any, field: string): number
```

追加 `and <field> >= …` 和/或 `and <field> < …`。下界闭区间，上界开区间。当 `toValue` 为 `Date` 时，会经 `getNextDayStart()` 推进到次日零点，因此"截止 2026-09-18"会包含 18 日当天的全部数据。

```typescript
this.addRangeCriteria(this.criteria?.priceFrom, this.criteria?.priceTo, 'p.price');
this.addRangeCriteria(this.criteria?.dateFrom, this.criteria?.dateTo, 'p.created_at');
```

### 执行方法

#### `paginationQuery(conn)`

```typescript
async paginationQuery(conn: DBConnection): Promise<PaginationList>
```

先执行 `select count(*) as cc from (<sql>) a`，再套用驱动的 limit/offset 子句执行分页查询。

```typescript
{
  count: number,     // 匹配总行数
  hasMore: boolean,  // 是否还有下一页
  list: Array<any>,  // 当前页数据
  pages: number      // Math.ceil(count / pageSize)
}
```

统计结果为 `0` 时直接短路返回 `{ count: 0, hasMore: false, list: [], pages: 0 }`，不再执行分页查询。

#### `query(conn)`

```typescript
async query(conn: DBConnection): Promise<Array<any>>
```

不分页执行并返回全部匹配行，后置处理与布尔转换逻辑保持一致。注意结果集大小 —— 这里没有 limit 子句。

### 扩展点

#### `getPostProcessor()`

```typescript
protected getPostProcessor(): ((obj: any) => void) | null
```

覆写以返回逐行调用的回调。`paginationQuery()` 与 `query()` 都会一致地应用它。

```typescript
protected getPostProcessor(): ((row: any) => void) | null {
    return (row: any) => {
        if (row.createdAt) {
            row.createdAt = new Date(row.createdAt);
        }
    };
}
```

#### `setBooleanFields(...fields)`

```typescript
protected setBooleanFields(...fields: Array<string>): void
```

声明哪些结果字段需要从驱动的表示（`1`/`0`、`'T'`/`'F'`、`'t'`/`'f'`）转换为 `true` / `false`。点号路径可深入已生成的嵌套对象。请在构造函数中调用。

```typescript
this.setBooleanFields('isActive', 'isDeleted', 'category.isActive');
```

#### `getPlaceholder(index)`

```typescript
protected getPlaceholder(index: number): string
```

按 1 起始的参数序号返回当前连接的占位符。当需要追加构建方法覆盖不到的原始片段时使用。

### 工具方法

| 方法 | 用途 |
| --- | --- |
| `isNotEmpty(v)` | 字符串非空白、或非字符串值不为 `null` / `undefined` 时返回 `true` |
| `includeStar(s)` | 字符串是否包含 `*` |
| `toWildSQL(s)` | 把 `*` 转为 `%`，不做转义 |
| `replaceWildStar(s)` | 转义 `\`、`%`、`_`，再把 `*` 转为 `%` |
| `escapePercentage(s)` | 转义 `\`、`%`、`_` |
| `wrapLikeMatch(s)` | 包装为 `%s%` |
| `getNextDayStart(d)` | 次日本地零点，夏令时安全；日期非法时返回 `null` |

---

## 使用示例

### 1. 定义查询类

```typescript
import { CommonSearchCriteria } from '@ticatec/node-common-library';

const BASE_SQL = `
    SELECT p.code, p.name, p.status, p.price, pc.name AS "category.name"
      FROM wms_products p
      JOIN wms_product_categories pc ON pc.code = p.category_code
     WHERE p.tenant_code = $1 AND p.deleted = false`;

export default class ProductSearchCriteria extends CommonSearchCriteria {

    constructor(tenantCode: string, criteria?: any) {
        super(criteria);
        this.sql = BASE_SQL;                 // 基线
        this.params = [tenantCode];          // 基线
        this.orderBy = 'ORDER BY p.name';    // 基线
        this.setBooleanFields('category.isActive');
    }

    protected buildDynamicQuery(): void {
        // 商品名称：支持通配符
        this.addWildcardCriteria(this.criteria?.name, 'p.name');

        // 状态：精确匹配
        this.addEqualsCriteria(this.criteria?.status, 'p.status');

        // 价格区间
        this.addRangeCriteria(this.criteria?.priceFrom, this.criteria?.priceTo, 'p.price');

        // 构建方法覆盖不到的片段 —— 先 push 参数，再取它的占位符
        if (this.criteria?.categoryPath) {
            this.params.push(`${this.criteria.categoryPath}%`);
            this.sql += ` AND pc.query_path LIKE ${this.getPlaceholder(this.params.length)}`;
        }
    }
}
```

> 示例中的 `BASE_SQL` 使用 `$1` 是因为它面向 PostgreSQL。你手写的占位符是方言相关的；构建方法与 `getPlaceholder()` 产出的则不是。

### 2. 执行查询

```typescript
const criteria = new ProductSearchCriteria('tenant001', {
    page: 1,
    pageSize: 20,
    name: 'iPhone*',                        // 通配符
    status: 'active',                       // 精确匹配
    categoryPath: '/electronics/phones',    // 前缀匹配
    priceFrom: 100,
    priceTo: 1000
});

const result = await criteria.paginationQuery(conn);
console.log(`总计: ${result.count}, 页数: ${result.pages}, 还有更多: ${result.hasMore}`);
console.log(result.list);

// 不分页执行，例如用于导出
const allRows = await criteria.query(conn);
```

在 DAO 中，交给 `executePaginationQuery()` 解析连接：

```typescript
export class ProductDAO extends CommonDAO {
  async search(criteria: ProductSearchCriteria): Promise<PaginationList> {
    return await this.executePaginationQuery(criteria);
  }
}
```

---

## 生成 SQL 速查

| 调用 | 追加的 SQL | 绑定参数 |
| --- | --- | --- |
| `addEqualsCriteria('active', 'p.status')` | `and p.status = $n` | `'active'` |
| `addWildcardCriteria('iPhone*', 'p.name')` | `and p.name like $n` | `'iPhone%'` |
| `addWildcardCriteria('iPhone', 'p.name')` | `and p.name = $n` | `'iPhone'` |
| `addRangeCriteria(100, 1000, 'p.price')` | `and p.price >= $n and p.price < $m` | `100`、`1000` |
| `addRangeCriteria(d1, d2, 'p.created_at')` | `and p.created_at >= $n and p.created_at < $m` | `d1`、`d2` 的次日零点 |

值为空时对应的构建方法整体跳过，既不产生子句也不产生参数。

---

## 嵌套对象

用点号路径为列取别名，映射器会自动生成嵌套对象：

```sql
SELECT p.code, pc.name AS "category.name", pc.is_active AS "category.isActive"
```

```json
{ "code": "P001", "category": { "name": "Phones", "isActive": true } }
```

嵌套的布尔字段需用完整路径声明：`this.setBooleanFields('category.isActive')`。

---

## 安全须知

- **值一律作为参数。** 绝不要把 `this.criteria.x` 拼进 `this.sql` —— 要么交给构建方法，要么 `params.push()` 之后引用 `getPlaceholder()`。
- **列名与 `orderBy` 是原样拼接的。** 绝不要用用户输入构造它们。如果界面提供用户可选排序，请把传入的 key 经白名单映射到你自己掌控的列名。
- **`query()` 没有 limit。** 面向用户的场景一律使用 `paginationQuery()`。
