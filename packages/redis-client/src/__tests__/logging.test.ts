import { setLoggerProvider, resetLoggerProvider } from '@ticatec/logger-api';
import type { Logger } from '@ticatec/logger-api';
import RedisClient from '../RedisClient.js';
import AbstractCachedData from '../cached-data/AbstractCachedData.js';
import CachedDataManager from '../cached-data/CachedDataManager.js';

type Rec = { level: string; ctx: unknown; msg?: string };

const records: Rec[] = [];
const capture = (level: string) => (a: unknown, b?: string) => {
    records.push({ level, ctx: a, msg: b });
};
const spy: Logger = {
    trace: capture('trace'),
    debug: capture('debug'),
    info: capture('info'),
    warn: capture('warn'),
    error: capture('error')
} as Logger;

const find = (fragment: string) => records.find((r) => (r.msg ?? '').includes(fragment));

describe('connection logging', () => {
    beforeEach(() => {
        records.length = 0;
        resetLoggerProvider();
        setLoggerProvider(() => spy);
        RedisClient.resetInstances();
    });
    afterEach(() => {
        RedisClient.resetInstances();
        resetLoggerProvider();
    });

    // RedisOptions carries password / username / sentinelPassword and TLS key
    // material. Logging the whole object copies the production Redis password
    // into the log store.
    it('never writes credentials or TLS material into the log', async () => {
        await RedisClient.init({
            host: 'redis.prod.internal',
            port: 6379,
            username: 'app',
            password: 'S3cr3t-Pr0d-P@ss',
            tls: { servername: 'redis.prod.internal', ca: 'PEM-DATA' },
            db: 2,
            lazyConnect: true
        } as never, 'creds');

        const serialised = JSON.stringify(records);
        expect(serialised).not.toContain('S3cr3t-Pr0d-P@ss');
        expect(serialised).not.toContain('PEM-DATA');
        expect(serialised).not.toContain('password');
    });

    it('still reports the connection target and whether auth and TLS are configured', async () => {
        await RedisClient.init({
            host: 'redis.prod.internal', port: 6380, db: 2,
            password: 'x', tls: {}, lazyConnect: true
        } as never, 'summary');

        const rec = find('Connecting to Redis');
        expect(rec).toBeDefined();
        expect(rec!.level).toBe('debug');
        expect(rec!.ctx).toEqual({
            host: 'redis.prod.internal',
            port: 6380,
            db: 2,
            tls: true,
            authenticated: true
        });
    });

    it('reports an unauthenticated plaintext connection as such', async () => {
        await RedisClient.init({ host: '127.0.0.1', lazyConnect: true } as never, 'plain');
        expect(find('Connecting to Redis')!.ctx).toMatchObject({ tls: false, authenticated: false });
    });

    it('counts sentinels without exposing their credentials', async () => {
        await RedisClient.init({
            sentinels: [{ host: 'a', port: 1 }, { host: 'b', port: 2 }],
            sentinelPassword: 'sentinel-secret',
            name: 'mymaster',
            lazyConnect: true
        } as never, 'sentinel');

        const rec = find('Connecting to Redis')!;
        expect(rec.ctx).toMatchObject({ sentinels: 2, name: 'mymaster' });
        expect(JSON.stringify(rec)).not.toContain('sentinel-secret');
    });

    it('warns when init is called again for the same instance', async () => {
        const first = await RedisClient.init(null, 'dup');
        records.length = 0;
        const second = await RedisClient.init(null, 'dup');

        expect(second).toBe(first);
        const rec = find('called again');
        expect(rec).toBeDefined();
        expect(rec!.level).toBe('warn');
        expect(rec!.ctx).toEqual({ name: 'dup' });
    });
});

describe('cached value logging', () => {
    let client: RedisClient;

    beforeEach(async () => {
        records.length = 0;
        resetLoggerProvider();
        setLoggerProvider(() => spy);
        RedisClient.resetInstances();
        client = await RedisClient.init(null, 'values');
    });
    afterEach(async () => {
        await client.close();
        RedisClient.resetInstances();
        resetLoggerProvider();
    });

    // Cached payloads are user records, tokens and sessions. Logging the value
    // itself copies them into the log store.
    it('does not log the value when a cached entry is not JSON', async () => {
        await client.set('session:42', 'not-json{ token=abcdef-SECRET');
        records.length = 0;

        expect(await client.getObject('session:42')).toBeNull();

        const rec = find('not JSON');
        expect(rec).toBeDefined();
        expect(rec!.level).toBe('debug');
        expect(rec!.ctx).toEqual({ key: 'session:42', length: 'not-json{ token=abcdef-SECRET'.length });
        expect(JSON.stringify(records)).not.toContain('SECRET');
    });

    it('does not log the element when a list entry is not JSON', async () => {
        await client.client.rpush('queue', '{"ok":1}', 'bad-json-PAYLOAD');
        records.length = 0;

        const list = await client.lrangeObject('queue', 0, -1);
        expect(list).toEqual([{ ok: 1 }]);

        const rec = find('not JSON');
        expect(rec!.level).toBe('warn');
        expect(rec!.ctx).toEqual({ key: 'queue', index: 1, length: 'bad-json-PAYLOAD'.length });
        expect(JSON.stringify(records)).not.toContain('PAYLOAD');
    });

    it('logs a cache miss and an in-flight join, by key only', async () => {
        records.length = 0;
        let resolveFetch: (v: string) => void = () => undefined;
        const gate = new Promise<string>((r) => { resolveFetch = r; });

        const a = client.getOrSet('hot', () => gate);
        const b = client.getOrSet('hot', () => gate);
        resolveFetch('value');
        await Promise.all([a, b]);

        expect(find('Cache miss')!.ctx).toEqual({ key: 'hot' });
        expect(find('in-flight')!.ctx).toEqual({ key: 'hot' });
        expect(find('Cache miss')!.level).toBe('debug');
    });
});

describe('CachedDataManager', () => {
    class Demo extends AbstractCachedData<{ id: string }> {
        constructor() {
            super((k) => `demo:${k.id}`, 0, 'values');
        }
    }

    beforeEach(() => {
        records.length = 0;
        resetLoggerProvider();
        setLoggerProvider(() => spy);
        CachedDataManager.resetInstance();
    });
    afterEach(() => {
        CachedDataManager.resetInstance();
        resetLoggerProvider();
    });

    it('stays quiet on a first registration', () => {
        CachedDataManager.getInstance().register(Demo, new Demo());
        expect(records).toHaveLength(0);
    });

    // A silent replacement leaves both registrants believing theirs is live.
    it('warns when a class is registered twice', () => {
        const manager = CachedDataManager.getInstance();
        manager.register(Demo, new Demo());
        const second = new Demo();
        manager.register(Demo, second);

        const rec = find('Re-registering');
        expect(rec).toBeDefined();
        expect(rec!.level).toBe('warn');
        expect(rec!.ctx).toEqual({ cachedData: 'Demo' });
        expect(manager.get(Demo)).toBe(second);
    });
});
