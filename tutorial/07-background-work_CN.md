# 7. 后台任务与关停

中文 | [English](07-background-work.md) · [教程目录](README_CN.md)

不由请求触发的活儿——待发件箱、要轮询的队列、每晚的清理——以及怎么在停机时一件都不丢。

## 一个处理器

继承 `CommonProcessor<T>`，说明多久看一次、每条数据怎么处理：

```typescript
import { CommonProcessor } from '@ticatec/keelson-express';
import { beanFactory } from '@ticatec/keelson-core';

interface PendingMail { id: string; to: string; body: string; }

export default class MailProcessor extends CommonProcessor<PendingMail> {
    constructor() {
        super(30, 5);        // 每 30 秒看一次，最多 5 条并发
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

构造函数两个参数分别是轮询间隔秒数（最小 5，会取整）和并发度——同时最多几个
`processItem` 在跑，默认 5。

循环是：等一个间隔，调 `loadToProcessData()`，用不超过 `ants` 的并发跑
`processItem`，再等。空批次会立刻重置计时器，所以空闲的处理器不会攒下一堆被跳过的 tick。

两个 tick 永不重叠。某一批跑得比间隔还久时，下一个 tick 是被跳过而不是排队——对
"把积压抽干"这类循环来说这正是你要的，但如果你期待的是固定频率调度，这一点值得知道。

## 异常不会停掉循环

`processItem` 抛异常会被记录，剩下的条目继续跑。`loadToProcessData` 抛异常会被记录，
这一轮结束，下一轮照常。所以数据库短暂故障只会让处理器暂停，而不是死掉。

随之而来的后果：一条永远处理不了的"毒药数据"会每个间隔重试一次，永远如此。那个把条目
标记为已处理的逻辑，也应当在 N 次失败后把它标记为失败——框架不跟踪重试次数，因为
只有你的表结构知道这个计数器该放哪。

## 注册与启动

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

`register(Class)` 以类名为键，返回实例，只在第一次真正创建。`startAll()` 启动所有
已注册的处理器。

注册要排在数据库与 bean 之后——处理器可能在启动后一秒内就跑第一个 tick，那时它必须
面对一个可用的世界。

之后想拿到某个处理器，`ProcessorManager.getInstance().get('MailProcessor')` 返回它或
`undefined`。`runImmediately()` 让下一个 tick 立刻发生——webhook 想踢一下抽取循环而
不是干等一个间隔时，用的就是它。

## 关停

`BaseServer.shutdown()` 按顺序做三件事：停掉所有处理器并等待在途条目、删掉 `check.dat`
端口文件、关闭 HTTP 服务器。

处理器排在最前面是关键。先关监听会让某一批数据处理到一半，而 pod 已经在被拆了。

把它接到编排器发的信号上：

```typescript
const server = new MyServer();
BaseServer.startup(server);

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
        server.shutdown().then(() => process.exit(0));
    });
}
```

`shutdown()` 不会自动挂到信号上。一个背着你安装信号处理器的框架，等你需要自己的关停
顺序时——关掉消息中间件连接、从服务发现注销——就成了要跟它搏斗的东西。

### "等待在途条目"是什么意思

`stop()` 清掉定时器，然后 await 当前正在跑的那一批。已经进入 `processItem` 的条目会
跑完。还没开始的条目就是不开始了——它仍然处在你的查询所依据的那个待处理状态里，
下一个起来的进程会接着捞。

这正是 `loadToProcessData()` 的查询应当依据持久化状态、而不是内存标志的原因：
你与未来的自己之间的约定是——没处理完的行，重启之后依然看得见。

### HTTP 那一侧

`close()` 停止接受新连接，并等待在途请求完成。Node 18 在这一步会把空闲的 keep-alive
连接留着，可能拖住回调，所以 `shutdown()` 显式关掉空闲连接。在途请求则不去动它，
让它写完——一个把响应写到一半截断的关停，不叫优雅。

给 pod 的 `terminationGracePeriodSeconds` 要比你最慢的请求更长。

## 端口文件

启动时服务器把自己实际绑定到的端口写进 `./check.dat`，`shutdown()` 删掉它。
在 `port: 0`（随便找个空闲端口）的场景下，外层脚本就是靠这个文件发现真实端口的。
作为健康信号它很弱，请用 `/health/live`。

---

下一章：[配置与缓存](08-config-and-cache_CN.md)。
