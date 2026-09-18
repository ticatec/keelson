# Controller Guide

[中文](./CONTROLLER_CN.md) | English

This guide explains how to use the controller classes provided by `@ticatec/common-express-server` to build your API endpoints.

## Table of Contents

- [Controller Hierarchy](#controller-hierarchy)
- [BaseController](#basecontroller)
- [CommonController](#commoncontroller)
- [CommonSearchController](#commonsearchcontroller)
- [Complete Examples](#complete-examples)
- [Best Practices](#best-practices)
- [Debug Mode](#debug-mode)
- [Summary](#summary)

## Controller Hierarchy

```
BaseController<T>
    ↓
CommonController<T>
    ↓
CommonSearchController<T>
```

- **`BaseController<T>`**: The foundation class providing logger injection, request user context parsing (`getLoggedUser`), and user impersonation support.
- **`CommonController<T>`**: Extends `BaseController` with CRUD operations (`createNew`, `update`, `del`), automatic validation integration, and configurable service method argument mapping (defaults to passing `[loggedUser, req.body]`).
- **`CommonSearchController<T>`**: Extends `CommonController` with a built-in `search()` method that passes `[loggedUser, req.query]` to `service.search`.

---

## BaseController

The foundation of all controllers. Provides basic functionality including logging and user context management.

### Features

- **Logging**: Automatic logger instance with Pino (via `@ticatec/logger-wrapper`)
- **User Context**: Access to the currently logged user via `this.getLoggedUser(req)`
- **User Impersonation**: Automatic support for `actAs` user impersonation

### Basic Usage

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
        // Get current logged user (handles actAs automatically)
        const user = this.getLoggedUser(req);

        // Access the injected service
        return await this.service.someMethod(user);
    }
}
```

### Key Methods

#### `getLoggedUser(req: Request): RegisteredUser`

Returns the current logged user. If user impersonation is active (`actAs`), returns the impersonated user. The return type automatically resolves to `RegisteredUser`.

```typescript
const user = this.getLoggedUser(req);
console.log(user.accountCode);  // User's account code
console.log(user.name);         // User's name
console.log(user.tenant);       // Tenant info (if applicable)
```

#### Server-Wide Custom User Model (`CustomUserRegistry`)

The framework supports binding an application-specific `AppUser` model at the server level via TypeScript declaration merging:

```typescript
// src/types/user-registry.d.ts
import { LoggedUser } from '@ticatec/common-express-server';

export interface AppUser extends LoggedUser {
    userId: string;
    roles: string[];
    permissions: string[];
}

declare module '@ticatec/common-express-server' {
    interface CustomUserRegistry {
        user: AppUser;
    }
}
```

Once registered, `this.getLoggedUser(req)` and user parameters passed to service methods in all controllers (`BaseController`, `CommonController`, `CommonSearchController`, etc.) will **automatically infer as `AppUser`** without needing generics on every controller!

---

## CommonController

Extends `BaseController` with CRUD operations, customizable service invocation arguments, and automatic validation support.

### Features

- **Automatic Validation**: Built-in validation using `@ticatec/bean-validator` via `getRules()`, `getCreateRules()`, or `getUpdateRules()`
- **CRUD Operations**: `createNew()`, `update()`, `del()` methods returning standard Express restful handlers
- **Default Service Arguments**: Defaults to forwarding `[loggedUser, req.body]` to service methods
- **Customizable Arguments**: Easily override argument builders for tenant-agnostic/admin operations
- **Service Interface Check**: Validates service methods before invocation
- **Request Data Building**: Customizable data extraction from requests via `buildNewEntry()` and `buildUpdatedEntry()`

### Usage (Tenant / Standard Model)

By default, `CommonController` passes the logged user as the first parameter to `createNew` and `update` service interfaces:

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

    // Configure validation rules
    protected getRules(): ValidationRules {
        return productRules;
    }
}

// In your routes
const productController = new ProductController(productService);

// POST /products - Create product (calls service.createNew(user, body))
router.post('/products', productController.createNew());

// PUT /products/:id - Update product (calls service.update(user, body))
router.put('/products/:id', productController.update());

// DELETE /products/:id - Delete product (calls service.del(id))
router.delete('/products/:id', productController.del());
```

### Usage (Platform Admin / Tenant-Agnostic Model)

For platform-level or admin operations where the service method does not require a `user` parameter (e.g. `createNew(data)`):

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

    // Override argument builders to omit the user parameter
    protected getCreateNewArguments(req: Request): Array<any> {
        return [req.body];
    }

    protected getUpdateArguments(req: Request): Array<any> {
        return [req.body];
    }
}
```

### Customizing Validation Rules

You can provide distinct validation rules for create vs update operations:

```typescript
class UserController extends CommonController<UserService> {
    // Shared fallback rules
    protected getRules(): ValidationRules {
        return baseRules;
    }

    // Rules specifically for createNew
    protected getCreateRules(): ValidationRules {
        return createRules;
    }

    // Rules specifically for update
    protected getUpdateRules(): ValidationRules {
        return updateRules;
    }
}
```

### Customizing Data Building

Override `buildNewEntry()` and `buildUpdatedEntry()` to enrich data before validation and service invocation:

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

### Protected Methods

#### `getRules(): ValidationRules`
Returns default validation rules for entity operations (defaults to `null`).

#### `getCreateRules(): ValidationRules`
Returns validation rules for creation (defaults to `getRules()`).

#### `getUpdateRules(): ValidationRules`
Returns validation rules for update (defaults to `getRules()`).

#### `getCreateNewArguments(req: Request): Array<any>`
Returns arguments passed to `service.createNew`. Defaults to `[this.getLoggedUser(req), req.body]`.

#### `getUpdateArguments(req: Request): Array<any>`
Returns arguments passed to `service.update`. Defaults to `[this.getLoggedUser(req), req.body]`.

#### `checkInterface(name: string): void`
Checks if the injected service has a method named `name`. Throws `ActionNotFoundError` if not found.

#### `invokeServiceInterface(name: string, args: Array<any>): Promise<any>`
Invokes a service method by name with the given arguments array.

---

## CommonSearchController

Extends `CommonController` with search capabilities out of the box.

### Features

- **Search Action**: Built-in `search()` method returning an Express handler
- **Query & User Propagation**: Passes `[this.getLoggedUser(req), req.query]` directly to `service.search(...)`
- **Inherited CRUD**: Retains full CRUD and validation capabilities from `CommonController`

### Usage

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

// In your routes
const orderController = new OrderController(orderService);

// GET /orders?status=active&page=1 - Calls orderService.search(user, req.query)
router.get('/orders', orderController.search());

// POST /orders - Calls orderService.createNew(user, req.body)
router.post('/orders', orderController.createNew());
```

---

## Complete Examples

### Example 1: Multi-Tenant Business Module

```typescript
// Services
interface ProductService {
    createNew(user: any, data: any): Promise<any>;
    update(user: any, data: any): Promise<any>;
    del(id: string): Promise<any>;
    search(user: any, query: any): Promise<any>;
}

// Controllers
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

// Routes
import { CommonRoutes } from '@ticatec/common-express-server';

class ProductRoutes extends CommonRoutes {
    private productController = new ProductController(productService);

    protected bindRoutes() {
        // Search products
        this.get('/products', this.helper.invokeRestfulAction(
            this.productController.search()
        ));

        // Create product
        this.post('/products', this.helper.invokeRestfulAction(
            this.productController.createNew()
        ));

        // Update product
        this.put('/products/:id', this.helper.invokeRestfulAction(
            this.productController.update()
        ));

        // Delete product
        this.delete('/products/:id', this.helper.invokeRestfulAction(
            this.productController.del()
        ));
    }
}
```

### Example 2: Platform Admin Panel (Tenant-Agnostic)

```typescript
// Service
interface SystemUserService {
    createNew(data: any): Promise<any>;
    update(data: any): Promise<any>;
    del(id: string): Promise<any>;
    search(query: any): Promise<any>;
}

// Controllers
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

    // Pass only body to service methods without user context
    protected getCreateNewArguments(req: Request): Array<any> {
        return [req.body];
    }

    protected getUpdateArguments(req: Request): Array<any> {
        return [req.body];
    }

    // Custom search action for admin without tenant/user scoping
    search() {
        return async (req: Request) => {
            this.checkInterface('search');
            return await this.invokeServiceInterface('search', [req.query]);
        };
    }
}

// Routes
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

        this.put('/admin/users/:id', this.helper.invokeRestfulAction(
            this.userController.update()
        ));

        this.delete('/admin/users/:id', this.helper.invokeRestfulAction(
            this.userController.del()
        ));
    }
}
```

---

## Best Practices

### 1. Choose the Right Controller

| Scenario | Controller Base Class | Notes |
|----------|-----------------------|-------|
| Non-service or custom endpoints | `BaseController` | Simple endpoints with logging & user context |
| Standard CRUD entity management | `CommonController` | Provides built-in validation & CRUD actions |
| Entity management with search | `CommonSearchController` | Provides `search()` alongside full CRUD |

### 2. Validation Rules

Always declare validation rules by overriding `getRules()`:

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

### 3. Error Handling

Controllers automatically throw standard exceptions mapped by the framework:
- `IllegalParameterError` - Data validation failures
- `ActionNotFoundError` - Missing service methods
- `UnauthenticatedError` - User not logged in

---

## Debug Mode

Enable debug logging for controllers during development:

```typescript
import { Controller } from '@ticatec/common-express-server';

Controller.debugEnabled = true;
```

This logs detailed debug information for data validation, entity construction, and service invocations.

---

## Summary

- **`BaseController`**: Foundation for logging, user retrieval, and user impersonation.
- **`CommonController`**: Complete CRUD workflow with validation. Defaults to `[loggedUser, req.body]` service parameters and can be customized easily for platform admin use cases.
- **`CommonSearchController`**: Ready-to-use search controller passing `[loggedUser, req.query]` to `service.search`.

---

For more information, see the [main README](./README.md).