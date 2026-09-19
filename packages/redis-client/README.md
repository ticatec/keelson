# Ticatec Redis Client

[中文](./README_CN.md) ｜ English

[![Version](https://img.shields.io/npm/v/@ticatec/redis-client)](https://www.npmjs.com/package/@ticatec/redis-client)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A lightweight TypeScript wrapper around ioredis, providing convenient methods for Redis operations with singleton and multi-instance pattern support, logging through the `@ticatec/logger-api` contract, mock Redis for testing, and an abstract caching framework with Cache-Aside (`getOrSet`) support.

## Features

- ✅ **Dual Module Support**: Full ES Module (ESM) & CommonJS (CJS) compatibility
- ✅ **Singleton & Multi-Instance**: Supports named singletons (`getInstance('session')`) and standalone instances
- ✅ **Mock Redis Support**: In-memory client for tests via `ioredis-mock`, kept out of production installs
- ✅ **Connection URL or Options**: `redis://` / `rediss://` strings and `RedisOptions` are both accepted
- ✅ **Pluggable Logging**: Writes through the `@ticatec/logger-api` contract, with credentials and cached values kept out of the log
- ✅ **Cache-Aside Pattern (`getOrSet`)**: Built-in `getOrSet` method to fetch or populate cache automatically
- ✅ **JSON Serialization**: Automatic JSON serialization/deserialization for objects
- ✅ **Comprehensive Operations**: High-level wrapper for Strings, Hashes, Sets, Lists, and Pub/Sub
- ✅ **Caching Framework**: `AbstractCachedData` and `CachedDataManager` system

## Installation

```bash
pnpm add @ticatec/redis-client @ticatec/logger-api ioredis
# or npm
npm install @ticatec/redis-client @ticatec/logger-api ioredis
```

`ioredis` and `@ticatec/logger-api` are peer dependencies. `@ticatec/logger-api`
is a zero-dependency contract: with no provider registered it writes to the
console, so nothing else is required. Add a concrete logger only if you want one:

```bash
pnpm add @ticatec/logger-pino pino
```

## Quick Start

### Basic Usage

**Named import (recommended):**
```typescript
import { RedisClient } from '@ticatec/redis-client';
```
This works the same way under ESM and CJS, and in bundlers/loaders with inconsistent
default-export interop, without needing a manual unwrap like
`(_RedisClient as any).default || _RedisClient`.

**Default import (still supported for backward compatibility):**
```typescript
import RedisClient from '@ticatec/redis-client';
```

**CommonJS (CJS):**
```javascript
const { RedisClient } = require('@ticatec/redis-client'); // recommended
// or, still supported:
const RedisClient = require('@ticatec/redis-client').default;
```

```typescript
// Initialize default singleton with real Redis
await RedisClient.init({
  host: '127.0.0.1',
  port: 6379,
  // ... ioredis options
});

const client = RedisClient.getInstance();

// String operations
await client.set('key', 'value', 3600); // 1-hour TTL
const value = await client.get('key');

// Object operations with automatic JSON serialization
await client.set('user', { name: 'John', age: 30 });
const user = await client.getObject<{ name: string; age: number }>('user');

// Cache-Aside (getOrSet) pattern
const userData = await client.getOrSet('user:100', async () => {
  return await fetchUserFromDatabase(100);
}, 3600);
```

### Multi-Instance Management

```typescript
// Initialize named instances
await RedisClient.init({ host: 'redis-cache', port: 6379 }, 'cache');
await RedisClient.init({ host: 'redis-session', port: 6379 }, 'session');

const cacheClient = RedisClient.getInstance('cache');
const sessionClient = RedisClient.getInstance('session');
```

### Testing with Mock Redis

```typescript
// Pass null to use Mock Redis
await RedisClient.init(null);

const client = RedisClient.getInstance();
await client.set('testKey', 'testValue');
const value = await client.get('testKey');
console.log(value); // 'testValue'
```

## Notes

- **`getInstance(name?)`** throws an `Error` if no instance was `init()`-ed under that name, instead of silently returning `undefined`.
- **`hset` / `sadd` / `rpush`** with a `seconds` TTL run inside an ioredis pipeline; command errors inside the pipeline are now surfaced (thrown), matching the non-TTL code path.
- **`subscribe` / `unsubscribe`** match handlers by function reference — pass the exact same function reference to `unsubscribe` that you passed to `subscribe`, not a new inline/anonymous function.
- **`init(conf, name?, options?)`** called a second time for a name that already exists returns the existing instance and **ignores the new `conf`**, with a `warn` in the log. A *closed* instance is replaced instead.
- **`resetInstances()`** disconnects all active instances and clears the registry (primarily for testing). Call `close()` or `closeInstance()` for graceful shutdown in application code.
- **`hsetnx`** returns `true` when the field was set and `false` when it already existed.
- **`conf`** on `RedisClient.create()` / `RedisClient.init()` / `new RedisClient()` is typed as `RedisConnection` (`RedisOptions | string | null` - pass `null` to use Mock Redis). An optional `options?: RedisOptions` parameter is also accepted.


### Mock Redis in tests

`RedisClient.create(null)` / `init(null)` returns an in-memory client backed by
[`ioredis-mock`](https://www.npmjs.com/package/ioredis-mock). That package is a
**development dependency of your application**, not of this one:

```bash
pnpm add -D ioredis-mock
```

It is deliberately not shipped with `@ticatec/redis-client`. It is 7.2 MB and
pulls in `fengari`, a Lua VM written in JavaScript, to emulate Redis' `EVAL`;
nothing in a production deployment should be paying for that. It is resolved at
call time from the application's working directory, so a production install that
never installs it also never loads it - and if such an install does reach the
mock branch it fails with a message saying so, rather than quietly running
against an in-memory fake.

### Connection URL

`create()`, `init()`, and `new RedisClient()` accept a connection string as well as an options object, with optional additional `options`:

```typescript
await RedisClient.init(process.env.REDIS_URL!);                               // redis:// or rediss://
await RedisClient.init(process.env.REDIS_URL!, 'app', { lazyConnect: true }); // with extra options
await RedisClient.init({ host: 'localhost', port: 6379 });
await RedisClient.init(null);                                                 // mock client
```

Credentials embedded in the URL are redacted in the log exactly like those in an
options object.

### Lifecycle

```typescript
await RedisClient.init(conf, 'session');
const client = RedisClient.getInstance('session');

await RedisClient.closeInstance('session');   // closes and unregisters
RedisClient.getInstance('session');           // throws: no longer registered
await RedisClient.init(conf, 'session');      // creates a fresh connection
```

`close()` unregisters the instance, so a closed client is never handed out again
and `init()` under the same name reconnects. `subscribe()` on a closed client
throws rather than deriving a subscriber that nothing would clean up.

### Caching and serialization

`set()` / `get()` and `setObject()` / `getObject()` are two separate channels:

| Write | Read | Stored form |
|---|---|---|
| `set('k', 'active')` | `get('k')` → `'active'` | the string verbatim |
| `setObject('k', 'active')` | `getObject('k')` → `'active'` | `"active"` (JSON) |

Mixing them does not round-trip: `set()` stores a string verbatim, and
`getObject()` cannot parse it. `getOrSet()` and `AbstractCachedData` use the
`setObject` / `getObject` pair throughout, so any value they accept reads back
unchanged - including plain strings and strings that look like JSON literals.

## Logging

The client logs through [`@ticatec/logger-api`](https://www.npmjs.com/package/@ticatec/logger-api),
a zero-dependency contract rather than a concrete logging library. With no
provider registered it falls back to the console, filtered by `LOG_LEVEL`.

| Event | Level | Payload |
|---|---|---|
| Connecting to Redis | `debug` | host, port, db, whether TLS and auth are configured |
| connect / ready / end / reconnecting | `info` | message only |
| ioredis client error | `error` | the error |
| `init()` called again for an existing name | `warn` | the instance name |
| Cache miss / joined an in-flight fetch | `debug` | the key |
| Cached value or list element is not JSON | `debug` / `warn` | key, index, byte length |
| Re-registering a cached data class | `warn` | the class name |
| Client closed | `info` | message only |

Two things are deliberately kept out of the log:

- **Credentials and TLS material.** `RedisOptions` carries `password`, `username`,
  `sentinelPassword` and TLS keys. The connection record is built from an
  allow-list of safe fields, so it reports *whether* auth and TLS are configured,
  never the values:

  ```json
  { "host": "redis.prod.internal", "port": 6379, "db": 2, "tls": true, "authenticated": true }
  ```

- **Cached values.** A cache holds user records, tokens and sessions. When an
  entry fails to parse, the record carries the key and the byte length - not the
  payload.

To route the records into a real logger, register a provider once at startup:

```typescript
import { setLoggerProvider } from '@ticatec/logger-api';
import { initialize, getPinoLogger } from '@ticatec/logger-pino';

initialize({
    appenders: [{ name: 'out', type: 'console', level: 'info' }],
    loggers: { root: { level: 'info', appenders: ['out'] } }
});
setLoggerProvider(getPinoLogger);
```

## API Reference

### Core Methods

#### Instance Management
- `RedisClient.init(conf, name?, options?)` - Initialize or replace a named singleton instance
- `RedisClient.getInstance(name?)` - Retrieve an initialized singleton instance (throws if uninitialized)
- `RedisClient.create(conf, options?)` - Create an independent non-singleton instance
- `RedisClient.closeInstance(name?)` - Close and unregister a specific singleton instance
- `RedisClient.resetInstances()` - Disconnect and clear all singleton instances (for testing)
- `close()` - Close client connection and unregister self from the singleton registry

#### String & JSON Operations
- `set(key, value, seconds?)` - Set key-value pair with optional TTL (objects serialized to JSON; strings/numbers stored verbatim)
- `get(key)` - Get string value by key
- `getBuffer(key)` - Get raw `Buffer` value by key (binary-safe; use this to read back values stored as a `Buffer` via `set()`, since `get()` decodes as a string)
- `setObject(key, value, seconds?)` - Set value with JSON serialization (symmetric with `getObject`)
- `getObject<T>(key)` - Get and parse JSON object (symmetric with `setObject`)
- `getOrSet<T>(key, fetchFn, seconds?)` - Fetch from cache or populate via `fetchFn` (uses `setObject`/`getObject` with in-flight deduplication)
- `del(key)` - Delete key
- `expiry(key, seconds)` / `expire(key, seconds)` - Set expiration time

#### Hash Operations
- `hset(key, data, seconds?)` - Set hash fields (uses atomic pipeline with TTL when `seconds > 0`)
- `hget(key, field)` - Get hash field value
- `hgetall(key)` - Get all hash fields as object
- `hsetnx(key, field, value)` - Set hash field if not exists (returns `Promise<boolean>`: `true` if set, `false` if already existed)

#### Set Operations
- `sadd(key, members, seconds?)` - Add members to set (uses atomic pipeline with TTL when `seconds > 0`)
- `scard(key)` - Get set cardinality
- `isSetMember(key, value)` - Check if value is in set

#### List Operations
- `rpush(key, data, seconds?)` - Push element to list tail (uses atomic pipeline with TTL when `seconds > 0`)
- `lrange(key, start, end)` - Get list range
- `lrangeObject(key, start, end)` - Get list range and parse JSON
- `llen(key)` - Get list length
- `lpop(key)` - Pop element from list head

#### Pub/Sub Operations
- `publish(channel, data)` - Publish string or object message
- `subscribe(channels, handler)` - Subscribe to channels
- `unsubscribe(channel, handler?)` - Unsubscribe specific handler or entire channel

### Caching Framework

#### AbstractCachedData

Abstract base class for cached entity operations with `load()`, `getOrSet()`, `save()`, and `clean()`:

```typescript
import { AbstractCachedData } from '@ticatec/redis-client';

interface User {
  id: number;
  name: string;
  email: string;
}

class UserCache extends AbstractCachedData<User> {
  constructor() {
    super((key: Partial<User>) => `user:${key.id}`, 3600);
  }
  
  async getUser(id: number): Promise<User> {
    return await this.getOrSet({ id }, async () => {
      return await fetchUserFromDatabase(id);
    });
  }
}
```

#### CachedDataManager

Singleton manager for registering and managing cache instances. Supports abstract base classes as registration tokens:

```typescript
import { CachedDataManager, AbstractCachedData } from '@ticatec/redis-client';

abstract class UserCacheToken extends AbstractCachedData<User> {}

class UserCache extends UserCacheToken {
  constructor() {
    super((key: Partial<User>) => `user:${key.id}`, 3600);
  }
}

const manager = CachedDataManager.getInstance();
const userCache = new UserCache();

// Register concrete instance with abstract token:
manager.register(UserCacheToken, userCache);
// Automatically infers return type as UserCacheToken | undefined:
const retrievedCache = manager.get(UserCacheToken);
```