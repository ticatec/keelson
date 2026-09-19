# 8. 配置与缓存

中文 | [English](08-config-and-cache.md) · [教程目录](README_CN.md)

把配置从运维放它的地方取进来，再给那些不是每秒都变的东西加一层缓存。

## 配置

`AppConf` 是内存里的持有者：用一个对象初始化一次，之后用点号路径读取。

```typescript
AppConf.init(config);

AppConf.getInstance()!.get('web.port');         // 3000
AppConf.getInstance()!.get('database.host');    // 'db.internal'
AppConf.getInstance()!.get('nope.nothing');     // undefined，不抛异常
```

`init()` 的幂等方向不太友好：第二次调用会保留第一份配置、忽略新的那份。
所以只初始化一次，在 `loadConfigFile()` 里。

查找只看自有属性，所以 `get('constructor')` 与 `get('toString')` 返回 `undefined`，
而不是 `Object.prototype` 上的东西。当键名来自你源码之外的地方时，这一点有意义。

那个对象从哪来，是 `@ticatec/config-loader` 的事。

### 本地 YAML 或 JSON

```typescript
import { loadConfig } from '@ticatec/config-loader';

protected async loadConfigFile(): Promise<void> {
    const { appConf, loggerConf } = await loadConfig('local', 'app.yaml', 'logger.yaml');
    initialize(loggerConf);      // @ticatec/logger-pino
    AppConf.init(appConf);
}
```

`loadConfig(mode, configFile, logFile)` 读取两份文档并分别返回。是两个文件而不是同一个
文件里的两段，因为日志必须在其他一切之前配好——包括读取应用配置的那段代码本身。

本地文件以 `CONFIG_DIR` 为根解析，没设就是 `./config`。需要指定根目录时，可以自己
构造 `LocalFileLoader`。

### Nacos 或 Consul

```typescript
const { appConf, loggerConf } = await loadConfig('nacos', 'app.yaml', 'logger.yaml');
```

同一个调用，换第一个参数——`'local'`、`'nacos'` 或 `'consul'`。两个远程加载器需要对应
的客户端库（`nacos` 或 `consul`），所以它们是可选对等依赖且按需动态加载：
用本地文件的服务不必为它们付出任何代价。

连接信息来自环境变量——`NACOS_SERVER_ADDR` 或 `NACOS_ENDPOINT`、`CONSUL_HTTP_ADDR`
以及各自的 token 变量。"配置放在哪"这件事本身，不可能放在配置里。

`loadConfig()` 读完会关掉加载器，免得 Nacos 的心跳线程在启动之后还吊着进程不退。

### 后处理器

第四、第五个参数是两份文档的钩子，它们比看上去窄：签名是
`(content: string) => string`，作用在**解析之前的原始文本**上，而且是同步的。
所以它们用于文本替换，不是用来改造已解析的对象：

```typescript
const { appConf, loggerConf } = await loadConfig(
    'local', 'app.yaml', 'logger.yaml',
    null,                                              // 日志那份不挂钩子
    (text) => text.replace(/\$\{(\w+)\}/g, (_, name) => process.env[name] ?? '')
);
```

有了这个钩子，YAML 里写 `password: ${DB_PASSWORD}` 就会从环境变量取值。

任何异步的事情——比如从 vault 读密钥——放在加载之后、`AppConf.init()` 之前，
那时你手里是一个普通对象，可以 await：

```typescript
const { appConf, loggerConf } = await loadConfig('local', 'app.yaml', 'logger.yaml');
appConf.database.password = await vault.read('db');
initialize(loggerConf);
AppConf.init(appConf);
```

两种写法下口令最终都落在配置对象里、永远不落在日志里——这也正是框架记录连接摘要
而不是记录收到的配置对象的原因（第 6 章）。

## 缓存

`@ticatec/redis-client` 是 ioredis 的封装，提供具名单例。

```typescript
import { RedisClient } from '@ticatec/redis-client';

protected async beforeStart(): Promise<void> {
    await RedisClient.init(AppConf.getInstance()!.get('redis'));          // 'default'
    await RedisClient.init(AppConf.getInstance()!.get('sessions'), 'sessions');
}
```

`init()` 接受 ioredis 的选项对象、`redis://` / `rediss://` URL，或者 `null` 表示内存
mock（仅限开发——mock 是 dev 依赖，在生产环境索要它会抛出带说明的异常）。

按名字取实例：

```typescript
const redis = RedisClient.getInstance();              // 'default'
const sessions = RedisClient.getInstance('sessions');
```

`getInstance()` 在该名字未初始化时抛错并点名。和 bean 的访问器一样，缺失的依赖当场
失败，而不是返回 `undefined`。

### 读写

```typescript
await redis.set('greeting', 'hello', 300);            // 字符串，300 秒 TTL
const s = await redis.get('greeting');

await redis.setObject('user:U1', user, 600);          // JSON 往返
const u = await redis.getObject<AppUser>('user:U1');

await redis.del('user:U1');
```

`set`/`get` 存取字符串，`setObject`/`getObject` 负责序列化。要成对使用——用 `set` 写、
用 `getObject` 读会得到解析错误，反过来会得到一串 JSON 文本。

### 一行搞定 cache-aside

```typescript
const profile = await redis.getOrSet<Profile>(
    `profile:${id}`,
    () => this.service.loadProfile(id),
    600
);
```

命中就返回缓存值；未命中就调用你给的函数、把结果存进去再返回。有两点要知道：
取数函数在缓存冷的时候执行，所以一个热点键在高负载下过期会引发多个并发取数——
重要的键请预热。另外值要经过 JSON 往返，`Date` 回来会变成字符串。
缓存那些能干净序列化的东西，或者在取出来时把类型还原。

### 失效要跟着写操作走

缓存不知道你的数据变了。在变更发生的地方删键——在 service 里，事务**提交之后**，
不是在事务里面：

```typescript
@Transaction()
async updateProfile(user: AppUser, profile: Profile): Promise<void> {
    await this.repo.update(profile);
}

// 调用方
await profileService.updateProfile(user, profile);
await RedisClient.getInstance().del(`profile:${profile.id}`);
```

在事务内部删除是典型错误：删除本身不是事务性的，所以回滚之后缓存是空的——这无害；
但如果删除发生在某个并发读之前，那次读会用尚未提交的状态把缓存填回去，最终缓存里留着
一个已经被回滚掉的值。提交之后再失效。

### 健康检查

Redis 通常是非关键依赖——缓存冷了是慢，不是坏。就按非关键注册它（第 6 章），
这样一次故障只会让服务降级，而不是把它移出负载均衡。

---

下一章：[上线之前](09-production-checklist_CN.md)。
