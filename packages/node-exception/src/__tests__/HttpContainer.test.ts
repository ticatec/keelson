import {ExpressContainer} from '../HttpContainer.js';
import ErrorResponse from '../ErrorResponse.js';

const container = new ExpressContainer();

const makeReq = (over: Record<string, any> = {}) => ({
    get: jest.fn((name: string) => (over.headers ?? {})[name.toLowerCase()]),
    app: over.app,
    ip: over.ip,
    baseUrl: over.baseUrl,
    path: over.path,
    accepts: over.accepts ?? jest.fn(() => false)
});

const appWith = (env: unknown) => ({get: jest.fn((k: string) => (k === 'env' ? env : undefined))});

describe('ExpressContainer.isDevelopment', () => {
    const original = process.env.NODE_ENV;
    afterEach(() => {
        if (original === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = original;
    });

    it.each(['development', 'dev', 'test'])('is true for app env %s', (env) => {
        expect(container.isDevelopment(makeReq({app: appWith(env)}))).toBe(true);
    });

    it.each(['production', 'staging'])('is false for app env %s', (env) => {
        expect(container.isDevelopment(makeReq({app: appWith(env)}))).toBe(false);
    });

    // Regression: this used to read `req.get('env')` - an HTTP request header.
    // Any client could send `env: development` and force stack-trace disclosure,
    // while a real development server (which sends no such header) never saw one.
    it('ignores an `env` request header', () => {
        process.env.NODE_ENV = 'production';
        const req = makeReq({app: appWith('production'), headers: {env: 'development'}});
        expect(container.isDevelopment(req)).toBe(false);
        expect(req.get).not.toHaveBeenCalled();
    });

    it('ignores an `env` request header even when no app is attached', () => {
        process.env.NODE_ENV = 'production';
        expect(container.isDevelopment(makeReq({headers: {env: 'development'}}))).toBe(false);
    });

    it('falls back to NODE_ENV when no express app is attached', () => {
        process.env.NODE_ENV = 'test';
        expect(container.isDevelopment(makeReq())).toBe(true);
        process.env.NODE_ENV = 'production';
        expect(container.isDevelopment(makeReq())).toBe(false);
    });

    it('defaults to development when nothing is configured', () => {
        delete process.env.NODE_ENV;
        expect(container.isDevelopment(makeReq())).toBe(true);
    });

    it('tolerates a request with no app and no get()', () => {
        process.env.NODE_ENV = 'production';
        expect(container.isDevelopment({})).toBe(false);
        expect(container.isDevelopment(undefined)).toBe(false);
    });
});

describe('ExpressContainer.getPath / getRemoteIp', () => {
    it('joins baseUrl and path', () => {
        expect(container.getPath(makeReq({baseUrl: '/api', path: '/orders'}))).toBe('/api/orders');
    });

    it('tolerates missing parts', () => {
        expect(container.getPath(makeReq({path: '/orders'}))).toBe('/orders');
        expect(container.getPath(makeReq())).toBe('');
    });

    it('returns the ip or unknown', () => {
        expect(container.getRemoteIp(makeReq({ip: '10.0.0.1'}))).toBe('10.0.0.1');
        expect(container.getRemoteIp(makeReq())).toBe('unknown');
    });
});

describe('ExpressContainer.sendError', () => {
    const payload: ErrorResponse = {
        code: -1, client: '1.1.1.1', path: '/p', method: 'GET', timestamp: 1, message: 'boom'
    };

    const makeRes = () => {
        const res: any = {
            setHeader: jest.fn(),
            status: jest.fn(() => res),
            json: jest.fn(() => res),
            type: jest.fn(() => res),
            send: jest.fn(() => res)
        };
        return res;
    };

    it('prefers JSON', () => {
        const req = makeReq({accepts: jest.fn((t: string) => t === 'json')});
        const res = makeRes();
        container.sendError(req, res, 500, payload);
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith(payload);
    });

    it('falls back to HTML', () => {
        const req = makeReq({accepts: jest.fn((t: string) => t === 'html')});
        const res = makeRes();
        container.sendError(req, res, 404, payload);
        expect(res.type).toHaveBeenCalledWith('text/html');
        expect(res.send.mock.calls[0][0]).toContain('<!DOCTYPE html>');
    });

    it('falls back to plain text', () => {
        const req = makeReq({accepts: jest.fn(() => false)});
        const res = makeRes();
        container.sendError(req, res, 400, payload);
        expect(res.type).toHaveBeenCalledWith('text/plain');
        expect(res.send.mock.calls[0][0]).toContain('Code: -1');
    });

    it('always sets X-Content-Type-Options: nosniff', () => {
        const res = makeRes();
        container.sendError(makeReq({accepts: jest.fn(() => false)}), res, 400, payload);
        expect(res.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
    });

    it('tolerates a response without setHeader', () => {
        const res = makeRes();
        delete res.setHeader;
        expect(() => container.sendError(makeReq({accepts: jest.fn(() => false)}), res, 400, payload)).not.toThrow();
    });
});
