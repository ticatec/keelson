import LocalFileLoader from '../lib/local-file/LocalFileLoader';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Mock fs module
jest.mock('node:fs');
const mockedFs = fs as jest.Mocked<typeof fs>;

describe('LocalFileLoader', () => {
    let loader: LocalFileLoader;
    let originalCwd: string;

    beforeEach(() => {
        loader = new LocalFileLoader();
        originalCwd = process.cwd();
        jest.clearAllMocks();
    });

    afterEach(() => {
        process.chdir(originalCwd);
    });

    describe('constructor', () => {
        it('should create instance with default config directory', () => {
            const testLoader = new LocalFileLoader();
            expect(testLoader).toBeInstanceOf(LocalFileLoader);
        });

        it('should set root to current working directory + /config', () => {
            const testLoader = new LocalFileLoader();
            const expectedRoot = `${process.cwd()}/config`;
            expect((testLoader as any).root).toBe(expectedRoot);
        });
    });

    describe('loadFile', () => {
        it('should successfully load a file', async () => {
            const mockContent = 'key1: value1\nkey2: value2';
            (mockedFs.readFile as any).mockImplementation((_path: any, _options: any, callback: any) => {
                callback(null, mockContent);
                return;
            });

            const result = await (loader as any).loadFile('test.yaml');
            expect(result).toBe(mockContent);
            expect(mockedFs.readFile).toHaveBeenCalledWith(
                path.join(process.cwd(), 'config', 'test.yaml'),
                'utf8',
                expect.any(Function)
            );
        });

        it('should resolve full path relative to config directory', async () => {
            const mockContent = 'test: content';
            (mockedFs.readFile as any).mockImplementation((_path: any, _options: any, callback: any) => {
                callback(null, mockContent);
                return;
            });

            const fileName = 'subdir/config.yaml';
            await (loader as any).loadFile(fileName);

            const expectedPath = path.join(process.cwd(), 'config', fileName);
            expect(mockedFs.readFile).toHaveBeenCalledWith(
                expectedPath,
                'utf8',
                expect.any(Function)
            );
        });

        it('should reject with error when file does not exist', async () => {
            const error = new Error('ENOENT: no such file or directory');
            (mockedFs.readFile as any).mockImplementation((_path: any, _options: any, callback: any) => {
                callback(error, null);
                return;
            });

            await expect((loader as any).loadFile('nonexistent.yaml')).rejects.toThrow(error);
        });

        it('should reject with error when readFile fails', async () => {
            const error = new Error('Permission denied');
            (mockedFs.readFile as any).mockImplementation((_path: any, _options: any, callback: any) => {
                callback(error, null);
                return;
            });

            await expect((loader as any).loadFile('restricted.yaml')).rejects.toThrow(error);
        });

        it('should handle files with special characters in content', async () => {
            const mockContent = 'key: "value with special chars: quotes and special chars!@#$%"';
            (mockedFs.readFile as any).mockImplementation((_path: any, _options: any, callback: any) => {
                callback(null, mockContent);
                return;
            });

            const result = await (loader as any).loadFile('special.yaml');
            expect(result).toBe(mockContent);
        });

        it('should handle empty files', async () => {
            const mockContent = '';
            (mockedFs.readFile as any).mockImplementation((_path: any, _options: any, callback: any) => {
                callback(null, mockContent);
                return;
            });

            const result = await (loader as any).loadFile('empty.yaml');
            expect(result).toBe('');
        });

        it('should reject path traversal attempts that escape the config directory', async () => {
            await expect((loader as any).loadFile('../../secret.yaml')).rejects.toThrow(
                "Path traversal rejected: '../../secret.yaml' escapes root directory"
            );
            await expect((loader as any).loadFile('/etc/passwd')).rejects.toThrow(
                "Path traversal rejected: '/etc/passwd' escapes root directory"
            );
        });
    });

    describe('load integration', () => {
        it('should load and parse YAML configuration', async () => {
            const yamlContent = `
database:
  host: localhost
  port: 5432
  name: testdb
cache:
  enabled: true
  ttl: 3600
            `.trim();

            (mockedFs.readFile as any).mockImplementation((_path: any, _options: any, callback: any) => {
                callback(null, yamlContent);
                return;
            });

            const result = await loader.load('config.yaml', null);
            expect(result).toEqual({
                database: {
                    host: 'localhost',
                    port: 5432,
                    name: 'testdb'
                },
                cache: {
                    enabled: true,
                    ttl: 3600
                }
            });
        });

        it('should apply postLoader function', async () => {
            const yamlContent = 'name: #{service-name}\nport: 3000';
            (mockedFs.readFile as any).mockImplementation((_path: any, _options: any, callback: any) => {
                callback(null, yamlContent);
                return;
            });

            const postLoader = (content: string) => content.replace('#{service-name}', 'my-service');
            const result = await loader.load('config.yaml', postLoader);
            expect(result).toEqual({
                name: 'my-service',
                port: 3000
            });
        });

        it('should handle YAML parse errors', async () => {
            const invalidYaml = 'key: "unclosed string';
            (mockedFs.readFile as any).mockImplementation((_path: any, _options: any, callback: any) => {
                callback(null, invalidYaml);
                return;
            });

            await expect(loader.load('invalid.yaml', null)).rejects.toThrow(
                "Failed to parse YAML configuration file 'invalid.yaml'"
            );
        });
    });

    describe('load with includes', () => {
        it('should load included configuration files', async () => {
            const mainConfig = `
includes:
  - file: database.yaml
    key: database
app:
  name: test-app
            `.trim();

            const dbConfig = `
host: localhost
port: 5432
            `.trim();

            let callCount = 0;
            (mockedFs.readFile as any).mockImplementation((filePath: any, _options: any, callback: any) => {
                callCount++;
                if (filePath.toString().endsWith('database.yaml')) {
                    callback(null, dbConfig);
                } else {
                    callback(null, mainConfig);
                }
                return;
            });

            const result = await loader.load('main.yaml', null);
            expect(result).toEqual({
                app: { name: 'test-app' },
                database: { host: 'localhost', port: 5432 }
            });
            expect(callCount).toBe(2);
        });

        it('should handle multiple includes', async () => {
            const mainConfig = `
includes:
  - file: db.yaml
    key: database
  - file: cache.yaml
    key: cache
app:
  name: multi-include
            `.trim();

            (mockedFs.readFile as any).mockImplementation((filePath: any, _options: any, callback: any) => {
                const pathStr = filePath.toString();
                if (pathStr.endsWith('db.yaml')) {
                    callback(null, 'host: localhost\nport: 5432');
                } else if (pathStr.endsWith('cache.yaml')) {
                    callback(null, 'enabled: true\nttl: 3600');
                } else {
                    callback(null, mainConfig);
                }
                return;
            });

            const result = await loader.load('main.yaml', null);
            expect(result).toEqual({
                app: { name: 'multi-include' },
                database: { host: 'localhost', port: 5432 },
                cache: { enabled: true, ttl: 3600 }
            });
        });
    });
});