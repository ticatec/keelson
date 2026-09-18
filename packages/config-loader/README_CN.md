# 配置加载器

一个功能强大且可扩展的 Node.js 应用程序配置加载器，支持从多种配置源加载配置，包括本地文件、Consul 和 Nacos，具备 YAML 解析和高级合并功能。

[English](./README.md) | 中文

[![Version](https://img.shields.io/npm/v/@ticatec/config-loader)](https://www.npmjs.com/package/@ticatec/config-loader)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 特性

- **⚡ 双模式支持**: 完整支持 ES Modules (ESM) 与 CommonJS (CJS)
- **🏗️ 可扩展架构**: 基于抽象 `BaseLoader` 类构建，易于扩展至新的配置源
- **📄 YAML 支持**: 原生解析 YAML 配置文件，支持完整功能特性
- **🔗 包含机制**: 通过文件包含和深度合并实现高级配置组合
- **🌊 深度合并**: 智能合并来自多个配置源的嵌套对象和数组
- **📡 多种配置源**: 支持本地文件、Consul KV 存储和 Nacos 配置中心
- **⚙️ 环境变量配置**: 通过环境变量轻松配置
- **🔄 后处理**: 使用 PostLoader 函数进行自定义内容转换

## 安装

```bash
pnpm add @ticatec/config-loader
# 或 npm
npm install @ticatec/config-loader
```

## 快速开始

**ES Modules (ESM):**
```typescript
import { loadConfig } from '@ticatec/config-loader';
```

**CommonJS (CJS):**
```javascript
const { loadConfig } = require('@ticatec/config-loader');
```

```typescript
import dotenv from 'dotenv';

async function main() {
    dotenv.config();
    
    const config = await loadConfig(
        'local', // 或 'consul', 'nacos'
        'app.yaml',
        'logger.yaml',
        (content: string) => content.replace(/#{service-name}/g, 'my-service')
    );
    
    console.log('应用配置:', config.appConf);
    console.log('日志配置:', config.loggerConf);
}

main();
```

## 配置源

### 本地文件

默认配置源从 `./config` 目录加载文件。

**环境变量**: 无需配置

**示例结构**:
```
config/
├── app.yaml
├── database.yaml
└── logger.yaml
```

### Consul KV 存储

从 HashiCorp Consul 的键值存储加载配置。

**环境变量配置**:
- `CONSUL_HOST` - Consul 服务器主机名或 IP
- `CONSUL_PORT` - Consul 服务器端口（可选，非 SSL 默认 `8500`，SSL 模式默认 `443`）
- `CONSUL_TOKEN` - Consul ACL 访问令牌（可选）
- `CONSUL_SSL` - 设置为 `"true"` 启用 HTTPS 安全连接（优先于通用变量 `SSL`）
- `SSL` - 通用 SSL 开关（兼容旧配置，设为 `"true"` 启用 HTTPS）

**示例**:
```typescript
// 设置环境变量
process.env.CONSUL_HOST = 'localhost';
process.env.CONSUL_PORT = '8500';
process.env.CONSUL_TOKEN = 'your-consul-token';
process.env.CONSUL_SSL = 'false';

const config = await loadConfig('consul', 'app/config', 'app/logger', null);
```

### Nacos 配置中心

从阿里巴巴 Nacos 配置管理平台加载配置。

**环境变量配置与优先级**:
- `NACOS_SERVER_ADDR` - Nacos 直连服务器地址或集群列表（**推荐，优先级最高**）。支持：
  - 单节点地址（如 `127.0.0.1:8848`）
  - 多节点集群列表（如 `nacos1:8848,nacos2:8848,nacos3:8848`）
  - IPv6 地址（如 `[::1]:8848`）
  - 完整 URL 格式（如 `http://localhost:8848` 或 `https://nacos.example.com`）
- `NACOS_ENDPOINT` - Aliyun ACM / MSE 域名端点（如 `acm.aliyun.com`）
- `NACOS_PORT` - Nacos 服务器端口（可选，默认 `8848`，HTTPS 模式默认 `443`）
- `NACOS_SSL` - 设置为 `"true"` 启用 HTTPS/TLS 安全传输（优先于通用变量 `SSL`）
- `NACOS_NAMESPACE` - Nacos 命名空间 ID（可选）
- `NACOS_GROUP` - Nacos 配置分组（可选，默认为 `"default"`）

**示例**:
```typescript
// 1. 直连 Nacos 单节点/集群示例（推荐）
process.env.NACOS_SERVER_ADDR = '127.0.0.1:8848';
// 或多节点集群：process.env.NACOS_SERVER_ADDR = 'nacos1:8848,nacos2:8848';
process.env.NACOS_NAMESPACE = 'production';
process.env.NACOS_GROUP = 'app-configs';

// 2. 阿里云 ACM 域名端点示例
// process.env.NACOS_ENDPOINT = 'acm.aliyun.com';
// process.env.NACOS_SSL = 'true';

const config = await loadConfig('nacos', 'app.yaml', 'logger.yaml', null);
```

## 高级功能

### 配置包含

包含机制允许您从多个源组合配置：

```yaml
# main-config.yaml
app:
  name: My Application
  version: 1.0.0

includes:
  - file: database.yaml
    key: database
    params:
      poolSize: 10
  - file: redis.yaml
    key: cache
    params:
      ttl: 3600
```

```yaml
# database.yaml
host: localhost
port: 5432
name: mydb
```

最终配置结果：
```yaml
app:
  name: My Application
  version: 1.0.0
database:
  host: localhost
  port: 5432
  name: mydb
  poolSize: 10
cache:
  # redis.yaml 内容将在此处合并
  ttl: 3600
```

### 后处理

在解析前转换配置内容：

```typescript
const postProcessor = (content: string): string => {
    return content
        .replace(/#{service-name}/g, 'user-service')
        .replace(/#{environment}/g, process.env.NODE_ENV || 'development');
};

const config = await loadConfig('local', 'app.yaml', 'logger.yaml', postProcessor);
```

## API 参考

### 核心函数

#### `loadConfig(configMode, configFile, logFile, loggerPostLoader)`

同时加载应用程序和日志记录器配置。

- `configMode` - 配置源类型：'local'、'consul' 或 'nacos'
- `configFile` - 主配置文件的路径/键
- `logFile` - 日志记录器配置文件的路径/键
- `loggerPostLoader` - 日志记录器配置的可选后处理函数

**返回**: `Promise<{appConf: any, loggerConf: any}>`

#### `getLoader(type)`

创建配置加载器的工厂函数。

- `type` - 加载器类型：'local'、'consul' 或 'nacos'

**返回**: `Promise<BaseLoader>`

### BaseLoader 类

所有配置加载器的抽象基类。

#### 方法

- `load(fileName, postLoader?)` - 支持包含的配置加载
- `loadConfig(fileName, postLoader?)` - 加载和解析单个配置文件
- `deepMerge(obj1, obj2)` - 深度合并两个配置对象

## 示例

### 基本本地配置

```typescript
import { getLoader } from '@ticatec/config-loader';

const loader = await getLoader('local');
const config = await loader.load('app.yaml');
console.log(config);
```

### 带认证的 Consul

```typescript
import { loadConfig } from '@ticatec/config-loader';

process.env.CONSUL_HOST = 'consul.example.com';
process.env.CONSUL_PORT = '8500';
process.env.CONSUL_TOKEN = 'secret-token';
process.env.SSL = 'true';

const config = await loadConfig('consul', 'apps/myapp/config', 'apps/myapp/logging', null);
```

### 复杂包含结构

```yaml
# app.yaml
app:
  name: 电商 API
  version: 2.1.0

includes:
  - file: database/postgres.yaml
    key: database
    params:
      ssl: true
  - file: services/redis.yaml  
    key: cache
  - file: services/elasticsearch.yaml
    key: search
    params:
      index_prefix: ecommerce_v2
```

## 扩展库

配置加载器设计为易于扩展。您可以通过继承 `BaseLoader` 类来创建自定义加载器，以支持任何配置源。以下是使用流行配置中心的实际示例。

### 创建自定义加载器

#### 示例 1: etcd 配置加载器

```typescript
import BaseLoader from '@ticatec/config-loader';
import { Etcd3 } from 'etcd3';

export default class EtcdLoader extends BaseLoader {
    private client: Etcd3;

    constructor() {
        super();
        this.client = new Etcd3({
            hosts: process.env['ETCD_HOSTS']?.split(',') || ['http://localhost:2379'],
            auth: {
                username: process.env['ETCD_USERNAME'],
                password: process.env['ETCD_PASSWORD']
            }
        });
    }

    /**
     * 从 etcd 键值存储加载配置
     * @param fileName - etcd 键路径
     * @returns 返回配置内容的 Promise
     * @protected
     */
    protected async loadFile(fileName: string): Promise<string> {
        try {
            const value = await this.client.get(fileName);
            if (!value) {
                throw new Error(`在 etcd 中未找到配置键 '${fileName}'`);
            }
            return value.toString();
        } catch (error) {
            throw new Error(`从 etcd 加载失败: ${error.message}`);
        }
    }
}
```

**使用方法：**
```typescript
import EtcdLoader from './loaders/EtcdLoader';

// 设置环境变量
process.env.ETCD_HOSTS = 'http://etcd1:2379,http://etcd2:2379,http://etcd3:2379';
process.env.ETCD_USERNAME = 'config_user';
process.env.ETCD_PASSWORD = 'config_pass';

const loader = new EtcdLoader();
const config = await loader.load('/myapp/config/production.yaml');
```

#### 示例 2: Eureka 配置加载器

```typescript
import BaseLoader from '@ticatec/config-loader';
import axios from 'axios';

export default class EurekaLoader extends BaseLoader {
    private eurekaUrl: string;
    private appName: string;

    constructor() {
        super();
        this.eurekaUrl = process.env['EUREKA_URL'] || 'http://localhost:8761/eureka';
        this.appName = process.env['EUREKA_APP_NAME'] || 'config-service';
    }

    /**
     * 从 Eureka 服务实例加载配置
     * @param fileName - 服务上的配置文件路径
     * @returns 返回配置内容的 Promise
     * @protected
     */
    protected async loadFile(fileName: string): Promise<string> {
        try {
            // 从 Eureka 获取服务实例
            const instanceUrl = await this.getServiceInstanceUrl();
            
            // 从服务实例获取配置
            const response = await axios.get(`${instanceUrl}/config/${fileName}`, {
                timeout: 5000,
                headers: {
                    'Accept': 'application/x-yaml'
                }
            });

            return response.data;
        } catch (error) {
            throw new Error(`从 Eureka 服务加载失败: ${error.message}`);
        }
    }

    private async getServiceInstanceUrl(): Promise<string> {
        const response = await axios.get(`${this.eurekaUrl}/apps/${this.appName}`, {
            headers: { 'Accept': 'application/json' }
        });

        const instances = response.data.application?.instance;
        if (!instances || instances.length === 0) {
            throw new Error(`未找到服务实例: ${this.appName}`);
        }

        // 使用第一个可用实例
        const instance = Array.isArray(instances) ? instances[0] : instances;
        const protocol = instance.securePort?.enabled ? 'https' : 'http';
        const port = instance.securePort?.enabled ? instance.securePort['$'] : instance.port['$'];
        
        return `${protocol}://${instance.hostName}:${port}`;
    }
}
```

**使用方法：**
```typescript
import EurekaLoader from './loaders/EurekaLoader';

