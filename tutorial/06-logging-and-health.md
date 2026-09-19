# 6. Logging and health

[中文](06-logging-and-health_CN.md) | English · [Tutorial index](README.md)

What the framework writes to the log, what it refuses to write, how to point it at pino, and
what Kubernetes sees when it probes the pod.

## Logging is a contract, not a library

No Keelson package imports a logging library. They all call the same contract:

```typescript
import { getLogger } from '@ticatec/logger-api';

const logger = getLogger('UserService', 'service');
logger.info({ orderId }, 'Order placed');
```

`getLogger(name, category)` — the name is usually the class, the category groups classes so
you can set a level for all of them at once. Inside the framework's base classes you already
have `this.logger`, scoped to your concrete class name.

With nothing installed, output goes to the console, filtered by `LOG_LEVEL`:

```bash
LOG_LEVEL=debug node dist/main.js
```

That is a real fallback, not a stub — fine for development and for a container whose logs
are collected as plain text.

## Structured logging with pino

Install the adapter and initialise it once, before anything logs:

```bash
pnpm add @ticatec/logger-pino
```

```typescript
// src/main.ts, before importing anything that logs
import 'reflect-metadata';
import { initialize } from '@ticatec/logger-pino';

initialize({
    appenders: [
        { name: 'stdout', type: 'console', level: 'info' },
        { name: 'errfile', type: 'file', level: 'error', options: { filename: '/var/log/app/error.log' } }
    ],
    loggers: {
        root: { level: 'info', appenders: ['stdout', 'errfile'] },
        dao: { level: 'warn', appenders: ['stdout'] },
        service: { level: 'debug', appenders: ['stdout'] }
    }
});
```

`root` is the fallback for any category with no entry of its own. `dao`, `service`,
`repository`, `controller` and `db` are the categories the framework uses, so the config
above quiets SQL logging while leaving services verbose.

`initialize()` can only be called once — a second call throws rather than silently
reconfiguring the process. It also accepts a pino instance directly if you have one already
configured.

## The two arguments

```typescript
logger.info({ orderId, amount }, 'Order placed');   // context first, message second
```

Both shapes are in the contract, and `logger.info('message')` works. Prefer the object form:
structured fields are what makes a log searchable, and a message with values interpolated
into it is a string nobody can query.

One rule that is easy to get wrong — pass an `Error` **as** the context, not inside one:

```typescript
logger.error(err, 'Failed to place order');       // message and stack survive
logger.error({ err }, 'Failed to place order');   // both are lost
```

`message` and `stack` are not enumerable properties, so once `{ err }` is serialised all
that remains is `{"err":{"code":"ENOSPC"}}` — the one line worth reading is gone.

## What the framework will not log

Three categories are kept out by default, because a log is a file that outlives the incident
and gets copied to places nobody enumerated.

**Credentials.** Connection configuration is logged as a summary — host, port, database,
pool size, and `authenticated: true` — never the password or the connection string.

**SQL bind parameters.** Statements are logged with their text and their parameter *count*:

```
DEBUG [SQL] Executing SQL update {"sql":"UPDATE users SET pwd = ? WHERE id = ?","paramCount":2}
```

When you genuinely need the values to trace a problem:

```bash
KEELSON_LOG_SQL_PARAMS=true node dist/main.js
```

It affects every layer — the DAO helpers and the driver both. Turn it off again.

**Request and response bodies.** Off unless you ask:

```typescript
import { Controller } from '@ticatec/keelson-express';
Controller.debugEnabled = true;
```

That prints `req.body` and `req.query` at debug — everything a client sent, passwords and
tokens included. Development only.

The user identity is also absent, as chapter 5 explained.

## Health checks

Three endpoints are mounted before your routes, without authentication:

| Endpoint | Meaning |
| --- | --- |
| `GET /health/live` | The process is up. Always 200 while it can answer. |
| `GET /health/ready` | 200 when every critical check passes, 503 otherwise. |
| `GET /health` | Same as `/health/ready`. |

The distinction matters to Kubernetes. A failing **liveness** probe restarts the pod; a
failing **readiness** probe only takes it out of the load balancer. A database outage should
take you out of rotation, not restart you in a loop — so the database belongs in readiness,
which is where `registerHealthCheck` puts it.

```typescript
protected async beforeStart(): Promise<void> {
    DBManager.init(initializePg(AppConf.getInstance()!.get('database')));

    this.registerHealthCheck('database', async () => {
        const conn = await DBManager.getInstance().connect();
        try {
            await conn.executeUpdate('SELECT 1', []);
            return { status: 'UP' };
        } finally {
            await conn.close();
        }
    });

    this.registerHealthCheck('cache', async () => {
        return { status: await redisReachable() ? 'UP' : 'DOWN' };
    }, false);     // not critical
}
```

A **critical** check that is DOWN makes the whole response DOWN and the status 503. A
**non-critical** one that is DOWN makes the response DEGRADED with a 200 — the service still
works, just worse. Cache is the textbook non-critical dependency: a cold cache is slow, not
broken.

Each check gets 3 seconds by default; pass a fourth argument to change it. A check that
exceeds its timeout counts as DOWN rather than hanging the probe, which matters because a
hung probe looks identical to a hung process.

A built-in `system` indicator is registered for you, reporting uptime and memory, and
reporting DEGRADED above 2 GB RSS.

## What a probe reveals

Outside production the response carries each check's `details` and error strings. With
`NODE_ENV=production` set, `details` are omitted and errors become a flat
`"Health check failed"`.

That is not decoration. `/health/ready` is unauthenticated by necessity, and an error string
from a driver will happily include a hostname, a port, a database name, sometimes a user.
Set `NODE_ENV=production` in production — it is also what strips stack traces from error
responses.

## Where to look when something is wrong

```bash
LOG_LEVEL=debug                    # everything, including route registration
KEELSON_LOG_SQL_PARAMS=true        # plus bind parameter values
```

and in the application, `Controller.debugEnabled = true` for request bodies. All three are
development switches. A production service runs with none of them.

---

Next: [Background work and shutdown](07-background-work.md).
