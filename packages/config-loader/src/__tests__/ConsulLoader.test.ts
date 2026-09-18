import ConsulLoader from '../lib/consul/ConsulLoader';
import Consul from 'consul';

// Mock Consul module
jest.mock('consul');
const MockedConsul = Consul as jest.MockedClass<typeof Consul>;

describe('ConsulLoader', () => {
    let loader: ConsulLoader;
    let mockConsul: any;
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
        jest.clearAllMocks();
        originalEnv = { ...process.env };
        for (const key of Object.keys(process.env)) {
            delete process.env[key];
        }

        // Create a mock Consul instance
        mockConsul = {
            kv: {
                get: jest.fn()
            }
        };

        MockedConsul.mockImplementation(() => mockConsul);
    });

    afterEach(() => {
        for (const key of Object.keys(process.env)) {
            delete process.env[key];
        }
        Object.assign(process.env, originalEnv);
    });

    describe('constructor', () => {
        it('should create instance with default configuration when no env vars set', () => {
            loader = new ConsulLoader();
            expect(MockedConsul).toHaveBeenCalled();
            const config = MockedConsul.mock.calls[0][0];
            expect(config.port).toBe(8500);
        });

        it('should use CONSUL_HOST from environment', () => {
            process.env.CONSUL_HOST = 'consul.example.com';
            loader = new ConsulLoader();

            const config = MockedConsul.mock.calls[0][0];
            expect(config.host).toBe('consul.example.com');
        });

        it('should use CONSUL_PORT from environment', () => {
            process.env.CONSUL_PORT = '8500';
            loader = new ConsulLoader();

            const config = MockedConsul.mock.calls[0][0];
            expect(config.port).toBe(8500);
        });

        it('should validate CONSUL_PORT and throw for invalid values or trailing non-digits', () => {
            process.env.CONSUL_PORT = 'invalid';
            expect(() => new ConsulLoader()).toThrow("Invalid CONSUL_PORT 'invalid': Must be a positive integer between 1 and 65535.");

            process.env.CONSUL_PORT = '8500abc';
            expect(() => new ConsulLoader()).toThrow("Invalid CONSUL_PORT '8500abc': Must be a positive integer between 1 and 65535.");

            process.env.CONSUL_PORT = '70000';
            expect(() => new ConsulLoader()).toThrow("Invalid CONSUL_PORT '70000': Must be a positive integer between 1 and 65535.");
        });

        it('should support CONSUL_SSL=true from environment', () => {
            process.env.CONSUL_SSL = 'true';
            loader = new ConsulLoader();

            const config = MockedConsul.mock.calls[0][0];
            expect(config.secure).toBe(true);
            expect(config.port).toBe(443);
        });

        it('should fallback to SSL=true from environment', () => {
            process.env.SSL = 'true';
            loader = new ConsulLoader();

            const config = MockedConsul.mock.calls[0][0];
            expect(config.secure).toBe(true);
            expect(config.port).toBe(443);
        });

        it('should prioritize CONSUL_PORT over default SSL port', () => {
            process.env.CONSUL_SSL = 'true';
            process.env.CONSUL_PORT = '8443';
            loader = new ConsulLoader();

            const config = MockedConsul.mock.calls[0][0];
            expect(config.port).toBe(8443);
            expect(config.secure).toBe(true);
        });

        it('should use CONSUL_TOKEN from environment', () => {
            process.env.CONSUL_TOKEN = 'test-token-12345';
            loader = new ConsulLoader();

            const config = MockedConsul.mock.calls[0][0];
            expect(config.defaults?.token).toBe('test-token-12345');
        });
    });

    describe('loadFile', () => {
        it('should fetch configuration content from Consul KV store', async () => {
            mockConsul.kv.get.mockResolvedValue({ Value: 'key: value' });
            loader = new ConsulLoader();

            const result = await (loader as any).loadFile('app.yaml');
            expect(result).toBe('key: value');
            expect(mockConsul.kv.get).toHaveBeenCalledWith('app.yaml');
        });
    });
});