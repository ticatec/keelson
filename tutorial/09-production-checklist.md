# 9. Before you go live

[中文](09-production-checklist_CN.md) | English · [Tutorial index](README.md)

A checklist. Each line has a reason, because a checklist whose items you cannot justify is
one you will skip.

## Environment

**`NODE_ENV=production`** — this one setting changes two behaviours. Error responses stop
carrying stack traces, and `/health/ready` stops carrying check `details` and error strings.
Both are unauthenticated surfaces that will otherwise hand out hostnames, ports and
database names.

**`LOG_LEVEL`** at `info` or `warn`. Debug logging includes every statement executed.

**`KEELSON_LOG_SQL_PARAMS` unset.** Set to `true` it prints bind parameter values —
passwords, tokens, personal data — into the log. It exists for a bad afternoon, not for
steady state.

**`Controller.debugEnabled` false** (the default). True prints `req.body` and `req.query`,
which is everything a client sent.

## Behind a gateway

If you use the default `HeaderUserResolver`, the `user` header is the caller's identity and
it is trusted completely. Verify two things:

- the service is not reachable except through the gateway — not by a second ingress, not by
  a debug port, not from inside the cluster
- the gateway **strips** any client-supplied `user` header before setting its own

If either is uncertain, install a resolver that verifies a signature (chapter 5). This is
the single highest-consequence line on this list: get it wrong and any caller is any user.

## Database

**Pool size** deliberately chosen. The default in most drivers is 10; the right number is
usually bounded by the database's `max_connections` divided by the number of pods, not by
what a single pod would like.

**`REQUIRES_NEW` audited.** Each one takes a second connection from the pool while the
outer transaction holds the first. In a loop, that is how a pool deadlocks.

**Long transactions looked at.** A `@Transaction()` that calls an HTTP API holds a
connection open for the duration of the call. Move the network call outside the boundary.

**Non-database work moved out.** Emails, message publishes and cache writes do not roll
back. Chapter 2 has the pattern.

## Shutdown

**`SIGTERM` handled** and wired to `shutdown()`. Without it, a pod termination kills
in-flight requests and half-processed batches.

**`terminationGracePeriodSeconds`** longer than your slowest request plus your slowest
`processItem`. Shorter, and the orchestrator `SIGKILL`s you mid-shutdown.

**Processors idempotent.** Shutdown waits for in-flight items, but a `SIGKILL`, an OOM
kill or a node failure does not. Whatever `loadToProcessData()` selects on must still select
the item after an abrupt restart.

## Health probes

**Liveness and readiness pointed at the right endpoints.** `/health/live` for liveness,
`/health/ready` for readiness. Pointing liveness at readiness means a database blip restarts
every pod at once, which turns a brief outage into a thundering herd.

**Dependencies classified.** Critical means "requests will fail" — the database, usually.
Non-critical means "requests will be slower" — the cache. A critical check that is DOWN
takes the pod out of rotation; a non-critical one reports DEGRADED and keeps serving.

**Timeouts set below the probe's own timeout.** A check defaults to 3 seconds. If your
probe timeout is 2, the probe gives up before the check does and you learn nothing.

## Logging

**A provider installed**, or a deliberate decision to stay on the console fallback. The
fallback writes plain text to stdout; if your collector expects JSON, install
`@ticatec/logger-pino` and call `initialize()` before anything logs.

**Errors passed as errors** — `logger.error(err, 'message')`, never `logger.error({ err },
'message')`. The second form loses the message and the stack.

**Categories tuned.** `dao` and `db` at `warn` keeps per-statement logging out of production
while leaving `service` informative.

## Build and dependencies

**`strict` on** in your own tsconfig. Every Keelson package is built with it; the types you
consume are only as useful as your own settings let them be.

**`reflect-metadata` imported once**, first, in the entry file.

**Peer dependencies pinned to ranges you have tested.** Keelson declares them loosely —
`>=1.0.0` — because it does not know your combination. Your lockfile should.

**One module format per process.** Mixing CommonJS and ESM copies of the same package works
— the singletons are anchored on `globalThis` for exactly that reason — but it doubles the
code loaded. Check your bundle if startup memory looks high.

## Before the first deploy

- Run `pnpm verify` — build, typecheck, tests, in that order
- Start the service with `NODE_ENV=production` locally and read the first fifty log lines.
  That is where a missing provider, a wrong category or a leaked secret shows up.
- `curl /health/ready` and confirm the body carries no `details`
- Cause a 500 on purpose and confirm the response carries no stack
- Send a request with a forged `user` header from outside the gateway and confirm it does
  not reach you

That last one is worth doing by hand, once, from outside the cluster. It is the test that
tells you whether the assumption underneath chapter 5 actually holds in your deployment.

---

Back to the [tutorial index](README.md), or the [project README](../README.md).
