# 2. 分层与事务

中文 | [English](02-layers-and-transactions.md) · [教程目录](README_CN.md)

第 1 章为了读一行数据，让你写了 DAO、Repository、Service 三个类——比这件事本身需要的
多了三个。这一章讲这些层是干什么的，以及让这套安排值回票价的那个机制。

## 分层要解决的问题

换一个不玩具的用例：两个账户之间转账，写一条流水，再记一条审计。三张表，一条规则——
要么全都发生，要么一件都不发生。

没有约定的话，连接就会变成参数：

```typescript
// 凡是没有早早定下规矩的代码库，最后都会长成这样
async function transfer(conn, fromId, toId, amount) {
    await debit(conn, fromId, amount);
    await credit(conn, toId, amount);
    await writeLedger(conn, fromId, toId, amount);
}
```

每个函数都多出一个自己并不关心的 `conn`，只为了传给下一个。漏掉一处，那条语句就
静悄悄地跑在事务外面——这是最坏的一类 bug：正常路径看起来一模一样，只有回滚发生时
才暴露出损失。

Keelson 的答案是：连接永远不是参数，它活在调用上下文里。

## 那个机制

`@Transaction()` 开启事务，把连接放进一个 `AsyncLocalStorage` 上下文，覆盖被装饰方法
所 await 的一切，无论嵌套多深。`CommonDAO` 的 `getDBConnection()` 从这个上下文里读。
没有人需要传递任何东西。

```typescript
export class TransferService extends CommonService {
    private get accounts(): AccountRepository {
        return this.getRepositoryInstance<AccountRepository>('AccountRepository');
    }
    private get ledger(): LedgerRepository {
        return this.getRepositoryInstance<LedgerRepository>('LedgerRepository');
    }

    @Transaction()
    async transfer(fromId: string, toId: string, amount: number): Promise<void> {
        const from = await this.accounts.findById(fromId);
        if (from == null || from.balance < amount) {
            throw new IllegalParameterError('余额不足');
        }
        await this.accounts.debit(fromId, amount);
        await this.accounts.credit(toId, amount);
        await this.ledger.record(fromId, toId, amount);
    }
}
```

五次调用、两个 Repository、三张表，一个连接，一个事务。正常返回即提交。抛异常——包括
上面那个同时也是 400 的 `IllegalParameterError`——即回滚。没有会被忘掉的
`try`/`catch`/`rollback`。

## 为什么 Service 不能直接调 DAO

规矩是：Controller → Service → Repository → DAO，每一层只调用紧邻的下一层。

这不是分类学。事务边界在 Service 层，而边界只有在"有且只有一个地方可能是它"时才有
意义。一旦 Service 可以直接调 DAO，"这条语句在不在转账的事务里"这个问题就不能从代码
形状上读出来，只能靠追。

层次划分是从这条规矩里长出来的：

- **DAO** —— 一张表那么多的 SQL。没有业务规则，也不调用别的 DAO。
- **Repository** —— 一个领域概念，需要几个 DAO 就用几个。`Account` 可能横跨
  `accounts` 与 `account_limits` 两张表，Service 不该知道这件事。
- **Service** —— 用例、规则，以及事务边界。

判断这个划分有没有挣回成本，看一个信号：表结构变了，只有 DAO 需要改；规则变了，
只有 Service 需要改。

## 传播行为

嵌套的 `@Transaction()` 会加入已经打开的那个事务，这几乎总是你要的：
`TransferService.transfer()` 调用 `FeeService.charge()`，两者应当是一个原子单元。

有时候恰恰相反。审计记录应当在它所审计的那件事回滚之后依然存在——一次失败的转账，
正是最需要留下记录的。

```typescript
@Transaction(Propagation.REQUIRES_NEW)
async recordAttempt(entry: AuditEntry): Promise<void> {
    await this.auditRepo.insert(entry);
}
```

`REQUIRES_NEW` 会取一个自己的连接，独立提交。调用方的事务回滚了，这一条已经落盘。

用它之前有两件事值得知道。它会从连接池再取一个连接，所以在循环里调用它可能把池耗干。
另外它看不到外层事务尚未提交的数据——这正是它的意义所在，但常让人意外：调用方刚插入的
那行，它读不到。

## 不用装饰器

`@Transaction` 是 `TransactionManager` 的语法糖。当边界不是一整个方法时——比如一个每
一千行提交一次的批处理——直接用它：

```typescript
import { TransactionManager, Propagation } from '@ticatec/keelson-core';

await TransactionManager.execute(Propagation.REQUIRED, async () => {
    await this.repo.doSomething();
    await this.repo.doSomethingElse();
});
```

`execute()` 是静态方法，传播行为要显式传入。它会把连接作为参数交给你的回调，你可以
不理会——下面的一切都从上下文里取，跟用装饰器时完全一样。规则也一样：返回即提交，
抛出即回滚。

第三种传播行为只在这里才有意义：`Propagation.NONE` 会给回调一个连接但不开事务，
用于那些不能待在事务里的语句。

## 读操作不需要事务

单条 `SELECT` 不需要边界。`CommonDAO` 从池里取连接、执行、返回。第 1 章的
`GreetingService.get()` 加装饰器是为了统一，不是必需。

读操作**确实**需要事务的场合是：多次读取必须看到同一个快照——比如一份汇总三张表的
报表，不能让数据在脚下变动。

## 写出不在乎数据库是谁的 SQL

占位符各不相同：PostgreSQL 是 `$1, $2`，MySQL 与达梦是 `?`。写死它，DAO 就焊死在一种
数据库上了。

对固定语句来说，写死通常没问题，别过度设计。对运行时拼出来的 SQL——比如长度不定的
`IN` 列表——问连接要：

```typescript
const conn = await this.getDBConnection();
const placeholders = ids.map((_, i) => conn.getPlaceholder(i + 1)).join(', ');
return await this.listQuery(`SELECT * FROM users WHERE id IN (${placeholders})`, ids);
```

`getPlaceholder(i)` 从 1 开始计数，返回底层驱动想要的那种写法。

另有两件事框架替你抹平了，与驱动无关：列名自动转驼峰；列在 `booleanFields` 里的字段会
被转成真正的布尔值——包括 `'t'`、`'f'`、`'true'`、`'false'`、`'1'`、`'0'` 这些字符串
形式，且不分大小写。这一条在 MySQL 与达梦上尤其重要，它们没有原生布尔类型。

## 什么会回滚，什么不会

事务覆盖的是数据库。它不覆盖你在方法里做的其他任何事——写出去的文件、发出去的邮件、
投递的消息、设置的 Redis 键。回滚之后，这些事依然做过了。

通常的解法是把它们挪到事务提交之后，而不是放在里面：

```typescript
@Transaction()
async placeOrder(order: Order): Promise<string> {
    return await this.orderRepo.insert(order);     // 只碰数据库
}

// 调用方，在任何事务之外
const id = await orderService.placeOrder(order);
await notifier.sendConfirmation(id);               // 只有提交成功才会走到这里
```

---

深入参考：[Service 与 Repository 指南](../docs/prompts/SERVICE_GUIDE_CN.md)（完整的
传播行为与 `TransactionManager`）、[DAO 指南](../docs/prompts/DAO_GUIDE_CN.md)（每个查询
辅助方法）。

下一章：[装配](03-wiring_CN.md) —— 这些类怎么互相找到。
