import { Redis } from 'ioredis';
import { setLoggerProvider, resetLoggerProvider } from '@ticatec/logger-api';
import type { Logger } from '@ticatec/logger-api';
import RedisClient from '../RedisClient.js';
import AbstractCachedData from '../cached-data/AbstractCachedData.js';
import CachedDataManager from '../cached-data/CachedDataManager.js';

const SILENT: Logger = (() => {
    const noop = () => { /* discard */ };
    return { trace: noop, debug: noop, info: noop, warn: noop, error: noop };
})();

describe('Real Redis integration (localhost:6379)', () => {
    let hasLocalRedis = false;
    let client: RedisClient;
    const TEST_DB = 14;
    const REDIS_URL = `redis://127.0.0.1:6379/${TEST_DB}`;

    beforeAll(async () => {
        resetLoggerProvider();
        setLoggerProvider(() => SILENT);
        try {
            const probe = new Redis({
                host: '127.0.0.1',
                port: 6379,
                connectTimeout: 800,
                maxRetriesPerRequest: 1,
                retryStrategy: () => null
            });
            const res = await probe.ping();
            hasLocalRedis = res === 'PONG';
            await probe.quit();
        } catch {
            hasLocalRedis = false;
        }
    });

    afterAll(() => {
        resetLoggerProvider();
    });

    beforeEach(async () => {
        if (!hasLocalRedis) return;
        RedisClient.resetInstances();
        client = await RedisClient.init(REDIS_URL, 'real');
        const testKeys = await client.client.keys('test:*');
        if (testKeys.length > 0) {
            await client.client.del(...testKeys);
        }
    });

    afterEach(async () => {
        if (!hasLocalRedis) return;
        if (client) {
            const testKeys = await client.client.keys('test:*');
            if (testKeys.length > 0) {
                await client.client.del(...testKeys);
            }
            await client.close();
        }
        RedisClient.resetInstances();
    });

    it('connects to real Redis via redis:// URL', async () => {
        if (!hasLocalRedis) return;
        expect(client).toBeDefined();
        const ping = await client.client.ping();
        expect(ping).toBe('PONG');
    });

    it('performs real string and object set/get/setObject/getObject operations', async () => {
        if (!hasLocalRedis) return;
        // Raw string
        await client.set('test:raw', 'hello-world');
        expect(await client.get('test:raw')).toBe('hello-world');

        // Plain string via setObject / getObject
        await client.setObject('test:str_obj', 'plain-string');
        expect(await client.getObject('test:str_obj')).toBe('plain-string');

        // Object via setObject / getObject
        const payload = { userId: 'u_100', active: true, count: 42 };
        await client.setObject('test:obj', payload);
        expect(await client.getObject('test:obj')).toEqual(payload);
    });

    it('operates real getOrSet without string cache-misses or type-mutations', async () => {
        if (!hasLocalRedis) return;
        const fetchStr = jest.fn().mockResolvedValue('active');
        const res1 = await client.getOrSet('test:str_cache', fetchStr, 60);
        expect(res1).toBe('active');
        expect(fetchStr).toHaveBeenCalledTimes(1);

        const res2 = await client.getOrSet('test:str_cache', fetchStr, 60);
        expect(res2).toBe('active');
        expect(fetchStr).toHaveBeenCalledTimes(1);

        const fetchNumStr = jest.fn().mockResolvedValue('123');
        const numStr1 = await client.getOrSet('test:num_str', fetchNumStr, 60);
        expect(numStr1).toBe('123');
        expect(typeof numStr1).toBe('string');

        const numStr2 = await client.getOrSet('test:num_str', fetchNumStr, 60);
        expect(numStr2).toBe('123');
        expect(typeof numStr2).toBe('string');
        expect(fetchNumStr).toHaveBeenCalledTimes(1);
    });

    it('performs real hsetnx with boolean return against real Redis', async () => {
        if (!hasLocalRedis) return;
        const set1 = await client.hsetnx('test:hash_lock', 'token', 'abc');
        expect(set1).toBe(true);

        const set2 = await client.hsetnx('test:hash_lock', 'token', 'def');
        expect(set2).toBe(false);

        expect(await client.hget('test:hash_lock', 'token')).toBe('abc');
    });

    it('executes atomic pipeline with TTL on real Redis (hset, sadd, rpush)', async () => {
        if (!hasLocalRedis) return;
        await client.hset('test:pipe_hash', { field1: 'val1', field2: 'val2' }, 30);
        const ttlHash = await client.client.ttl('test:pipe_hash');
        expect(ttlHash).toBeGreaterThan(0);
        expect(await client.hgetall('test:pipe_hash')).toEqual({ field1: 'val1', field2: 'val2' });

        await client.sadd('test:pipe_set', ['alpha', 'beta'], 30);
        const ttlSet = await client.client.ttl('test:pipe_set');
        expect(ttlSet).toBeGreaterThan(0);
        expect(await client.isSetMember('test:pipe_set', 'alpha')).toBe(true);

        await client.rpush('test:pipe_list', { item: 1 }, 30);
        const ttlList = await client.client.ttl('test:pipe_list');
        expect(ttlList).toBeGreaterThan(0);
        expect(await client.lrangeObject('test:pipe_list', 0, -1)).toEqual([{ item: 1 }]);
    });

    it('handles real Pub/Sub message dispatch and unbinding', async () => {
        if (!hasLocalRedis) return;
        const received: any[] = [];
        const handler = (channel: string, data: any) => {
            received.push({ channel, data });
        };

        await client.subscribe('test:pubsub:ch', handler);
        await client.publish('test:pubsub:ch', { event: 'created', id: 999 });

        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(received).toHaveLength(1);
        expect(received[0]).toEqual({
            channel: 'test:pubsub:ch',
            data: { event: 'created', id: 999 }
        });

        await client.unsubscribe('test:pubsub:ch', handler);
        await client.publish('test:pubsub:ch', { event: 'second' });
        await new Promise((resolve) => setTimeout(resolve, 50));

        expect(received).toHaveLength(1);
    });

    it('integrates AbstractCachedData and CachedDataManager with real Redis', async () => {
        if (!hasLocalRedis) return;
        interface Session {
            sessionId: string;
            role: string;
        }
        class SessionCache extends AbstractCachedData<Session> {
            constructor() {
                super((k) => `test:session:${k.sessionId}`, 60, 'real');
            }
        }

        const manager = CachedDataManager.getInstance();
        const cache = new SessionCache();
        manager.register(SessionCache, cache);

        const retrieved = manager.get(SessionCache)!;
        expect(retrieved).toBe(cache);

        await retrieved.save({ sessionId: 's_1', role: 'admin' });
        const loaded = await retrieved.load({ sessionId: 's_1' });
        expect(loaded).toEqual({ sessionId: 's_1', role: 'admin' });

        await retrieved.clean({ sessionId: 's_1' });
        expect(await retrieved.load({ sessionId: 's_1' })).toBeNull();
    });
});
