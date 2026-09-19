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
    trace: capture('trace'), debug: capture('debug'), info: capture('info'),
    warn: capture('warn'), error: capture('error')
} as Logger;
const find = (fragment: string) => records.find((r) => (r.msg ?? '').includes(fragment));

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

describe('subscription client error handling', () => {
    // ioredis' duplicate() clones the options, never the listeners. An
    // EventEmitter with no 'error' listener takes the whole process down when one
    // fires - and a dropped subscription connection fires one.
    it('attaches an error listener to the subscription client', async () => {
        const client = await RedisClient.init(null, 'sub');
        await client.subscribe('ch', () => undefined);

        const sub = (client as unknown as { subClient: { listenerCount(e: string): number } }).subClient;
        expect(sub.listenerCount('error')).toBeGreaterThan(0);
        await client.close();
    });

    it('logs a subscription client error instead of throwing it', async () => {
        const client = await RedisClient.init(null, 'sub-err');
        await client.subscribe('ch', () => undefined);
        const sub = (client as unknown as { subClient: { emit(e: string, p: unknown): boolean } }).subClient;

        const boom = new Error('connection reset by peer');
        expect(() => sub.emit('error', boom)).not.toThrow();

        const rec = find('subscription client error');
        expect(rec).toBeDefined();
        expect(rec!.level).toBe('error');
        expect(rec!.ctx).toEqual({ err: boom });
        await client.close();
    });

    it('refuses to subscribe on a closed client rather than leaking a connection', async () => {
        const client = await RedisClient.init(null, 'closed-sub');
        await client.close();
        await expect(client.subscribe('ch', () => undefined)).rejects.toThrow(/closed/i);
    });
});

describe('getOrSet round-trips its own writes', () => {
    let client: RedisClient;
    beforeEach(async () => { client = await RedisClient.init(null, 'rt'); });
    afterEach(async () => { await client.close(); });

    // set() stores a string verbatim while getObject() JSON.parses, so a plain
    // string never read back: every call was a miss and re-ran fetchFn.
    it('caches a plain string', async () => {
        let calls = 0;
        const fetch = async () => { calls += 1; return 'active'; };

        expect(await client.getOrSet('status', fetch)).toBe('active');
        expect(await client.getOrSet('status', fetch)).toBe('active');
        expect(calls).toBe(1);
    });

    // '123' was stored raw and parsed back as the number 123.
    it.each([['123', '123'], ['true', 'true'], ['null', 'null'], ['{bad', '{bad']])(
        'returns %p unchanged on the second read', async (stored) => {
            let calls = 0;
            const value = await client.getOrSet(`lit:${stored}`, async () => { calls += 1; return stored; });
            const again = await client.getOrSet(`lit:${stored}`, async () => { calls += 1; return stored; });

            expect(value).toBe(stored);
            expect(again).toBe(stored);
            expect(typeof again).toBe('string');
            expect(calls).toBe(1);
        });

    it.each([[42], [true], [false], [0]])('caches the primitive %p', async (v) => {
        let calls = 0;
        const key = `p:${String(v)}`;
        expect(await client.getOrSet(key, async () => { calls += 1; return v; })).toBe(v);
        expect(await client.getOrSet(key, async () => { calls += 1; return v; })).toBe(v);
        expect(calls).toBe(1);
    });

    it('does not cache a null result, as documented', async () => {
        let calls = 0;
        const fetch = async () => { calls += 1; return null; };
        expect(await client.getOrSet('nil', fetch)).toBeNull();
        expect(await client.getOrSet('nil', fetch)).toBeNull();
        expect(calls).toBe(2);
    });

    it('still caches objects and arrays', async () => {
        let calls = 0;
        const fetch = async () => { calls += 1; return { a: 1, b: ['x'] }; };
        expect(await client.getOrSet('o', fetch)).toEqual({ a: 1, b: ['x'] });
        expect(await client.getOrSet('o', fetch)).toEqual({ a: 1, b: ['x'] });
        expect(calls).toBe(1);
    });

    it('setObject and getObject are symmetric where set and getObject are not', async () => {
        await client.setObject('sym', 'plain');
        expect(await client.getObject('sym')).toBe('plain');

        await client.set('asym', 'plain');
        expect(await client.getObject('asym')).toBeNull();
        expect(await client.get('asym')).toBe('plain');
    });
});

