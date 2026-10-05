# Dynamic Conditional Pagination Query Framework

[中文文档](SEARCH_CRITERIA_CN.md) | English

## Overview

`CommonSearchCriteria` builds parameterised, dialect-neutral SQL for dynamic search screens. You declare a base query once, append whichever conditions the incoming criteria object actually carries, and the base class handles counting, pagination, row mapping and post-processing.

## Core Features

- **Dynamic conditions** — exact match, range and wildcard helpers that skip themselves when the value is empty
- **Dialect-neutral placeholders** — `$1` on PostgreSQL, `?` on MySQL and Dameng, generated from the active connection
- **Pagination** — page / page size are read from the criteria object and clamped to safe bounds
- **Wildcards** — `*` is translated to SQL `%`, with `\`, `%` and `_` escaped in the user's input
- **SQL injection protection** — every value is bound as a parameter; only column names you write yourself are interpolated
- **Re-entrancy** — the constructor baseline is snapshotted and restored, so one instance can be executed repeatedly
- **Extension points** — override the row post-processor, declare boolean fields, append raw fragments when needed

---

## Architecture

### Base class: `CommonSearchCriteria<C = any>`

An abstract class providing the shared query and pagination logic. Subclasses implement `buildDynamicQuery()`.
`C` is the type of the search criteria object, defaulting to `any`.

`SearchCriteria<C = any>` is an empty subclass kept for backward compatibility (`abstract class SearchCriteria<C = any> extends CommonSearchCriteria<C> {}`). It adds no behaviour — extend `CommonSearchCriteria` directly in new code.

#### Constructor

```typescript
protected constructor(conn: DBConnection, criteria?: C)
```

The constructor is `protected`, so the class is only usable through a subclass — declare your own `public` constructor and call `super(conn, criteria)`.

It accepts the active `conn: DBConnection` and reads two fields off `criteria` and clamps them:

| Field | Default | Clamped to |
| --- | --- | --- |
| `page` | `1` | below `1` → `1` |
| `pageSize` | `25` | below `1` → `25`; above `1000` → `1000` |

The two are not clamped the same way, and the difference matters. A `page` below 1 becomes 1, but a `pageSize` below 1 falls back to the **default 25**, not to 1 — `pageSize=0` gives you 25 rows, not one. Only the upper bound is a true clamp, and it is what stops a hostile `pageSize=999999` from turning a paginated endpoint into a full-table dump. The `page` floor is what stops `page=0` from producing `offset -25`.

#### Protected properties

```typescript
protected readonly logger: Logger;      // scoped to the concrete subclass name
protected conn: DBConnection;           // injected in constructor; backs getPlaceholder()
protected sql: string;                  // the query being built (starts as '')
protected orderBy: string;              // ORDER BY clause (starts as '')
protected params: Array<any>;           // bound parameters
protected criteria?: C;                 // the incoming criteria object
protected booleanFields?: Array<string>; // set via setBooleanFields()
```

`page` and `pageSize` are private — read them from `criteria` if you need them.

### The baseline contract

Set `sql`, `params` and `orderBy` in the **constructor**. On the first execution they are snapshotted as a baseline; before every subsequent execution they are restored and `buildDynamicQuery()` runs again. So:

- `buildDynamicQuery()` must be **purely additive** — append to `sql`, push onto `params`
- the same instance can be executed as many times as you like without duplicating conditions
- the base parameters (a tenant code, an owner id) survive every run

```typescript
const criteria = new ProductSearchCriteria(conn, 'tenant001', { name: 'iPhone*' });
await criteria.paginationQuery();   // → ... AND p.tenant_code = $1 AND p.name LIKE $2
await criteria.paginationQuery();   // → identical; no duplicated clause, no extra params
```

---

## Method Reference

### Abstract

```typescript
protected abstract buildDynamicQuery(): any
```

Implement it to append the conditions this query supports. Called once per execution, after the baseline is restored.

### Condition builders

Each builder is a no-op when the value is empty (`isNotEmpty()` decides), so you can call them unconditionally. Each returns the next parameter index.

#### `addEqualsCriteria(value, field)`

```typescript
protected addEqualsCriteria(value: any, field: string): number
```

Appends `and <field> = <placeholder>`.

```typescript
this.addEqualsCriteria(this.criteria?.status, 'p.status');
```

#### `addWildcardCriteria(text, field)`

```typescript
protected addWildcardCriteria(text: string, field: string): number
```

If `text` contains `*`, appends `and <field> like <placeholder>` and converts `*` to `%`; otherwise appends `and <field> = <placeholder>`. Escaping applies to the LIKE branch only: `a_b*` binds `a\_b%`, so the underscore stays literal. A starless `a_b` is not escaped at all — it does not need to be, because the operator is `=`, not `LIKE`.

```typescript
this.addWildcardCriteria(this.criteria?.name, 'p.name');
// 'iPhone*' → and p.name like $n   (parameter 'iPhone%')
// 'iPhone'  → and p.name = $n      (parameter 'iPhone')
```

#### `addRangeCriteria(fromValue, toValue, field)`

```typescript
protected addRangeCriteria(fromValue: any, toValue: any, field: string): number
```

Appends `and <field> >= …` and/or `and <field> < …`. The lower bound is inclusive, the upper bound exclusive. When `toValue` is a `Date`, it is advanced by `getNextDayStart()` so that "to 2026-09-18" includes everything that happened on the 18th.

```typescript
this.addRangeCriteria(this.criteria?.priceFrom, this.criteria?.priceTo, 'p.price');
this.addRangeCriteria(this.criteria?.dateFrom, this.criteria?.dateTo, 'p.created_at');
```

### Execution

#### `paginationQuery<T>()`

```typescript
async paginationQuery<T = any>(): Promise<PaginationList<T>>
```

Runs `select count(*) as cc from (<sql>) a`, then the page query with the driver's limit/offset clause.

Two consequences of that count wrapping your SQL in a subquery. Keep `ORDER BY` in `this.orderBy` and out of `this.sql` — inside the counted subquery it is a sort nobody reads, and some dialects reject it outright. And never put a LIMIT or OFFSET in `this.sql`: the base class appends the dialect's own limit clause after `this.orderBy`.

```typescript
{
  count: number,     // total matching rows
  hasMore: boolean,  // whether a further page exists
  list: Array<T>,    // the current page
  pages: number      // Math.ceil(count / pageSize)
}
```

`hasMore` is computed, not queried: it is `offset + pageSize < count`, where `offset = (page - 1) * pageSize` and `pageSize` is the clamped value.

When the count is `0`, it short-circuits to `{ count: 0, hasMore: false, list: [], pages: 0 }` without running the page query. It short-circuits again whenever `offset >= count` — any page past the end returns an empty list after the COUNT alone, so `page=10000000` costs one round trip rather than two, and needs no guard of your own.

#### `query<T>()`

```typescript
async query<T = any>(): Promise<Array<T>>
```

Runs the query unpaginated and returns every matching row, with the same post-processing and boolean coercion. Mind the result size — there is no limit clause.

### Extension points

#### `getPostProcessor()`

```typescript
protected getPostProcessor(): ((obj: any) => void) | null
```

Override to return a callback invoked on each mapped row. Applied consistently by both `paginationQuery()` and `query()`.

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

Declares which result fields should be coerced to `true` / `false`. The accepted values are a real boolean, the numbers `1` and `0`, and the strings `'1'`, `'0'`, `'t'`, `'f'`, `'true'`, `'false'` — trimmed and case-insensitive, so `'TRUE'` and `'T'` are the same rule. Anything else falls through to plain truthiness, which is why an unexpected `'yes'` silently becomes `true`. Dotted paths reach into hydrated nested objects. Call it from the constructor.

```typescript
this.setBooleanFields('isActive', 'isDeleted', 'category.isActive');
```

#### `getPlaceholder(index)`

```typescript
protected getPlaceholder(index: number): string
```

Returns the active connection's placeholder for a 1-based parameter index. Use it when appending a raw fragment that the builders do not cover.

### Utilities

| Method | Purpose |
| --- | --- |
| `isNotEmpty(v)` | `true` when a string is non-blank, or a non-string is not `null` / `undefined` |
| `includeStar(s)` | Whether the string contains `*` |
| `toWildSQL(s)` | Converts `*` to `%` without escaping |
| `replaceWildStar(s)` | Escapes `\`, `%`, `_`, then converts `*` to `%` |
| `escapePercentage(s)` | Escapes `\`, `%` and `_` |
| `wrapLikeMatch(s)` | Wraps the string as `%s%` |
| `getNextDayStart(d)` | Next local midnight in the Node process's zone; `null` for `null`/`undefined` or an invalid date. Where a DST jump skips midnight it returns 01:00, which is still the first instant of the next local day |

---

## Usage Examples

### 1. Defining a query class

```typescript
import { CommonSearchCriteria, DBConnection } from '@ticatec/keelson-core';

