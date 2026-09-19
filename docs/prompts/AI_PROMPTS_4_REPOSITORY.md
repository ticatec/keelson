# 4. Repository layer

[中文](AI_PROMPTS_4_REPOSITORY_CN.md) | English · [Index](AI_PROMPTS.md)

The bridge between service and DAO. It assembles domain entities, performs the simple
entity checks, and owns the cache.

## What "simple entity checks" means

Checks the repository makes, because it is the layer that knows how to fetch the thing:

- **does it exist** — `null` from the DAO becomes `ActionNotFoundError`
- **is its status usable** — ARCHIVED, DISABLED, EXPIRED become `ConflictError`
- **does it belong to this tenant** — a mismatch becomes `ActionNotFoundError`, never a 403
- **is this code already taken** — a uniqueness probe before an insert

The shape is a `require*` method that returns the entity or throws:

```typescript
/**
 * Loads an order and asserts it is usable by this tenant.
 * @param id - The order id.
 * @param tenantCode - The caller's tenant.
 * @returns The order.
 * @throws {ActionNotFoundError} No such order, or it belongs to another tenant.
 * @throws {ConflictError} The order exists but is not ACTIVE.
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
        throw new ConflictError('Order is not active');
    }

    return order;
}
```

Three things in that method are the conventions rather than the logic: the JSDoc names
every error it can raise, each throw is preceded by a log of the reason, and the
tenant-mismatch case is `debug` rather than `warn` because a caller probing ids should not
be able to fill an operator's dashboard.

The service then reads as the business rule it is, with no null-handling noise:

```typescript
const order = await this.repo.requireActive(id, user.tenantCode);
```

What does **not** belong here: the business rule itself. "Only an ORDER_ADMIN may cancel" is
a service decision — it is about the caller, not about the entity.

## Redis lives here

If the module uses Redis, the repository is where it is used. Not the service, which would
then know about caching as well as about rules; not the DAO, which would make "read from
the database" mean something other than what it says.

The repository is the only layer that knows how an entity is fetched, so it is the only one
that can decide the fetch can be skipped.

Two rules that follow:

**Invalidate on write, in the same method that writes.** A repository method that updates a
row deletes the key before returning. Do not leave invalidation to the caller.

**Invalidation is not transactional.** A rollback does not restore a deleted key — which is
harmless — but a key deleted *before* a concurrent read can be repopulated from
uncommitted state. When that matters, delete the key after the transaction commits, from the
service's caller, and say so in a comment.

---

## Prompt 4.1 — Repository for a CRUD entity

```
Create src/repository/<Order>Repository.ts.

Default-exported class extending CommonRepository, with a private getter resolving
<Order>DAO via getDAOInstance.

Plain fetch and persist:
  findById(id): Promise<<Order> | null>
  create(order): Promise<string>                 returns the new id
  update(order): Promise<void>
  updateStatus(id, status): Promise<void>

Entity checks that throw:
  requireById(id, tenantCode): Promise<<Order>>
      not found, or a tenant mismatch -> ActionNotFoundError
  requireActive(id, tenantCode): Promise<<Order>>
      the above, plus status must be ACTIVE -> ConflictError otherwise
  requireCodeAvailable(tenantCode, code): Promise<void>
      the code already exists -> ConflictError

Rules:
- a tenant mismatch throws ActionNotFoundError, not InsufficientPermissionError — a 403
  confirms the record exists and lets someone enumerate other tenants' ids
- no SQL here; every query is a DAO call
- no business rules; those are the service's
- no @Transaction(); the boundary is the service's

Documentation and logging:
- JSDoc on every method, with a @throws line for each error the require* methods raise
- every `throw` preceded by a this.logger call recording why, with the id and the state
  that led to it — debug for not-found, warn for a wrong status. Do not log the error
  object; the framework's middleware does that.
```

## Prompt 4.2 — An entity assembled from several DAOs

```
<Order> is stored across three tables and the service should never know that.

Extend <Order>Repository:

  findFullById(id): Promise<<OrderDetail> | null>

It loads:
  - the order header via <Order>DAO
  - its line items via <OrderItem>DAO
  - the shipping address via <Address>DAO

and returns one <OrderDetail> object. If the header is missing it returns null without
calling the other two.

Add a private getter for each DAO. Define the <OrderDetail> type in src/types/.

This is the reason the repository layer exists: the service asks for an order and gets an
order, not three query results it has to staple together.
```

## Prompt 4.3 — Adding a cache

```
Add Redis caching to <Order>Repository using @ticatec/redis-client.

Requirements:
- a private getter returning RedisClient.getInstance()
- a private key(id) method producing `<order>:${id}` — one place that builds keys
- findById: check the cache, fall through to the DAO on a miss, store the result with a
  <300> second TTL, return it. Do not cache a null.
- update / updateStatus: delete the key before returning
- a comment on the TTL explaining what staleness is acceptable for this entity

Do not cache inside the DAO, and do not cache in the service.

Values round-trip through JSON, so a Date comes back as a string. If <Order> has date
fields, restore them on read and say so in a comment.
```

## Prompt 4.4 — Cache invalidation across a transaction

```
<Order>Repository.update() deletes the cache key, but it runs inside the service's
transaction, so a rollback leaves the key deleted and a concurrent read can repopulate it
from uncommitted state.

Show the two options and when each applies:

1. Delete inside the repository method — simple, and correct when a briefly stale entry is
   acceptable and reads are rare during writes
2. Return from the transaction first, then delete from the service's caller — correct when
   a stale entry would be visible and wrong

Implement option 2 for <Order> and leave a comment on the repository method explaining why
it does not invalidate by itself.
```

## Prompt 4.5 — A cache-aside read

```
Add a read-through helper to <Customer>Repository for data that changes rarely and is read
on nearly every request:

  findProfile(id): Promise<<CustomerProfile> | null>

Use redis.getOrSet with a <600> second TTL.

In a comment, note the two things getOrSet does not do: it does not prevent several
concurrent fetches when a hot key expires under load, and it does not restore types lost to
JSON.

Say which one applies to this entity and what you did about it.
```

## Prompt 4.6 — Paginated query

```
Add to <Order>Repository:

  queryByCriteria(criteria: <Order>SearchCriteria): Promise<PaginationList<<Order>>>

It delegates to the DAO's pagination helper and returns the framework's PaginationList.
The criteria object was built by the service; the repository does not build criteria and
does not read req.query.

Add findRecent(tenantCode, limit) as a plain non-paginated list for <the dashboard>.
```

---

Next: [DAO layer](AI_PROMPTS_5_DAO.md). Deeper background:
[Service & Repository guide](SERVICE_GUIDE.md),
tutorial chapters [2](../../tutorial/02-layers-and-transactions.md) and
[8](../../tutorial/08-config-and-cache.md).
