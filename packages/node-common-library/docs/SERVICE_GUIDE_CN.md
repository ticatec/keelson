# Service 与 Repository 层开发指南

中文 | [English](SERVICE_GUIDE.md)

本指南说明如何使用 `@ticatec/node-common-library` v4 构建与维护 Service 和 Repository。

## 📚 目录

1. [四层架构](#-四层架构)
2. [Repository 层 (`CommonRepository`)](#1-repository-层-commonrepository)
3. [Service 层 (`CommonService`) 与 `@Transaction`](#2-service-层-commonservice-与-transaction)
4. [事务传播行为](#3-事务传播行为)
5. [不使用装饰器的事务](#4-不使用装饰器的事务)
6. [核心规则与保护机制](#-核心规则与保护机制)

---

## 📚 四层架构

为保持职责分离，**Service 不直接引用 DAO**，而是经由 **Repository** 层：

```
┌─────────────────────────────────────────┐
│          Controller / Router            │  HTTP 请求处理
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│            Service 层                   │  业务逻辑与声明式事务（@Transaction）
│  - 继承 CommonService                   │
│  - 通过 getRepositoryInstance<T>(name)  │
│    获取 Repository                      │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│           Repository 层                 │  领域持久化与 DAO 聚合
│  - 继承 CommonRepository                │
│  - 通过 getDAOInstance<T>(name) 获取 DAO │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│             DAO 层                      │  单表访问 / SQL 执行
│  - 继承 CommonDAO                       │
│  - 通过 await this.getDBConnection()    │
│    解析上下文连接                        │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│             数据库                       │  数据存储
└─────────────────────────────────────────┘
```

Service 开启的事务通过 `AsyncLocalStorage` 向下透传，因此整条调用链上的 DAO 语句都运行在同一个连接上，无需任何人把连接作为参数传递。

---

## 1. Repository 层 (`CommonRepository`)

Repository 封装持久化逻辑并聚合多个 DAO 的调用：

```typescript
import { CommonRepository } from '@ticatec/node-common-library';
import type { UserDAO } from '../dao/UserDAO';
import type { ProfileDAO } from '../dao/ProfileDAO';

export interface User {
  id?: string;
  name: string;
  email: string;
  bio?: string;
}

export class UserRepository extends CommonRepository {

  private get userDAO(): UserDAO { return this.getDAOInstance<UserDAO>('UserDAO'); }
  private get profileDAO(): ProfileDAO { return this.getDAOInstance<ProfileDAO>('ProfileDAO'); }

  async findUserWithProfile(id: string): Promise<User | null> {
    const user = await this.userDAO.findById(id);
    if (!user) return null;
    const profile = await this.profileDAO.findByUserId(id);
    return { ...user, bio: profile?.bio };
  }

  async saveUser(user: User): Promise<string> {
    const userId = user.id || this.genID();          // genID() 来自 CommonRepository
    await this.userDAO.create({ ...user, id: userId });
    if (user.bio) {
      await this.profileDAO.saveProfile(userId, user.bio);
    }
    return userId;
  }
}
```

两点需要注意：

- **用 getter 解析 DAO，不要用字段初始化器。** `getDAOInstance()` 在 Bean 未注册时会抛错，而字段初始化器在 Repository 构造时执行 —— 那时该 DAO 的 `beanFactory.register()` 可能还没跑到。用 getter 可以把查找推迟到首次使用。（两种写法拿到的都是惰性代理，没有额外开销。）
- **`genID()` / `genUUID()` 用 Repository 自己的。** `CommonDAO` 上的同名方法也是 `protected`，写 `this.userDAO.genID()` 无法通过编译 —— 直接调用 Repository 的 `this.genID()`。

`CommonRepository` 成员：

| 成员 | 用途 |
| --- | --- |
| `getDAOInstance<T>(name)` | 返回已注册的 DAO 代理；未注册时抛出描述性错误 |
| `genID()` | 32 位无连字符 UUID v7 |
| `genUUID()` | 标准 36 位带连字符 UUID v7 |
| `logger` | 以具体 Repository 类名命名的日志器 |

---

## 2. Service 层 (`CommonService`) 与 `@Transaction`

Service 继承 `CommonService`，通过 `getRepositoryInstance<T>(name)` 访问 Repository，并用 `@Transaction` 声明事务边界。

```typescript
import { CommonService, Transaction, Propagation } from '@ticatec/node-common-library';
import type { UserRepository, User } from '../repository/UserRepository';

export class UserService extends CommonService {

  private get userRepo(): UserRepository {
    return this.getRepositoryInstance<UserRepository>('UserRepository');
  }

  @Transaction()
  async registerUser(user: User): Promise<string> {
    this.logger.info({ email: user.email }, 'Registering user');   // logger 来自 CommonService

    const existing = await this.userRepo.findUserWithProfile(user.id || '');
    if (existing) {
      throw new Error('用户已存在');                                 // 抛出异常即触发回滚
    }

    return await this.userRepo.saveUser(user);
  }

  @Transaction(Propagation.REQUIRES_NEW)
  async logAuditRecord(action: string, payload: any): Promise<void> {
    // 独立事务：即使外层事务回滚，这里依然提交
  }
}
```

> **不要在子类中重新声明 `logger`。** `CommonService` 已经提供了以子类名命名的 `protected readonly logger`，把它重新声明为 `private` 会导致 TypeScript 编译错误。

织入机制：`@Transaction` 只通过 `reflect-metadata` 记录元数据，真正的包装发生在 `CommonService` 构造函数中 —— 它遍历原型链，把每个带注解的方法包进 `TransactionManager.execute(propagation, …)`。由此带来两个结论：

- 用在**不继承** `CommonService` 的类上，装饰器**不会生效**。
- 包装是幂等的 —— 父类已包装过的继承方法不会被二次包装，因此 `REQUIRES_NEW` 只会开启一个事务而不是两个。

`CommonService` 成员：

| 成员 | 用途 |
| --- | --- |
| `getRepositoryInstance<T>(name)` | 返回已注册的 Repository 代理；未注册时抛错 |
| `getDBConnection()` | 返回当前事务的连接 |
| `logger` | 以具体 Service 类名命名的日志器 |

---

## 3. 事务传播行为

| 传播行为 | 说明 |
| --- | --- |
| `REQUIRED`（默认） | 外层存在活动**事务**时加入；否则新开连接并启动事务 |
| `REQUIRES_NEW` | 始终开启独立的连接与事务，并挂起外层上下文 |
| `NONE` | 在全新的非事务连接上执行 —— 语句自动提交 |

`NONE` 会建立上下文以便 DAO 仍能解析到连接，但该上下文**不是**事务性的。因此从 `NONE` 上下文中调用的 `REQUIRED` 方法会真正开启自己的事务，而不是静默复用那条自动提交的连接。

```typescript
@Transaction(Propagation.NONE)
async exportReport(): Promise<Buffer> {
  // 在非事务连接上执行只读工作
  return await this.reportRepo.render();
}
```

无论哪种传播行为，连接都会在正常返回时提交、抛出异常时回滚，并在最后统一关闭。

---

## 4. 不使用装饰器的事务

脚本、定时任务等不便使用装饰器的场景，可以直接调用 `TransactionManager`：

```typescript
import { TransactionManager, Propagation } from '@ticatec/node-common-library';

await TransactionManager.execute(Propagation.REQUIRED, async (conn) => {
  // 正常返回则提交，抛异常则回滚，最终始终关闭
  // 在这里调用的 DAO 解析到的就是这条连接
});

// 在该回调内部的任意位置：
const conn = TransactionManager.getCurrentConnection();   // DBConnection | undefined
```

---

## 🔑 核心规则与保护机制

1. **Bean 注册检查。** `getRepositoryInstance<T>(name)` 与 `getDAOInstance<T>(name)` 会校验 Bean 是否已在 `beanFactory` 中注册，未注册时抛出明确的 `Error`（`Repository/DAO "X" is not registered in BeanFactory...`）。详见 [DEPENDENCY_INJECTION_GUIDE_CN.md](DEPENDENCY_INJECTION_GUIDE_CN.md)。
2. **分层约束。** Service → Repository → DAO。Service 直接调用 DAO 会绕过聚合层，使 Repository 这一层失去意义。
3. **事务从 Service 层开启。** DAO 的便捷方法在事务上下文之外会抛错 —— 这正是防止零散语句跑在无人管理的连接上的机制。
4. **靠抛异常回滚。** 绝不要在 `@Transaction` 方法内部吞掉异常后正常返回，那样会把做了一半的工作提交掉。
5. **先初始化再使用。** `initialize()`（日志）与 `DBManager.init(factory)` 都在应用启动时执行一次，且必须早于任何 Service / Repository / DAO 的构造。
