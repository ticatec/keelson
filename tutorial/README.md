# Keelson Tutorial

<p align="center">
  <img src="keelson.png" alt="Keelson" width="220">
</p>

[中文](README_CN.md) | English

Nine chapters, each one topic, each readable on its own. Start wherever your question is.

| # | Chapter | What it answers |
| --- | --- | --- |
| 1 | [Getting started](01-getting-started.md) | Empty directory to a service answering requests |
| 2 | [Layers and transactions](02-layers-and-transactions.md) | Why four tiers, and how one transaction spans them |
| 3 | [Wiring](03-wiring.md) | How classes find each other without an initialisation order |
| 4 | [The HTTP layer](04-http-layer.md) | Routes, controllers, validation, error mapping |
| 5 | [Identity and access control](05-identity.md) | Where `req.user` comes from, and how to authorise |
| 6 | [Logging and health](06-logging-and-health.md) | What gets logged, what never does, and what Kubernetes sees |
| 7 | [Background work and shutdown](07-background-work.md) | Periodic jobs, and stopping without dropping anything |
| 8 | [Configuration and cache](08-config-and-cache.md) | Local YAML, Nacos, Consul, Redis |
| 9 | [Before you go live](09-production-checklist.md) | The checklist, with the reason behind each line |

## How this relates to docs/prompts guides

`docs/prompts/` holds the **reference guides** — every method, every option, every edge
case of a single layer. This tutorial is the other half: why the pieces are shaped the way
they are, and how they fit together. Chapters covering core layers (DAO, Service, DI,
Controllers, and Bean Validation) link to the guide that goes deeper.

Read the tutorial to understand the framework. Keep the guides open while you write code.

If you drive an AI assistant, `docs/prompts/AI_PROMPTS.md` has the layer rules as a block to
paste, plus ready prompts per layer.

## Conventions in these chapters

Every code sample compiles against the published types. Where a sample is deliberately
incomplete, it says so.

Examples use PostgreSQL placeholders (`$1`, `$2`). For MySQL and Dameng they are `?` —
chapter 2 explains how to write SQL that does not care.

Chapters assume you read [the project README](../README.md) first for an overall architectural view.
