# 5. DAO layer

[中文](AI_PROMPTS_5_DAO_CN.md) | English · [Index](AI_PROMPTS.md)

SQL, and nothing else.

## The rules

**One table's worth per DAO.** A join that reads a second table for a column is fine; a DAO
that owns two entities is two DAOs.

**No business rules.** A DAO does not decide that an ARCHIVED order cannot be updated. It
runs the UPDATE it was given and reports how many rows changed.

**No other DAOs, no repository.** A DAO's dependencies are the connection and the helpers
its base class provides.

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
| `quickSearch<T>(sql, params, pageNo, rowCount, booleanFields?)` | A page of results |
| `executePaginationQuery(criteria)` | `PaginationList` from a `CommonSearchCriteria` |
| `genID()` | A 32-character UUID v7, time-ordered, usable as a primary key |
| `toBooleanInt(b)` / `toBooleanChar(b)` | Write direction: boolean to `1`/`0`, boolean to `'T'`/`'F'` |

Column names come back camelCased — `created_at` becomes `createdAt`.

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
  updateStatus(id, status): number
  deleteById(id): number

Rules:
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

## Prompt 5.2 — Paginated search

```
Add to <Order>DAO:

  searchByCriteria(criteria: <Order>SearchCriteria): Promise<PaginationList<<Order>>>

Use executePaginationQuery(criteria) — the criteria object carries its own conditions,
parameters, ordering and page size, so the DAO neither builds conditions nor reads paging
arguments. Boolean fields are declared on the criteria class with setBooleanFields, not
passed here.

Also add:

  countByStatus(tenantCode): Promise<Array<{ status: string; count: number }>>

using a GROUP BY, mapped through listQuery.
```

## Prompt 5.3 — Dialect-independent SQL

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

## Prompt 5.4 — Batch insert

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

## Prompt 5.5 — A read that spans tables

```
Add to <Order>DAO:

  findWithCustomerName(id): Promise<any | null>

A LEFT JOIN onto `customers` for the customer's name only.

This is the boundary case for "one table per DAO": joining to read a column is fine, and
the DAO still owns only `orders`. What would not be fine is a method here that also writes
to `customers` — that belongs in <Customer>DAO, with the repository calling both.

Alias the joined column so it maps to a clear camelCase name — `c.name AS customer_name`
becomes `customerName`.
```

## Prompt 5.6 — Running a schema file

```
Add a bootstrap DAO that runs <the schema file at db/schema.sql> at startup, for the
development environment only.

Use executeSQLFile. Note in a comment that it logs each statement as it runs, so the file
must not contain credentials — a seed file with a password in an INSERT will put that
password in the log.

Show where it is called from: <Orders>Server.beforeStart(), guarded by an environment
check, after DBManager.init().
```

---

Deeper background: [DAO guide](DAO_GUIDE.md),
[Search Criteria guide](SEARCH_CRITERIA.md),
tutorial chapter [2](../../tutorial/02-layers-and-transactions.md).
