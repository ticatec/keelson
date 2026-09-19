# 3. 装配

中文 | [English](03-wiring.md) · [教程目录](README_CN.md)

Service 需要 Repository，Repository 需要 DAO。用 `new` 写，这就变成一个你必须一次做对
并且一直保持对的初始化顺序。Keelson 的答案是：一个按名字索引的注册表，加上一个把构造
推迟到首次使用的代理。

## 先注册，再按名字取

```typescript
import { beanFactory } from '@ticatec/keelson-core';

beanFactory.register('UserDAO', UserDAO);
beanFactory.register('UserRepository', UserRepository);
beanFactory.register('UserService', UserService);
```

`register()` 只是把类存起来，不调用构造函数——这里什么都没有被实例化，所以这三行的
先后顺序无关紧要。

取回来：

```typescript
const service = beanFactory.createBean<UserService>('UserService');
```

拿到的是一个 `Proxy`。真正的 `UserService` 在你第一次访问属性或调用方法时才构造，
之后一直缓存。用同一个名字再调 `createBean`，拿到的是同一个代理，背后是同一个实例。

这就是顺序问题消失的原因。`UserService` 的构造函数可以引用 `UserRepository`，后者引用
`UserDAO`，而它们谁都不会被构造，直到真的有请求打进来——那时候一切早已注册完毕。

## 层内部用带类型的访问器

`beanFactory.createBean()` 是从外部进入的入口——你的启动代码、路由类。在层的内部，
用基类给你的访问器：

```typescript
export class UserService extends CommonService {
    private get userRepo(): UserRepository {
        return this.getRepositoryInstance<UserRepository>('UserRepository');
    }
}

export class UserRepository extends CommonRepository {
    private get userDAO(): UserDAO {
        return this.getDAOInstance<UserDAO>('UserDAO');
    }
}
```

两者有一处关键差别。`createBean<T>()` 返回 `T | undefined`——名字没注册过时是
undefined——所以 `strict` 会逼你处理，通常是一个 `!`。而
`getRepositoryInstance()` 与 `getDAOInstance()` 返回 `T`，名字不存在时**直接抛错**，
消息里点名是哪个 bean，并告诉你去注册。

这种不对称是刻意的：请求深处少了一个 bean 是编程错误，你要的是它当场、大声地失败，
而不是一个 `undefined` 再往下走三层才变成
`Cannot read properties of undefined`。

## 为什么用 getter 而不是字段

注意上面的访问器是 getter，不是在构造函数里赋值的字段：

```typescript
// 这样写
private get userRepo(): UserRepository {
    return this.getRepositoryInstance<UserRepository>('UserRepository');
}

// 不要这样
private userRepo = this.getRepositoryInstance<UserRepository>('UserRepository');
```

字段初始化器在构造期间执行。而构造本身是首次使用时才发生的，所以字段会在那一刻解析
依赖——通常没问题，但把两个生命周期绑在了一起，没有换来任何好处。getter 每次访问都
解析一遍，代价是一次 map 查找，因为代理本身是缓存的。

## 循环依赖

`UserService` 用到 `AccountService`，后者又用到 `UserService`。用 `new` 写，这是栈溢出。
用懒加载代理，这没问题——只要两边的**构造函数**都不去用对方。

```typescript
// 没问题：各自只在方法真正运行时才解析对方
class UserService extends CommonService {
    private get accounts(): AccountService {
        return beanFactory.createBean<AccountService>('AccountService')!;
    }
}
```

不行的是在构造函数里调用对方。工厂会检测到并抛出把链条写清楚的错误：

```
Circular dependency detected: UserService -> AccountService -> UserService
```

这条消息在告诉你：某个构造函数在做它不该做的事。把它挪进方法里。

## bean 很多的时候

在 `beforeStart()` 里一个个列出来会很长，而且每一个都对应入口文件顶部的一条 import——
这意味着无论进程用不用得上，所有类都会在启动时被加载。`Beans` 注册的是**加载器**：

```typescript
import { Beans } from '@ticatec/keelson-core';

protected async beforeStart(): Promise<void> {
    DBManager.init(initializePg(AppConf.getInstance()!.get('database')));

    const beans = Beans.getInstance();
    beans.register('UserDAO', () => import('./dao/UserDAO.js'));
    beans.register('UserRepository', () => import('./repository/UserRepository.js'));
    beans.register('UserService', () => import('./service/UserService.js'));

    await beans.load();
}
```

每个加载器是一个动态 import，对应模块的**默认导出**就是那个类。`load()` 遍历它们，
逐个 import 并把类以该名字交给 `beanFactory`。之后的一切与前面完全一样。

这还能打破模块层面的循环引用——那是懒加载代理帮不上忙的地方：两个模块在顶部互相 import，
问题在你的任何代码运行之前就已经发生了。

## 注册该写在哪

永远写在 `beforeStart()` 里。它在配置加载之后、Express 应用创建之前运行，正是数据库
已经就绪而请求还不可能到达的那个窗口。

写在 `setupRoutes()` 里也能跑通，但那是碰巧——路由绑定确实发生在开始监听之前。
只是这样一来注册就排在 `addHealthCheck()` 之后了，某个要解析 bean 的健康检查项会
发现它还不存在。

## 一个进程一份注册表

`beanFactory` 是单例，而在一个同时发布 CommonJS 与 ESM 的包里，单例是个陷阱：
两种模块格式，两份模块级变量，两个注册表。从一边注册、从另一边解析，bean 就是不存在。

Keelson 把它以 `Symbol.for()` 为键锚定在 `globalThis` 上，两份产物共用一份注册表。
这件事你不需要做任何处理——知道它，只是为了解释 `beanFactory` 为什么不是一个简单的
导出常量。

## bean 找不到的时候

```
Repository "UserRepository" is not registered in BeanFactory.
Please register it via beanFactory.register('UserRepository', Class) before usage.
```

按可能性排序的三个常见原因：注册用的名字和查找用的名字拼得不一样——它们是字符串，
没有任何东西会替你核对；注册写在了错误的生命周期方法里；或者 `Beans` 的加载器指向的
模块没有 `default` 导出。

## bean 不要带状态

一个 bean 是整个进程里所有请求共用的那一个实例。构造函数之外任何写到 `this` 上的东西，
下一个请求都看得见；压力一上来，就是两个请求在写同一个字段。每请求的状态靠参数传递，
或者放在事务上下文里——绝不要放在 service 上。

## 自己的一份注册表

`BeanFactory` 除了单例之外也作为类导出，所以 `new BeanFactory()` 能给你一份别人看不到的
私有注册表。

它的用处比听上去窄。`CommonService.getRepositoryInstance()` 与
`CommonRepository.getDAOInstance()` 读的是模块级单例，不接受注册表参数，所以一个要跑
service 或 repository 的测试，无论如何都得注册到全局的 `beanFactory` 上。私有实例只对
直接调用注册表的代码有意义。

---

下一章：[HTTP 层](04-http-layer_CN.md) —— 路由、控制器、校验与错误。