interface ProductCriteria {
    page?: number;
    pageSize?: number;
    name?: string;
    status?: string;
    categoryPath?: string;
    priceFrom?: number;
    priceTo?: number;
}

const BASE_SQL = `
    SELECT p.code, p.name, p.status, p.price, pc.name AS "category.name"
      FROM wms_products p
      JOIN wms_product_categories pc ON pc.code = p.category_code
     WHERE p.tenant_code = $1 AND p.deleted = false`;

export default class ProductSearchCriteria extends CommonSearchCriteria<ProductCriteria> {

    constructor(conn: DBConnection, tenantCode: string, criteria?: ProductCriteria) {
        super(conn, criteria);
        this.sql = BASE_SQL;                 // baseline
        this.params = [tenantCode];          // baseline
        this.orderBy = 'ORDER BY p.name';    // baseline
        this.setBooleanFields('category.isActive');
    }

    protected buildDynamicQuery(): void {
        // Product name: wildcard-aware
        this.addWildcardCriteria(this.criteria?.name, 'p.name');

        // Status: exact match
        this.addEqualsCriteria(this.criteria?.status, 'p.status');

        // Price range
        this.addRangeCriteria(this.criteria?.priceFrom, this.criteria?.priceTo, 'p.price');

        // A fragment the builders do not cover — push the parameter, then ask for its placeholder
        if (this.criteria?.categoryPath) {
            this.params.push(`${this.criteria.categoryPath}%`);
            this.sql += ` AND pc.query_path LIKE ${this.getPlaceholder(this.params.length)}`;
        }
    }
}
```

> `BASE_SQL` uses `$1` because this example targets PostgreSQL. Placeholders you write by hand are dialect-specific; those produced by the builders and by `getPlaceholder()` are not.

### 2. Running it

```typescript
const criteria = new ProductSearchCriteria(conn, 'tenant001', {
    page: 1,
    pageSize: 20,
    name: 'iPhone*',                        // wildcard
    status: 'active',                       // exact match
    categoryPath: '/electronics/phones',    // prefix match
    priceFrom: 100,
    priceTo: 1000
});

