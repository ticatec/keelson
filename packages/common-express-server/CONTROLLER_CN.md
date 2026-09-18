# Controller 使用指南

[English](./CONTROLLER.md) | 中文

本指南解释如何使用 `@ticatec/common-express-server` 提供的控制器类来构建你的 API 端点。

## 目录

- [控制器层次结构](#控制器层次结构)
- [BaseController](#basecontroller)
- [CommonController](#commoncontroller)
- [CommonSearchController](#commonsearchcontroller)
- [完整示例](#完整示例)
- [最佳实践](#最佳实践)
- [调试模式](#调试模式)
- [总结](#总结)

## 控制器层次结构

```
BaseController<T>
    ↓
CommonController<T>
    ↓
CommonSearchController<T>
```

- **`BaseController<T>`**: 基础类，提供日志记录器注入、请求用户上下文解析（`getLoggedUser`）以及用户扮演（`actAs`）支持。
- **`CommonController<T>`**: 继承自 `BaseController`，提供 CRUD 操作（`createNew`、`update`、`del`）、数据校验集成，以及可配置的服务方法参数映射（默认传递 `[loggedUser, req.body]`）。
- **`CommonSearchController<T>`**: 继承自 `CommonController`，提供内置的 `search()` 方法，自动将 `[loggedUser, req.query]` 传递给 `service.search`。

---

## BaseController

所有控制器的基础类。提供基础功能，包括日志记录和用户上下文管理。

### 特性

- **日志记录**: 自动注入基于 Pino 的日志记录器实例（通过 `@ticatec/logger-wrapper`）
- **用户上下文**: 通过 `this.getLoggedUser(req)` 访问当前登录用户
- **用户扮演**: 自动支持 `actAs` 用户扮演机制

### 基本用法

```typescript
import BaseController from '@ticatec/common-express-server/common/BaseController';
import { Request } from 'express';

interface UserService {
    someMethod(user: any): Promise<any>;
}

class MyController extends BaseController<UserService> {
    constructor(service: UserService) {
        super(service);
    }

    async myEndpoint(req: Request) {
        const user = this.getLoggedUser(req);
        return await this.service.someMethod(user);
    }
}
```

### 核心方法

#### `getLoggedUser(req: Request): RegisteredUser`

返回当前登录用户。如果处于用户扮演状态（`actAs`），则返回被扮演的用户对象。返回类型会自动推导为 `RegisteredUser`。

```typescript
const user = this.getLoggedUser(req);
console.log(user.accountCode);  // 用户账号
console.log(user.name);         // 用户姓名
console.log(user.tenant);       // 租户信息（如适用）
```

#### 服务器级自定义用户模型 (`CustomUserRegistry`)

框架支持通过 TypeScript 声明合并（Declaration Merging）在服务器级别绑定自定义的 `AppUser` 模型：

```typescript
// src/types/user-registry.d.ts
import { LoggedUser } from '@ticatec/common-express-server';

export interface AppUser extends LoggedUser {
    userId: string;
}

declare module '@ticatec/common-express-server' {
    interface CustomUserRegistry {
        user: AppUser;
    }
}
```

绑定后，所有继承自 `BaseController`、`CommonController`、`CommonSearchController` 等基类的控制器中，`this.getLoggedUser(req)` 及自动透传至服务层的第一个用户参数，均会**自动享受 `AppUser` 的强类型推导**，无需在每个控制器上编写冗余泛型！

---

## CommonController

继承自 `BaseController`，提供 CRUD 操作、自定义服务调用参数以及自动数据校验支持。

### 特性

- **自动校验**: 使用 `@ticatec/bean-validator` 进行内置校验，通过 `getRules()`、`getCreateRules()` 或 `getUpdateRules()` 声明
- **CRUD 操作**: 提供 `createNew()`、`update()`、`del()` 方法，返回标准 Express restful 处理器
- **默认入参传递**: 默认自动向服务层方法传递 `[loggedUser, req.body]`
- **灵活定制入参**: 可轻松覆写入参构建方法以适应平台管理员/与租户无关的业务场景
- **服务接口检查**: 调用前自动校验服务层是否存在对应方法（缺失则抛出 `ActionNotFoundError`）
- **请求数据构建**: 通过 `buildNewEntry()` 和 `buildUpdatedEntry()` 自定义请求数据提取与预处理

### 用法（租户 / 标准模式）

默认情况下，`CommonController` 会将登录用户作为第一个参数传递给 `createNew` 和 `update` 服务接口：

```typescript
import CommonController from '@ticatec/common-express-server/common/CommonController';
import { ValidationRules, StringValidator, NumberValidator } from '@ticatec/bean-validator';
import { Request } from 'express';

interface ProductService {
    createNew(user: any, data: any): Promise<any>;
    update(user: any, data: any): Promise<any>;
    del(id: string): Promise<any>;
}

const productRules: ValidationRules = [
    new StringValidator('name', { required: true, minLen: 2, maxLen: 50 }),
    new NumberValidator('price', { required: true, minValue: 0 })
];

class ProductController extends CommonController<ProductService> {
    constructor(service: ProductService) {
        super(service);
    }

    // 配置校验规则
    protected getRules(): ValidationRules {
        return productRules;
    }
}

// 在路由中使用
const productController = new ProductController(productService);

// POST /products - 创建产品（调用 service.createNew(user, body)）
router.post('/products', productController.createNew());

// PUT /products/:id - 更新产品（调用 service.update(user, body)）
router.put('/products/:id', productController.update());

// DELETE /products/:id - 删除产品（调用 service.del(id)）
router.delete('/products/:id', productController.del());
```

### 用法（平台管理员 / 与租户无关模式）

对于平台级或管理员操作，服务方法无需 `user` 参数（例如 `createNew(data)`）：

```typescript
interface SystemConfigService {
    createNew(config: any): Promise<any>;
    update(config: any): Promise<any>;
    del(id: string): Promise<any>;
}

class SystemConfigController extends CommonController<SystemConfigService> {
    constructor(service: SystemConfigService) {
        super(service);
    }

    protected getRules(): ValidationRules {
        return configRules;
    }

    // 覆写入参构建方法以省略 user 参数
    protected getCreateNewArguments(req: Request): Array<any> {
        return [req.body];
    }

    protected getUpdateArguments(req: Request): Array<any> {
        return [req.body];
    }
}
```

### 自定义校验规则

你可以为创建与更新操作分别提供不同的校验规则：

```typescript
class UserController extends CommonController<UserService> {
    // 默认回退校验规则
    protected getRules(): ValidationRules {
        return baseRules;
    }

    // 专门针对 createNew 的校验规则
    protected getCreateRules(): ValidationRules {
        return createRules;
    }

    // 专门针对 update 的校验规则
    protected getUpdateRules(): ValidationRules {
        return updateRules;
    }
}
```

### 自定义数据构建

覆写 `buildNewEntry()` 和 `buildUpdatedEntry()`，在校验和服务调用前丰富或转换数据：

```typescript
class ProductController extends CommonController<ProductService> {
    protected buildNewEntry(req: Request): any {
        return {
            ...req.body,
            createdAt: new Date().toISOString()
        };
    }

    protected buildUpdatedEntry(req: Request): any {
        return {
            ...req.body,
            updatedAt: new Date().toISOString()
        };
    }
}
```

### 受保护方法

#### `getRules(): ValidationRules`
返回实体操作的默认验证规则（默认为 `null`）。

#### `getCreateRules(): ValidationRules`
返回创建操作的验证规则（默认为 `getRules()`）。

#### `getUpdateRules(): ValidationRules`
返回更新操作的验证规则（默认为 `getRules()`）。

#### `getCreateNewArguments(req: Request): Array<any>`
返回传递给 `service.createNew` 的参数数组，默认为 `[this.getLoggedUser(req), req.body]`。

#### `getUpdateArguments(req: Request): Array<any>`
返回传递给 `service.update` 的参数数组，默认为 `[this.getLoggedUser(req), req.body]`。

#### `checkInterface(name: string): void`
检查注入的服务是否包含指定名称的方法。如果不存在则抛出 `ActionNotFoundError`。

#### `invokeServiceInterface(name: string, args: Array<any>): Promise<any>`
使用给定的参数数组调用指定的服务方法。

---

## CommonSearchController

继承自 `CommonController`，开箱即用提供搜索能力。

### 特性

- **内置搜索动作**: 提供 `search()` 方法返回 Express 处理器
- **查询与用户透传**: 自动将 `[this.getLoggedUser(req), req.query]` 传递给 `service.search(...)`
- **继承完整 CRUD**: 完整保留 `CommonController` 的所有 CRUD 及校验能力

### 用法

```typescript
import CommonSearchController from '@ticatec/common-express-server/common/CommonSearchController';
import { Request } from 'express';

interface OrderService {
    createNew(user: any, data: any): Promise<any>;
    update(user: any, data: any): Promise<any>;
    del(id: string): Promise<any>;
    search(user: any, query: any): Promise<any>;
}

class OrderController extends CommonSearchController<OrderService> {
    constructor(service: OrderService) {
        super(service);
    }

    protected getRules() {
        return orderValidationRules;
    }
}

// 在路由中使用
const orderController = new OrderController(orderService);

// GET /orders?status=active&page=1 - 调用 orderService.search(user, req.query)
router.get('/orders', orderController.search());

// POST /orders - 调用 orderService.createNew(user, req.body)
router.post('/orders', orderController.createNew());
```

---

## 完整示例

### 示例 1: 多租户业务模块

```typescript
// 服务层接口
interface ProductService {
    createNew(user: any, data: any): Promise<any>;
    update(user: any, data: any): Promise<any>;
    del(id: string): Promise<any>;
    search(user: any, query: any): Promise<any>;
}

// 控制器
import CommonSearchController from '@ticatec/common-express-server/common/CommonSearchController';
import { ValidationRules, StringValidator, NumberValidator } from '@ticatec/bean-validator';

const productRules: ValidationRules = [
    new StringValidator('name', { required: true, minLen: 2, maxLen: 100 }),
    new NumberValidator('price', { required: true, minValue: 0 })
];

class ProductController extends CommonSearchController<ProductService> {
    constructor(service: ProductService) {
        super(service);
    }

    protected getRules(): ValidationRules {
        return productRules;
    }
}

// 路由
import { CommonRoutes } from '@ticatec/common-express-server';

class ProductRoutes extends CommonRoutes {
    private productController = new ProductController(productService);

    protected bindRoutes() {
        // 搜索产品
        this.get('/products', this.helper.invokeRestfulAction(
            this.productController.search()
        ));

        // 创建产品
        this.post('/products', this.helper.invokeRestfulAction(
            this.productController.createNew()
        ));

        // 更新产品
        this.put('/products/:id', this.helper.invokeRestfulAction(
            this.productController.update()
        ));

        // 删除产品
        this.delete('/products/:id', this.helper.invokeRestfulAction(
            this.productController.del()
        ));
    }
}
```

### 示例 2: 平台管理后台（与租户无关）

```typescript
// 服务层接口
interface SystemUserService {
    createNew(data: any): Promise<any>;
    update(data: any): Promise<any>;
    del(id: string): Promise<any>;
    search(query: any): Promise<any>;
}

// 控制器
import CommonController from '@ticatec/common-express-server/common/CommonController';
import { ValidationRules, StringValidator } from '@ticatec/bean-validator';
import { Request } from 'express';

const systemUserRules: ValidationRules = [
    new StringValidator('username', { required: true, minLen: 3 }),
    new StringValidator('role', { required: true })
];

class SystemUserController extends CommonController<SystemUserService> {
    constructor(service: SystemUserService) {
        super(service);
    }

    protected getRules(): ValidationRules {
        return systemUserRules;
    }

    // 仅向服务层方法传递 req.body，不传递 user
    protected getCreateNewArguments(req: Request): Array<any> {
        return [req.body];
    }

    protected getUpdateArguments(req: Request): Array<any> {
        return [req.body];
    }

    // 自定义平台级无租户搜索
    search() {
        return async (req: Request) => {
            this.checkInterface('search');
            return await this.invokeServiceInterface('search', [req.query]);
        };
    }
}

// 路由
import { CommonRoutes } from '@ticatec/common-express-server';

class AdminUserRoutes extends CommonRoutes {
    private userController = new SystemUserController(systemUserService);

    protected bindRoutes() {
        this.get('/admin/users', this.helper.invokeRestfulAction(
            this.userController.search()
        ));

        this.post('/admin/users', this.helper.invokeRestfulAction(
            this.userController.createNew()
        ));

        this.get('/admin/users', this.helper.invokeRestfulAction(
            this.searchController.buildQuery()
        ));
    }
}
```

## 最佳实践

### 1. 选择正确的控制器基类

| 业务场景 | 控制器基类 | 说明 |
|----------|------------|------|
| 无需服务注入或纯自定义端点 | `BaseController` | 仅需要基础日志与用户上下文提取 |
| 标准实体 CRUD 业务管理 | `CommonController` | 提供内置数据校验与 CRUD 动作 |
| 带有搜索功能的实体管理 | `CommonSearchController` | 在完整 CRUD 基础上提供 `search()` 动作 |

### 2. 声明校验规则

建议始终通过覆写 `getRules()` 声明数据校验规则：

```typescript
protected getRules(): ValidationRules {
    return [
        new StringValidator('name', { required: true, minLen: 2, maxLen: 100 }),
        new NumberValidator('price', { required: true, minValue: 0 }),
        new StringValidator('email', {
            required: true,
            format: { regex: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ }
        })
    ];
}
```

### 3. 错误处理

控制器会自动抛出框架统一捕获的标准异常：
- `IllegalParameterError` - 数据校验未通过
- `ActionNotFoundError` - 服务层未实现对应方法
- `UnauthenticatedError` - 用户未登录

---

## 调试模式

在开发过程中开启控制器的详细调试日志：

```typescript
import { Controller } from '@ticatec/common-express-server';

Controller.debugEnabled = true;
```

开启后，控制台将输出数据校验细节、入参构造及服务层调用的详细日志。

---

## 总结

- **`BaseController`**: 日志记录、用户提取与用户扮演的基础类。
- **`CommonController`**: 带有校验能力的统一 CRUD 控制器，默认向服务层透传 `[loggedUser, req.body]`，并支持针对平台管理员场景进行入参定制。
- **`CommonSearchController`**: 开箱即用的搜索控制器，自动向 `service.search` 传递 `[loggedUser, req.query]`。

---

更多信息请参阅 [主 README](./README_CN.md)。