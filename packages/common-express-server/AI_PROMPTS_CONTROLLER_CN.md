# AI 编程提示词：Controller 使用指南

本文档提供了用于AI辅助编程的详细提示词，帮助开发者理解和使用 `@ticatec/common-express-server` 框架中的 Controller 类体系。

---

## 🏛️ 应用四层分层架构规范 (Four-Tier Architecture)

在编写或生成业务代码时，必须遵循以下**四层分层架构**职责边界：

1. **Web 层 (`routes` + `controller`)**:
   - **Routes** (`CommonRoutes` / `AuthenticatedRoutes`): 处理 HTTP 路由映射、请求头校验、中间件绑定与认证 (`isValidUser`)。
   - **Controller** (`Controller`, `BaseController`, `CommonController`, `CommonSearchController` 等): 负责解析 Web 请求、提取 DTO 入参和 `this.getLoggedUser(req)` 登录上下文，并将其传给 **Service 层**。Web 层**严禁**直接编写业务规则或执行 SQL 数据库查询。
2. **Service 业务逻辑层 (`service`)**:
   - 处理核心业务逻辑、领域校验、状态转换与事务（Transaction）管理。
   - 依赖 **Repository 层** 进行领域数据的读取与持久化操作。
3. **Repository 仓储层 (`repository`)**:
   - 负责数据访问抽象，屏蔽底层数据库实现细节，组装 PO/DTO 与领域模型。
   - 协调调用一个或多个 **DAO 层** 执行数据聚合。
4. **DAO 数据访问层 (`dao`)**:
   - 负责最底层的数据库通信与 SQL / ORM 执行（如基于 `@ticatec/pg-common-library` 或数据库连接池执行具体增删改查）。

---

## Prompt 0: 通过 CustomUserRegistry 注册服务器级自定义用户模型

```
请帮我在 TypeScript 项目中为 @ticatec/common-express-server 注册 Server 级别的自定义用户类型。要求如下：

1. 创建文件 src/types/user-registry.d.ts
2. 定义接口 AppUser 继承自 LoggedUser，包含属性：
   - userId: string
   - roles: string[]
   - permissions: string[]
   - departmentId: string
3. 使用 declare module '@ticatec/common-express-server' 进行 TypeScript 模块扩展（Declaration Merging）
4. 在 CustomUserRegistry 中注册 user: AppUser

请生成完整的代码，并说明之后框架内所有 Controller（如 CommonController）中 this.getLoggedUser(req) 将自动推导为 AppUser。
```

---

## Prompt 1: 使用 Controller 创建最基础的控制器（无需服务注入）

```
请帮我创建一个继承自 Controller 的基础控制器类。这个控制器不需要服务注入。要求如下：

1. 类名为 HealthController
2. 这个控制器用于健康检查和系统状态查询，不需要服务层
3. 控制器需要实现以下方法：
   - checkHealth() - 健康检查，返回系统状态
   - getVersion() - 获取应用版本信息
   - getSystemInfo() - 获取系统基本信息
4. 每个方法应该：
   - 使用 this.getLoggedUser(req) 获取当前用户（如果有）
   - 使用 this.logger 记录操作日志
   - 返回 RestfulFunction 类型的函数
   - 包含适当的错误处理
5. 添加类型定义和 JSDoc 注释

请生成完整的控制器代码，注意：
- 不需要构造函数参数（因为没有服务注入）
- 可以直接访问 this.logger 和 this.getLoggedUser()
- 返回简单的数据对象或状态信息
```

---

## Prompt 2: 使用 BaseController 创建基础控制器（带服务注入）

```
请帮我创建一个继承自 BaseController 的控制器类。要求如下：

1. 类名为 NotificationController
2. 服务接口定义：
```typescript
interface NotificationService {
    sendNotification(user: any, message: string, type: string): Promise<any>;
    getNotifications(user: any, unreadOnly: boolean): Promise<any[]>;
    markAsRead(user: any, notificationId: string): Promise<void>;
}
```
3. 控制器需要实现以下方法：
   - send() - 发送通知
   - getNotifications() - 获取通知列表
   - markAsRead() - 标记通知为已读
4. 每个方法应该：
   - 使用 this.getLoggedUser(req) 获取当前用户
   - 调用对应的 service 方法
   - 返回 RestfulFunction 类型的函数
   - 包含适当的错误处理和日志记录
5. 添加类型定义和 JSDoc 注释

请生成完整的控制器代码，包括服务接口定义。
```

---

## Prompt 3: 使用 CommonController 实现 CRUD 操作

