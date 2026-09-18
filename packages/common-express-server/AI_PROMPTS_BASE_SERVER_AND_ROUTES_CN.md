# AI 编程提示词：BaseServer 和 CommonRoutes

本文档提供了用于AI辅助编程的详细提示词，帮助开发者理解和使用 `@ticatec/common-express-server` 框架中的 BaseServer 和 CommonRoutes 类。

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

## Prompt 1: 创建自定义服务器类

```
请帮我创建一个继承自 BaseServer 的自定义服务器类。要求如下：

1. 实现 loadConfigFile() 方法，从 './config/app.json' 加载配置，并使用 AppConf.init() 初始化
2. 实现 getWebConf() 方法，返回以下配置：
   - port: 从配置中读取，默认 3000
   - ip: '0.0.0.0'
   - contextRoot: 从配置中读取，默认 '/api'
3. 实现 setupRoutes() 方法，绑定以下路由：
   - '/api/users' -> UserRoutes
   - '/api/products' -> ProductRoutes
   - '/api/admin' -> AdminRoutes
4. 在 beforeStart() 中初始化数据库连接
5. 在 setupExpress() 中配置 CORS，允许所有来源

请确保：
- 使用 async/await 处理异步操作
- 正确使用 AppConf.getInstance().get() 读取配置
- 使用 await this.bindRoutes(path, loader) 绑定路由
- 添加适当的错误处理和日志记录
```

---

## Prompt 2: 创建带认证的路由类

```
请帮我创建一个继承自 AuthenticatedRoutes 的保护路由类，用于用户个人中心。要求如下：

1. 类名为 ProtectedUserRoutes，直接继承自 AuthenticatedRoutes（默认拒绝匿名请求）
2. 实现 bindRoutes() 方法，定义以下路由：
   - GET /profile - 获取当前用户资料
   - PUT /profile - 更新用户资料
   - POST /change-password - 修改密码
3. 使用 routerHelper.invokeRestfulAction() 包装所有路由处理器
4. 在项目中配合 CustomUserRegistry 声明全局用户 AppUser

请确保：
- 无需手动在 isValidUser 中判定 user 非空（AuthenticatedRoutes 自动完成）
- 使用 this.logger 记录操作日志
```

---

## Prompt 3: 创建带用户钩子的管理员路由

```
请帮我创建一个管理员路由类继承自 CommonRoutes。要求如下：

1. 类名为 AdminRoutes
2. 实现 getUserHook() 方法，在用户验证前加载管理员权限：
   - 从数据库加载管理员角色
   - 检查管理员是否拥有必要的权限
   - 将权限信息添加到 user.permissions
3. 实现 isValidUser() 方法，验证用户是否为平台管理员（user.isPlatform === true）
4. 实现 getGlobalHandler() 方法，添加全局中间件检查请求头 'x-admin-token'
5. 实现 bindRoutes() 方法，定义管理员路由：
   - GET /users - 获取所有用户列表
   - POST /users - 创建新用户
   - PUT /users/:id - 更新用户
   - DELETE /users/:id - 删除用户
   - GET /stats - 获取平台统计信息
6. 使用 mergeParams: true 构造选项

请确保：
- 在 getUserHook 中使用异步操作加载权限
- 在 isValidUser 中同时检查原始用户和 actAs 用户
- 在 getGlobalHandler 中抛出适当的错误（如 IllegalParameterError）
- 所有路由使用 routerHelper.invokeRestfulAction 包装
```

---

## Prompt 4: 创建租户路由类

```
请帮我创建一个租户特定的路由类继承自 CommonRoutes。要求如下：

1. 类名为 TenantRoutes
2. 实现 getUserHook() 方法，加载租户特定数据：
   - 加载租户配置信息
   - 加载租户的功能开关
   - 验证租户是否有效
   - 将租户数据添加到 user.tenantData
3. 实现 isValidUser() 方法，验证：
   - 用户已登录
   - 用户关联到有效的租户
   - 租户状态为 'active'
4. 实现 bindRoutes() 方法，定义租户路由：
   - GET /info - 获取租户信息
   - GET /members - 获取租户成员列表
   - POST /members - 邀请成员
   - PUT /members/:id - 更新成员角色
   - DELETE /members/:id - 移除成员
5. 每个路由处理器应该：
   - 使用 this.getLoggedUser(req) 获取当前用户
   - 从 user.tenantData 获取租户信息
   - 返回适当的数据或错误

请确保：
- 在 getUserHook 中捕获并处理加载租户数据时的错误
- 在 isValidUser 中检查 user.tenant 是否存在且有效
- 所有数据库操作使用 try-catch 包装
- 使用 this.logger.debug 记录调试信息
```