// 设置环境变量
process.env.EUREKA_URL = 'http://eureka-server:8761/eureka';
process.env.EUREKA_APP_NAME = 'config-service';

const loader = new EurekaLoader();
const config = await loader.load('application.yaml');
```

### 高级集成模式

#### 模式 1: 自定义加载器工厂

```typescript
import { BaseLoader } from '@ticatec/config-loader';
import EtcdLoader from './loaders/EtcdLoader';
import EurekaLoader from './loaders/EurekaLoader';

export const getAdvancedLoader = async (type: string): Promise<BaseLoader> => {
    switch (type) {
        case 'etcd':
            return new EtcdLoader();
        case 'eureka':
            return new EurekaLoader();
        case 'nacos':
            const NacosLoader = (await import('@ticatec/config-loader/dist/lib/nacos/NacosConfigLoader')).default;
            return new NacosLoader();
        case 'consul':
            const ConsulLoader = (await import('@ticatec/config-loader/dist/lib/consul/ConsulLoader')).default;
            return new ConsulLoader();
        default:
            const LocalFileLoader = (await import('@ticatec/config-loader/dist/lib/local-file/LocalFileLoader')).default;
            return new LocalFileLoader();
    }
};
```

#### 模式 2: 多源配置

```typescript
import { PostLoader } from '@ticatec/config-loader';
import { getAdvancedLoader } from './advanced-loaders';

