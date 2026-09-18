# Keelson

中文 | [English](README.md)

面向 Node.js 与 Express 的企业级 TypeScript 框架 —— 分层数据访问、声明式事务、依赖注入、Bean 校验与服务端骨架。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

keelson（龙骨翼板）是铺在船体龙骨之上、纵贯全船的内构梁。它把所有肋骨绑在一起，承担纵向载荷。你永远看不见它，但没有它船就散了。

## 包列表

所有包发布在 `@ticatec/*` scope 下。

### 内核

| 包 | 版本 | 职责 |
| --- | --- | --- |
| [common-express-server](packages/common-express-server) | 2.0.1 | Express 服务端骨架 —— `BaseServer`、控制器、路由、健康检查、多租户、鉴权上下文 |
| [node-common-library](packages/node-common-library) | 4.0.0 | 四层数据访问 —— `CommonDAO` / `CommonRepository` / `CommonService`、`@Transaction`、`BeanFactory`、`CommonSearchCriteria`、分页 |
| [bean-validator](packages/bean-validator) | 1.0.2 | 声明式 DTO 校验与数据清洗 |
| [node-exception](packages/node-exception) | 2.0.0 | 标准化的 Express 错误处理中间件 |

### 数据库驱动

`node-common-library` 中 `DBConnection` / `DBFactory` 契约的具体实现。

| 包 | 版本 | 数据库 |
| --- | --- | --- |
| [pg-common-library](packages/pg-common-library) | 3.3.0 | PostgreSQL |
| [mysql-common-library](packages/mysql-common-library) | 3.3.0 | MySQL |
| [dm-common-library](packages/dm-common-library) | 3.3.0 | 达梦 DM8 |

### 基础设施

可独立用于任何 Node 项目。

| 包 | 版本 | 职责 |
| --- | --- | --- |
| [logger-api](packages/logger-api) | 1.0.0 | 零依赖日志契约 —— 包面向它写日志，应用注入具体实现 |
| [logger-wrapper](packages/logger-wrapper) | 0.3.0 | `logger-api` 的可选 pino 适配器，提供 appender 与分类级别 |
| [config-loader](packages/config-loader) | 1.0.0 | YAML / JSON 配置加载 |
| [redis-client](packages/redis-client) | 1.1.0 | ioredis 封装，含单例管理与缓存数据辅助 |

## 架构

```
┌─────────────────────────────────────────────┐
│  Controller / Router                        │  common-express-server
│  请求处理、校验、错误映射                     │  bean-validator · node-exception
└───────────────────┬─────────────────────────┘
                    │
┌───────────────────▼─────────────────────────┐
│  Service                                    │  node-common-library
│  业务逻辑、@Transaction 事务边界              │
└───────────────────┬─────────────────────────┘
                    │
┌───────────────────▼─────────────────────────┐
│  Repository                                 │  node-common-library
│  领域持久化、DAO 聚合                         │
└───────────────────┬─────────────────────────┘
                    │
┌───────────────────▼─────────────────────────┐
│  DAO                                        │  node-common-library
│  SQL 执行、结果映射                           │  + pg / mysql / dm 驱动
└───────────────────┬─────────────────────────┘
                    │
              ┌─────▼─────┐
              │  数据库    │
              └───────────┘
```

Service 层开启的事务通过 `AsyncLocalStorage` 向下透传，整条调用链上的语句共享同一个连接，无需任何人把连接作为参数传递。

## 快速上手

```bash
pnpm add @ticatec/common-express-server @ticatec/node-common-library \
         @ticatec/bean-validator @ticatec/node-exception \
         @ticatec/logger-api reflect-metadata
# 再加上你使用的数据库驱动
pnpm add @ticatec/pg-common-library pg
```

建议从 [node-common-library 的 README](packages/node-common-library/README_CN.md) 开始 —— 它完整覆盖数据层，并链接到四份专题指南：

- [DAO 层](packages/node-common-library/docs/DAO_GUIDE_CN.md)
- [Service 与 Repository 层](packages/node-common-library/docs/SERVICE_GUIDE_CN.md)
- [依赖注入](packages/node-common-library/docs/DEPENDENCY_INJECTION_GUIDE_CN.md)
- [查询条件构建](packages/node-common-library/docs/SEARCH_CRITERIA_CN.md)

## 在本仓库中开发

这是一个 pnpm workspace，包间依赖使用 `workspace:*`，因此全部基于本地源码构建。

```bash
pnpm install
pnpm build        # 按依赖图拓扑顺序构建
pnpm typecheck
pnpm test
pnpm verify       # typecheck && test && build
```

单个包：

```bash
pnpm --filter @ticatec/node-common-library test
```

## 授权协议

MIT —— 详见 [LICENSE](LICENSE)。

## 作者

**Henry Feng** —— [huili.f@gmail.com](mailto:huili.f@gmail.com)
