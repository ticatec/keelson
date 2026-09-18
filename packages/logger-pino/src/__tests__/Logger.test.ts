import pino from 'pino';
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
                .toThrow('logger-pino is not initialized');
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
                .toThrow('logger-pino has already been initialized');
        });

        test('throws on invalid config without touching singleton state if uninitialized', () => {
            expect(() => initialize({ appenders: [], loggers: {} } as any)).toThrow();
        });
    });

    describe('appender destinations are shared, not rebuilt per logger', () => {
        // root, controller and service all name the same file appender. Building
        // the destination per logger entry would open that file three times, each
        // with its own sonic-boom buffer — wasted descriptors and interleaved
        // writes under load.
        test('calls pino.destination once per appender, however many loggers use it', () => {
            const spy = jest.spyOn(pino, 'destination');
            try {
                initialize({
                    appenders: [{ name: 'file', type: 'file', level: 'info', options: { filename: '/tmp/logger-pino-test.log' } }],
                    loggers: {
                        root: { level: 'info', appenders: ['file'] },
                        controller: { level: 'info', appenders: ['file'] },
                        service: { level: 'info', appenders: ['file'] }
                    }
                });
                expect(spy).toHaveBeenCalledTimes(1);
            } finally {
                spy.mockRestore();
            }
        });
    });

    describe('category reaches the log payload', () => {
        test('binds category alongside module on the child logger', () => {
            initialize(MULTI_CATEGORY_CONFIG);
            expect(getPinoLogger('UserController', 'controller').bindings())
                .toEqual({ module: 'UserController', category: 'controller' });
        });

        test('omits category when none was given', () => {
            initialize(MULTI_CATEGORY_CONFIG);
            expect(getPinoLogger('AppConf').bindings()).toEqual({ module: 'AppConf' });
        });
    });

    describe('dual package hazard', () => {
        // The CJS and ESM builds of this package are two module instances.
        // Module-scoped state would leave initialize() in one invisible to the
        // other, and getPinoLogger() there would throw.
        const KEY = Symbol.for('@ticatec/logger-pino.state');

        test('anchors its state on Symbol.for(), not on module scope', () => {
            initialize(INFO_CONFIG);
            const shared = (globalThis as any)[KEY];
            expect(shared).toBeDefined();
            expect(shared.root).not.toBeNull();
            expect(shared.categories).toBeInstanceOf(Map);
            expect(shared.children).toBeInstanceOf(Map);
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