```
请帮我创建一个继承自 CommonController 的控制器类，用于产品管理。要求如下：

1. 类名为 ProductController
2. 服务接口定义：
```typescript
interface ProductService {
    createNew(user: any, data: ProductCreateRequest): Promise<Product>;
    update(user: any, data: ProductUpdateRequest): Promise<Product>;
    del(id: string): Promise<void>;
}
```
3. 请求数据类型：
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
4. 验证规则：
   - 通过覆写 protected getRules(): ValidationRules 声明规则
   - name: 必填，字符串，2-100字符
   - price: 必填，数字，>= 0
   - category: 必填，字符串
   - stock: 必填，整数，>= 0
   - description: 可选，字符串，最多500字符
5. 参数传递：
   - 了解 CommonController 默认将 [this.getLoggedUser(req), req.body] 作为入参传递给 createNew 和 update
6. 覆写 buildNewEntry() 和 buildUpdatedEntry()：
   - 添加 createdAt 或 updatedAt 时间戳
7. 添加自定义方法：
   - getCategories() - 获取产品分类列表
   - updateStock() - 更新库存（带自定义校验）

请生成完整的控制器代码。
```

---

## Prompt 4: 使用 CommonController 创建多租户业务控制器

```
请帮我创建一个继承自 CommonController 的控制器类，用于多租户订单管理。要求如下：

1. 类名为 OrderController
2. 服务接口定义：
```typescript
interface OrderService {
    createNew(user: CommonUser, data: OrderCreateRequest): Promise<Order>;
    update(user: CommonUser, data: OrderUpdateRequest): Promise<Order>;
    del(id: string): Promise<void>;
    cancel(user: CommonUser, orderId: string, reason: string): Promise<Order>;
    getHistory(user: CommonUser, params: any): Promise<Order[]>;
}
```
3. 数据类型：
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
4. 验证规则：
   - 通过 protected getRules(): ValidationRules 声明
   - items: 必填，数组，至少1个元素
   - shippingAddress: 必填，对象
   - paymentMethod: 必填，枚举 ['credit_card', 'paypal', 'bank_transfer']
   - items[].productId: 必填，字符串
   - items[].quantity: 必填，整数，> 0
   - items[].price: 必填，数字，> 0
5. 覆写 buildNewEntry()：
   - 添加订单状态：'pending'
   - 添加创建时间戳
6. 添加自定义端点方法：
   - cancel() - 取消订单
   - getHistory() - 获取订单历史
   - 每个方法使用 this.checkInterface() 验证服务接口
   - 每个方法使用 this.invokeServiceInterface() 调用服务

请生成完整的控制器代码，包含类型定义。
```

---

## Prompt 5: 使用 CommonController 创建平台管理员控制器（与租户无关）

```
请帮我创建一个继承自 CommonController 的平台管理员控制器类，用于系统用户管理（无租户/跨租户）。要求如下：

1. 类名：SystemUserController
2. 服务接口：
```typescript
interface SystemUserService {
    createNew(data: UserCreateRequest): Promise<SystemUser>;
    update(data: UserUpdateRequest): Promise<SystemUser>;
    del(userId: string): Promise<void>;
    assignRole(userId: string, roleId: string): Promise<void>;
    resetPassword(userId: string, newPassword: string): Promise<void>;
}
```
3. 数据类型：
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
4. 验证规则：
   - 通过 protected getRules(): ValidationRules 声明
   - email: 必填，有效的邮箱格式
   - name: 必填，字符串，2-100字符
   - role: 必填，字符串
   - isActive: 可选，布尔值
5. 覆写入参构建方法以省略 user 参数：
   - protected getCreateNewArguments(req: Request): Array<any> -> 返回 [req.body]
   - protected getUpdateArguments(req: Request): Array<any> -> 返回 [req.body]
6. 覆写 buildNewEntry()：
   - 添加密码哈希（如果提供了密码）
   - 添加创建时间
   - 设置默认 isActive 为 true
7. 添加自定义方法：
   - assignRole() - 分配角色
   - resetPassword() - 重置密码

请生成完整的控制器代码。
```

---

## Prompt 6: 使用 CommonSearchController 创建搜索控制器

```
请帮我创建一个继承自 CommonSearchController 的控制器类，用于产品搜索。要求如下：

1. 类名：ProductSearchController
2. 服务接口：
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
3. 查询类型：
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
4. 搜索实现：
   - 自动继承 CommonSearchController 的 search() 方法，默认自动将 [this.getLoggedUser(req), req.query] 传递给 service.search。
5. 添加额外的自定义搜索端点：
   - getCategories() - 获取分类
   - getFeatured() - 获取特色产品

请生成完整的控制器代码，包含类型定义。
```

