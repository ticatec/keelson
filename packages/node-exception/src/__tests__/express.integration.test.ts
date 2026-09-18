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

    it('serves plain text when nothing else is acceptable', async () => {
        process.env.NODE_ENV = 'production';
        const server = await startServer((app) => app.set('env', 'production'));
        try {
            const res = await request(server, '/boom', {accept: 'application/octet-stream'});
            expect(res.body).toContain('Code: 1001');
            expect(res.headers.get('x-content-type-options')).toBe('nosniff');
        } finally {
            await stop(server);
        }
    });
});
