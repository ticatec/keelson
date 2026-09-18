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

describe('HttpError', () => {
    it('carries message and status code', () => {
        const err = new HttpError('boom', 418);
        expect(err.message).toBe('boom');
        expect(err.statusCode).toBe(418);
        expect(err).toBeInstanceOf(Error);
    });

    it('sets name to the concrete constructor name', () => {
        expect(new HttpError('x', 500).name).toBe('HttpError');
        expect(new UnauthenticatedError().name).toBe('UnauthenticatedError');
    });

    it('captures a stack trace that excludes the constructor frame', () => {
        const err = new TimeoutError();
        expect(typeof err.stack).toBe('string');
        expect(err.stack).not.toMatch(/at new TimeoutError/);
    });
});

describe('AppError', () => {
    it('exposes the application code and always uses status 500', () => {
        const err = new AppError(1001, 'order not found');
        expect(err.code).toBe(1001);
        expect(err.statusCode).toBe(500);
        expect(err.message).toBe('order not found');
    });

    it('falls back to a default message', () => {
        expect(new AppError(2002).message).toBe('Internal server error');
        expect(new AppError(2002, '').message).toBe('Internal server error');
    });

    it('exposes code as read-only', () => {
        const err = new AppError(3003);
        expect(() => {
            (err as unknown as { code: number }).code = 9;
        }).toThrow();
        expect(err.code).toBe(3003);
    });
});

describe('predefined errors', () => {
    const cases: Array<[HttpError, number]> = [
        [new UnauthenticatedError(), 401],
        [new InsufficientPermissionError(), 403],
        [new IllegalParameterError('bad id'), 400],
        [new ActionNotFoundError(), 404],
        [new TimeoutError(), 408],
        [new ProxyError(), 502],
        [new ServiceUnavailableError(), 503]
    ];

    it.each(cases)('%p maps to the right status code', (err, status) => {
        expect(err.statusCode).toBe(status);
        expect(err).toBeInstanceOf(HttpError);
    });

    it('IllegalParameterError keeps the caller message', () => {
        expect(new IllegalParameterError('bad id').message).toBe('bad id');
    });
});
