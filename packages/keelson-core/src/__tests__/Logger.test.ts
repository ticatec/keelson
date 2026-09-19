import { setLoggerProvider, resetLoggerProvider } from '@ticatec/logger-api';
import type { Logger } from '@ticatec/logger-api';
import { getLogger } from '../Logger.js';

describe('keelson-core Logger', () => {

    beforeEach(() => {
        resetLoggerProvider();
    });

    afterAll(() => {
        resetLoggerProvider();
    });

    test('returns a usable logger with no provider installed', () => {
        // The framework must never require the application to configure logging
        // before it can construct a DAO, a Service or a Criteria.
        const logger = getLogger('TestModule');
        expect(logger).toBeDefined();
        expect(typeof logger.info).toBe('function');
        expect(() => logger.debug({ sql: 'select 1' }, 'no provider yet')).not.toThrow();
    });

    test('routes to the provider once one is installed', () => {
        const seen: Array<{ name: string; category?: string; args: unknown[] }> = [];
        const noop = () => { /* discard */ };
        setLoggerProvider((name, category) => ({
            trace: noop, debug: noop, warn: noop, error: noop,
            info: (...args: unknown[]) => { seen.push({ name, category, args }); }
        } as Logger));

        getLogger('TestModule', 'service').info('hello');

        expect(seen).toHaveLength(1);
        expect(seen[0].name).toBe('TestModule');
        expect(seen[0].category).toBe('service');
    });

    test('a logger captured before injection still reaches the provider', () => {
        const logger = getLogger('EarlyBird', 'db');

        const seen: unknown[] = [];
        const noop = () => { /* discard */ };
        setLoggerProvider(() => ({
            trace: noop, debug: noop, info: noop, warn: noop,
            error: (...args: unknown[]) => { seen.push(args); }
        } as Logger));

        logger.error({ code: 'E1' }, 'late binding');
        expect(seen).toHaveLength(1);
    });
});
