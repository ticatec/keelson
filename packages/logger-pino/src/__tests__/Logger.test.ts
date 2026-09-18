import { getLogger, initialize, resetForTest, fallbackLoggingConf, getPinoLogger } from '../Logger.js';
import { hasLoggerProvider } from '@ticatec/logger-api';
import type { LoggingConfig } from '../types.js';

const SILENT_CONFIG: LoggingConfig = {
    appenders: [{ name: 'console', type: 'console', level: 'silent' }],
    loggers: { root: { level: 'silent', appenders: ['console'] } }
};

const INFO_CONFIG: LoggingConfig = {
    appenders: [{ name: 'console', type: 'console', level: 'info' }],
    loggers: { root: { level: 'info', appenders: ['console'] } }
};

const MULTI_CATEGORY_CONFIG: LoggingConfig = {
    appenders: [{ name: 'console', type: 'console', level: 'info' }],
    loggers: {
        root: { level: 'info', appenders: ['console'] },
        controller: { level: 'debug', appenders: ['console'] }
    }
};

describe('Logger Wrapper', () => {
    beforeEach(() => {
        resetForTest();
    });

    describe('fallbackLoggingConf', () => {
        test('constructs default console logging config with specified level', () => {
            const conf = fallbackLoggingConf('debug');
            expect(conf).toEqual({
                appenders: [{ name: 'console', type: 'console', level: 'debug' }],
                loggers: { root: { level: 'debug', appenders: ['console'] } }
            });
        });
    });

    describe('initialization contract', () => {
        test('getLogger works before initialize, routed by @ticatec/logger-api to the console', () => {
            // This adapter is optional. Until initialize() installs the pino
            // provider, logger-api's console fallback handles every record.
            expect(hasLoggerProvider()).toBe(false);
            const logger = getLogger('TestModule');
            expect(logger).toBeDefined();
            expect(() => logger.info('before initialize')).not.toThrow();
        });

        test('initialize installs the pino provider for the whole process', () => {
            expect(hasLoggerProvider()).toBe(false);
            initialize(SILENT_CONFIG);
            expect(hasLoggerProvider()).toBe(true);
            expect(getPinoLogger('LateModule').level).toBe('silent');
        });

        test('getPinoLogger throws before initialize', () => {
            expect(() => getPinoLogger('TooEarly'))
                .toThrow('LoggerWrapper is not initialized');
        });

        test('a logger captured before initialize still reaches pino afterwards', () => {
            const logger = getLogger('EarlyModule');
            initialize(SILENT_CONFIG);
            expect(() => logger.info('late bound')).not.toThrow();
            expect(hasLoggerProvider()).toBe(true);
        });

        test('throws when initialize is called more than once explicitly', () => {
            initialize(SILENT_CONFIG);
            expect(() => initialize(SILENT_CONFIG))
                .toThrow('LoggerWrapper has already been initialized');
        });

        test('throws on invalid config without touching singleton state if uninitialized', () => {
            expect(() => initialize({ appenders: [], loggers: {} } as any)).toThrow();
        });
    });

    describe('getLogger without category', () => {
        test('returns a child of the root logger', () => {
            initialize(INFO_CONFIG);
            const logger = getPinoLogger('TestModule');
            expect(logger).toBeDefined();
            expect(logger.level).toBe('info');
        });

        test('caches the underlying pino child by name', () => {
            initialize(INFO_CONFIG);
            expect(getPinoLogger('X')).toBe(getPinoLogger('X'));
        });
    });

    describe('getLogger with category', () => {
        test('falls back to root when category is unknown', () => {
            initialize(INFO_CONFIG);
            expect(getPinoLogger('Foo', 'nonexistent').level).toBe('info');
        });

        test('uses the category logger when category matches', () => {
            initialize(MULTI_CATEGORY_CONFIG);

            const rootLogger = getPinoLogger('UserController');
            const controllerLogger = getPinoLogger('UserController', 'controller');

            expect(rootLogger.level).toBe('info');
            expect(controllerLogger.level).toBe('debug');
            expect(rootLogger).not.toBe(controllerLogger);
        });

        test('caches per (name, category) pair independently', () => {
            initialize(MULTI_CATEGORY_CONFIG);

            const a1 = getPinoLogger('UserController', 'controller');
            const a2 = getPinoLogger('UserController', 'controller');
            const b1 = getPinoLogger('UserController');

            expect(a1).toBe(a2);
            expect(a1).not.toBe(b1);
        });
    });
});
