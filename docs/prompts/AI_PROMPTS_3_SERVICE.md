# 3. Service layer — interface and implementation

[中文](AI_PROMPTS_3_SERVICE_CN.md) | English · [Index](AI_PROMPTS.md)

Business logic and the transaction boundary. Declared as an interface, implemented by a
class.

## The shape

```typescript
// src/service/OrderService.ts — the contract
export default interface OrderService {

    /**
     * Creates an order in the caller's tenant and returns its id.
     * @param user - The acting user; the order is created in this user's tenant.
     * @param data - The order to create. Field shapes are validated at the web layer.
     * @returns The id of the new order.
     * @throws {ConflictError} The order code already exists in this tenant.
     */
    createNew(user: AppUser, data: Order): Promise<string>;

    /**
     * Cancels an active order.
     * @param user - The acting user; must hold the ORDER_ADMIN role.
     * @param id - The order id.
     * @param reason - Free text recorded on the cancellation.
     * @throws {ActionNotFoundError} No such order, or it belongs to another tenant.
     * @throws {ConflictError} The order is not in ACTIVE state.
     * @throws {InsufficientPermissionError} The caller lacks the ORDER_ADMIN role.
     */
    cancel(user: AppUser, id: string, reason: string): Promise<void>;
}

// src/service/impl/OrderServiceImpl.ts — the implementation
export default class OrderServiceImpl extends CommonService implements OrderService {

    private get repo(): OrderRepository {
        return this.getRepositoryInstance<OrderRepository>('OrderRepository');
    }

    @Transaction()
    async cancel(user: AppUser, id: string, reason: string): Promise<void> {
        const order = await this.repo.requireActive(id, user.tenantCode);

        if (!user.roles.includes('ORDER_ADMIN')) {
            this.logger.warn({ orderId: id, roles: user.roles },
                'Rejecting cancel: caller lacks ORDER_ADMIN');
            throw new InsufficientPermissionError();
        }

        await this.repo.cancel(order.id, reason);
    }
}
```

Every interface method documents its `@throws`, every throw site logs why first, and the
implementation carries no JSDoc duplicating the interface — the contract is documented in
one place.

Registered under the **interface** name, pointing at the **implementation**:

```typescript
beans.register('OrderService', () => import('./service/impl/OrderServiceImpl.js'));
```

Resolved as the interface, so nothing outside the service package depends on the class:

```typescript
beanFactory.createBean<OrderService>('OrderService')!
```

The interface is what the controller and any other service see. It is also the file to read
when you want to know what a module can do, without the body of every method in the way.

## The rules

**Every public method that writes carries `@Transaction()`.** The boundary is the service
method, and there is exactly one place it can be. A read-only method does not need one
unless several reads must see the same snapshot.

**Throw to roll back.** No `try`/`catch`/`rollback`. An error thrown anywhere under the
decorated method rolls the whole thing back, including an `IllegalParameterError` that also
happens to be a 400.

**No SQL, no `req`, no `res`.** A service that takes a `Request` is a controller wearing a
different name.

**No input-shape validation.** That was done at the web layer. What belongs here is the
business rule that needs the caller or the database — permission on a specific record,
whether a state transition is legal, whether the totals reconcile.

**Non-database side effects go outside the boundary.** Emails, message publishes and cache
writes do not roll back. Return from the transactional method and do them in the caller.

---

## Prompt 3.1 — Interface and implementation for a CRUD entity

