# Configuration Loader

A versatile and extensible configuration loader for Node.js applications that supports loading configurations from multiple sources including local files, Consul, and Nacos, with YAML parsing and advanced merging capabilities.

[中文文档](./README_CN.md) | English

[![Version](https://img.shields.io/npm/v/@ticatec/config-loader)](https://www.npmjs.com/package/@ticatec/config-loader)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- **⚡ Dual Module Support**: Full ES Module (ESM) & CommonJS (CJS) compatibility
- **🏗️ Extensible Architecture**: Built with abstract `BaseLoader` class for easy extension to new configuration sources
- **📄 YAML Support**: Native parsing of YAML configuration files with full feature support
- **🔗 Include Mechanism**: Advanced configuration composition through file includes with deep merging
- **🌊 Deep Merge**: Intelligent merging of nested objects and arrays from multiple configuration sources
- **📡 Multiple Sources**: Support for local files, Consul KV store, and Nacos configuration center
- **⚙️ Environment Configuration**: Easy configuration through environment variables
- **🔄 Post-Processing**: Custom content transformation with PostLoader functions

## Installation

```bash
pnpm add @ticatec/config-loader
# or npm
npm install @ticatec/config-loader
```

## Quick Start

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
        'local', // or 'consul', 'nacos'
        'app.yaml',
        'logger.yaml',
        (content: string) => content.replace(/#{service-name}/g, 'my-service')
    );
    
    console.log('App Config:', config.appConf);
    console.log('Logger Config:', config.loggerConf);
}

main();
```

## Configuration Sources

### Local Files

The default configuration source loads files from the `./config` directory.

**Environment Variables**: None required

**Example Structure**:
```
config/
├── app.yaml
├── database.yaml
└── logger.yaml
```

### Consul KV Store

Load configurations from HashiCorp Consul's Key-Value store.

**Environment Variable Specifications**:
- `CONSUL_HOST` - Consul server hostname or IP address
- `CONSUL_PORT` - Consul server port (optional, default `8500`, default `443` in SSL mode)
- `CONSUL_TOKEN` - Consul ACL access token (optional)
- `CONSUL_SSL` - Set to `"true"` to enable HTTPS connection (takes precedence over generic `SSL`)
- `SSL` - Generic SSL flag (legacy compatibility, set to `"true"` for HTTPS)

**Example**:
```typescript
// Set environment variables
process.env.CONSUL_HOST = 'localhost';
process.env.CONSUL_PORT = '8500';
process.env.CONSUL_TOKEN = 'your-consul-token';
process.env.CONSUL_SSL = 'false';

const config = await loadConfig('consul', 'app/config', 'app/logger', null);
```

### Nacos Configuration Center

Loads configuration from Alibaba Nacos configuration management platform.

**Environment Variables & Priority**:
- `NACOS_SERVER_ADDR` - Direct Nacos server address or cluster node list (**Recommended, Highest Priority**). Supports:
  - Single node address (e.g., `127.0.0.1:8848`)
  - Multi-node cluster list (e.g., `nacos1:8848,nacos2:8848,nacos3:8848`)
  - IPv6 addresses (e.g., `[::1]:8848`)
  - Full URL formats (e.g., `http://localhost:8848` or `https://nacos.example.com`)
- `NACOS_ENDPOINT` - Aliyun ACM / MSE domain endpoint (e.g., `acm.aliyun.com`)
- `NACOS_PORT` - Nacos server port (optional, default `8848`, default `443` in HTTPS mode)
- `NACOS_SSL` - Set to `"true"` to enable HTTPS/TLS connection (takes precedence over generic `SSL`)
- `NACOS_NAMESPACE` - Nacos namespace ID (optional)
- `NACOS_GROUP` - Nacos configuration group (optional, default: `"default"`)

**Example**:
```typescript
// 1. Direct Nacos single node / cluster example (Recommended)
process.env.NACOS_SERVER_ADDR = '127.0.0.1:8848';
// Or multi-node cluster: process.env.NACOS_SERVER_ADDR = 'nacos1:8848,nacos2:8848';
process.env.NACOS_NAMESPACE = 'production';
process.env.NACOS_GROUP = 'app-configs';

// 2. Aliyun ACM domain endpoint example
// process.env.NACOS_ENDPOINT = 'acm.aliyun.com';
// process.env.NACOS_SSL = 'true';

const config = await loadConfig('nacos', 'app.yaml', 'logger.yaml', null);
```

## Advanced Features

### Configuration Includes

The include mechanism allows you to compose configurations from multiple sources:

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

The resulting configuration will be:
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
  # redis.yaml content merged here
  ttl: 3600
```

### Post-Processing

Transform configuration content before parsing:

```typescript
const postProcessor = (content: string): string => {
    return content
        .replace(/#{service-name}/g, 'user-service')
        .replace(/#{environment}/g, process.env.NODE_ENV || 'development');
};

const config = await loadConfig('local', 'app.yaml', 'logger.yaml', postProcessor);
```

## API Reference

### Core Functions

#### `loadConfig(configMode, configFile, logFile, loggerPostLoader)`

Load both application and logger configurations.

- `configMode` - Configuration source type: 'local', 'consul', or 'nacos'
- `configFile` - Path/key to the main configuration file
- `logFile` - Path/key to the logger configuration file  
- `loggerPostLoader` - Optional post-processing function for logger config

**Returns**: `Promise<{appConf: any, loggerConf: any}>`

#### `getLoader(type)`

Factory function to create configuration loaders.

- `type` - Loader type: 'local', 'consul', or 'nacos'

**Returns**: `Promise<BaseLoader>`

### BaseLoader Class

Abstract base class for all configuration loaders.

#### Methods

- `load(fileName, postLoader?)` - Load configuration with includes support
- `loadConfig(fileName, postLoader?)` - Load and parse single configuration file
- `deepMerge(obj1, obj2)` - Deep merge two configuration objects

## Examples

### Basic Local Configuration

```typescript
import { getLoader } from '@ticatec/config-loader';

const loader = await getLoader('local');
const config = await loader.load('app.yaml');
console.log(config);
```

### Consul with Authentication

```typescript
import { loadConfig } from '@ticatec/config-loader';

process.env.CONSUL_HOST = 'consul.example.com';
process.env.CONSUL_PORT = '8500';
process.env.CONSUL_TOKEN = 'secret-token';
process.env.SSL = 'true';

const config = await loadConfig('consul', 'apps/myapp/config', 'apps/myapp/logging', null);
```

### Complex Include Structure

```yaml
# app.yaml
app:
  name: E-commerce API
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

## Extending the Library

The configuration loader is designed to be easily extensible. You can create custom loaders for any configuration source by extending the `BaseLoader` class. Here are practical examples using popular configuration centers.

### Creating Custom Loaders

#### Example 1: etcd Configuration Loader

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
     * Load configuration from etcd key-value store
     * @param fileName - The etcd key path
     * @returns Promise that resolves to the configuration content
     * @protected
     */
    protected async loadFile(fileName: string): Promise<string> {
        try {
            const value = await this.client.get(fileName);
            if (!value) {
                throw new Error(`Configuration key '${fileName}' not found in etcd`);
            }
            return value.toString();
        } catch (error) {
            throw new Error(`Failed to load from etcd: ${error.message}`);
        }
    }
}
```

**Usage:**
```typescript
import EtcdLoader from './loaders/EtcdLoader';

// Set environment variables
process.env.ETCD_HOSTS = 'http://etcd1:2379,http://etcd2:2379,http://etcd3:2379';
process.env.ETCD_USERNAME = 'config_user';
process.env.ETCD_PASSWORD = 'config_pass';

const loader = new EtcdLoader();
const config = await loader.load('/myapp/config/production.yaml');
```

#### Example 2: Eureka Configuration Loader

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
     * Load configuration from Eureka service instance
     * @param fileName - The configuration file path on the service
     * @returns Promise that resolves to the configuration content
     * @protected
     */
    protected async loadFile(fileName: string): Promise<string> {
        try {
            // Get service instances from Eureka
            const instanceUrl = await this.getServiceInstanceUrl();
            
            // Fetch configuration from service instance
            const response = await axios.get(`${instanceUrl}/config/${fileName}`, {
                timeout: 5000,
                headers: {
                    'Accept': 'application/x-yaml'
                }
            });

            return response.data;
        } catch (error) {
            throw new Error(`Failed to load from Eureka service: ${error.message}`);
        }
    }

    private async getServiceInstanceUrl(): Promise<string> {
        const response = await axios.get(`${this.eurekaUrl}/apps/${this.appName}`, {
            headers: { 'Accept': 'application/json' }
        });

        const instances = response.data.application?.instance;
        if (!instances || instances.length === 0) {
            throw new Error(`No instances found for service: ${this.appName}`);
        }

        // Use the first available instance
        const instance = Array.isArray(instances) ? instances[0] : instances;
        const protocol = instance.securePort?.enabled ? 'https' : 'http';
        const port = instance.securePort?.enabled ? instance.securePort['$'] : instance.port['$'];
        
        return `${protocol}://${instance.hostName}:${port}`;
    }
}
```

**Usage:**
```typescript
import EurekaLoader from './loaders/EurekaLoader';

