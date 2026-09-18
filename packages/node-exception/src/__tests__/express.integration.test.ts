import express from 'express';
import type {AddressInfo} from 'net';
import type {Server} from 'http';
import {handleError, setHttpContainer} from '../handleError.js';
import {ExpressContainer} from '../HttpContainer.js';
import {AppError} from '../HttpError.js';

const startServer = (configure: (app: express.Express) => void): Promise<Server> =>
    new Promise((resolve) => {
        const app = express();
        configure(app);
        app.get('/boom', (_req, _res, next) => next(new AppError(1001, 'kaboom')));
        app.use(handleError as express.ErrorRequestHandler);
        const server = app.listen(0, () => resolve(server));
    });

const stop = (server: Server): Promise<void> =>
    new Promise((resolve) => server.close(() => resolve()));

const request = async (server: Server, path: string, headers: Record<string, string>) => {
    const {port} = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {headers});
    return {status: res.status, headers: res.headers, body: await res.text()};
};

describe('express integration', () => {
    const original = process.env.NODE_ENV;

    beforeEach(() => setHttpContainer(new ExpressContainer()));
    afterEach(() => {
        if (original === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = original;
    });

    it('returns a JSON error payload', async () => {
        process.env.NODE_ENV = 'production';
        const server = await startServer((app) => app.set('env', 'production'));
        try {
            const res = await request(server, '/boom', {accept: 'application/json'});
            expect(res.status).toBe(500);
            expect(JSON.parse(res.body)).toMatchObject({code: 1001, message: 'kaboom', method: 'GET', path: '/boom'});
            expect(res.headers.get('x-content-type-options')).toBe('nosniff');
        } finally {
            await stop(server);
        }
    });

    // Regression: `req.get('env')` meant a real development server never produced
    // a stack trace, while any client could ask for one by sending `env: development`.
    it('exposes the stack when the app env is development', async () => {
        const server = await startServer((app) => app.set('env', 'development'));
        try {
            const res = await request(server, '/boom', {accept: 'application/json'});
            expect(JSON.parse(res.body).stack).toContain('AppError');
        } finally {
            await stop(server);
        }
    });

    it('never exposes the stack because of an `env` request header', async () => {
        process.env.NODE_ENV = 'production';
        const server = await startServer((app) => app.set('env', 'production'));
        try {
            const res = await request(server, '/boom', {accept: 'application/json', env: 'development'});
            expect(JSON.parse(res.body).stack).toBeUndefined();
            expect(res.body).not.toContain('at ');
        } finally {
            await stop(server);
        }
    });

    // Regression: `client` is req.ip, which follows X-Forwarded-For under `trust proxy`.
    it('escapes an X-Forwarded-For payload in the HTML error page', async () => {
        process.env.NODE_ENV = 'production';
        const server = await startServer((app) => {
            app.set('env', 'production');
            app.set('trust proxy', true);
        });
        try {
            const res = await request(server, '/boom', {
                accept: 'text/html',
                'x-forwarded-for': '"><script>alert(document.domain)</script>'
            });
            expect(res.body).not.toContain('<script>alert(document.domain)</script>');
            expect(res.body).toContain('&lt;script&gt;alert(document.domain)&lt;/script&gt;');
        } finally {
            await stop(server);
        }
    });

    // Regression: `req.accepts('json')` returns 'json' for a browser too, because a
    // browser's Accept header ends in `*/*;q=0.8`. The old chain of single-type
    // checks therefore answered every browser page request with JSON, and the HTML
    // error page was unreachable in practice - the unit tests missed it only because
    // they sent a bare `accept: text/html`.
    const BROWSER_ACCEPT =
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8';

    it.each([
        ['a browser', BROWSER_ACCEPT, 'text/html'],
        ['an explicit text/html client', 'text/html', 'text/html'],
        ['an API client', 'application/json', 'application/json'],
        ['curl (*/*)', '*/*', 'application/json'],
        ['a plain-text client', 'text/plain', 'text/plain'],
        ['an unsatisfiable client', 'application/octet-stream', 'application/json']
    ])('negotiates %s to %s', async (_name, accept, contentType) => {
        process.env.NODE_ENV = 'production';
        const server = await startServer((app) => app.set('env', 'production'));
        try {
            const res = await request(server, '/boom', {accept});
            expect(res.headers.get('content-type')).toContain(contentType);
            expect(res.headers.get('x-content-type-options')).toBe('nosniff');
            if (contentType === 'text/html') {
                expect(res.body).toContain('<!DOCTYPE html>');
                expect(res.body).toContain('<h1>Error Code: 1001</h1>');
            } else if (contentType === 'text/plain') {
                expect(res.body).toContain('Code: 1001');
            } else {
                expect(JSON.parse(res.body).code).toBe(1001);
            }
        } finally {
            await stop(server);
        }
    });

    // Regression: RouterHelper and friends call handleError(err, req, res, null).
    // Falling through to write a response after the headers are out threw
    // ERR_HTTP_HEADERS_SENT from inside the error handler, crashing the process.
    it('does not throw when the response has started and no next is given', async () => {
        process.env.NODE_ENV = 'production';
        const app = express();
        app.set('env', 'production');
        app.get('/late', (_req, res) => {
            res.status(200).json({ok: true});
            handleError(new AppError(5001, 'after send'), _req, res, null);
        });
        const server: Server = await new Promise((resolve) => {
            const s = app.listen(0, () => resolve(s));
        });
        const uncaught: Error[] = [];
        const onUncaught = (e: Error) => uncaught.push(e);
        process.on('uncaughtException', onUncaught);
        try {
            const res = await request(server, '/late', {accept: 'application/json'});
            expect(res.status).toBe(200);
            expect(JSON.parse(res.body)).toEqual({ok: true});
            await new Promise((r) => setTimeout(r, 50));
            expect(uncaught).toHaveLength(0);
        } finally {
            process.off('uncaughtException', onUncaught);
            await stop(server);
        }
    });
});