```
Create the service layer for <Order>.

Produce two files.

1. src/service/<Order>Service.ts — the interface, default-exported:

   createNew(user: AppUser, data: <Order>): Promise<string>
   update(user: AppUser, data: <Order>): Promise<void>
   cancel(user: AppUser, id: string, reason: string): Promise<void>
   search(user: AppUser, criteria: any): Promise<PaginationList>

   Document each method with what it does and which errors it throws.

2. src/service/impl/<Order>ServiceImpl.ts — default-exported class extending CommonService
   and implementing <Order>Service:

   - a private getter resolving <Order>Repository via getRepositoryInstance
   - @Transaction() on createNew, update and cancel; none on search
   - business rules:
     * createNew: the code must not already exist in this tenant; set status to ACTIVE
     * update: the order must exist, belong to the caller's tenant, and be in DRAFT
     * cancel: the order must exist, belong to the caller's tenant, be in ACTIVE, and the
       caller must hold the ORDER_ADMIN role — otherwise InsufficientPermissionError
   - the existence, tenant and status checks are calls into the repository, not queries
     written here

Documentation and logging:
- every method on the INTERFACE gets JSDoc with @param, @returns and a @throws line for
  each error type it can raise
- the implementation class does not repeat that JSDoc; any protected method it adds does
  get its own
- every `throw` in the implementation is preceded by a this.logger call recording why,
  with the ids and states that led to the decision — warn for a 4xx an operator cares
  about, debug for routine ones. Do not log the error object; the framework does that.

No validation of field shapes — that is the web layer's job. No SQL. Do not catch and
re-throw; let errors propagate so the transaction rolls back.
```

## Prompt 3.2 — A method spanning several repositories

```
Add to <Order>ServiceImpl:

  transfer(user: AppUser, orderId: string, toCustomerId: string): Promise<void>

It must, in one transaction:
1. load the order through <Order>Repository and require it ACTIVE and in the caller's tenant
2. load the target customer through <Customer>Repository and require it ACTIVE
3. update the order's customer
4. write an audit row through <Audit>Repository

Add a private getter for each repository. All four steps are inside a single
@Transaction() — they either all happen or none do.

Also add the interface method to <Order>Service.ts with the same signature.
```

## Prompt 3.3 — An audit record that survives a rollback

```
Add to <Order>ServiceImpl:

  recordAttempt(user: AppUser, orderId: string, outcome: string): Promise<void>

This must commit even when the caller's transaction rolls back — a failed attempt is
exactly what the audit trail is for.

Use @Transaction(Propagation.REQUIRES_NEW).

In a comment, note the two consequences: it takes a second connection from the pool while
the outer transaction holds the first, so it must not be called in a loop; and it cannot
see the outer transaction's uncommitted rows.
```

## Prompt 3.4 — A side effect that must not be inside the transaction

```
When an order is confirmed we must send a confirmation email and publish a message to
<Kafka>.

Show the correct structure: the transactional service method does only the database work
and returns, and the caller performs the side effects afterwards.

Explain in a comment why the email cannot be inside @Transaction() — a rollback does not
un-send it, so an order that failed to commit would still have told the customer it
succeeded.

If the side effect must be reliable, write an outbox row inside the transaction and let a
background processor drain it; show that variant too.
```

## Prompt 3.5 — A service calling another service

```
<Order>ServiceImpl needs <Inventory>Service to reserve stock during createNew.

Requirements:
- resolve it with beanFactory.createBean<<Inventory>Service>('<Inventory>Service')! in a
  private getter, typed as the interface
- the call happens inside <Order>ServiceImpl's @Transaction(); the reserve method's own
  @Transaction() joins it rather than opening a second one, so a failure anywhere rolls
  back both
- if the two services reference each other, keep the resolution in getters — a lazy proxy
  handles the cycle, but a constructor that uses the other service does not

State explicitly which of the two transactions commits.
```

## Prompt 3.6 — Paginated search

```
Implement search on <Order>ServiceImpl.

- It takes the criteria object the controller passed straight from req.query
- It builds a CommonSearchCriteria subclass and hands it to the repository
- It returns PaginationList
- No @Transaction() — it is a read

Generate the criteria class too: src/criteria/<Order>SearchCriteria.ts, mapping the query
fields <status, customerId, a createdAt date range, a keyword over code and remark> onto
conditions, with the tenant always applied from the user rather than from the query.

The tenant condition is not optional and must not come from the client. Say so in a
comment.
```

---

Next: [Repository layer](AI_PROMPTS_4_REPOSITORY.md). Deeper background:
[keelson-core's README](../../packages/keelson-core/README.md),
[Search Criteria guide](SEARCH_CRITERIA.md),
tutorial chapter [2](../../tutorial/02-layers-and-transactions.md).