// Set environment variables
process.env.EUREKA_URL = 'http://eureka-server:8761/eureka';
process.env.EUREKA_APP_NAME = 'config-service';

const loader = new EurekaLoader();
const config = await loader.load('application.yaml');
```

### Advanced Integration Patterns

#### Pattern 1: Factory with Custom Loaders

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

#### Pattern 2: Multi-Source Configuration

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
            // Deep merge if no specific key
            finalConfig = { ...finalConfig, ...config };
        }
    }

    return finalConfig;
};

// Usage example
const config = await loadMultiSourceConfig([
    { type: 'etcd', configFile: '/app/database.yaml', key: 'database' },
    { type: 'eureka', configFile: 'services.yaml', key: 'services' },
    { type: 'local', configFile: 'app.yaml' }
]);
```

### Environment Configuration

#### For etcd Loader

```bash
# etcd Configuration
ETCD_HOSTS=http://etcd1:2379,http://etcd2:2379,http://etcd3:2379
ETCD_USERNAME=config_user
ETCD_PASSWORD=config_secret
ETCD_PREFIX=/myapp/config
```

#### For Eureka Loader

```bash
# Eureka Configuration  
EUREKA_URL=http://eureka-server:8761/eureka
EUREKA_APP_NAME=config-service
EUREKA_TIMEOUT=5000
EUREKA_RETRY_COUNT=3
```

