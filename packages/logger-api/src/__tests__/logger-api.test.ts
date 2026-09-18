import {
    getLogger, setLoggerProvider, resetLoggerProvider, hasLoggerProvider, createConsoleLogger
} from '../index.js';
import type { Logger, LoggerProvider } from '../index.js';

/** Records every call so assertions can inspect what a package actually logged. */
const recorder = () => {
    const calls: Array<{ level: string; args: unknown[]; name: string; category?: string }> = [];
    const provider: LoggerProvider = (name, category) => {
        const at = (level: string) => (...args: unknown[]) => { calls.push({ level, args, name, category }); };
        return { trace: at('trace'), debug: at('debug'), info: at('info'), warn: at('warn'), error: at('error') } as Logger;
    };
    return { calls, provider };
};

describe('@ticatec/logger-api', () => {

    const ORIGINAL_LEVEL = process.env['LOG_LEVEL'];

    beforeEach(() => {
        resetLoggerProvider();
        process.env['LOG_LEVEL'] = 'silent';
    });

    afterAll(() => {
        resetLoggerProvider();
        if (ORIGINAL_LEVEL === undefined) delete process.env['LOG_LEVEL'];
        else process.env['LOG_LEVEL'] = ORIGINAL_LEVEL;
    });

    describe('contract', () => {
        test('exposes exactly the five level methods', () => {
            const logger = getLogger('X');
            for (const m of ['trace', 'debug', 'info', 'warn', 'error']) {
                expect(typeof (logger as any)[m]).toBe('function');
            }
        });

        test('works with no provider installed and never throws', () => {
            expect(hasLoggerProvider()).toBe(false);
            const logger = getLogger('NoProvider');
            expect(() => {
                logger.info('plain message');
                logger.debug({ sql: 'select 1' }, 'structured message');
                logger.error(new Error('boom'), 'an error');
            }).not.toThrow();
        });
    });

    describe('provider injection', () => {
        test('routes records to the installed provider', () => {
            const { calls, provider } = recorder();
            setLoggerProvider(provider);

            getLogger('UserService', 'service').info('hello');

            expect(hasLoggerProvider()).toBe(true);
            expect(calls).toHaveLength(1);
            expect(calls[0].level).toBe('info');
            expect(calls[0].name).toBe('UserService');
            expect(calls[0].category).toBe('service');
            expect(calls[0].args[0]).toBe('hello');
        });

        test('preserves both call shapes', () => {
            const { calls, provider } = recorder();
            setLoggerProvider(provider);
            const logger = getLogger('SQL', 'db');

            logger.debug('a plain message');
            logger.debug({ sql: 'select 1', paramCount: 2 }, 'Executing SQL update');

            expect(calls[0].args[0]).toBe('a plain message');
            expect(calls[1].args[0]).toEqual({ sql: 'select 1', paramCount: 2 });
            expect(calls[1].args[1]).toBe('Executing SQL update');
        });

        test('resetLoggerProvider restores the console fallback', () => {
            const { calls, provider } = recorder();
            setLoggerProvider(provider);
            const logger = getLogger('X');
            logger.info('routed');
            expect(calls).toHaveLength(1);

            resetLoggerProvider();
            expect(hasLoggerProvider()).toBe(false);
            logger.info('not routed');
            expect(calls).toHaveLength(1);
        });
    });

    describe('lazy resolution — the ordering guarantee', () => {
        test('a logger captured BEFORE injection still routes to the provider', () => {
            // This is the pattern the framework uses: base classes capture
            // `this.logger = getLogger(...)` in their constructor, and beans are
            // built lazily, so construction may well precede injection.
            const logger = getLogger('CapturedEarly', 'db');

            const { calls, provider } = recorder();
            setLoggerProvider(provider);

            logger.warn({ attempt: 1 }, 'late binding works');

            expect(calls).toHaveLength(1);
            expect(calls[0].name).toBe('CapturedEarly');
            expect(calls[0].category).toBe('db');
        });

        test('follows a provider that is swapped at runtime', () => {
            const first = recorder();
            const second = recorder();

            const logger = getLogger('Swappable');
            setLoggerProvider(first.provider);
            logger.info('one');
            setLoggerProvider(second.provider);
            logger.info('two');

            expect(first.calls).toHaveLength(1);
            expect(second.calls).toHaveLength(1);
        });

        test('does not rebuild the underlying logger on every call', () => {
            let built = 0;
            setLoggerProvider((_name) => {
                built++;
                const noop = () => { /* discard */ };
                return { trace: noop, debug: noop, info: noop, warn: noop, error: noop } as Logger;
            });

            const logger = getLogger('Cached');
            logger.info('1'); logger.info('2'); logger.info('3');

            expect(built).toBe(1);
        });
    });

    describe('argument forwarding', () => {
        test('forwards exactly the arguments it received', () => {
            const seen: unknown[][] = [];
            const noop = () => { /* discard */ };
            setLoggerProvider(() => ({
                trace: noop, debug: noop, warn: noop, error: noop,
                info: (...args: unknown[]) => { seen.push(args); }
            } as Logger));

            const logger = getLogger('Forwarding');
            logger.info('just a message');
            logger.info({ k: 1 }, 'with context');
            logger.info('with extras', 1, 2);

            // A message-only call must not arrive as ('msg', undefined) — a naive
            // provider would render the trailing undefined.
            expect(seen[0]).toEqual(['just a message']);
            expect(seen[1]).toEqual([{ k: 1 }, 'with context']);
            expect(seen[2]).toEqual(['with extras', 1, 2]);
        });
    });

    describe('dual package hazard', () => {
        // This package ships CJS and ESM builds. Loading both in one process
        // creates two module instances; module-scoped state would give each its
        // own registry, so a provider installed through one would be invisible to
        // the other. The registry therefore lives on a well-known global symbol.
        const KEY = Symbol.for('@ticatec/logger-api.registry');

        test('anchors its state on Symbol.for(), not on module scope', () => {
            const shared = (globalThis as any)[KEY];
            expect(shared).toBeDefined();
            expect(shared).toHaveProperty('provider');
            expect(shared).toHaveProperty('generation');
        });

        test('observes a provider installed by another module instance', () => {
            const seen: unknown[][] = [];
            const noop = () => { /* discard */ };

            // Simulate the other build writing straight to the shared registry.
            const shared = (globalThis as any)[KEY];
            shared.provider = () => ({
                trace: noop, debug: noop, info: noop, warn: noop,
                error: (...args: unknown[]) => { seen.push(args); }
            } as Logger);
            shared.generation++;

            expect(hasLoggerProvider()).toBe(true);
            getLogger('CrossInstance').error({ code: 'E' }, 'routed across module instances');
            expect(seen).toHaveLength(1);
        });
    });

    describe('console fallback', () => {
        const withLevel = (level: string, fn: () => void) => {
            process.env['LOG_LEVEL'] = level;
            try { fn(); } finally { process.env['LOG_LEVEL'] = 'silent'; }
        };

        test('filters by LOG_LEVEL', () => {
            const spy = jest.spyOn(console, 'debug').mockImplementation(() => { /* capture */ });
            try {
                withLevel('info', () => createConsoleLogger('X').debug('should be filtered'));
                expect(spy).not.toHaveBeenCalled();

                withLevel('debug', () => createConsoleLogger('X').debug('should pass'));
                expect(spy).toHaveBeenCalledTimes(1);
            } finally {
                spy.mockRestore();
            }
        });

        test('defaults to info when LOG_LEVEL is unset or invalid', () => {
            const debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => { /* capture */ });
            const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => { /* capture */ });
            try {
                withLevel('not-a-level', () => {
                    createConsoleLogger('X').debug('filtered');
                    createConsoleLogger('X').info('emitted');
                });
                expect(debugSpy).not.toHaveBeenCalled();
                expect(infoSpy).toHaveBeenCalledTimes(1);
            } finally {
                debugSpy.mockRestore();
                infoSpy.mockRestore();
            }
        });

        test('renders the structured form with the message and the context', () => {
            const spy = jest.spyOn(console, 'info').mockImplementation(() => { /* capture */ });
            try {
                withLevel('info', () => createConsoleLogger('SQL', 'db').info({ rows: 3 }, 'query done'));
                const line = String(spy.mock.calls[0][0]);
                expect(line).toContain('[db/SQL]');
                expect(line).toContain('query done');
                expect(line).toContain('"rows":3');
            } finally {
                spy.mockRestore();
            }
        });

        test('survives a circular context object', () => {
            const spy = jest.spyOn(console, 'error').mockImplementation(() => { /* capture */ });
            try {
                const circular: any = { name: 'loop' };
                circular.self = circular;
                withLevel('error', () => {
                    expect(() => createConsoleLogger('X').error(circular, 'circular')).not.toThrow();
                });
                expect(spy).toHaveBeenCalledTimes(1);
            } finally {
                spy.mockRestore();
            }
        });

        test('prints the stack for an Error context', () => {
            const spy = jest.spyOn(console, 'error').mockImplementation(() => { /* capture */ });
            try {
                withLevel('error', () => createConsoleLogger('X').error(new Error('kaboom'), 'failed'));
                expect(String(spy.mock.calls[0][0])).toContain('kaboom');
            } finally {
                spy.mockRestore();
            }
        });

        test('silent suppresses everything', () => {
            const spy = jest.spyOn(console, 'error').mockImplementation(() => { /* capture */ });
            try {
                withLevel('silent', () => createConsoleLogger('X').error('nope'));
                expect(spy).not.toHaveBeenCalled();
            } finally {
                spy.mockRestore();
            }
        });
    });
});
