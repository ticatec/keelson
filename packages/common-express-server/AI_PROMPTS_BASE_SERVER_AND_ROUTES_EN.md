# AI Programming Prompts: BaseServer and CommonRoutes

This document provides detailed prompts for AI-assisted programming to help developers understand and use the BaseServer and CommonRoutes classes from the `@ticatec/common-express-server` framework.

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

## Prompt 1: Create Custom Server Class

```
Please help me create a custom server class that extends BaseServer. Requirements:

1. Implement loadConfigFile() to load configuration from './config/app.json' and initialize with AppConf.init()
2. Implement getWebConf() to return:
   - port: read from config, default 3000
   - ip: '0.0.0.0'
   - contextRoot: read from config, default '/api'
3. Implement setupRoutes() to bind:
   - '/api/users' -> UserRoutes
   - '/api/products' -> ProductRoutes
   - '/api/admin' -> AdminRoutes
4. Initialize database connection in beforeStart()
5. Configure CORS in setupExpress() to allow all origins

Ensure:
- Use async/await for asynchronous operations
- Use AppConf.getInstance().get() to read configuration
- Use await this.bindRoutes(path, loader) to bind routes
- Add appropriate error handling and logging
```

---

## Prompt 2: Create Authenticated Route Class

```
Please help me create a protected route class that extends AuthenticatedRoutes for user profile operations. Requirements:

1. Class name: ProtectedUserRoutes, extending AuthenticatedRoutes directly (rejects unauthenticated requests by default)
2. Implement bindRoutes() to define:
   - GET /profile - Get current user profile
   - PUT /profile - Update user profile
   - POST /change-password - Change password
3. Use routerHelper.invokeRestfulAction() to wrap all route handlers
4. Leverage CustomUserRegistry to bind a server-wide AppUser model

Ensure:
- No need to manually check user != null in isValidUser (handled automatically by AuthenticatedRoutes)
- Use this.logger for operation logging
```

---

## Prompt 3: Create Admin Route with User Hook

```
Please help me create an admin route class that extends CommonRoutes. Requirements:

1. Class name: AdminRoutes
2. Implement getUserHook() to load admin permissions before validation:
   - Load admin roles from database
   - Check if admin has necessary permissions
   - Add permissions to user.permissions
3. Implement isValidUser() to verify user is platform admin (user.isPlatform === true)
4. Implement getGlobalHandler() to add global middleware checking 'x-admin-token' header
5. Implement bindRoutes() to define admin routes:
   - GET /users - Get all users list
   - POST /users - Create new user
   - PUT /users/:id - Update user
   - DELETE /users/:id - Delete user
   - GET /stats - Get platform statistics
6. Use mergeParams: true in constructor

Ensure:
- Use async operations in getUserHook to load permissions
- Check both original user and actAs user in isValidUser
- Throw appropriate errors in getGlobalHandler (e.g., IllegalParameterError)
- Wrap all routes with routerHelper.invokeRestfulAction
```

---

## Prompt 4: Create Tenant Route Class

```
Please help me create a tenant-specific route class that extends CommonRoutes. Requirements:

1. Class name: TenantRoutes
2. Implement getUserHook() to load tenant-specific data:
   - Load tenant configuration
   - Load tenant feature flags
   - Verify tenant is valid
   - Add tenant data to user.tenantData
3. Implement isValidUser() to verify:
   - User is logged in
   - User is associated with a valid tenant
   - Tenant status is 'active'
4. Implement bindRoutes() to define tenant routes:
   - GET /info - Get tenant information
   - GET /members - Get tenant members list
   - POST /members - Invite member
   - PUT /members/:id - Update member role
   - DELETE /members/:id - Remove member
5. Each route handler should:
   - Use this.getLoggedUser(req) to get current user
   - Get tenant info from user.tenantData
   - Return appropriate data or errors

Ensure:
- Catch and handle errors when loading tenant data in getUserHook
- Check user.tenant exists and is valid in isValidUser
- Wrap all database operations with try-catch
- Use this.logger.debug for debug logging
```

