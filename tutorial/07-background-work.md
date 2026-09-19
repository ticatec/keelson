# 7. Background work and shutdown

[中文](07-background-work_CN.md) | English · [Tutorial index](README.md)

Work that is not triggered by a request — an outbox to drain, a queue to poll, a nightly
cleanup — and how to stop without dropping any of it.

## A processor

Extend `CommonProcessor<T>`, say how often to look and what to do with each item:

```typescript
import { CommonProcessor } from '@ticatec/keelson-express';
import { beanFactory } from '@ticatec/keelson-core';

interface PendingMail { id: string; to: string; body: string; }

export default class MailProcessor extends CommonProcessor<PendingMail> {
    constructor() {
        super(30, 5);        // look every 30 seconds, up to 5 items at a time
    }

    private get service(): MailService {
        return beanFactory.createBean<MailService>('MailService')!;
    }

    protected async loadToProcessData(): Promise<Array<PendingMail>> {
        return await this.service.findPending(100);
    }

    protected async processItem(item: PendingMail): Promise<void> {
        await this.service.send(item);
    }
}
```

The two constructor arguments are the poll interval in seconds (minimum 5, rounded) and the
concurrency — how many `processItem` calls may be in flight at once. The default is 5.

The loop is: wait for the interval, call `loadToProcessData()`, run `processItem` over the
results with at most `ants` running concurrently, then wait again. An empty batch resets the
timer immediately, so an idle processor does not accumulate a backlog of skipped ticks.

Two ticks never overlap. If a batch takes longer than the interval, the next tick is skipped
rather than queued — which is what you want for a drain loop, and worth knowing if you
expected fixed-rate scheduling.

## Errors do not stop the loop

`processItem` throwing is logged and the remaining items carry on. `loadToProcessData`
throwing is logged and the tick ends; the next one runs as usual. A transient database
outage therefore pauses the processor rather than killing it.

The consequence: a permanently poisonous item is retried every interval, forever. Whatever
marks an item as processed should also mark it as failed after N attempts — the framework
does not track attempts, because only your schema knows where to put the counter.

## Registering and starting

```typescript
import { ProcessorManager } from '@ticatec/keelson-express';

protected async beforeStart(): Promise<void> {
    DBManager.init(initializePg(AppConf.getInstance()!.get('database')));
    beanFactory.register('MailService', MailService);

    const manager = ProcessorManager.getInstance();
    manager.register(MailProcessor);
    manager.startAll();
}
```

`register(Class)` keys the processor by its class name and returns the instance, creating it
only the first time. `startAll()` starts every registered one.

Register after the database and the beans — a processor can fire its first tick within a
second of starting, and it must find a working world.

To reach one later, `ProcessorManager.getInstance().get('MailProcessor')` returns it or
`undefined`. `runImmediately()` makes the next tick happen now, which is how a webhook can
nudge a drain loop instead of waiting for the interval.

## Shutdown

`BaseServer.shutdown()` does three things in order: stops all processors and waits for
in-flight items, deletes the `check.dat` port file, then closes the HTTP server.

Processors first is the important part. Stopping the listener first would leave a batch
half-processed while the pod is already being torn down.

Wire it to the signals your orchestrator sends:

```typescript
const server = new MyServer();
BaseServer.startup(server);

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
        server.shutdown().then(() => process.exit(0));
    });
}
```

`shutdown()` is not wired to signals automatically. A framework that installs signal handlers
behind your back is a framework you have to fight when you need your own ordering — closing
a message-broker connection, deregistering from service discovery.

### What "waits for in-flight items" means

`stop()` clears the interval timer, then awaits the currently running batch. An item already
inside `processItem` finishes. An item that had not started is simply not started — it stays
in whatever pending state your query selects on, and the next process to come up picks it up.

That is why the query in `loadToProcessData()` should select on durable state rather than an
in-memory flag: the contract with your future self is that an unprocessed row is still
visible after a restart.

### The HTTP side

`close()` stops accepting new connections and waits for in-flight requests to finish. Node
18 leaves idle keep-alive connections open at this point, which can delay the callback, so
`shutdown()` closes idle connections explicitly. In-flight requests are left alone to
complete — a shutdown that truncates a response mid-write is not graceful.

Give the pod a `terminationGracePeriodSeconds` longer than your slowest request.

## The port file

On startup the server writes the port it actually bound to into `./check.dat`, and
`shutdown()` deletes it. With `port: 0` — bind anything free — that file is how a wrapper
script discovers the real port. As a health signal it is weak; prefer `/health/live`.

---

Next: [Configuration and cache](08-config-and-cache.md).
