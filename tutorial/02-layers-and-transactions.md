# 2. Layers and transactions

[中文](02-layers-and-transactions_CN.md) | English · [Tutorial index](README.md)

Chapter 1 had you write a DAO, a repository and a service to read one row, which is three
classes more than the job needs. This chapter is about what those layers are for, and about
the mechanism that makes the arrangement worth the trouble.

## The problem the layers solve

Take a use case that is not a toy: transferring a balance between two accounts, writing a
ledger entry, and recording an audit trail. Three tables, and a rule — either all of it
happens or none of it does.

Without a convention, the connection becomes a parameter:

```typescript
// the shape this turns into, in every codebase that does not decide early
async function transfer(conn, fromId, toId, amount) {
    await debit(conn, fromId, amount);
    await credit(conn, toId, amount);
    await writeLedger(conn, fromId, toId, amount);
}
```

Every function now takes a `conn` it does not care about, only to hand it to the next one.
Miss one and it silently runs outside the transaction — the worst kind of bug, because the
happy path looks identical and only a rollback reveals the damage.

Keelson's answer is that the connection is never a parameter. It lives in the call context.

## The mechanism

`@Transaction()` opens a transaction and puts the connection into an `AsyncLocalStorage`
context that covers everything the decorated method awaits, however deep. `CommonDAO`'s
`getDBConnection()` reads from that context. Nobody passes anything.

```typescript
export class TransferService extends CommonService {
    private get accounts(): AccountRepository {
        return this.getRepositoryInstance<AccountRepository>('AccountRepository');
    }
    private get ledger(): LedgerRepository {
        return this.getRepositoryInstance<LedgerRepository>('LedgerRepository');
    }

    @Transaction()
    async transfer(fromId: string, toId: string, amount: number): Promise<void> {
        const from = await this.accounts.findById(fromId);
        if (from == null || from.balance < amount) {
            throw new IllegalParameterError('Insufficient balance');
        }
        await this.accounts.debit(fromId, amount);
        await this.accounts.credit(toId, amount);
        await this.ledger.record(fromId, toId, amount);
    }
}
```

Five calls, two repositories, three tables, one connection, one transaction. Return and it
commits. Throw — including the `IllegalParameterError` above, which is also a 400 to the
client — and it rolls back. There is no `try`/`catch`/`rollback` to forget.

## Why a Service may not call a DAO

The rule is: Controller → Service → Repository → DAO, each layer calling only the next.

It is not taxonomy. The transaction boundary is the Service layer, and the boundary is only
meaningful if there is exactly one place it can be. Let a Service call a DAO directly and
the question "is this statement inside the transfer's transaction?" stops having an answer
you can read off the code — you have to trace it.

The layers then fall out of that:

- **DAO** — one table's worth of SQL. No business rules, no other DAOs.
- **Repository** — one domain concept, assembled from as many DAOs as it takes. `Account`
  may span `accounts` and `account_limits`; the Service should not know that.
- **Service** — the use case, the rules, and the transaction boundary.

The tell that the split is earning its keep: when the schema changes, only DAOs change.
When a rule changes, only Services change.

## Propagation

A nested `@Transaction()` joins the one already open, which is what you want almost always:
`TransferService.transfer()` calling `FeeService.charge()` should be one atomic unit.

Sometimes it is the opposite. An audit record should survive the rollback of the thing it is
auditing — a failed transfer is exactly what you want a record of.

```typescript
@Transaction(Propagation.REQUIRES_NEW)
async recordAttempt(entry: AuditEntry): Promise<void> {
    await this.auditRepo.insert(entry);
}
```

`REQUIRES_NEW` takes its own connection and commits independently. The caller's transaction
rolls back; this one is already durable.

Two consequences worth knowing before you reach for it. It uses a second connection from
the pool, so a method that calls it in a loop can exhaust the pool. And it cannot see the
outer transaction's uncommitted rows — that is the point, but it surprises people who
expect to read a row the caller just inserted.

## Without the decorator

`@Transaction` is sugar over `TransactionManager`. When the boundary is not a whole method
— a batch job that commits every thousand rows, say — drive it directly:

```typescript
import { TransactionManager, Propagation } from '@ticatec/keelson-core';

await TransactionManager.execute(Propagation.REQUIRED, async () => {
    await this.repo.doSomething();
    await this.repo.doSomethingElse();
});
```

`execute()` is static and takes the propagation explicitly. It hands your callback the
connection as an argument, which you are free to ignore — everything underneath picks it up
from the context, exactly as it does under the decorator. Same rules too: return commits,
throw rolls back.

The third propagation mode only makes sense here: `Propagation.NONE` runs the callback with
a connection but no transaction, for statements that must not be inside one.

## Reads do not need a transaction

A single `SELECT` does not need a boundary. `CommonDAO` takes a connection from the pool,
runs the statement and returns it. Chapter 1's `GreetingService.get()` was decorated for
consistency, not necessity.

Where a read *does* want one is when several reads must see the same snapshot — a report
summing three tables that must not shift underneath it.

## Writing SQL that does not care which database it runs on

Placeholders differ: `$1, $2` for PostgreSQL, `?` for MySQL and Dameng. Hard-code them and
the DAO is welded to one database.

For fixed statements this is usually fine and you should not over-engineer it. For SQL
assembled at runtime — an `IN` list whose length varies — ask the connection:

```typescript
const conn = await this.getDBConnection();
const placeholders = ids.map((_, i) => conn.getPlaceholder(i + 1)).join(', ');
return await this.listQuery(`SELECT * FROM users WHERE id IN (${placeholders})`, ids);
```

`getPlaceholder(i)` is 1-based and returns what the driver underneath wants.

Two things the framework normalises for you regardless of driver: column names come back
camelCased, and a column listed in `booleanFields` is coerced to a real boolean —
including the string forms `'t'`, `'f'`, `'true'`, `'false'`, `'1'`, `'0'` in any case,
which matters on MySQL and Dameng where there is no native boolean type.

## What rolls back, and what does not

The transaction covers the database. It does not cover anything else you did inside the
method — a file written, an email sent, a message published, a Redis key set. Those stay
done after a rollback.

The usual fix is to do them after the transaction commits, not inside it:

```typescript
@Transaction()
async placeOrder(order: Order): Promise<string> {
    return await this.orderRepo.insert(order);     // database only
}

// the caller, outside any transaction
const id = await orderService.placeOrder(order);
await notifier.sendConfirmation(id);               // only reached if the commit succeeded
```

---

Deeper reference: [Service & Repository guide](../docs/prompts/SERVICE_GUIDE.md) for
propagation and `TransactionManager` in full, and the
[DAO guide](../docs/prompts/DAO_GUIDE.md) for every query helper.

Next: [Wiring](03-wiring.md) — how these classes find each other.