---

## Prompt 5: Complete Application Setup

```
Please help me create a complete Express application using @ticatec/common-express-server framework. Requirements:

Project structure (organized by business modules):
```
src/
├── server/
│   ├── MyServer.ts              # Main server class
│   └── index.ts                 # Server startup entry
├── modules/
│   ├── user/                    # User management module (all files flat)
│   │   ├── UserRoutes.ts                # User route definitions
│   │   ├── AdminUserRoutes.ts           # User management routes (admin)
│   │   ├── UserController.ts            # User controller implementation
│   │   ├── UserSearchController.ts      # User search controller implementation
│   │   ├── UserService.ts               # User service (business logic)
│   │   ├── IUserDao.ts                  # User DAO interface
│   │   ├── UserDao.ts                   # User DAO implementation (database operations)
│   │   └── User.ts                      # User entity/model
│   ├── product/                 # Product management module (all files flat)
│   │   ├── ProductRoutes.ts             # Product route definitions
│   │   ├── TenantProductRoutes.ts       # Tenant product routes
│   │   ├── ProductController.ts         # Product controller implementation
│   │   ├── ProductSearchController.ts   # Product search controller
│   │   ├── ProductService.ts            # Product service (business logic)
│   │   ├── IProductDao.ts               # Product DAO interface
│   │   ├── ProductDao.ts                # Product DAO implementation
│   │   └── Product.ts                   # Product entity/model
│   ├── order/                   # Order management module (layered structure example)
│   │   ├── OrderRoutes.ts               # Order route definitions
│   │   ├── OrderController.ts           # Order controller implementation
│   │   ├── OrderService.ts              # Order service (business logic)
│   │   ├── IOrderDao.ts                 # Order DAO interface
│   │   ├── OrderDao.ts                  # Order DAO implementation
│   │   ├── Order.ts                     # Order entity/model
│   │   └── details/                     # Order detail sub-module (tightly coupled entities)
│   │       ├── OrderDetail.ts           # Order detail entity
│   │       ├── IOrderDetailDao.ts       # Order detail DAO interface
│   │       └── OrderDetailDao.ts        # Order detail DAO implementation
│   └── admin/                  # Admin module (all files flat)
│       ├── AdminRoutes.ts               # Admin routes
│       ├── AdminController.ts           # Admin controller
│       ├── AdminService.ts              # Admin service (business logic)
│       ├── IAdminDao.ts                 # Admin DAO interface
│       ├── AdminDao.ts                  # Admin DAO implementation
│       └── AdminStats.ts                # Admin statistics entity
├── config/
│   ├── app.json                 # Application configuration
│   └── database.ts              # Database connection configuration
├── common/                      # Common utilities and middleware
│   ├── validators.ts            # Validators
│   └── utils.ts                 # Utility functions
└── types/                       # TypeScript type definitions
    └── index.ts
