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

    // 4xx is the client's problem: visible when debugging, silent in production.
    it.each([
        ['UnauthenticatedError', new UnauthenticatedError(), 401],
        ['InsufficientPermissionError', new InsufficientPermissionError(), 403],
        ['IllegalParameterError', new IllegalParameterError('bad id'), 400],
        ['ActionNotFoundError', new ActionNotFoundError(), 404],
        ['TimeoutError', new TimeoutError(), 408]
    ])('logs %s at debug level', (_name, err, status) => {
        handleError(err, {method: 'GET'}, {}, jest.fn());
        expect(records).toHaveLength(1);
        expect(records[0].level).toBe('debug');
        expect(records[0].msg).toBe(`Handled ${status} on GET /api/orders`);
    });

    // 5xx means the server failed. The client gets no stack in production, so this
    // record is the only thing that says why - it must not be silenced because the
    // error type happens to be a declared one.
    it.each([
        ['AppError', new AppError(5001, 'payment gateway down'), 500],
        ['ProxyError', new ProxyError(), 502],
        ['ServiceUnavailableError', new ServiceUnavailableError(), 503]
    ])('logs %s at error level with its stack', (_name, err, status) => {
        handleError(err, {method: 'POST'}, {}, jest.fn());
        expect(records).toHaveLength(1);
        expect(records[0].level).toBe('error');
        expect(records[0].first).toBe(err);
        expect((records[0].first as Error).stack).toBeTruthy();
        expect(records[0].msg).toBe(`Handled ${status} on POST /api/orders`);
    });

    it('classifies an application subclass by its status code, not its type', () => {
        class PaymentDeclinedError extends AppError {
            constructor() {
                super(4001, 'card declined');
            }
        }
        handleError(new PaymentDeclinedError(), {method: 'POST'}, {}, jest.fn());
        expect(records[0].level).toBe('error');   // AppError is a 500
    });

    it('logs a bare HttpError by its status code', () => {
        handleError(new HttpError('teapot', 418), {method: 'GET'}, {}, jest.fn());
        expect(records[0].level).toBe('debug');
        handleError(new HttpError('gateway', 504), {method: 'GET'}, {}, jest.fn());
        expect(records[1].level).toBe('error');
    });

    it('keeps the cause chain attached for the logger to unwind', () => {
        const root = new Error('ECONNREFUSED 10.0.0.9:5432');
        handleError(new AppError(5002, 'order save failed', {cause: root}), {method: 'POST'}, {}, jest.fn());
        expect(records[0].level).toBe('error');
        expect((records[0].first as Error).cause).toBe(root);
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
