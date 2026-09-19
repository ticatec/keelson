# 依赖注入与 Bean 管理指南

中文 | [English](DEPENDENCY_INJECTION_GUIDE.md)

本文说明 `@ticatec/keelson-core` v4 中的依赖管理 —— 用 `beanFactory` 完成注册与查找，用 `Beans` 完成延迟模块加载。

## 📚 目录

1. [BeanFactory 惰性单例代理](#beanfactory-惰性单例代理)
2. [注册与获取 Bean](#注册与获取-bean)
3. [使用 `Beans` 延迟注册](#使用-beans-延迟注册)
4. [循环依赖自动解耦](#循环依赖自动解耦)
5. [独立注册表](#独立注册表)
6. [最佳实践](#最佳实践)

---

## BeanFactory 惰性单例代理

本包以默认导出的形式提供单例注册表 `beanFactory`。

`beanFactory.register(name, Class)` **不会**立即实例化；`beanFactory.createBean<T>(name)` 返回一个透明代理，真实实例在首次属性或方法访问时才构造，此后作为单例复用。用同一个名字反复调用 `createBean(name)` 始终返回同一个代理。

```typescript
import { beanFactory } from '@ticatec/keelson-core';
import { UserDAO } from './dao/UserDAO';
import { UserRepository } from './repository/UserRepository';
import { UserService } from './service/UserService';

// 1. 注册构造函数 —— 此时什么都还没构造
beanFactory.register('UserDAO', UserDAO);
beanFactory.register('UserRepository', UserRepository);
beanFactory.register('UserService', UserService);

// 2. 获取惰性单例代理
const userService = beanFactory.createBean<UserService>('UserService');

// 3. 真实的 UserService 在这里、首次访问时才被构造
await userService.registerUser({ name: 'Ada', email: 'ada@example.com' });
```

---

## 注册与获取 Bean

| 方法 | 签名 | 说明 |
| --- | --- | --- |
| `register` | `register(name: string, beanClass: any): void` | 用已存在的名字注册会替换该类，并丢弃已缓存的代理 |
| `createBean` | `createBean<T>(name: string): T \| undefined` | 名字未注册时返回 **`undefined`** |

正因为 `createBean` 会返回 `undefined`，框架基类对它做了封装：

```typescript
// CommonService
protected getRepositoryInstance<T extends object>(name: string): T

// CommonRepository
protected getDAOInstance<T extends object>(name: string): T
```

两者都会抛出描述性错误，而不是把 `undefined` 交还给调用方：

```
Repository "UserRepository" is not registered in BeanFactory.
Please register it via beanFactory.register('UserRepository', Class) before usage.
```

在 Service 与 Repository 内部请优先使用这两个方法；只在组装根（控制器、启动代码、测试）直接调用 `beanFactory.createBean()`，并在那里处理 `undefined`。

---

## 使用 `Beans` 延迟注册

`Beans` 登记异步加载函数，并一次性解析注入 `beanFactory`。适合代码分割构建，以及不希望在启动时 import 全部类的大型应用。

```typescript
import { Beans } from '@ticatec/keelson-core';

const beans = Beans.getInstance();

beans.register('UserDAO', () => import('./dao/UserDAO.js'));
beans.register('UserRepository', () => import('./repository/UserRepository.js'));
beans.register('UserService', () => import('./service/UserService.js'));

// 解析全部加载器，并把各模块的 default 导出注册进 beanFactory
await beans.load();
```

| 方法 | 用途 |
| --- | --- |
| `Beans.getInstance()` | 单例访问入口 |
| `register(name, loader)` | 以名字登记一个 `() => Promise<any>` 加载器 |
| `load()` | 等待全部加载器完成，并把各自的 `default` 导出注册进 `beanFactory` |

> 每个加载器对应的模块必须有 **default 导出** —— 被注册的正是它。

---

## 循环依赖自动解耦

由于构造被推迟到首次使用，跨模块边界的循环引用（`import` / `require`）不会再在加载阶段抛出 `ReferenceError: Cannot access 'X' before initialization`。相互引用的 A 与 B 可以正常注册 —— 在真正调用代理上的方法之前，两者都不会被构造。

如果在**构造过程中**出现真实环路 —— A 的构造函数用到 B，而 B 的构造函数又用到 A —— 工厂会检测并报出完整链路：

```
Error: Circular dependency detected: UserService -> AuditService -> UserService
```

这是代理无法掩盖的设计问题。解法是把依赖移出构造函数，改为在 getter 中惰性解析：

```typescript
export class UserService extends CommonService {
  // 使用时才解析，而非构造时
  private get auditService(): AuditService {
    return this.getRepositoryInstance<AuditService>('AuditService');
  }
}
```

---

## 独立注册表

`beanFactory` 是共享单例，但 `BeanFactory` 类同样被导出 —— 当测试需要自己的注册表而不想污染全局状态时很有用：

```typescript
import { BeanFactory } from '@ticatec/keelson-core';

const registry = new BeanFactory();
registry.register('UserDAO', FakeUserDAO);
const dao = registry.createBean<UserDAO>('UserDAO');
```

> **4.0.0 变更。** `BeanFactory` 导出此前指向的是单例实例（与 `beanFactory` 是同一个对象），因此 `new BeanFactory()` 根本无法使用。现在它是类本身。

---

## 最佳实践

- 在应用启动时完成全部 Bean 注册，早于第一个请求被处理。
- Bean 名称使用统一的命名约定 —— 用类名最自然，错误信息里回显的也正是这个名字。
- Bean 保持无状态。它们是跨请求共享的单例；请求级状态应放在方法参数或事务上下文中。
- 用 getter 而非字段初始化器解析依赖，把查找推迟到首次使用，这样注册顺序就不再重要。
- 测试中优先 `new BeanFactory()` 新建注册表，而不是往全局单例上反复注册。
