# Ticatec Redis Client

[English](./README.md) ｜ 中文

[![Version](https://img.shields.io/npm/v/@ticatec/redis-client)](https://www.npmjs.com/package/@ticatec/redis-client)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

一个基于 ioredis 的轻量级 TypeScript 工具库，提供便捷的 Redis 操作、单例与多实例连接管理、Pino 日志集成、测试 Mock Redis 支持以及包含 Cache-Aside (`getOrSet`) 模式的抽象缓存框架。

## 特性

- ✅ **双模式支持**：完整支持 ES Modules (ESM) 与 CommonJS (CJS)
- ✅ **单例与多实例**：支持命名单例（`getInstance('session')`）与独立实例创建
- ✅ **Mock Redis 支持**：内置基于 `ioredis-mock` 的模拟环境
- ✅ **Pino 日志集成**：集成 `@ticatec/logger-wrapper` Pino 结构化日志输出
- ✅ **Cache-Aside 模式 (`getOrSet`)**：内置 `getOrSet` 自动查询与回填缓存
- ✅ **JSON 自动序列化**：针对对象类型提供自动序列化与反序列化
- ✅ **丰富操作接口**：高阶封装 String、Hash、Set、List 与 Pub/Sub
- ✅ **缓存框架**：`AbstractCachedData` 与 `CachedDataManager` 体系

## 安装

```bash
pnpm add @ticatec/redis-client @ticatec/logger-wrapper ioredis pino
# 或 npm
npm install @ticatec/redis-client @ticatec/logger-wrapper ioredis pino
```

## 快速开始

### 基础用法

**具名导入（推荐）：**
```typescript
import { RedisClient } from '@ticatec/redis-client';
```
具名导入在 ESM 和 CJS 下行为一致，也不受不同打包器/加载器对 default export
互操作解析不一致的影响，不需要再写 `(_RedisClient as any).default || _RedisClient`
这类兜底代码。

**默认导入（为兼容旧代码而保留）：**
```typescript
import RedisClient from '@ticatec/redis-client';
```

**CommonJS (CJS):**
```javascript
const { RedisClient } = require('@ticatec/redis-client'); // 推荐写法
// 仍然兼容：
const RedisClient = require('@ticatec/redis-client').default;
```

```typescript
// 初始化默认单例（真实 Redis）
await RedisClient.init({
  host: '127.0.0.1',
  port: 6379,
  // ... ioredis 其它配置
});

const client = RedisClient.getInstance();

// 字符串操作
await client.set('key', 'value', 3600); // 过期时间 1 小时
const value = await client.get('key');

// 对象操作（自动 JSON 序列化）
await client.set('user', { name: '张三', age: 30 });
const user = await client.getObject<{ name: string; age: number }>('user');

// Cache-Aside (getOrSet) 模式
const userData = await client.getOrSet('user:100', async () => {
  return await fetchUserFromDatabase(100);
}, 3600);
```

### 多实例连接管理

```typescript
// 初始化命名单例实例
await RedisClient.init({ host: 'redis-cache', port: 6379 }, 'cache');
await RedisClient.init({ host: 'redis-session', port: 6379 }, 'session');

const cacheClient = RedisClient.getInstance('cache');
const sessionClient = RedisClient.getInstance('session');
```

### 单元测试使用 Mock Redis

```typescript
// 传入 null 使用 Mock Redis
await RedisClient.init(null);

const client = RedisClient.getInstance();
await client.set('testKey', 'testValue');
const value = await client.get('testKey');
console.log(value); // 'testValue'
```

## 使用说明

- **`getInstance(name?)`**：如果对应名字的实例从未 `init()` 过，会抛出 `Error`，不再静默返回 `undefined`。
- **`hset` / `sadd` / `rpush`** 在带 `seconds` TTL 时走 ioredis pipeline；pipeline 内命令出错现在会被抛出，与不带 TTL 的分支行为保持一致。
- **`subscribe` / `unsubscribe`** 按函数引用匹配 handler —— `unsubscribe` 时必须传入与 `subscribe` 时完全相同的函数引用，不能是新的匿名/内联函数。
- **`conf`** 参数（`RedisClient.create()` / `RedisClient.init()` / `new RedisClient()`）类型为 ioredis 的 `RedisOptions | null`（传 `null` 使用 Mock Redis）。

## API 指南

### 核心方法

#### 字符串与 JSON 操作
- `set(key, value, seconds?)` - 设置键值对，可选 TTL
- `get(key)` - 获取字符串值
- `getBuffer(key)` - 获取原始 `Buffer` 值（二进制安全；用于读回通过 `set()` 存入的 `Buffer` 数据，因为 `get()` 会按字符串解码）
- `getObject<T>(key)` - 获取并解析 JSON 对象
- `getOrSet<T>(key, fetchFn, seconds?)` - 优先读缓存，未命中则调用 `fetchFn` 回填
- `del(key)` - 删除指定键
- `expiry(key, seconds)` - 设置过期时间

#### Hash 操作
- `hset(key, data, seconds?)` - 设置哈希表字段
- `hget(key, field)` - 获取哈希表字段值
- `hgetall(key)` - 获取哈希表所有字段
- `hsetnx(key, field, value)` - 当字段不存在时设置值

#### Set 操作
- `sadd(key, members, seconds?)` - 向集合添加元素
- `scard(key)` - 获取集合元素数量
- `isSetMember(key, value)` - 判断元素是否存在于集合

#### List 操作
- `rpush(key, data, seconds?)` - 向列表尾部追加元素
- `lrange(key, start, end)` - 获取列表指定范围元素
- `lrangeObject(key, start, end)` - 获取列表指定范围元素并解析为 JSON
- `llen(key)` - 获取列表长度
- `lpop(key)` - 弹出列表头部元素

#### Pub/Sub 订阅发布
- `publish(channel, data)` - 发布消息（自动转 JSON）
- `subscribe(channels, handler)` - 订阅频道
- `unsubscribe(channel, handler?)` - 取消订阅特定回调或整个频道

### 缓存框架

#### AbstractCachedData

抽象缓存基类，提供 `load()`、`getOrSet()`、`save()` 和 `clean()` 方法：

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

缓存管理器单例，用于注册和统一获取缓存实例：

```typescript
import { CachedDataManager } from '@ticatec/redis-client';

const manager = CachedDataManager.getInstance();
const userCache = new UserCache();

manager.register(UserCache, userCache);
// 自动推断返回类型为 UserCache | undefined：
const retrievedCache = manager.get(UserCache);
```