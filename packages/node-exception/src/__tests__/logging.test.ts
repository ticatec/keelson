import {setLoggerProvider, resetLoggerProvider} from '@ticatec/logger-api';
import type {Logger} from '@ticatec/logger-api';
import {handleError, setHttpContainer} from '../handleError.js';
import HttpContainer, {ExpressContainer} from '../HttpContainer.js';
import HttpError, {
    AppError,
    UnauthenticatedError,
    InsufficientPermissionError,
    IllegalParameterError,
    ActionNotFoundError,
    TimeoutError,
    ProxyError,
    ServiceUnavailableError
} from '../HttpError.js';

type Record_ = {level: string; first: unknown; msg?: string};

const records: Record_[] = [];

const capture = (level: string) => (first: unknown, msg?: string) => {
    records.push({level, first, msg});
};

const spyLogger: Logger = {
    trace: capture('trace'),
    debug: capture('debug'),
    info: capture('info'),
    warn: capture('warn'),
    error: capture('error')
} as Logger;

const silentContainer: HttpContainer = {
    getRemoteIp: () => '10.0.0.1',
    getPath: () => '/api/orders',
    isDevelopment: () => false,
    sendError: () => undefined
};

describe('error logging', () => {
    beforeEach(() => {
        records.length = 0;
        setLoggerProvider(() => spyLogger);
        setHttpContainer(silentContainer);
    });

    afterEach(() => {
        resetLoggerProvider();
        setHttpContainer(new ExpressContainer());
    });

    it('logs an unknown error at error level, passing the Error itself', () => {
        const err = new Error('database exploded');
        handleError(err, {method: 'POST'}, {}, jest.fn());

        expect(records).toHaveLength(1);
        expect(records[0].level).toBe('error');
        // The Error is the first argument, which is the only shape that renders a
        // stack under both pino and the console fallback.
        expect(records[0].first).toBe(err);
        expect((records[0].first as Error).stack).toContain('database exploded');
        expect(records[0].msg).toBe('Unhandled error on POST /api/orders');
    });

    it('logs a non-Error throwable at error level', () => {
        handleError('just a string', {method: 'GET'}, {}, jest.fn());

        expect(records[0].level).toBe('error');
        expect(records[0].first).toEqual({thrown: 'just a string'});
        expect(records[0].msg).toContain('non-Error throwable');
    });

    // Declared outcomes: the application raised them on purpose, chose the status
    // code, and the client is being told exactly what happened. Nothing to
    // diagnose, and at volume they would drown out real faults.
    it.each([
        ['AppError', new AppError(1001, 'business rule')],
        ['UnauthenticatedError', new UnauthenticatedError()],
        ['InsufficientPermissionError', new InsufficientPermissionError()],
        ['IllegalParameterError', new IllegalParameterError('bad id')],
        ['ActionNotFoundError', new ActionNotFoundError()],
        ['TimeoutError', new TimeoutError()],
        ['ProxyError', new ProxyError()],
        ['ServiceUnavailableError', new ServiceUnavailableError()],
        ['a bare HttpError', new HttpError('teapot', 418)]
    ])('writes nothing for %s', (_name, err) => {
        handleError(err, {method: 'GET'}, {}, jest.fn());
        expect(records).toHaveLength(0);
    });

    it('stays silent for an application subclass of HttpError', () => {
        class PaymentDeclinedError extends AppError {
            constructor() {
                super(4001, 'card declined');
            }
        }
        handleError(new PaymentDeclinedError(), {method: 'POST'}, {}, jest.fn());
        expect(records).toHaveLength(0);
    });

    it('still responds normally for a declared outcome', () => {
        const sendError = jest.fn();
        setHttpContainer({...silentContainer, sendError});
        handleError(new ActionNotFoundError(), {method: 'GET'}, {}, jest.fn());
        expect(sendError).toHaveBeenCalled();
        expect(sendError.mock.calls[0][2]).toBe(404);
        expect(records).toHaveLength(0);
    });

    it('writes nothing for a declared outcome raised after the response started', () => {
        const next = jest.fn();
        const err = new ActionNotFoundError();
        handleError(err, {method: 'GET'}, {headersSent: true}, next);
        expect(next).toHaveBeenCalledWith(err);
        expect(records).toHaveLength(0);
    });

    it('logs once, then delegates, when the response has already started', () => {
        const err = new Error('late');
        const next = jest.fn();
        handleError(err, {method: 'GET'}, {headersSent: true}, next);

        expect(next).toHaveBeenCalledWith(err);
        expect(records).toHaveLength(1);
        expect(records[0].level).toBe('error');
        expect(records[0].first).toBe(err);
    });

    it('still responds when the logger throws', () => {
        const sendError = jest.fn();
        setHttpContainer({...silentContainer, sendError});
        setLoggerProvider(() => ({
            trace: () => undefined,
            debug: () => undefined,
            info: () => undefined,
            warn: () => undefined,
            error: () => {
                throw new Error('logger is broken');
            }
        } as Logger));

        expect(() => handleError(new Error('boom'), {method: 'GET'}, {}, jest.fn())).not.toThrow();
        expect(sendError).toHaveBeenCalled();
    });

    it('still responds when the container cannot resolve a path', () => {
        const sendError = jest.fn();
        setHttpContainer({
            ...silentContainer,
            getPath: () => {
                throw new Error('no path');
            },
            sendError
        });

        // sendApplicationError has always called getPath unguarded, so the throw
        // surfaces there - but it must not have been swallowed by the logger first.
        expect(() => handleError(new Error('boom'), {method: 'GET'}, {}, jest.fn())).toThrow('no path');
        expect(records[0].msg).toBe('Unhandled error on GET unknown');
    });
});
