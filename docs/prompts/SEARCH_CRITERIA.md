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

### Base class: `CommonSearchCriteria`

An abstract class providing the shared query and pagination logic. Subclasses implement `buildDynamicQuery()`.

`SearchCriteria` is an empty subclass kept for backward compatibility (`abstract class SearchCriteria extends CommonSearchCriteria {}`). It adds no behaviour — extend `CommonSearchCriteria` directly in new code.

#### Constructor

```typescript
protected constructor(criteria?: any)
```

The constructor is `protected`, so the class is only usable through a subclass — declare your own `public` constructor and call `super(criteria)`.

It reads two fields off `criteria` and clamps them:

| Field | Default | Clamped to |
| --- | --- | --- |
| `page` | `1` | `>= 1` |
| `pageSize` | `25` | `1 … 1000` |

Clamping is why a hostile `pageSize=999999` cannot turn a paginated endpoint into a full-table dump, and a negative `page` cannot produce a `offset -25` syntax error.

#### Protected properties

```typescript
protected readonly logger: Logger;      // scoped to the concrete subclass name
protected conn?: DBConnection;          // set before each run; backs getPlaceholder()
protected sql: string;                  // the query being built (starts as '')
protected orderBy: string;              // ORDER BY clause (starts as '')
protected params: Array<any>;           // bound parameters
protected criteria: any;                // the incoming criteria object
protected booleanFields?: Array<string>; // set via setBooleanFields()
```

`page` and `pageSize` are private — read them from `criteria` if you need them.

### The baseline contract

Set `sql`, `params` and `orderBy` in the **constructor**. On the first execution they are snapshotted as a baseline; before every subsequent execution they are restored and `buildDynamicQuery()` runs again. So:

- `buildDynamicQuery()` must be **purely additive** — append to `sql`, push onto `params`
- the same instance can be executed as many times as you like without duplicating conditions
- the base parameters (a tenant code, an owner id) survive every run

```typescript
const criteria = new ProductSearchCriteria('tenant001', { name: 'iPhone*' });
await criteria.paginationQuery(conn);   // → ... AND p.tenant_code = $1 AND p.name LIKE $2
await criteria.paginationQuery(conn);   // → identical; no duplicated clause, no extra params
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

If `text` contains `*`, appends `and <field> like <placeholder>` and converts `*` to `%`; otherwise appends `and <field> = <placeholder>`. Literal `\`, `%` and `_` in the input are escaped, so a user searching for `a_b` matches the literal string rather than any three characters.

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

#### `paginationQuery(conn)`

```typescript
async paginationQuery(conn: DBConnection): Promise<PaginationList>
```

Runs `select count(*) as cc from (<sql>) a`, then the page query with the driver's limit/offset clause.

```typescript
{
  count: number,     // total matching rows
  hasMore: boolean,  // whether a further page exists
  list: Array<any>,  // the current page
  pages: number      // Math.ceil(count / pageSize)
}
```

When the count is `0`, it short-circuits to `{ count: 0, hasMore: false, list: [], pages: 0 }` without running the page query.

#### `query(conn)`

```typescript
async query(conn: DBConnection): Promise<Array<any>>
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

Declares which result fields should be coerced to `true` / `false` from the driver's representation (`1`/`0`, `'T'`/`'F'`, `'t'`/`'f'`). Dotted paths reach into hydrated nested objects. Call it from the constructor.

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
| `getNextDayStart(d)` | Next local midnight, DST-safe; `null` for an invalid date |

---

## Usage Examples

### 1. Defining a query class

```typescript
import { CommonSearchCriteria } from '@ticatec/keelson-core';

const BASE_SQL = `
    SELECT p.code, p.name, p.status, p.price, pc.name AS "category.name"
      FROM wms_products p
      JOIN wms_product_categories pc ON pc.code = p.category_code
     WHERE p.tenant_code = $1 AND p.deleted = false`;

export default class ProductSearchCriteria extends CommonSearchCriteria {

    constructor(tenantCode: string, criteria?: any) {
        super(criteria);
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
const criteria = new ProductSearchCriteria('tenant001', {
    page: 1,
    pageSize: 20,
    name: 'iPhone*',                        // wildcard
    status: 'active',                       // exact match
    categoryPath: '/electronics/phones',    // prefix match
    priceFrom: 100,
    priceTo: 1000
});

const result = await criteria.paginationQuery(conn);
console.log(`Total: ${result.count}, pages: ${result.pages}, more: ${result.hasMore}`);
console.log(result.list);

// Unpaginated, e.g. for an export
const allRows = await criteria.query(conn);
```

From a DAO, let `executePaginationQuery()` resolve the connection for you:

```typescript
export class ProductDAO extends CommonDAO {
  async search(criteria: ProductSearchCriteria): Promise<PaginationList> {
    return await this.executePaginationQuery(criteria);
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