---

## Prompt 7: 将控制器集成到路由中

```
请帮我创建一个完整的路由类，使用 CommonController 和 CommonSearchController。要求如下：

1. 创建 ProductRoutes 类继承 CommonRoutes
2. 导入和实例化以下控制器：
   - ProductController (CommonController 或 CommonSearchController)
3. 实现 isValidUser()：
   - 验证用户已登录
   - 验证用户关联到有效租户
4. 实现 bindRoutes()：
   - POST /products - 创建产品（使用 productController.createNew()）
   - PUT /products/:id - 更新产品（使用 productController.update()）
   - DELETE /products/:id - 删除产品（使用 productController.del()）
   - GET /products - 搜索产品（使用 searchController.buildQuery()）
   - GET /products/categories - 获取分类（使用 productController.getCategories()）
   - GET /products/featured - 获取特色产品（使用 searchController.getFeatured()）
5. 所有路由使用 routerHelper.invokeRestfulAction() 包装
6. 添加适当的日志记录

请生成完整的路由类代码。
```

---

## Prompt 8: 创建完整的控制器和路由示例

```
请帮我为一个博客系统创建完整的控制器和路由结构。要求：

系统需求：
1. 文章管理与搜索（租户级别）
2. 评论管理（租户级别）
3. 用户管理（管理员级别，与租户无关）
4. 标签管理（全局，管理员级别）

需要创建：

1. ArticleController (继承 CommonSearchController)
   - 服务接口：ArticleService (createNew, update, del, search, publish)
   - 验证规则：title, content, tags

2. CommentController (继承 CommonController)
   - 服务接口：CommentService (createNew, update, del)
   - 验证规则：articleId, content

3. UserController (继承 CommonController)
   - 服务接口：UserAdminService (createNew, update, del, activate, deactivate)
   - 覆写 getCreateNewArguments 和 getUpdateArguments 以省略 user 参数
   - 验证规则：email, name, role

4. TagController (继承 CommonController)
   - 服务接口：TagService (createNew, update, del, merge)
   - 覆写 getCreateNewArguments 和 getUpdateArguments 以省略 user 参数
   - 验证规则：name, color

5. 路由类：
   - ArticleRoutes - 集成 ArticleController
   - CommentRoutes - 集成 CommentController
   - AdminUserRoutes - 集成 UserController
   - AdminTagRoutes - 集成 TagController

请生成所有控制器和路由类的完整代码，包括：
- 服务接口定义
- 数据类型定义
- 验证规则（通过 getRules 声明）
- 实现细节
- JSDoc 注释
```

---

## 使用建议

1. **选择合适的控制器基类**：
   - 无需服务层的简单操作 → `Controller`
   - 需要服务注入的自定义业务逻辑 → `BaseController`
   - 需要标准 CRUD 操作与验证 → `CommonController`
   - 需要 CRUD 操作与搜索功能 → `CommonSearchController`

2. **验证规则**：
   - 始终通过覆写 `protected getRules(): ValidationRules` 定义校验规则
   - 使用 `@ticatec/bean-validator` 提供的验证器
   - 可以覆写 `buildNewEntry`/`buildUpdatedEntry` 在校验前丰富或预处理数据

3. **服务接口**：
   - 默认情况下，`CommonController` 向 `createNew` 和 `update` 传递 `[loggedUser, req.body]`
   - 对于无需 user 参数的平台管理员操作，覆写 `getCreateNewArguments` 和 `getUpdateArguments` 返回 `[req.body]`
   - `CommonSearchController.search()` 自动向 `service.search` 传递 `[loggedUser, req.query]`

4. **调试**：
   - 设置 `Controller.debugEnabled = true` 启用控制器调试日志

---

## Controller 层次结构快速参考

```
Controller (基础功能，包含日志与用户访问)
  └── BaseController<T> (服务注入)
        └── CommonController<T> (CRUD + 自动校验)
              └── CommonSearchController<T> (搜索支持)
```

### 各控制器的默认服务方法签名：

**CommonController (默认 / 多租户):**
```typescript
service.createNew(user: any, data: any): Promise<any>
service.update(user: any, data: any): Promise<any>
service.del(id: string): Promise<any>
```

**CommonController (平台管理员 / 自定义参数):**
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

更多信息请参考：[CONTROLLER_CN.md](./CONTROLLER_CN.md)