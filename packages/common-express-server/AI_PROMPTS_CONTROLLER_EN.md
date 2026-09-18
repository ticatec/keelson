# AI Programming Prompts: Controller Usage Guide

This document provides detailed prompts for AI-assisted programming to help developers understand and use the Controller class hierarchy from the `@ticatec/common-express-server` framework.

---

## 🏛️ Four-Tier Architecture Overview

When developing applications or writing code with AI assistance, strictly adhere to the following **Four-Tier Architecture**:

1. **Web Layer (`routes` + `controller`)**:
   - **Routes** (`CommonRoutes` / `AuthenticatedRoutes`): Handles HTTP route binding, header validation, middleware registration, and authentication (`isValidUser`).
   - **Controller** (`Controller`, `BaseController`, `CommonController`, `CommonSearchController`, etc.): Parses Web requests, validates input DTOs, extracts logged-in context via `this.getLoggedUser(req)`, and delegates calls to the **Service Layer**. The Web layer **must not** execute raw database queries or complex domain logic directly.
2. **Service Layer (`service`)**:
   - Handles core business rules, domain validation, state transitions, and transaction management.
   - Interacts with the **Repository Layer** for domain entity retrieval and persistence.
3. **Repository Layer (`repository`)**:
   - Encapsulates data access abstractions, masking database-specific details.
   - Assembles POs/DTOs and domain models by orchestrating one or multiple **DAO Layers**.
4. **DAO Layer (`dao`)**:
   - Executes low-level database operations, raw SQL queries, or ORM calls (e.g. using `@ticatec/pg-common-library` or DB drivers).

---

## Prompt 0: Register Server-Wide Custom User Model via CustomUserRegistry

```
Please help me register a server-wide custom user model for @ticatec/common-express-server in my TypeScript project. Requirements:

1. Create file src/types/user-registry.d.ts
2. Define interface AppUser extending LoggedUser with properties:
   - userId: string
   - roles: string[]
   - permissions: string[]
   - departmentId: string
3. Use declare module '@ticatec/common-express-server' for TypeScript declaration merging
4. Register user: AppUser inside CustomUserRegistry

Generate complete code and explain how this.getLoggedUser(req) across all controllers (e.g. CommonController) will automatically infer as AppUser.
```

---

## Prompt 1: Create Basic Controller with Controller (No Service Injection)

```
Please help me create a controller class that extends Controller. This controller does not need service injection. Requirements:

1. Class name: HealthController
2. This controller is for health checks and system status queries, no service layer needed
3. Controller should implement these methods:
   - checkHealth() - Health check, return system status
   - getVersion() - Get application version info
   - getSystemInfo() - Get basic system information
4. Each method should:
   - Use this.getLoggedUser(req) to get current user (if available)
   - Use this.logger for operation logging
   - Return RestfulFunction type function
   - Include appropriate error handling
5. Add type definitions and JSDoc comments

Please generate complete controller code, note:
- No constructor parameters needed (no service injection)
- Can directly access this.logger and this.getLoggedUser()
- Return simple data objects or status information
```

---

## Prompt 2: Create Basic Controller with BaseController (With Service Injection)

```
Please help me create a controller class that extends BaseController. Requirements:

1. Class name: NotificationController
2. Service interface:
```typescript
interface NotificationService {
    sendNotification(user: any, message: string, type: string): Promise<any>;
    getNotifications(user: any, unreadOnly: boolean): Promise<any[]>;
    markAsRead(user: any, notificationId: string): Promise<void>;
}
```
3. Controller should implement these methods:
   - send() - Send notification
   - getNotifications() - Get notification list
   - markAsRead() - Mark notification as read
4. Each method should:
   - Use this.getLoggedUser(req) to get current user
   - Call corresponding service method
   - Return RestfulFunction type function
   - Include appropriate error handling and logging
5. Add type definitions and JSDoc comments

Please generate complete controller code including service interface definition.
```

---

## Prompt 3: Implement CRUD Operations with CommonController

```
Please help me create a controller class that extends CommonController for product management. Requirements:

1. Class name: ProductController
2. Service interface:
```typescript
interface ProductService {
    createNew(user: any, data: ProductCreateRequest): Promise<Product>;
    update(user: any, data: ProductUpdateRequest): Promise<Product>;
    del(id: string): Promise<void>;
}
```
3. Request data types:
```typescript
interface ProductCreateRequest {
    name: string;
    description?: string;
    price: number;
    category: string;
    stock: number;
}

