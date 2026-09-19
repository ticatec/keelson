# 5. DAO layer

[中文](AI_PROMPTS_5_DAO_CN.md) | English · [Index](AI_PROMPTS.md)

SQL, and nothing else.

## The rules

**One DAO, one table.** A DAO owns exactly one table. Reading a second table through a JOIN
is fine — that is how you get a customer's name onto an order row. Owning two entities is
not: a DAO that both writes `orders` and writes `customers` is two DAOs that have been
pasted together.

**A question about table A is answered by table A's DAO, even when table B is asking.**
This is the half of the rule that gets broken, because the broken version reads naturally.
`orders` references `customers` many-to-one, and a customer cannot be deleted while orders
still point at it. So something must run:

```sql
select count(*) as cc from orders where customer_id = $1
```

That statement's FROM clause says `orders`, so it is `OrderDAO.countByCustomer(customerId)`
— **not** a `countReferencingOrders()` tucked inside `CustomerDAO` next to the delete it
guards. The repository calls both: `OrderDAO` to count, then `CustomerDAO` to delete.

The test is mechanical: **whatever is in the FROM clause names the DAO.** No exceptions for
"it's only a count", "it's only one line", or "it's only used here".

What it buys you is one place to change. The day `orders` gets a `deleted` flag and every
query over it needs `and deleted = false`, you edit `OrderDAO` and you are done. If the
count lives in `CustomerDAO`, it keeps counting soft-deleted orders, and a customer that
should be deletable stays undeletable — with no failing test, because the count still
returns a number.

**One update statement per table, not one per column.** A DAO does not get `updateStatus`,
`updateRemark`, `updateAmount`. It gets `update(order)`, which writes every updatable
column. To change one field, the caller reads the row, sets the field on the object it got
back, and writes it:

```typescript
const order = await this.orderDAO.findById(id);
order.status = 'CANCELLED';
await this.orderDAO.update(order);
```

Which columns `update` must leave alone is a property of the entity, not of the caller —
the tenant the row belongs to, its id, its creation time. That list belongs in the UPDATE
statement's SET clause, written once, where every caller inherits it. An `updateStatus`
that touches only `status` is safe by accident; it is the next one, `updateCustomer`, that
quietly lets a row change hands.

The cost is one extra SELECT, inside the transaction that is about to write — which is
also what stops the read-modify-write from racing. What it buys is one statement to amend
when a column is added, one place where the non-updatable columns are named, and an
`updated_at` or version bump that no write path can skip.

**No business rules.** A DAO does not decide that an ARCHIVED order cannot be updated. It
runs the UPDATE it was given and reports how many rows changed.

**No other DAOs, no repository.** A DAO's dependencies are the connection and the helpers
its base class provides. A DAO that needs a second table's DAO is telling you the
orchestration belongs one layer up.

**No connection handling.** `CommonDAO` takes the connection from the transaction context.
Never open one, never pass one as an argument, never commit.

**Errors that mean something stay in SQL terms.** A DAO reports a driver error or an
affected-row count. Turning a zero-row update into `ActionNotFoundError` is the repository's
job, because only it knows whether zero rows is an error.

**JSDoc on every method.** A DAO method's signature does not show which table it touches or
what the returned shape is; the JSDoc does. This is the layer where a reader most often has
to guess, and the layer where guessing wrong is a production query.

This is also the layer with the fewest throws — most DAO methods have none, and the
throw-site logging rule simply does not come up. Where one does throw, the rule applies.

## The helpers

| Method | Returns |
| --- | --- |
| `findByPK(sql, params)` | The first row mapped, or `null` |
| `findFirst(sql, params)` | The same, for a query that is not a key lookup |
| `listQuery(sql, params)` | All rows mapped |
| `executeInsertQuery<T>(sql, params)` | `InsertResult<T>` — `affectedRows`, `record`, `insertId` |
| `executeUpdateQuery<T>(sql, params)` | `UpdateResult<T>` — `affectedRows`, `record` |
| `executeDeleteQuery(sql, params)` | Affected row count |
| `executeCountSQL(sql, params, key?)` | A number, key defaults to `cc` |
| `quickSearch<T>(sql, params, pageNo, rowCount, booleanFields?)` | `QuickSearchResult<T>` — `list`, `hasMore` |
| `executePaginationQuery(criteria)` | `PaginationList` from a `CommonSearchCriteria` |
| `genID()` | A 32-character UUID v7, time-ordered, usable as a primary key |
| `toBooleanInt(b)` / `toBooleanChar(b)` | Write direction: boolean to `1`/`0`, boolean to `'T'`/`'F'` |

