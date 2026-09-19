# Ticatec Redis Client

[English](./README.md) ｜ 中文

[![Version](https://img.shields.io/npm/v/@ticatec/redis-client)](https://www.npmjs.com/package/@ticatec/redis-client)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

一个基于 ioredis 的轻量级 TypeScript 工具库，提供便捷的 Redis 操作、单例与多实例连接管理、通过 `@ticatec/logger-api` 契约输出日志、测试 Mock Redis 支持以及包含 Cache-Aside (`getOrSet`) 模式的抽象缓存框架。

## 特性

- ✅ **双模式支持**：完整支持 ES Modules (ESM) 与 CommonJS (CJS)
- ✅ **单例与多实例**：支持命名单例（`getInstance('session')`）与独立实例创建
- ✅ **Mock Redis 支持**：内置基于 `ioredis-mock` 的模拟环境
- ✅ **可插拔日志**：通过 `@ticatec/logger-api` 契约输出，凭据与缓存值不会进入日志
- ✅ **Cache-Aside 模式 (`getOrSet`)**：内置 `getOrSet` 自动查询与回填缓存
- ✅ **JSON 自动序列化**：针对对象类型提供自动序列化与反序列化
- ✅ **丰富操作接口**：高阶封装 String、Hash、Set、List 与 Pub/Sub
- ✅ **缓存框架**：`AbstractCachedData` 与 `CachedDataManager` 体系

## 安装

```bash
pnpm add @ticatec/redis-client @ticatec/logger-api ioredis
# 或 npm
npm install @ticatec/redis-client @ticatec/logger-api ioredis
```

`ioredis` 与 `@ticatec/logger-api` 是 peer dependency。`@ticatec/logger-api` 本身
零依赖：未注入 provider 时退回写控制台，因此不需要再装别的东西。只有当你想接入具体
日志库时才需要：

```bash
pnpm add @ticatec/logger-pino pino
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
- **`init(conf, name?)`** 对已存在的名字再次调用时，返回已有实例并**忽略新的 `conf`**，同时记一条 `warn` 日志。
- **`resetInstances()`** 只清空注册表，不会关闭连接——需要真正断开时请先对各实例调用 `close()`。
- **`conf`** 参数（`RedisClient.create()` / `RedisClient.init()` / `new RedisClient()`）类型为 ioredis 的 `RedisOptions | null`（传 `null` 使用 Mock Redis）。

## 日志

本客户端通过 [`@ticatec/logger-api`](https://www.npmjs.com/package/@ticatec/logger-api)
记录日志——那是一份零依赖的契约，而非某个具体的日志库。未注入 provider 时退回写
控制台，并按 `LOG_LEVEL` 过滤。

| 事件 | 级别 | 内容 |
|---|---|---|
| 正在连接 Redis | `debug` | host、port、db，以及是否配置了 TLS 与认证 |
| connect / ready / end / reconnecting | `info` | 仅消息 |
| ioredis 客户端错误 | `error` | 错误对象 |
| 同名实例重复 `init()` | `warn` | 实例名 |
| 缓存未命中 / 搭上进行中的取数 | `debug` | key |
| 缓存值或列表元素不是 JSON | `debug` / `warn` | key、下标、字节长度 |
| 缓存数据类重复注册 | `warn` | 类名 |
| 客户端已关闭 | `info` | 仅消息 |

有两类内容是刻意不写进日志的：

- **凭据与 TLS 材料。** `RedisOptions` 里带着 `password`、`username`、
  `sentinelPassword` 以及 TLS 密钥。连接日志按白名单构造，只报告*是否*配置了认证
  与 TLS，绝不报告其取值：

  ```json
  { "host": "redis.prod.internal", "port": 6379, "db": 2, "tls": true, "authenticated": true }
  ```

- **缓存值本身。** 缓存里放的往往是用户记录、令牌、会话。某条记录解析失败时，
  日志只带 key 与字节长度，不带内容。

若要接入真正的日志库，在启动时注册一次 provider：

```typescript
import { setLoggerProvider } from '@ticatec/logger-api';
import { initialize, getPinoLogger } from '@ticatec/logger-pino';

initialize({
    appenders: [{ name: 'out', type: 'console', level: 'info' }],
    loggers: { root: { level: 'info', appenders: ['out'] } }
});
setLoggerProvider(getPinoLogger);
```

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