### Testing Custom Loaders

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
        // Mock etcd client or use test container
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
        // Mock Eureka API responses
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

### Best Practices for Custom Loaders

1. **Error Handling**: Always wrap external service calls in try-catch blocks
2. **Timeouts**: Set appropriate timeouts for network requests
3. **Caching**: Consider implementing caching for frequently accessed configurations
4. **Authentication**: Handle authentication tokens and credentials securely
5. **Connection Pooling**: Reuse connections when possible
6. **Health Checks**: Implement health checks for external services

```typescript
// Example with error handling and caching
export default class RobustEtcdLoader extends BaseLoader {
    private client: Etcd3;
    private cache = new Map<string, { content: string; timestamp: number }>();
    private cacheTTL = 60000; // 1 minute

    protected async loadFile(fileName: string): Promise<string> {
        // Check cache first
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
                    // Cache successful result
                    this.cache.set(fileName, { content, timestamp: Date.now() });
                    return content;
                }
            } catch (error) {
                retries--;
                if (retries === 0) throw error;
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        throw new Error(`Configuration '${fileName}' not found after retries`);
    }
}
```

## Contributing

We welcome contributions! Please see our [contribution guidelines](CONTRIBUTING.md) for details.

### Development Setup

```bash
git clone https://github.com/ticatec/config-loader.git
cd config-loader
npm install
npm run build
```

### Running Tests

```bash
npm test
```

## License

Copyright © 2023 Ticatec. All rights reserved.

This library is released under the MIT License. See the [LICENSE](LICENSE) file for details.

## Support

- 📧 Email: huili.f@gmail.com
- 🐛 Issues: [GitHub Issues](https://github.com/ticatec/config-loader/issues)
- 📖 Documentation: [GitHub Pages](https://ticatec.github.io/config-loader)

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history and changes.