Column names come back camelCased — `created_at` becomes `createdAt`.

### What a write returns

`executeInsertQuery` and `executeUpdateQuery` return a typed structure rather than the
driver's own value:

```typescript
interface InsertResult<T> {
    affectedRows: number;
    record: T | null;                    // populated when the statement returns a row
    insertId?: number | string | null;   // generated key, where the driver supplies one
}

interface UpdateResult<T> {
    affectedRows: number;
    record: T | null;
}
```

Which of the two is filled in depends on the database, and this is the detail that makes a
DAO non-portable without anyone noticing:

| Driver | `record` | `insertId` |
| --- | --- | --- |
| PostgreSQL | the row, when the statement ends with `RETURNING *` | not supplied |
| MySQL | always `null` — MySQL has no `RETURNING` | the auto-increment key |
| Dameng | the row, when the statement returns one | not supplied — `RETURNING INTO` or `SELECT @@IDENTITY` |

So a DAO that returns `result.record!.id` works on PostgreSQL and throws on MySQL. Return
something the caller can rely on instead — the id the DAO already generated — and check
`affectedRows` before trusting `record`.

### Joined columns become nested objects

An alias containing a dot does not produce a flat name — it builds an object:

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

so `order.customer.name` is reachable without a second query and without mapping code.
Each segment is camelCased on its own — `"customer.contact_name"` becomes
`customer.contactName`. Prefer this over `c.name AS customer_name`: a flat `customerName`
loses the fact that the value came from a different table, and it has nowhere to put the
second and third column when the screen asks for them.

The quoting is not optional, and it is dialect-specific: double quotes on PostgreSQL,
backticks on MySQL. An unquoted alias has its dot folded away and you get a flat field back.
Dameng cannot carry a dot in an alias at all, so its driver reads `__` instead
(`customer__name`); `splitFieldPath` is the hook that decides this, and changing that
separator is the only thing a driver overrides. Boolean fields on a criteria class are
declared by the same path: `setBooleanFields('customer.isActive')`.

Two things the mapper refuses. A path segment named `__proto__`, `constructor` or
`prototype` is dropped rather than assigned. And it will not overwrite an intermediate that
is already a scalar — so do not select both `"customer"` and `"customer.name"` in one
statement; whichever lands second is silently discarded.

Boolean coercion is narrower than it looks, and it is worth knowing before you write a
prompt that assumes otherwise. `booleanFields` coerces the strings `'t'`, `'f'`, `'true'`,
`'false'`, `'1'`, `'0'` in any case into real booleans — which is what makes a MySQL or
Dameng schema without a native boolean type behave like PostgreSQL. But at the DAO level it
is a parameter of **`quickSearch` only**. `findByPK`, `findFirst` and `listQuery` do not
take it.

For those, either coerce in the DAO method itself, or reach the connection's own
`listQuery(sql, params, postConstruction, booleanFields)` through `this.getDBConnection()`.
For a paginated criteria query, declare the fields on the criteria class with
`setBooleanFields(...)` instead.

---

## Pagination

Two mechanisms, answering different questions. Pick by whether the screen shows a total.

| | `executePaginationQuery(criteria)` | `quickSearch(sql, params, pageNo, rowCount)` |
| --- | --- | --- |
| Returns | `PaginationList` — `count`, `pages`, `hasMore`, `list` | `QuickSearchResult<T>` — `list`, `hasMore` |
| Round trips | two — a COUNT, then the page | one |
| Conditions | built by a criteria class | written into the SQL by you |
| Boolean fields | `setBooleanFields()` on the criteria | the fifth argument |
| Use for | a search screen with a pager: "142 results, page 3 of 6" | infinite scroll, a picker, a type-ahead |