---

## Prompt 5: 完整的应用程序设置

请帮我创建一个完整的 Express 应用程序，使用 @ticatec/common-express-server 框架。要求如下：

项目结构（按业务模块分层）：
```
src/
├── server/
│   ├── MyServer.ts              # 主服务器类
│   └── index.ts                 # 服务器启动入口
├── modules/
│   ├── user/                    # 用户管理模块（所有文件平级）
│   │   ├── UserRoutes.ts                # 用户路由定义
│   │   ├── AdminUserRoutes.ts           # 用户管理路由（管理员）
│   │   ├── UserController.ts            # 用户控制器实现
│   │   ├── UserSearchController.ts      # 用户搜索控制器实现
│   │   ├── UserService.ts               # 用户服务（业务逻辑）
│   │   ├── IUserDao.ts                  # 用户DAO接口
│   │   ├── UserDao.ts                   # 用户DAO实现（数据库操作）
│   │   └── User.ts                      # 用户实体/模型
│   ├── product/                 # 产品管理模块（所有文件平级）
│   │   ├── ProductRoutes.ts             # 产品路由定义
│   │   ├── TenantProductRoutes.ts       # 租户产品路由
│   │   ├── ProductController.ts         # 产品控制器实现
│   │   ├── ProductSearchController.ts   # 产品搜索控制器
│   │   ├── ProductService.ts            # 产品服务（业务逻辑）
│   │   ├── IProductDao.ts               # 产品DAO接口
│   │   ├── ProductDao.ts                # 产品DAO实现
│   │   └── Product.ts                   # 产品实体/模型
│   ├── order/                   # 订单管理模块（分层结构示例）
│   │   ├── OrderRoutes.ts               # 订单路由定义
│   │   ├── OrderController.ts           # 订单控制器实现
│   │   ├── OrderService.ts              # 订单服务（业务逻辑）
│   │   ├── IOrderDao.ts                 # 订单DAO接口
│   │   ├── OrderDao.ts                  # 订单DAO实现
│   │   ├── Order.ts                     # 订单实体/模型
│   │   └── details/                     # 订单明细子模块（强耦合实体）
│   │       ├── OrderDetail.ts           # 订单明细实体
│   │       ├── IOrderDetailDao.ts       # 订单明细DAO接口
│   │       └── OrderDetailDao.ts        # 订单明细DAO实现
│   └── admin/                  # 管理员模块（所有文件平级）
│       ├── AdminRoutes.ts               # 管理员路由
│       ├── AdminController.ts           # 管理员控制器
│       ├── AdminService.ts              # 管理员服务（业务逻辑）
│       ├── IAdminDao.ts                 # 管理员DAO接口
│       ├── AdminDao.ts                  # 管理员DAO实现
│       └── AdminStats.ts                # 管理统计实体
├── config/
│   ├── app.json                 # 应用配置
│   └── database.ts              # 数据库连接配置
├── common/                      # 通用工具和中间件
│   ├── validators.ts            # 验证器
│   └── utils.ts                 # 工具函数
└── types/                       # TypeScript类型定义
    └── index.ts
```

**模块内分层说明**：
- 对于强耦合实体（如订单/订单明细），可在模块内建立子目录
- 子目录只包含该实体的 DAO 接口、DAO 实现和实体类
- 路由、控制器、服务仍在顶层，统一管理主实体和子实体的业务逻辑
- 适用场景：主从表关系、父子实体、聚合根模式

架构要求：

1. **MyServer 继承 BaseServer**
   - 从 config/app.json 加载配置
   - 初始化数据库连接池
   - 配置 CORS、body-parser、helmet等中间件
   - 绑定所有模块路由到对应的路径
   - 启动服务器并监听端口