interface ProductUpdateRequest {
    id: string;
    name?: string;
    description?: string;
    price?: number;
    category?: string;
    stock?: number;
}
```
4. Validation rules:
   - Configure rules by overriding `protected getRules(): ValidationRules`
   - name: required, string, 2-100 chars
   - price: required, number, >= 0
   - category: required, string
   - stock: required, integer, >= 0
   - description: optional, string, max 500 chars
5. CRUD argument passing:
   - Note that CommonController defaults to passing [this.getLoggedUser(req), req.body] to createNew and update
6. Override buildNewEntry() and buildUpdatedEntry():
   - Add createdAt or updatedAt timestamp
7. Add custom methods:
   - getCategories() - Get product categories list
   - updateStock() - Update stock (with custom validation)

Please generate complete controller code.
```

---

## Prompt 4: Create Multi-Tenant Business Controller with CommonController

```
Please help me create a controller class that extends CommonController for multi-tenant order management. Requirements:

1. Class name: OrderController
2. Service interface:
```typescript
interface OrderService {
    createNew(user: CommonUser, data: OrderCreateRequest): Promise<Order>;
    update(user: CommonUser, data: OrderUpdateRequest): Promise<Order>;
    del(id: string): Promise<void>;
    cancel(user: CommonUser, orderId: string, reason: string): Promise<Order>;
    getHistory(user: CommonUser, params: any): Promise<Order[]>;
}
```
3. Data types:
```typescript
interface OrderCreateRequest {
    items: OrderItem[];
    shippingAddress: Address;
    paymentMethod: string;
}

interface OrderUpdateRequest {
    id: string;
    items?: OrderItem[];
    shippingAddress?: Address;
    status?: string;
}

interface OrderItem {
    productId: string;
    quantity: number;
    price: number;
}
```
4. Validation rules:
   - Declare via `protected getRules(): ValidationRules`
   - items: required, array, min 1 element
   - shippingAddress: required, object
   - paymentMethod: required, enum ['credit_card', 'paypal', 'bank_transfer']
   - items[].productId: required, string
   - items[].quantity: required, integer, > 0
   - items[].price: required, number, > 0
5. Override buildNewEntry():
   - Add auto-generated order status: 'pending'
   - Add creation timestamp
6. Add custom endpoint methods:
   - cancel() - Cancel order
   - getHistory() - Get order history
   - Each method uses this.checkInterface() to verify service
   - Each method uses this.invokeServiceInterface() to call service

Please generate complete controller code with type definitions.
```

---

## Prompt 5: Create Platform Admin Controller with CommonController

```
Please help me create a platform admin controller class that extends CommonController for system user management (tenant-agnostic). Requirements:

1. Class name: SystemUserController
2. Service interface:
```typescript
interface SystemUserService {
    createNew(data: UserCreateRequest): Promise<SystemUser>;
    update(data: UserUpdateRequest): Promise<SystemUser>;
    del(userId: string): Promise<void>;
    assignRole(userId: string, roleId: string): Promise<void>;
    resetPassword(userId: string, newPassword: string): Promise<void>;
}
```
3. Data types:
```typescript
interface UserCreateRequest {
    email: string;
    name: string;
    role: string;
    isActive?: boolean;
}

interface UserUpdateRequest {
    id: string;
    email?: string;
    name?: string;
    role?: string;
    isActive?: boolean;
}
```
4. Validation rules:
   - Declare via `protected getRules(): ValidationRules`
   - email: required, valid email format
   - name: required, string, 2-100 chars
   - role: required, string
   - isActive: optional, boolean
5. Override argument builders to omit user parameter:
   - `protected getCreateNewArguments(req: Request): Array<any>` -> return [req.body]
   - `protected getUpdateArguments(req: Request): Array<any>` -> return [req.body]
6. Override buildNewEntry():
   - Add password hash (if password provided)
   - Add creation timestamp
   - Set default isActive to true
7. Add custom methods:
   - assignRole() - Assign role
   - resetPassword() - Reset password

Please generate complete controller code.
```

---

## Prompt 6: Create Search Controller with CommonSearchController

```
Please help me create a controller class that extends CommonSearchController for product search. Requirements:

1. Class name: ProductSearchController
2. Service interface:
```typescript
interface ProductSearchService {
    createNew(user: CommonUser, data: any): Promise<Product>;
    update(user: CommonUser, data: any): Promise<Product>;
    del(id: string): Promise<void>;
    search(user: CommonUser, query: ProductQuery): Promise<SearchResult<Product>>;
    getCategories(user: CommonUser): Promise<string[]>;
    getFeaturedProducts(user: CommonUser, limit: number): Promise<Product[]>;
}
```
3. Query types:
```typescript
interface ProductQuery {
    keyword?: string;
    category?: string;
    minPrice?: number;
    maxPrice?: number;
    inStock?: boolean;
    page?: number;
    pageSize?: number;
}

