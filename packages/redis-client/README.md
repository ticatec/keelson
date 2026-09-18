# Ticatec Redis Client

[中文](./README_CN.md) ｜ English

[![Version](https://img.shields.io/npm/v/@ticatec/redis-client)](https://www.npmjs.com/package/@ticatec/redis-client)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A lightweight TypeScript wrapper around ioredis, providing convenient methods for Redis operations with singleton and multi-instance pattern support, Pino logger integration, mock Redis for testing, and an abstract caching framework with Cache-Aside (`getOrSet`) support.

## Features

- ✅ **Dual Module Support**: Full ES Module (ESM) & CommonJS (CJS) compatibility
- ✅ **Singleton & Multi-Instance**: Supports named singletons (`getInstance('session')`) and standalone instances
- ✅ **Mock Redis Support**: Built-in mock Redis via `ioredis-mock` for testing environments
- ✅ **Pino Logger Integration**: Structured logging via `@ticatec/logger-pino` (Pino)
- ✅ **Cache-Aside Pattern (`getOrSet`)**: Built-in `getOrSet` method to fetch or populate cache automatically
- ✅ **JSON Serialization**: Automatic JSON serialization/deserialization for objects
- ✅ **Comprehensive Operations**: High-level wrapper for Strings, Hashes, Sets, Lists, and Pub/Sub
- ✅ **Caching Framework**: `AbstractCachedData` and `CachedDataManager` system

## Installation

```bash
pnpm add @ticatec/redis-client @ticatec/logger-pino ioredis pino
# or npm
npm install @ticatec/redis-client @ticatec/logger-pino ioredis pino
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
- **`conf`** on `RedisClient.create()` / `RedisClient.init()` / `new RedisClient()` is typed as ioredis's `RedisOptions | null` (pass `null` to use Mock Redis).

## API Reference

### Core Methods

#### String & JSON Operations
- `set(key, value, seconds?)` - Set key-value pair with optional TTL
- `get(key)` - Get string value by key
- `getBuffer(key)` - Get raw `Buffer` value by key (binary-safe; use this to read back values stored as a `Buffer` via `set()`, since `get()` decodes as a string)
- `getObject<T>(key)` - Get and parse JSON object
- `getOrSet<T>(key, fetchFn, seconds?)` - Fetch from cache or populate via `fetchFn`
- `del(key)` - Delete key
- `expiry(key, seconds)` - Set expiration time

#### Hash Operations
- `hset(key, data, seconds?)` - Set hash fields
- `hget(key, field)` - Get hash field value
- `hgetall(key)` - Get all hash fields as object
- `hsetnx(key, field, value)` - Set hash field if not exists

#### Set Operations
- `sadd(key, members, seconds?)` - Add members to set
- `scard(key)` - Get set cardinality
- `isSetMember(key, value)` - Check if value is in set

#### List Operations
- `rpush(key, data, seconds?)` - Push element to list tail
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

Singleton manager for registering and managing cache instances:

```typescript
import { CachedDataManager } from '@ticatec/redis-client';

const manager = CachedDataManager.getInstance();
const userCache = new UserCache();

manager.register(UserCache, userCache);
// Automatically infers return type as UserCache | undefined:
const retrievedCache = manager.get(UserCache);
```