const result = await criteria.paginationQuery<Product>();
console.log(`Total: ${result.count}, pages: ${result.pages}, more: ${result.hasMore}`);
console.log(result.list);

// Unpaginated, e.g. for an export
const allRows = await criteria.query<Product>();
```

From a DAO, let `executePaginationQuery()` run the criteria query:

```typescript
export class ProductDAO extends CommonDAO {
  async search(criteria: ProductSearchCriteria): Promise<PaginationList<Product>> {
    return await this.executePaginationQuery<Product>(criteria);
  }
}
```

---

## Generated SQL Reference

| Call | Appended SQL | Bound parameter |
| --- | --- | --- |
| `addEqualsCriteria('active', 'p.status')` | `and p.status = $n` | `'active'` |
| `addWildcardCriteria('iPhone*', 'p.name')` | `and p.name like $n` | `'iPhone%'` |
| `addWildcardCriteria('iPhone', 'p.name')` | `and p.name = $n` | `'iPhone'` |
| `addRangeCriteria(100, 1000, 'p.price')` | `and p.price >= $n and p.price < $m` | `100`, `1000` |
| `addRangeCriteria(d1, d2, 'p.created_at')` | `and p.created_at >= $n and p.created_at < $m` | `d1`, next midnight after `d2` |

Every builder is skipped entirely when its value is empty, so no clause and no parameter is produced.

---

## Nested Objects

Alias a column with a dotted path and the mapper hydrates a nested object:

```sql
SELECT p.code, pc.name AS "category.name", pc.is_active AS "category.isActive"
```

```json
{ "code": "P001", "category": { "name": "Phones", "isActive": true } }
```

Declare the nested boolean with its full path: `this.setBooleanFields('category.isActive')`.

---

## Safety Notes

- **Values are always parameters.** Never interpolate `this.criteria.x` into `this.sql` — pass it through a builder, or `params.push()` it and reference `getPlaceholder()`.
- **Column names and `orderBy` are interpolated verbatim.** Never build them from user input. If a screen offers user-selectable sorting, map the incoming key through a whitelist to a column name you control.
- **`query()` has no limit.** Use `paginationQuery()` for anything user-facing.