interface SearchResult<T> {
    items: T[];
    total: number;
}
```
4. Search implementation:
   - Inherits `search()` method automatically from `CommonSearchController`, which passes `[this.getLoggedUser(req), req.query]` to `service.search`.
5. Add additional custom search endpoints:
   - getCategories() - Get categories
   - getFeatured() - Get featured products

Please generate complete controller code with type definitions.
```

---

## Prompt 7: Integrate Controllers into Routes

```
Please help me create a complete route class that uses CommonController and CommonSearchController. Requirements:

1. Create ProductRoutes class extending CommonRoutes
2. Import and instantiate these controllers:
   - ProductController (CommonController or CommonSearchController)
3. Implement isValidUser():
   - Verify user is logged in
   - Verify user is associated with valid tenant
4. Implement bindRoutes():
   - POST /products - Create product (use productController.createNew())
   - PUT /products/:id - Update product (use productController.update())
   - DELETE /products/:id - Delete product (use productController.del())
   - GET /products - Search products (use productController.search())
   - GET /products/categories - Get categories (use productController.getCategories())
5. Wrap all route actions with routerHelper.invokeRestfulAction()
6. Add appropriate logging

Please generate complete route class code.
```

---

## Prompt 8: Create Complete Controller and Route Example

```
Please help me create a complete controller and route structure for a blog system. Requirements:

System requirements:
1. Article management with search (tenant level)
2. Comment management (tenant level)
3. User management (admin level, tenant-agnostic)
4. Tag management (global, admin level)

Need to create:

1. ArticleController (extends CommonSearchController)
   - Service interface: ArticleService (createNew, update, del, search, publish)
   - Validation rules: title, content, tags

2. CommentController (extends CommonController)
   - Service interface: CommentService (createNew, update, del)
   - Validation rules: articleId, content

3. UserController (extends CommonController)
   - Service interface: UserAdminService (createNew, update, del, activate, deactivate)
   - Overrides getCreateNewArguments & getUpdateArguments to omit user parameter
   - Validation rules: email, name, role

4. TagController (extends CommonController)
   - Service interface: TagService (createNew, update, del, merge)
   - Overrides getCreateNewArguments & getUpdateArguments to omit user parameter
   - Validation rules: name, color

5. Route classes:
   - ArticleRoutes - Integrate ArticleController
   - CommentRoutes - Integrate CommentController
   - AdminUserRoutes - Integrate UserController
   - AdminTagRoutes - Integrate TagController

Please generate complete code for all controllers and route classes, including:
- Service interface definitions
- Data type definitions
- Validation rules via getRules()
- Implementation details
- JSDoc comments
```

---

## Usage Tips

1. **Choose appropriate controller base class**:
   - Simple operations without service layer → `Controller`
   - Custom business logic endpoints → `BaseController`
   - Need standard CRUD operations with validation → `CommonController`
   - Need CRUD operations and search functionality → `CommonSearchController`

2. **Validation rules**:
   - Always define validation rules by overriding `protected getRules(): ValidationRules`
   - Use validators from `@ticatec/bean-validator`
   - Override `buildNewEntry`/`buildUpdatedEntry` to enrich or prepare data before validation

3. **Service interface**:
   - By default, `CommonController` passes `[loggedUser, req.body]` to `createNew` and `update`
   - For platform admin operations without user parameter, override `getCreateNewArguments` and `getUpdateArguments` to return `[req.body]`
   - `CommonSearchController.search()` passes `[loggedUser, req.query]` to `service.search`

4. **Debugging**:
   - Set `Controller.debugEnabled = true` to enable detailed controller debugging logs

---

## Controller Hierarchy Quick Reference

```
Controller (Base Class with Logger & User Access)
  └── BaseController<T> (Service Injection)
        └── CommonController<T> (CRUD + Automatic Validation)
              └── CommonSearchController<T> (Search Support)
```

### Service Method Signatures by Default:

**CommonController (Default / Multi-Tenant):**
```typescript
service.createNew(user: any, data: any): Promise<any>
service.update(user: any, data: any): Promise<any>
service.del(id: string): Promise<any>
```

**CommonController (Platform Admin / Custom Arguments):**
```typescript
service.createNew(data: any): Promise<any>
service.update(data: any): Promise<any>
service.del(id: string): Promise<any>
```

**CommonSearchController:**
```typescript
service.search(user: any, query: any): Promise<any>
```

---

For more information, see: [CONTROLLER.md](./CONTROLLER.md)