```

**Module Layering Explanation**:
- For tightly coupled entities (e.g., Order/OrderDetail), create subdirectories within the module
- Subdirectories only contain DAO interfaces, DAO implementations, and entity classes for that entity
- Routes, controllers, and services remain at the top level, managing business logic for both main and sub-entities
- Applicable scenarios: master-detail relationships, parent-child entities, aggregate root pattern

Architecture requirements:

1. **MyServer extends BaseServer**
   - Load configuration from config/app.json
   - Initialize database connection pool
   - Configure middleware: CORS, body-parser, helmet, etc.
   - Bind all module routes to their respective paths
   - Start server and listen on configured port

2. **Routes Layer**
   - UserRoutes: extends CommonRoutes, implements user verification
     - GET /profile - Get current user profile
     - PUT /profile - Update user profile
     - POST /change-password - Change password
   - ProductRoutes: extends CommonRoutes, implements tenant verification
      - Use CommonController and CommonSearchController
     - Provide product CRUD routes
   - AdminRoutes: extends CommonRoutes, implements admin verification
     - Provide user management routes
     - Provide system statistics routes

3. **Controller Layer**
   - Direct implementation classes extending BaseXxxController
   - Receive HTTP request parameters
   - **Boundary Checks**: Parameter validation, permission checks, data format validation
   - Call Service layer to handle business logic
   - Return unified response format
   - Controllers are implementations, no interfaces needed
   - No core business logic, only request/response handling and boundary checks

4. **Service Layer**
   - Implement core business logic
   - **Business Logic Checks**: Foreign key constraints, business rule validation, data consistency checks
   - Transaction management
   - Call DAO layer for data access
   - Reusable across multiple Controllers
   - Handle business exceptions and validation

5. **DAO Layer**
   - Interface definition: Define data access method signatures
   - Implementation class: Execute actual database operations (SQL/ORM)
   - Handle transactions and connection management
   - Use interfaces for easy testing and implementation replacement

6. **Entity Layer**
   - Define data models/entity classes
   - Include field definitions and validation rules
   - Map to database table structures

7. **Layer Invocation Chain**
   - Route -> Controller -> Service -> DAO -> Entity
   - Each layer only calls the next layer, no cross-layer calls
   - Dependency Injection: DAO interfaces injected into Service, Service instances injected into Controller
   - Services use interface types for easy mocking in unit tests

Please generate complete implementation with:
- Complete type definitions and interfaces
- Error handling and logging
- Database connection management
- Dependency injection pattern
- Example data access code
```

---

## Usage Tips

These prompts can be directly copied to AI assistants (like Claude, ChatGPT, etc.) to help them generate code that follows `@ticatec/common-express-server` framework conventions.

Usage tips:
1. Modify the details in prompts according to your specific needs
2. Combine requirements from multiple prompts
3. If generated code has issues, point out specific problems and ask for regeneration
4. Add your business logic requirements to the prompts

---

## Key Concepts Quick Reference

### BaseServer Methods to Implement:
- `loadConfigFile(): Promise<void>` - Load configuration
- `getWebConf(): any` - Return server configuration
- `setupRoutes(): Promise<void>` - Setup routes

### BaseServer Optional Methods to Override:
- `beforeStart(): Promise<void>` - Pre-startup logic
- `setupExpress(): void` - Express configuration
- `bindStaticSite(): Promise<void>` - Static resources binding
- `postServerCreated(server): Promise<void>` - After server creation
- `getHealthCheckPath(): string` - Health check path

### CommonRoutes Methods to Override:
- `getUserHook(): ((user: any) => any) | null` - User data processing hook
- `isValidUser(user: CommonUser): boolean | Promise<boolean>` - User validation (defaults to true)
- `getGlobalHandler(): RequestHandler | null` - Global middleware
- `bindRoutes(): void` - Route definitions

### CommonRoutes Route Registration Methods:
- `get(path, handler)` - Register GET route (auto logging)
- `post(path, handler)` - Register POST route (auto logging)
- `put(path, handler)` - Register PUT route (auto logging)
- `delete(path, handler)` - Register DELETE route (auto logging)

### Middleware Execution Order:
1. getUserHook (if defined)
2. isValidUser
3. getGlobalHandler (if defined)
4. Route handlers in bindRoutes

### RouterHelper Singleton Methods:
- `routerHelper.invokeRestfulAction(func)` - Wrap RESTful handler (auto error handling & JSON serialization)
- `routerHelper.invokeController(func)` - Wrap controller handler (auto error handling)
- `routerHelper.retrieveUser()` - Parse user from headers (non-invasive)
- `routerHelper.checkLoggedUser()` - Verify user is logged in
- `routerHelper.actionNotFound()` - 404 error handling

---

For more information, see: [README.md](./README.md)