`PaginationList` takes **no type parameter** — its `list` is `Array<any>`. Write
`Promise<PaginationList>`, never `Promise<PaginationList<Order>>`; the latter does not
compile. `QuickSearchResult<T>` is generic and does type its list.

### The criteria route

Three pieces: a criteria class that owns the SQL, a one-line DAO method, and a caller that
passes the raw request criteria straight through.

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
        this.sql = BASE_SQL;                            // baseline
        this.params = [tenantCode];                     // baseline
        this.orderBy = 'ORDER BY o.created_at DESC';    // baseline — kept out of this.sql
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
 * Runs the order search screen's paginated query.
 * @param criteria - a prepared OrderSearchCriteria carrying conditions, ordering and page bounds
 * @returns the requested page, plus the total matching count and page count
 */
async searchByCriteria(criteria: OrderSearchCriteria): Promise<PaginationList> {
    return this.executePaginationQuery(criteria);
}
```

```typescript
// src/repository/OrderRepository.ts — the criteria object comes from the request, unchanged
const criteria = new OrderSearchCriteria(user.tenantCode, params);
return this.orderDAO.searchByCriteria(criteria);
```

`page` and `pageSize` are read off that raw object by the base constructor. They are not
DAO arguments and do not appear in any signature above.

| Field | Default | Out of range |
| --- | --- | --- |
| `page` | `1` | below `1` → `1` |
| `pageSize` | `25` | below `1` → `25`; above `1000` → `1000` |

The two are not treated alike: a `pageSize` below 1 falls back to the default 25, not to 1.

### Four things that bite

**Your base SQL gets wrapped, so it has to survive being a subquery.** The count runs
`select count(*) as cc from (<this.sql>) a`. That is why `ORDER BY` belongs in
`this.orderBy` and not in `this.sql` — inside the counted subquery it is at best a sort
nobody reads, and on some dialects a syntax error. For the same reason, never put a LIMIT
or OFFSET in the base SQL: the base class appends the dialect's own limit clause after
`this.orderBy`.

**`buildDynamicQuery()` must be purely additive.** The constructor's `sql` / `params` /
`orderBy` are snapshotted on the first run and restored before every later one, so the same
instance can be executed repeatedly. Append to `this.sql`, push onto `this.params`, and
never reassign either — a reassignment silently discards the tenant filter that the
constructor put there.

**A page past the end costs one query, not two.** When `offset >= count` the base class
returns an empty list without running the page query. `page=10000000` is cheap; you do not
need to guard it. The 1000 cap on `pageSize` is the one that matters for safety — it is
what stops `pageSize=999999` from turning a paginated endpoint into a full-table dump.

**`hasMore` and `pages` are computed, not queried.** `hasMore` is `offset + pageSize <
count`, `pages` is `ceil(count / pageSize)`, and both are `0` / `false` when nothing
matched. Do not recompute them one layer up.

### The quickSearch route

One round trip, no total. The conditions are yours to write, and boolean fields are the
fifth argument rather than a criteria-class declaration.

```typescript
/**
 * Type-ahead over order codes within a tenant. One round trip — no total count.
 * @param tenantCode - tenant the search is scoped to
 * @param keyword - prefix to match against the order code
 * @param pageNo - 1-based page number, defaults to 1
 * @param rowCount - rows per page, defaults to 25
 * @returns up to rowCount rows and whether a further page exists
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

`quickSearch` appends the limit clause itself, so the SQL above carries no LIMIT — and no
ORDER BY either unless you write one, which for a picker you usually should.

---

## Prompt 5.1 — DAO for a table

```
Create src/dao/<Order>DAO.ts, a default-exported class extending CommonDAO.

Table `orders`:
  id             varchar(36) primary key
  tenant_code    varchar(32) not null
  code           varchar(32) not null
  customer_id    varchar(36) not null
  amount         numeric(14,2) not null
  currency       char(3) not null
  status         varchar(16) not null
  remark         varchar(500)
  is_urgent      boolean not null default false
  created_at     timestamptz not null default now()

Methods:
  findById(id)
  findByCode(tenantCode, code)
  listByCustomer(tenantCode, customerId)
  insert(order): InsertResult<<Order>>          -- RETURNING *, id from genID() when absent
  update(order): number                          -- affected rows
  deleteById(id): number

Rules:
- this DAO owns `orders` and nothing else. Any statement whose FROM clause is not `orders`
  belongs in another DAO — say so rather than adding it here.
- do NOT add updateStatus, updateRemark or any other single-column update. `update(order)`
  writes every updatable column; a caller changing one field reads the row, sets it and
  calls update. List the non-updatable columns — id, tenant_code, created_at — in a comment
  above the statement and leave them out of the SET clause.
- PostgreSQL placeholders ($1, $2, ...)
- select explicit column lists, never SELECT *, except where RETURNING * is needed
- `is_urgent` must come back as a real boolean. Note that `listQuery` and `findByPK` take
  no booleanFields argument — only `quickSearch` does — so either coerce it inside the DAO
  method or obtain the connection with this.getDBConnection() and use its listQuery
  overload. State which you chose and why.
- no business rules, no validation, no error translation — return what the database said

Documentation:
- JSDoc on every method: what it queries, @param for each, @returns describing the shape
- a DAO rarely throws by itself; where one does (an unsupported argument, an empty batch
  that is a caller error rather than a no-op), log the reason before throwing
```

## Prompt 5.2 — Paginated search with a criteria class

```
The order search screen sends: code (may contain *), status, customerId,
createdFrom, createdTo, page, pageSize.

Create src/dao/criteria/<Order>SearchCriteria.ts extending CommonSearchCriteria:

- public constructor(tenantCode: string, criteria?: any), calling super(criteria)
- in the constructor set the baseline: this.sql (a SELECT over `orders`, LEFT JOIN
  `customers` for the customer name only), this.params = [tenantCode],
  this.orderBy = 'ORDER BY o.created_at DESC'
- keep ORDER BY out of this.sql and put no LIMIT/OFFSET in it at all — the base class
  wraps this.sql in a count subquery and appends the dialect's own limit clause
- declare boolean result fields with setBooleanFields(...), not on the DAO call
- buildDynamicQuery(): addWildcardCriteria for code, addEqualsCriteria for status and
  customerId, addRangeCriteria for the created_at range. Purely additive — never reassign
  this.sql or this.params, or the tenant filter set in the constructor is lost.

Then add to <Order>DAO:

  searchByCriteria(criteria: <Order>SearchCriteria): Promise<PaginationList>

a single call to executePaginationQuery(criteria).

Constraints:
- PaginationList is NOT generic. Promise<PaginationList<<Order>>> does not compile.
- page and pageSize are read off the raw criteria object by the base constructor. Do not
  add them as method parameters and do not bound them yourself — a page below 1 becomes 1,
  a pageSize below 1 falls back to the default 25, and one above 1000 is capped at 1000.
- do not recompute count / pages / hasMore anywhere above this method; they come back
  filled in.

Show the repository-side call that builds the criteria from the request object, and a
JSDoc block on the DAO method describing the returned shape.
```

## Prompt 5.3 — Quick search without a count

```
Add to <Order>DAO a type-ahead used by an order picker:

  searchByKeyword(tenantCode, keyword, pageNo = 1, rowCount = 25): Promise<QuickSearchResult<<Order>>>

Use quickSearch(sql, params, pageNo, rowCount, booleanFields).

Requirements:
- prefix match on `code`, scoped by tenant
- explicit column list — id, code, status, is_urgent — nothing the picker will not show
- pass ['isUrgent'] as booleanFields; this is the one DAO helper that accepts it
- write no LIMIT and no OFFSET: quickSearch appends the limit clause itself
- do write an ORDER BY, and say why a picker without one returns rows in an order that can
  change between pages

Explain in a comment why this is quickSearch and not executePaginationQuery: the picker
shows "load more", never "page 3 of 6", so the COUNT query would be paid for and discarded.
```

## Prompt 5.4 — Dialect-independent SQL

```
<Order>DAO must run against PostgreSQL, MySQL and Dameng.

Rewrite the queries that build their parameter list at runtime — the IN list in
listByIds(ids) — to ask the connection for placeholders rather than hard-coding $1 / ?:

  const conn = await this.getDBConnection();
  const placeholders = ids.map((_, i) => conn.getPlaceholder(i + 1)).join(', ');

getPlaceholder is 1-based.

Leave the fixed statements as they are and explain why: a statement whose placeholders never
change is readable as written, and over-generalising it costs more than it saves.

Note which of the remaining statements are not portable — RETURNING * is PostgreSQL-only —
and show the MySQL alternative using insertId from InsertResult.
```

## Prompt 5.5 — Batch insert

```
Add to <Order>DAO:

  insertBatch(orders: Array<<Order>>): Promise<number>

Requirements:
- one statement with multiple VALUES tuples, not a loop of inserts
- placeholders built with getPlaceholder so the statement stays portable
- return the affected row count
- guard the empty array: return 0 without touching the database
- cap the batch at <500> rows per statement and note in a comment what happens beyond that
  — most drivers have a parameter limit, and PostgreSQL's is 65535

The caller is inside a transaction, so partial failure rolls back. Do not add a try/catch.
```

## Prompt 5.6 — A read that spans tables

```
Add to <Order>DAO:

  findWithCustomer(id): Promise<<Order> | null>

A LEFT JOIN onto `customers` reading the customer's name and mode.

Alias the joined columns onto a dotted path so they hydrate into a nested object rather
than flat fields:

  select o.id, o.code, o.status, o.customer_id,
         c.name as "customer.name", c.mode as "customer.mode"
    from orders o
    left join customers c on c.id = o.customer_id
   where o.id = $1

The result carries order.customer.name and order.customer.mode. The double quotes are
required — without them PostgreSQL folds the alias and the dot is lost. Do not use
`c.name AS customer_name`: a flat customerName hides which table the value came from and
has nowhere to put the second column.

Note in a comment that on Dameng the separator is `__` (customer__name), because that
dialect cannot carry a dot in an alias, and that the driver's splitFieldPath hook is what
makes the two behave alike.

This is also the boundary case for "one DAO, one table": joining to read columns is fine,
and the DAO still owns only `orders`. What would not be fine is a method here that also
writes to `customers` — that belongs in <Customer>DAO, with the repository calling both.

Declare the nested shape on the <Order> type so the caller gets it typed, and do not
select both "customer" and "customer.name" in one statement — the mapper drops whichever
lands on top of a scalar.
```

## Prompt 5.7 — Where a reference check lives

```
`orders.customer_id` references `customers.id`, many-to-one. A customer may not be deleted
while any order still references it.

Implement the check, and place each piece by which table its FROM clause names:

  <Order>DAO.countByCustomer(customerId): Promise<number>
      select count(*) as cc from orders where customer_id = <placeholder>
      via executeCountSQL. It reads `orders`, so it lives in <Order>DAO.

  <Customer>DAO.deleteById(id): Promise<number>
      the DELETE, and nothing else. No count, no guard.

  <Customer>Repository.delete(id)
      calls <Order>DAO.countByCustomer first, and throws ConflictError with a message
      naming the count when it is non-zero. Log the reason and its inputs before throwing.
      Only then calls <Customer>DAO.deleteById.

Do NOT put countByCustomer (or a countReferencingOrders) inside <Customer>DAO, even though
it is only used there. State the reason in a comment on the repository method: the SQL over
`orders` stays in one file, so when `orders` gains a soft-delete flag there is one query to
amend — a copy inside <Customer>DAO would go on counting deleted orders and silently block
a delete that should succeed.

Both calls are in the same transaction, so the count cannot go stale between the check and
the delete under the isolation level in use. Note in a comment whether that holds for the
configured level, and if it does not, what constraint in the schema is the real guarantee.
```

---

Deeper background: [keelson-core's README](../../packages/keelson-core/README.md),
[Search Criteria guide](SEARCH_CRITERIA.md),
tutorial chapter [2](../../tutorial/02-layers-and-transactions.md).