export const loadMultiSourceConfig = async (
    sources: Array<{ type: string; configFile: string; key?: string }>,
    postLoader?: PostLoader
): Promise<any> => {
    let finalConfig = {};

    for (const source of sources) {
        const loader = await getAdvancedLoader(source.type);
        const config = await loader.load(source.configFile, postLoader);
        
        if (source.key) {
            finalConfig[source.key] = config;
        } else {
            // 如果没有指定键则深度合并
            finalConfig = { ...finalConfig, ...config };
        }
    }

    return finalConfig;
};

// 使用示例
const config = await loadMultiSourceConfig([
    { type: 'etcd', configFile: '/app/database.yaml', key: 'database' },
    { type: 'eureka', configFile: 'services.yaml', key: 'services' },
    { type: 'local', configFile: 'app.yaml' }
]);
```

### 环境配置

#### etcd 加载器配置

```bash
# etcd 配置
ETCD_HOSTS=http://etcd1:2379,http://etcd2:2379,http://etcd3:2379
ETCD_USERNAME=config_user
ETCD_PASSWORD=config_secret
ETCD_PREFIX=/myapp/config
```

#### Eureka 加载器配置

```bash
# Eureka 配置  
EUREKA_URL=http://eureka-server:8761/eureka
EUREKA_APP_NAME=config-service
EUREKA_TIMEOUT=5000
EUREKA_RETRY_COUNT=3
```

### 测试自定义加载器

```typescript
// etcd-loader.test.ts
import EtcdLoader from '../loaders/EtcdLoader';

