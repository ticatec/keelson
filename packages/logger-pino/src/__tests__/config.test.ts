import { getLogger, initialize, resetForTest, getPinoLogger } from '../Logger.js';
import { validateConfig } from '../validate.js';
import type { LoggingConfig } from '../types.js';

const MINIMAL_CONFIG: LoggingConfig = {
    appenders: [{ name: 'console', type: 'console', level: 'info' }],
    loggers: { root: { level: 'info', appenders: ['console'] } }
};

const MULTI_CATEGORY_CONFIG: LoggingConfig = {
    appenders: [
        { name: 'console', type: 'console', level: 'info' },
        { name: 'file', type: 'file', level: 'trace', options: { filename: 'logs/app.log', sync: false } }
    ],
    loggers: {
        root: { level: 'info', appenders: ['console', 'file'] },
        controller: { level: 'debug', appenders: ['console', 'file'] },
        service: { level: 'debug', appenders: ['file'] }
    }
};

describe('validateConfig', () => {
    test('accepts a minimal valid config and normalises defaults', () => {
        const result = validateConfig({
            appenders: [{ name: 'console', type: 'console' }],
            loggers: { root: { level: 'info', appenders: ['console'] } }
        });
        expect(result.appenders[0].level).toBe('info');
        expect(result.appenders[0].options).toEqual({});
    });

    test('rejects non-object input', () => {
        expect(() => validateConfig(null)).toThrow(/top-level object/);
        expect(() => validateConfig('string')).toThrow(/top-level object/);
    });

    test('rejects empty or missing appenders', () => {
        expect(() => validateConfig({ loggers: {} })).toThrow(/non-empty "appenders"/);
        expect(() => validateConfig({ appenders: [], loggers: {} })).toThrow(/non-empty "appenders"/);
    });

    test('rejects missing loggers object', () => {
        expect(() => validateConfig({ appenders: [{ name: 'c', type: 'console' }] })).toThrow(/"loggers" object/);
    });

    test('rejects config without a root logger', () => {
        expect(() => validateConfig({
            appenders: [{ name: 'c', type: 'console' }],
            loggers: { controller: { level: 'debug', appenders: ['c'] } }
        })).toThrow(/must define a "root" logger entry/);
    });

    test('rejects logger that references an unknown appender', () => {
        expect(() => validateConfig({
            appenders: [{ name: 'c', type: 'console' }],
            loggers: { root: { level: 'info', appenders: ['c', 'missing'] } }
        })).toThrow(/references unknown appender "missing"/);
    });

    test('rejects file appender without filename', () => {
        expect(() => validateConfig({
            appenders: [{ name: 'f', type: 'file' }],
            loggers: { root: { level: 'info', appenders: ['f'] } }
        })).toThrow(/requires options\.filename/);
    });

    test('rejects duplicate appender names', () => {
        expect(() => validateConfig({
            appenders: [
                { name: 'dup', type: 'console' },
                { name: 'dup', type: 'console' }
            ],
            loggers: { root: { level: 'info', appenders: ['dup'] } }
        })).toThrow(/Duplicate appender name "dup"/);
    });

    test('rejects unsupported appender type', () => {
        expect(() => validateConfig({
            appenders: [{ name: 'x', type: 'http' }],
            loggers: { root: { level: 'info', appenders: ['x'] } }
        })).toThrow(/unsupported type "http"/);
    });
});

describe('initialize', () => {
    beforeEach(() => resetForTest());

    test('initializes root and exposes its level via getLogger', () => {
        initialize(MINIMAL_CONFIG);
        expect(getPinoLogger('Anything').level).toBe('info');
    });

    test('registers each named logger as a category', () => {
        initialize(MULTI_CATEGORY_CONFIG);

        expect(getPinoLogger('UserController', 'controller').level).toBe('debug');
        expect(getPinoLogger('UserService', 'service').level).toBe('debug');
        expect(getPinoLogger('Uncategorised').level).toBe('info');
    });

    test('category lookup falls back to root when category is unknown', () => {
        initialize(MINIMAL_CONFIG);
        expect(getPinoLogger('Foo', 'no-such-category').level).toBe('info');
    });

    test('does not initialize twice', () => {
        initialize(MINIMAL_CONFIG);
        expect(() => initialize(MINIMAL_CONFIG)).toThrow(/already been initialized/);
    });

    test('rejects invalid config without touching singleton state', () => {
        expect(() => initialize({ appenders: [], loggers: {} } as any)).toThrow();
        expect(getLogger('X')).toBeDefined();
    });
});
