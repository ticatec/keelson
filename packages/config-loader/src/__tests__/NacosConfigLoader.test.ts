import NacosConfigLoader from '../lib/nacos/NacosConfigLoader';
import { NacosConfigClient } from 'nacos';

// Mock nacos module
jest.mock('nacos');
const MockedNacosConfigClient = NacosConfigClient as jest.MockedClass<typeof NacosConfigClient>;

describe('NacosConfigLoader', () => {
    let mockClient: any;
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
        jest.clearAllMocks();
        originalEnv = { ...process.env };
        for (const key of Object.keys(process.env)) {
            delete process.env[key];
        }

        // Create a mock NacosConfigClient instance
        mockClient = {
            getConfig: jest.fn()
        };

        MockedNacosConfigClient.mockImplementation(() => mockClient);
    });

    afterEach(() => {
        for (const key of Object.keys(process.env)) {
            delete process.env[key];
        }
        Object.assign(process.env, originalEnv);
    });

    describe('constructor', () => {
        it('should throw error when neither NACOS_SERVER_ADDR nor NACOS_ENDPOINT is set', () => {
            expect(() => new NacosConfigLoader()).toThrow(
                'NACOS_SERVER_ADDR or NACOS_ENDPOINT environment variable is required'
            );
        });

        it('should set serverAddr when NACOS_ENDPOINT includes http:// and port', () => {
            process.env.NACOS_ENDPOINT = 'http://localhost:8848';
            new NacosConfigLoader();

            const options = MockedNacosConfigClient.mock.calls[0][0];
            expect(options.serverAddr).toBe('localhost:8848');
        });

        it('should handle uppercase HTTPS:// URL correctly', () => {
            process.env.NACOS_ENDPOINT = 'HTTPS://nacos.example.com';
            new NacosConfigLoader();

            const options = MockedNacosConfigClient.mock.calls[0][0];
            expect(options.serverAddr).toBe('nacos.example.com:443');
            expect(options.ssl).toBe(true);
        });

        it('should preserve multi-node cluster serverAddr string without splitting', () => {
            process.env.NACOS_SERVER_ADDR = 'nacos1:8848,nacos2:8848,nacos3:8848';
            new NacosConfigLoader();

            const options = MockedNacosConfigClient.mock.calls[0][0];
            expect(options.serverAddr).toBe('nacos1:8848,nacos2:8848,nacos3:8848');
        });

        it('should handle IPv6 serverAddr format correctly', () => {
            process.env.NACOS_SERVER_ADDR = '[::1]:8848';
            new NacosConfigLoader();

            const options = MockedNacosConfigClient.mock.calls[0][0];
            expect(options.serverAddr).toBe('[::1]:8848');
        });

        it('should set endpoint when domain ACM endpoint is set without protocol or port', () => {
            process.env.NACOS_ENDPOINT = 'acm.aliyun.com';
            new NacosConfigLoader();

            const options = MockedNacosConfigClient.mock.calls[0][0];
            expect(options.endpoint).toBe('acm.aliyun.com');
        });

        it('should handle NACOS_SERVER_ADDR and NACOS_SSL correctly', () => {
            process.env.NACOS_SERVER_ADDR = 'http://127.0.0.1:8848';
            process.env.NACOS_SSL = 'true';
            new NacosConfigLoader();

            const options = MockedNacosConfigClient.mock.calls[0][0];
            expect(options.serverAddr).toBe('127.0.0.1:8848');
            expect(options.ssl).toBe(true);
        });

        it('should validate NACOS_PORT and reject trailing non-digits or out-of-bound values', () => {
            process.env.NACOS_ENDPOINT = 'http://localhost';

            process.env.NACOS_PORT = '8500abc';
            expect(() => new NacosConfigLoader()).toThrow("Invalid NACOS_PORT '8500abc': Must be a positive integer between 1 and 65535.");

            process.env.NACOS_PORT = '70000';
            expect(() => new NacosConfigLoader()).toThrow("Invalid NACOS_PORT '70000': Must be a positive integer between 1 and 65535.");

            process.env.NACOS_PORT = '0';
            expect(() => new NacosConfigLoader()).toThrow("Invalid NACOS_PORT '0': Must be a positive integer between 1 and 65535.");
        });

        it('should use NACOS_NAMESPACE from environment', () => {
            process.env.NACOS_ENDPOINT = 'http://nacos.example.com';
            process.env.NACOS_NAMESPACE = 'test-namespace';
            new NacosConfigLoader();

            const options = MockedNacosConfigClient.mock.calls[0][0];
            expect(options.namespace).toBe('test-namespace');
        });

        it('should use NACOS_GROUP from environment', () => {
            process.env.NACOS_ENDPOINT = 'http://nacos.example.com';
            process.env.NACOS_GROUP = 'test-group';
            const loader = new NacosConfigLoader();

            expect((loader as any).group).toBe('test-group');
        });

        it('should use default group when NACOS_GROUP is not set', () => {
            process.env.NACOS_ENDPOINT = 'http://nacos.example.com';
            const loader = new NacosConfigLoader();

            expect((loader as any).group).toBe('default');
        });
    });

    describe('loadFile', () => {
        it('should fetch configuration content from Nacos client', async () => {
            process.env.NACOS_ENDPOINT = 'http://localhost:8848';
            mockClient.getConfig.mockResolvedValue('key: value');

            const loader = new NacosConfigLoader();
            const result = await (loader as any).loadFile('app.yaml');

            expect(result).toBe('key: value');
            expect(mockClient.getConfig).toHaveBeenCalledWith('app.yaml', 'default');
        });
    });
});