2. **路由层（Routes）**
   - UserRoutes: 继承 CommonRoutes，实现用户验证
     - GET /profile - 获取当前用户资料
     - PUT /profile - 更新用户资料
     - POST /change-password - 修改密码
   - ProductRoutes: 继承 CommonRoutes，实现租户验证
      - 使用 CommonController 和 CommonSearchController
     - 提供产品 CRUD 路由
   - AdminRoutes: 继承 CommonRoutes，实现管理员验证
     - 提供用户管理路由
     - 提供系统统计路由

3. **Controller 层**
   - 直接继承对应的 BaseXxxController
   - 接收 HTTP 请求参数
   - **边界检查**：参数验证、权限检查、数据格式校验
   - 调用 Service 层处理业务逻辑
   - 返回统一格式的响应
   - Controller 是实现类，不需要接口
   - 不包含核心业务逻辑，只负责请求/响应处理和边界检查

4. **Service 层**
   - 实现核心业务逻辑
   - **业务逻辑检查**：外键约束、业务规则验证、数据一致性检查
   - 事务管理
   - 调用 DAO 层进行数据访问
   - 可被多个 Controller 复用
   - 处理业务异常和验证

5. **DAO 层**
   - 接口定义：定义数据访问方法签名
   - 实现类：执行实际的数据库操作（SQL/ORM）
   - 处理事务和连接管理
   - 使用接口便于测试和替换实现

6. **Entity 层**
   - 定义数据模型/实体类
   - 包含字段定义和验证规则
   - 映射数据库表结构

7. **层次调用关系**
   - Route -> Controller -> Service -> DAO -> Entity
   - 每层只调用下一层，不跨层调用
   - 依赖注入：DAO 接口注入到 Service，Service 实例注入到 Controller
   - Service 使用接口类型，便于单元测试时 mock

请生成完整的代码实现，包含：
- 完整的类型定义和接口
- 错误处理和日志记录
- 数据库连接管理
- 依赖注入模式
- 示例数据访问代码


---

## 使用建议

这些 prompts 可以直接复制给 AI 助手（如 Claude、ChatGPT 等），让它们帮你生成符合 `@ticatec/common-express-server` 框架规范的代码。

使用技巧：
1. 根据你的具体需求修改 prompt 中的细节
2. 可以组合多个 prompts 的要求
3. 如果生成的代码有问题，可以指出具体问题并要求重新生成
4. 添加你的业务逻辑要求到 prompt 中

---

## 关键概念快速参考

### BaseServer 必须实现的方法：
- `loadConfigFile(): Promise<void>` - 加载配置
- `getWebConf(): any` - 返回服务器配置
- `setupRoutes(): Promise<void>` - 设置路由

### BaseServer 可选重写的方法：
- `beforeStart(): Promise<void>` - 启动前逻辑
- `setupExpress(): void` - Express 配置
- `bindStaticSite(): Promise<void>` - 静态资源绑定
- `postServerCreated(server): Promise<void>` - 服务器创建后
- `getHealthCheckPath(): string` - 健康检查路径

### CommonRoutes 可重写的方法：
- `getUserHook(): ((user: any) => any) | null` - 用户数据处理钩子
- `isValidUser(user: CommonUser): boolean | Promise<boolean>` - 用户验证（默认返回true）
- `getGlobalHandler(): RequestHandler | null` - 全局中间件
- `bindRoutes(): void` - 路由定义

### CommonRoutes 路由注册方法：
- `get(path, handler)` - 注册GET路由（自动记录日志）
- `post(path, handler)` - 注册POST路由（自动记录日志）
- `put(path, handler)` - 注册PUT路由（自动记录日志）
- `delete(path, handler)` - 注册DELETE路由（自动记录日志）

### 中间件执行顺序：
1. getUserHook (如果定义)
2. isValidUser
3. getGlobalHandler (如果定义)
4. bindRoutes 中的路由处理器

### RouterHelper 单例方法：
- `routerHelper.invokeRestfulAction(func)` - 包装RESTful处理器（自动错误处理和JSON序列化）
- `routerHelper.invokeController(func)` - 包装控制器处理器（自动错误处理）
- `routerHelper.retrieveUser()` - 从请求头解析用户信息（非侵入式）
- `routerHelper.checkLoggedUser()` - 验证用户是否已登录
- `routerHelper.actionNotFound()` - 404错误处理

---

更多信息请参考：[README_CN.md](./README_CN.md)