describe('EtcdLoader', () => {
    let loader: EtcdLoader;

    beforeEach(() => {
        process.env.ETCD_HOSTS = 'http://localhost:2379';
        loader = new EtcdLoader();
    });

    it('should load configuration from etcd', async () => {
        // 模拟 etcd 客户端或使用测试容器
        const config = await loader.load('/test/config.yaml');
        expect(config).toBeDefined();
    });
});

// eureka-loader.test.ts
import EurekaLoader from '../loaders/EurekaLoader';
import nock from 'nock';

describe('EurekaLoader', () => {
    beforeEach(() => {
        process.env.EUREKA_URL = 'http://localhost:8761/eureka';
        process.env.EUREKA_APP_NAME = 'config-service';
    });

    it('should load configuration from Eureka service', async () => {
        // 模拟 Eureka API 响应
        nock('http://localhost:8761')
            .get('/eureka/apps/config-service')
            .reply(200, {
                application: {
                    instance: {
                        hostName: 'config-service-host',
                        port: { '$': '8080' },
                        securePort: { enabled: false }
                    }
                }
            });

        nock('http://config-service-host:8080')
            .get('/config/app.yaml')
            .reply(200, 'app:\n  name: test\n  version: 1.0');

        const loader = new EurekaLoader();
        const config = await loader.load('app.yaml');
        
        expect(config.app.name).toBe('test');
    });
});
```

### 自定义加载器最佳实践

1. **错误处理**: 始终在 try-catch 块中包装外部服务调用
2. **超时设置**: 为网络请求设置适当的超时时间
3. **缓存**: 考虑为频繁访问的配置实施缓存
4. **身份验证**: 安全地处理身份验证令牌和凭据
5. **连接池**: 尽可能重用连接
6. **健康检查**: 为外部服务实施健康检查

```typescript
// 带错误处理和缓存的示例
export default class RobustEtcdLoader extends BaseLoader {
    private client: Etcd3;
    private cache = new Map<string, { content: string; timestamp: number }>();
    private cacheTTL = 60000; // 1 分钟

    protected async loadFile(fileName: string): Promise<string> {
        // 首先检查缓存
        const cached = this.cache.get(fileName);
        if (cached && (Date.now() - cached.timestamp) < this.cacheTTL) {
            return cached.content;
        }

        let retries = 3;
        while (retries > 0) {
            try {
                const value = await this.client.get(fileName);
                if (value) {
                    const content = value.toString();
                    // 缓存成功结果
                    this.cache.set(fileName, { content, timestamp: Date.now() });
                    return content;
                }
            } catch (error) {
                retries--;
                if (retries === 0) throw error;
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        throw new Error(`重试后仍未找到配置 '${fileName}'`);
    }
}
```

## 贡献

我们欢迎贡献！请查看我们的[贡献指南](CONTRIBUTING.md)了解详情。

### 开发环境设置

```bash
git clone https://github.com/ticatec/config-loader.git
cd config-loader
npm install
npm run build
```

### 运行测试

```bash
npm test
```

## 许可证

版权所有 © 2023 Ticatec。保留所有权利。

该库根据 MIT 许可证发布。详情请参见 [LICENSE](LICENSE) 文件。

## 支持

- 📧 邮箱: huili.f@gmail.com
- 🐛 问题反馈: [GitHub Issues](https://github.com/ticatec/config-loader/issues)
- 📖 文档: [GitHub Pages](https://ticatec.github.io/config-loader)
