// `node:module` is mocked at the top of this file so the mock client's resolution
// can be made to fail on demand. Jest freezes an ES module namespace object, so
// patching `createRequire` after the fact does not work - it has to be mocked
// before RedisClient is loaded.
const actualModule = jest.requireActual<typeof import('node:module')>('node:module');
let resolutionFails = false;

jest.mock('node:module', () => ({
    ...actualModule,
    createRequire: (...args: unknown[]) => {
        if (resolutionFails) {
            const err = new Error("Cannot find module 'ioredis-mock'") as NodeJS.ErrnoException;
            err.code = 'MODULE_NOT_FOUND';
            throw err;
        }
        return (actualModule.createRequire as (...a: unknown[]) => unknown)(...args);
    }
}));

import { setLoggerProvider, resetLoggerProvider } from '@ticatec/logger-api';
import type { Logger } from '@ticatec/logger-api';
import * as fs from 'node:fs';
import * as nodePath from 'node:path';
import pkg from '../../package.json';
import RedisClient from '../RedisClient.js';

const silent: Logger = (() => {
    const noop = () => undefined;
    return { trace: noop, debug: noop, info: noop, warn: noop, error: noop };
})() as Logger;

beforeEach(() => {
    resolutionFails = false;
    resetLoggerProvider();
    setLoggerProvider(() => silent);
    RedisClient.resetInstances();
});
afterEach(() => {
    RedisClient.resetInstances();
    resetLoggerProvider();
});

// ioredis-mock is 7.2MB and pulls in fengari, a Lua VM written in JavaScript, to
// emulate Redis' EVAL. As a static top-level import in `dependencies` it was
// downloaded, shipped and loaded into memory by every production install, even
// though only tests ever take the mock branch.
describe('when ioredis-mock cannot be resolved', () => {
    it('explains that it is a development dependency', () => {
        resolutionFails = true;
        expect(() => RedisClient.create(null)).toThrow(/development dependency/);
        expect(() => RedisClient.create(null)).toThrow(/ioredis-mock/);
        expect(() => RedisClient.create(null)).toThrow(/Production code must pass real connection options/);
    });

    it('keeps the resolution failure as the cause', () => {
        resolutionFails = true;
        let caught: (Error & { cause?: NodeJS.ErrnoException }) | null = null;
        try {
            RedisClient.create(null);
        } catch (e) {
            caught = e as Error & { cause?: NodeJS.ErrnoException };
        }
        expect(caught?.cause?.code).toBe('MODULE_NOT_FOUND');
    });

    it('does not affect a real connection', () => {
        resolutionFails = true;
        const client = RedisClient.create({ host: '127.0.0.1', port: 6379, lazyConnect: true } as never);
        expect(client).toBeInstanceOf(RedisClient);
    });
});

describe('the package manifest and imports', () => {
    it('does not declare ioredis-mock as a runtime dependency', () => {
        const manifest = pkg as { dependencies?: Record<string, string>; devDependencies: Record<string, string> };
        expect(manifest.dependencies?.['ioredis-mock']).toBeUndefined();
        expect(manifest.devDependencies['ioredis-mock']).toBeDefined();
    });

    // A static top-level import would load it in production regardless of whether
    // the mock branch is ever taken.
    it('does not import it at module load time', () => {
        const source = fs.readFileSync(nodePath.join(__dirname, '..', 'RedisClient.ts'), 'utf8');
        expect(source).not.toMatch(/^import .*ioredis-mock/m);
    });
});

describe('when the application provides it', () => {
    it('still returns a working in-memory client', async () => {
        const client = await RedisClient.init(null, 'mock-present');
        await client.set('k', 'v');
        expect(await client.get('k')).toBe('v');
        await client.close();
    });
});
