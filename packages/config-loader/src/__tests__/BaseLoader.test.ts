import BaseLoader from '../lib/BaseLoader';

/**
 * Mock implementation of BaseLoader for testing
 */
class MockLoader extends BaseLoader {
    private mockData: Map<string, string>;

    constructor(mockData: Record<string, string> = {}) {
        super();
        this.mockData = new Map(Object.entries(mockData));
    }

    protected async loadFile(fileName: string): Promise<string> {
        const content = this.mockData.get(fileName);
        if (content === undefined) {
            throw new Error(`File not found: ${fileName}`);
        }
        return content;
    }

    public setMockData(fileName: string, content: string): void {
        this.mockData.set(fileName, content);
    }
}

describe('BaseLoader', () => {
    let loader: MockLoader;

    beforeEach(() => {
        loader = new MockLoader();
    });

    describe('deepMerge', () => {
        it('should merge two simple objects', () => {
            const obj1 = { a: 1, b: 2 };
            const obj2 = { b: 3, c: 4 };
            const result = (loader as any).deepMerge(obj1, obj2);
            expect(result).toEqual({ a: 1, b: 3, c: 4 });
        });

        it('should merge arrays by concatenating them', () => {
            const obj1 = { items: [1, 2] };
            const obj2 = { items: [3, 4] };
            const result = (loader as any).deepMerge(obj1, obj2);
            expect(result).toEqual({ items: [1, 2, 3, 4] });
        });

        it('should handle empty arrays in obj1', () => {
            const obj1 = { items: [] };
            const obj2 = { items: [1, 2] };
            const result = (loader as any).deepMerge(obj1, obj2);
            expect(result).toEqual({ items: [1, 2] });
        });

        it('should handle missing array in obj1', () => {
            const obj1 = {};
            const obj2 = { items: [1, 2] };
            const result = (loader as any).deepMerge(obj1, obj2);
            expect(result).toEqual({ items: [1, 2] });
        });

        it('should recursively merge nested objects', () => {
            const obj1 = {
                config: {
                    database: { host: 'localhost', port: 5432 },
                    cache: { enabled: true }
                }
            };
            const obj2 = {
                config: {
                    database: { host: 'production.db', port: 5433 },
                    cache: { ttl: 3600 }
                }
            };
            const result = (loader as any).deepMerge(obj1, obj2);
            expect(result).toEqual({
                config: {
                    database: { host: 'production.db', port: 5433 },
                    cache: { enabled: true, ttl: 3600 }
                }
            });
        });

        it('should handle missing nested object in obj1', () => {
            const obj1 = { config: {} };
            const obj2 = { config: { nested: { value: 1 } } };
            const result = (loader as any).deepMerge(obj1, obj2);
            expect(result).toEqual({ config: { nested: { value: 1 } } });
        });

        it('should override non-object non-array properties', () => {
            const obj1 = { name: 'old', count: 1, active: false };
            const obj2 = { name: 'new', active: true };
            const result = (loader as any).deepMerge(obj1, obj2);
            expect(result).toEqual({ name: 'new', count: 1, active: true });
        });

        it('should handle empty objects', () => {
            const obj1 = {};
            const obj2 = { a: 1 };
            const result = (loader as any).deepMerge(obj1, obj2);
            expect(result).toEqual({ a: 1 });
        });

        it('should return obj2 when obj1 is empty', () => {
            const obj1 = {};
            const obj2 = { a: 1, b: 2 };
            const result = (loader as any).deepMerge(obj1, obj2);
            expect(result).toEqual({ a: 1, b: 2 });
        });

        it('should handle complex nested structures', () => {
            const obj1 = {
                servers: ['server1'],
                config: {
                    db: { host: 'localhost' },
                    cache: ['redis']
                }
            };
            const obj2 = {
                servers: ['server2'],
                config: {
                    db: { port: 5432 },
                    cache: ['memcached']
                }
            };
            const result = (loader as any).deepMerge(obj1, obj2);
            expect(result).toEqual({
                servers: ['server1', 'server2'],
                config: {
                    db: { host: 'localhost', port: 5432 },
                    cache: ['redis', 'memcached']
                }
            });
        });
    });

    describe('loadConfig', () => {
        it('should parse valid YAML content', async () => {
            const yamlContent = `
key1: value1
key2: value2
nested:
  item1: test1
  item2: test2
            `.trim();
            loader.setMockData('test.yaml', yamlContent);
            const result = await (loader as any).loadConfig('test.yaml', null);
            expect(result).toEqual({
                key1: 'value1',
                key2: 'value2',
                nested: {
                    item1: 'test1',
                    item2: 'test2'
                }
            });
        });

        it('should apply postLoader function before parsing', async () => {
            const yamlContent = `
name: #{service-name}
port: 3000
            `.trim();
            loader.setMockData('test.yaml', yamlContent);
            const postLoader = (content: string) => content.replace('#{service-name}', 'my-service');
            const result = await (loader as any).loadConfig('test.yaml', postLoader);
            expect(result).toEqual({
                name: 'my-service',
                port: 3000
            });
        });

        it('should throw error for invalid YAML', async () => {
            const invalidYaml = 'key: "unclosed string';
            loader.setMockData('invalid.yaml', invalidYaml);
            await expect((loader as any).loadConfig('invalid.yaml', null)).rejects.toThrow(
                "Failed to parse YAML configuration file 'invalid.yaml'"
            );
        });

        it('should handle empty YAML content', async () => {
            loader.setMockData('empty.yaml', '');
            const result = await (loader as any).loadConfig('empty.yaml', null);
            expect(result).toBeNull();
        });

        it('should parse YAML arrays', async () => {
            const yamlContent = `
items:
  - item1
  - item2
  - item3
numbers: [1, 2, 3]
            `.trim();
            loader.setMockData('array.yaml', yamlContent);
            const result = await (loader as any).loadConfig('array.yaml', null);
            expect(result).toEqual({
                items: ['item1', 'item2', 'item3'],
                numbers: [1, 2, 3]
            });
        });
    });

    describe('load with includes', () => {
        it('should load and merge included configuration files', async () => {
            const mainConfig = `
includes:
  - file: database.yaml
    key: db
    params:
      maxConnections: 100
app:
  name: main-app
  port: 3000
            `.trim();

            const dbConfig = `
host: localhost
port: 5432
            `.trim();

            loader.setMockData('main.yaml', mainConfig);
            loader.setMockData('database.yaml', dbConfig);

            const result = await loader.load('main.yaml', null);
            expect(result).toEqual({
                app: {
                    name: 'main-app',
                    port: 3000
                },
                db: {
                    host: 'localhost',
                    port: 5432,
                    maxConnections: 100
                }
            });
        });

        it('should handle multiple included files', async () => {
            const mainConfig = `
includes:
  - file: db.yaml
    key: database
  - file: cache.yaml
    key: cache
  - file: logger.yaml
    key: logging
app:
  name: test
            `.trim();

            loader.setMockData('main.yaml', mainConfig);
            loader.setMockData('db.yaml', 'host: localhost\nport: 5432');
            loader.setMockData('cache.yaml', 'enabled: true\nttl: 3600');
            loader.setMockData('logger.yaml', 'level: info\nformat: json');

            const result = await loader.load('main.yaml', null);
            expect(result).toEqual({
                app: { name: 'test' },
                database: { host: 'localhost', port: 5432 },
                cache: { enabled: true, ttl: 3600 },
                logging: { level: 'info', format: 'json' }
            });
        });

        it('should handle single include (not array)', async () => {
            const mainConfig = `
includes:
  file: config.yaml
  key: config
app:
  name: main
            `.trim();

            loader.setMockData('main.yaml', mainConfig);
            loader.setMockData('config.yaml', 'key1: value1\nkey2: value2');

            const result = await loader.load('main.yaml', null);
            expect(result).toEqual({
                app: { name: 'main' },
                config: { key1: 'value1', key2: 'value2' }
            });
        });

        it('should remove includes key from final config', async () => {
            const mainConfig = `
includes:
  - file: other.yaml
    key: other
app:
  name: test
            `.trim();

            loader.setMockData('main.yaml', mainConfig);
            loader.setMockData('other.yaml', 'key: value');

            const result = await loader.load('main.yaml', null);
            expect(result).not.toHaveProperty('includes');
        });

        it('should recursively load multi-level nested includes', async () => {
            const mainConfig = `
includes:
  - file: level1.yaml
    key: level1
mainKey: mainValue
            `.trim();

            const level1Config = `
includes:
  - file: level2.yaml
    key: level2
l1Key: l1Value
            `.trim();

            const level2Config = `
l2Key: l2Value
            `.trim();

            loader.setMockData('main.yaml', mainConfig);
            loader.setMockData('level1.yaml', level1Config);
            loader.setMockData('level2.yaml', level2Config);

            const result = await loader.load('main.yaml', null);
            expect(result).toEqual({
                mainKey: 'mainValue',
                level1: {
                    l1Key: 'l1Value',
                    level2: {
                        l2Key: 'l2Value'
                    }
                }
            });
        });

        it('should handle objects with constructor property key without discarding data', () => {
            const obj1 = { constructor: 'app', name: 'service-a' };
            const obj2 = { version: '1.0.0' };
            const result = (loader as any).deepMerge(obj1, obj2);
            expect(result).toEqual({ constructor: 'app', name: 'service-a', version: '1.0.0' });
        });

        it('should prevent prototype pollution during deepMerge', () => {
            const obj1 = { name: 'safe' };
            const obj2 = JSON.parse('{"__proto__": {"polluted": true}, "constructor": {"polluted": true}}');
            const result = (loader as any).deepMerge(obj1, obj2);
            expect(result.name).toBe('safe');
            expect(({} as any).polluted).toBeUndefined();
        });

        it('should detect circular includes and throw Error', async () => {
            const fileA = `
includes:
  - file: fileB.yaml
    key: b
aKey: aValue
            `.trim();

            const fileB = `
includes:
  - file: fileA.yaml
    key: a
bKey: bValue
            `.trim();

            loader.setMockData('fileA.yaml', fileA);
            loader.setMockData('fileB.yaml', fileB);

            await expect(loader.load('fileA.yaml')).rejects.toThrow('Circular include detected: fileA.yaml -> fileB.yaml -> fileA.yaml');
        });

        it('should handle root-level YAML array without triggering includes false positive', async () => {
            const rootArrayYaml = `
- item1
- item2
- item3
            `.trim();

            loader.setMockData('array-root.yaml', rootArrayYaml);
            const result = await loader.load('array-root.yaml');
            expect(result).toEqual(['item1', 'item2', 'item3']);
        });

        it('should reject reserved prototype keys in include key', async () => {
            const protoKeyConfig = `
includes:
  - file: other.yaml
    key: __proto__
app:
  name: proto-test
            `.trim();

            loader.setMockData('main.yaml', protoKeyConfig);
            loader.setMockData('other.yaml', 'foo: bar');

            await expect(loader.load('main.yaml')).rejects.toThrow("Invalid include item at index 0 in 'main.yaml': 'key' cannot be reserved prototype property '__proto__'.");
        });

        it('should fail fast when include item has missing or invalid file property', async () => {
            const mainConfig = `
includes:
  - filename: db.yaml
app:
  name: typo-test
            `.trim();

            loader.setMockData('main.yaml', mainConfig);
            await expect(loader.load('main.yaml')).rejects.toThrow("Invalid include item at index 0 in 'main.yaml': 'file' property must be a non-empty string.");
        });
    });

    describe('getLoader', () => {
        it('should throw error for unknown or unsupported config mode', async () => {
            const { getLoader } = await import('../lib/BaseLoader');
            await expect(getLoader('consull')).rejects.toThrow("Unknown or unsupported config mode 'consull'");
        });

        it('should return LocalFileLoader for local mode', async () => {
            const { getLoader } = await import('../lib/BaseLoader');
            const loaderInstance = await getLoader('local');
            expect(loaderInstance.constructor.name).toBe('LocalFileLoader');
        });
    });
});