describe('AbstractCachedData round-trip', () => {
    class Names extends AbstractCachedData<string> {
        constructor() { super((k) => `name:${k}`, 0, 'cd'); }
    }

    it('saves and loads a string entity', async () => {
        const client = await RedisClient.init(null, 'cd');
        const cache = new Names();
        await cache.save('alice');
        expect(await cache.load('alice')).toBe('alice');
        await client.close();
    });
});

describe('closed instances leave the registry', () => {
    it('getInstance no longer hands back a closed client', async () => {
        const client = await RedisClient.init(null, 'dead');
        await client.close();
        expect(() => RedisClient.getInstance('dead')).toThrow(/has not been initialized/);
    });

    it('init creates a fresh client after close, without the duplicate warning', async () => {
        const first = await RedisClient.init(null, 'dead2');
        await first.close();
        records.length = 0;

        const second = await RedisClient.init(null, 'dead2');
        expect(second).not.toBe(first);
        expect(find('called again')).toBeUndefined();
        await second.close();
    });

    it('closeInstance closes and unregisters in one step', async () => {
        await RedisClient.init(null, 'ci');
        await RedisClient.closeInstance('ci');
        expect(() => RedisClient.getInstance('ci')).toThrow();
        await expect(RedisClient.closeInstance('ci')).resolves.toBeUndefined();
    });

    it('leaves a standalone create() client out of the registry', async () => {
        const standalone = RedisClient.create(null);
        await standalone.close();
        expect(() => RedisClient.getInstance('default')).toThrow();
    });
});

describe('hsetnx reports whether it set the field', () => {
    it('returns true then false', async () => {
        const client = await RedisClient.init(null, 'h');
        expect(await client.hsetnx('lock', 'owner', 'a')).toBe(true);
        expect(await client.hsetnx('lock', 'owner', 'b')).toBe(false);
        expect(await client.client.hget('lock', 'owner')).toBe('a');
        await client.close();
    });
});

describe('connection URLs', () => {
    it('redacts the credentials embedded in a URL', async () => {
        const client = await RedisClient.init(
            'rediss://app:UrlS3cret@redis.example.com:6380/3',
            'url',
            { lazyConnect: true }
        );

        const rec = find('Connecting to Redis')!;
        expect(rec.ctx).toEqual({
            host: 'redis.example.com', port: 6380, db: '3', tls: true, authenticated: true
        });
        expect(JSON.stringify(records)).not.toContain('UrlS3cret');
        await client.close();
    });

    // new URL('anything:whatever') parses, leaving the rest of the string as the
    // pathname - reporting that as the db would echo it straight into the log.
    // Whether ioredis then accepts the string or not, the record must stay clean.
    it.each(['not-a-url:with-a-secret', 'http://host/with-a-secret', '%%'])(
        'does not echo %p', async (bad) => {
            const name = `bad-${bad.length}`;
            let client: RedisClient | null = null;
            try {
                client = await RedisClient.init(bad, name, { lazyConnect: true });
            } catch {
                // ioredis rejected it; the log record was written first either way.
            }

            const rec = find('Connecting to Redis')!;
            expect(rec).toBeDefined();
            expect(rec.ctx).toEqual({ connection: 'url', parsed: false });
            expect(JSON.stringify(records)).not.toContain('with-a-secret');

            if (client) await client.close();
        });
});

describe('CachedDataManager', () => {
    abstract class UserCacheToken extends AbstractCachedData<{ id: string }> {}
    class UserCache extends UserCacheToken {
        constructor() { super((k) => `user:${k.id}`, 0, 'cdm'); }
    }

    beforeEach(() => CachedDataManager.resetInstance());
    afterEach(() => CachedDataManager.resetInstance());

    // Registering a concrete implementation under an abstract base class used as a
    // token is the common pattern, and it used to fail to compile.
    it('accepts an abstract class as the registration token', () => {
        const manager = CachedDataManager.getInstance();
        const impl = new UserCache();
        manager.register(UserCacheToken, impl);
        expect(manager.get(UserCacheToken)).toBe(impl);
    });
});
