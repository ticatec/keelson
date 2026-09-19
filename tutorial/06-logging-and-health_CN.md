# 6. 日志与健康检查

中文 | [English](06-logging-and-health.md) · [教程目录](README_CN.md)

框架往日志里写什么、拒绝写什么、怎么把它接到 pino 上，以及 Kubernetes 探针看到的是什么。

## 日志面向契约，不面向具体库

没有任何一个 Keelson 包引入日志库。它们都调用同一个契约：

```typescript
import { getLogger } from '@ticatec/logger-api';

const logger = getLogger('UserService', 'service');
logger.info({ orderId }, 'Order placed');
```

`getLogger(name, category)`——name 通常是类名，category 把一批类归到一起，方便一次性
设级别。在框架的基类内部，你已经有 `this.logger`，它的名字就是你的具体类名。

什么都不装也能用：输出到 console，按 `LOG_LEVEL` 过滤。

```bash
LOG_LEVEL=debug node dist/main.js
```

这是一个真正可用的回退，不是占位实现——开发时够用，日志被当作纯文本采集的容器里也够用。

## 用 pino 做结构化日志

装上适配器，在任何东西打日志之前初始化一次：

```bash
pnpm add @ticatec/logger-pino
```

```typescript
// src/main.ts，在引入任何会打日志的模块之前
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

`root` 是所有没有单独配置的 category 的兜底。框架用到的 category 有 `dao`、`service`、
`repository`、`controller`、`db`，所以上面这份配置压住了 SQL 日志，同时让 service 层
保持详细。

`initialize()` 只能调用一次——第二次会抛错，而不是悄悄地重新配置整个进程。
如果你已经有配好的 pino 实例，它也直接接受实例。

## 两个参数

```typescript
logger.info({ orderId, amount }, 'Order placed');   // 上下文在前，消息在后
```

契约里两种形式都支持，`logger.info('message')` 也能用。优先用对象形式：结构化字段
才让日志可检索，而把值拼进消息字符串里，谁也查不了。

有一条容易搞错——`Error` 要**作为**上下文传，而不是包在对象里：

```typescript
logger.error(err, 'Failed to place order');       // message 与 stack 都在
logger.error({ err }, 'Failed to place order');   // 两个都没了
```

`message` 与 `stack` 都不是可枚举属性，`{ err }` 序列化之后只剩
`{"err":{"code":"ENOSPC"}}`——最该看的那行没了。

## 框架不会记录的东西

有三类默认被挡在外面，因为日志是一个比事故本身活得更久、并且会被复制到没人清点过的
地方去的文件。

**凭据。** 连接配置以摘要形式记录——host、port、database、池大小，以及
`authenticated: true`——绝不记口令或连接串。

**SQL 绑定参数。** 语句只记文本与参数**个数**：

```
DEBUG [SQL] Executing SQL update {"sql":"UPDATE users SET pwd = ? WHERE id = ?","paramCount":2}
```

确实需要参数值来排查问题时：

```bash
KEELSON_LOG_SQL_PARAMS=true node dist/main.js
```

它对每一层都生效——DAO 的辅助方法和驱动层都在内。用完记得关掉。

**请求体与响应体。** 不主动打开就不记录：

```typescript
import { Controller } from '@ticatec/keelson-express';
Controller.debugEnabled = true;
```

它会把 `req.body` 与 `req.query` 打到 debug——客户端发来的一切，包括口令与 token。
仅限开发环境。

用户标识同样不记录，原因见第 5 章。

## 健康检查

三个端点挂在你的路由之前，且免认证：

| 端点 | 含义 |
| --- | --- |
| `GET /health/live` | 进程活着。只要还能应答就是 200。 |
| `GET /health/ready` | 所有关键检查通过返回 200，否则 503。 |
| `GET /health` | 与 `/health/ready` 相同。 |

这个区分对 Kubernetes 很重要。**存活**探针失败会重启 pod；**就绪**探针失败只是把它
移出负载均衡。数据库故障应该让你下线，而不是让你进入重启循环——所以数据库属于就绪检查，
也正是 `registerHealthCheck` 注册的位置。

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
    }, false);     // 非关键
}
```

**关键**检查 DOWN 会让整体响应 DOWN、状态码 503。**非关键**检查 DOWN 让整体
DEGRADED、状态码 200——服务还能用，只是变差了。缓存是教科书级的非关键依赖：
缓存冷了是慢，不是坏。

每个检查默认 3 秒超时，第四个参数可以改。超时的检查按 DOWN 处理，而不是把探针挂住——
这点很重要，因为一个挂住的探针和一个挂住的进程看起来一模一样。

框架还替你注册了一个内置的 `system` 指示器，报告运行时长与内存，RSS 超过 2 GB 时
报 DEGRADED。

## 探针会泄露什么

非生产环境下，响应里带着每个检查的 `details` 与错误字符串。设置
`NODE_ENV=production` 后，`details` 被省略，错误统一变成
`"Health check failed"`。

这不是修饰。`/health/ready` 出于必要是免认证的，而驱动抛出的错误字符串里很乐意包含
主机名、端口、数据库名，有时还有用户名。生产环境请设置 `NODE_ENV=production`——
它同时也是剥掉错误响应中堆栈的那个开关。

## 出问题时看哪里

```bash
LOG_LEVEL=debug                    # 一切，包括路由注册
KEELSON_LOG_SQL_PARAMS=true        # 外加绑定参数值
```

以及在应用里设 `Controller.debugEnabled = true` 看请求体。这三个都是开发期开关，
生产服务一个都不该开。

---

下一章：[后台任务与关停](07-background-work_CN.md)。
