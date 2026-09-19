# Keelson 教程

中文 | [English](README.md)

九章，一章一个主题，各章独立成篇。从你当下的问题那一章看起即可。

| # | 章节 | 回答什么问题 |
| --- | --- | --- |
| 1 | [起步](01-getting-started_CN.md) | 从空目录到一个能响应请求的服务 |
| 2 | [分层与事务](02-layers-and-transactions_CN.md) | 为什么分四层，一个事务怎么贯穿它们 |
| 3 | [装配](03-wiring_CN.md) | 类与类之间怎么互相找到，且不必操心初始化顺序 |
| 4 | [HTTP 层](04-http-layer_CN.md) | 路由、控制器、校验、错误映射 |
| 5 | [身份与访问控制](05-identity_CN.md) | `req.user` 从哪来，鉴权怎么做 |
| 6 | [日志与健康检查](06-logging-and-health_CN.md) | 什么会被记录、什么永远不记、K8s 看到什么 |
| 7 | [后台任务与关停](07-background-work_CN.md) | 周期任务，以及关停时不丢活儿 |
| 8 | [配置与缓存](08-config-and-cache_CN.md) | 本地 YAML、Nacos、Consul、Redis |
| 9 | [上线之前](09-production-checklist_CN.md) | 检查清单，以及每一条背后的理由 |

## 它与 docs/prompts 指南的关系

`docs/prompts/` 是**参考手册**——单个层的每个方法、每个选项、每种边界情况。
本教程是另一半：这些部件为什么长成这样，以及它们怎么拼在一起。涉及核心层（DAO、
Service、依赖注入、控制器与数据校验）的章节末尾均链接了对应的深入指南。

想理解框架，读教程；动手写代码时，把指南开在旁边。

如果你用 AI 助手写代码，`docs/prompts/AI_PROMPTS_CN.md` 里有可直接粘贴的分层规则块，
以及按层组织的现成提示词。

## 各章的约定

所有示例代码都对着已发布的类型编译验证过。确实写得不完整的地方，会明说。

示例用 PostgreSQL 的占位符（`$1`、`$2`）。MySQL 与达梦用 `?`——第 2 章讲怎么写出
与方言无关的 SQL。

各章默认你已经读过[项目 README](../README_CN.md)以了解框架全貌。
