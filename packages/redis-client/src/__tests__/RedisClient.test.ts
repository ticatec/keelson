import { setLoggerProvider, resetLoggerProvider } from '@ticatec/logger-api';
import type { Logger } from '@ticatec/logger-api';
import RedisClient from '../RedisClient.js';

/** Silences framework logging for the duration of the suite. */
const SILENT: Logger = (() => {
    const noop = () => { /* discard */ };
    return { trace: noop, debug: noop, info: noop, warn: noop, error: noop };
})();


describe('RedisClient', () => {
    let client: RedisClient;

    beforeAll(() => {
        resetLoggerProvider();
        setLoggerProvider(() => SILENT);
    });

    beforeEach(async () => {
        RedisClient.resetInstances();
        client = await RedisClient.init(null); // null uses MockRedis
    });

    afterEach(async () => {
        await client.close();
    });

    test('should initialize mock redis when conf is null', () => {
        expect(client).toBeDefined();
        expect(client.client).toBeDefined();
        expect(RedisClient.getInstance()).toBe(client);
    });

    test('should support named multi-instance redis clients', async () => {
        const sessionClient = await RedisClient.init(null, 'session');
        expect(sessionClient).toBeDefined();
        expect(RedisClient.getInstance('session')).toBe(sessionClient);
        expect(RedisClient.getInstance('session')).not.toBe(client);
        await sessionClient.close();
    });

    test('should handle init concurrent race condition safely', async () => {
        const results = await Promise.all([
            RedisClient.init(null, 'concurrent_instance'),
            RedisClient.init(null, 'concurrent_instance'),
            RedisClient.init(null, 'concurrent_instance'),
            RedisClient.init(null, 'concurrent_instance')
        ]);
        expect(results[0]).toBe(results[1]);
        expect(results[1]).toBe(results[2]);
        expect(results[2]).toBe(results[3]);
        await results[0].close();
    });

    test('should set and get string and JSON object values', async () => {
        await client.set('strKey', 'hello');
        const strVal = await client.get('strKey');
        expect(strVal).toBe('hello');

        const objData = { id: 1, name: 'Alice' };
        await client.set('objKey', objData);
        const fetchedObj = await client.getObject('objKey');
        expect(fetchedObj).toEqual(objData);
    });

    test('should handle Buffer values directly in set without JSON stringifying', async () => {
        const buf = Buffer.from('binary-data');
        await client.set('bufKey', buf);
        const raw = await client.get('bufKey');
        expect(raw).toBeDefined();
    });

    test('should support getOrSet (Cache-Aside) method with Cache Stampede deduplication', async () => {
        const fetchFn = jest.fn().mockImplementation(async () => {
            await new Promise((resolve) => setTimeout(resolve, 50));
            return { score: 99 };
        });

        // 10 concurrent requests to the un-cached key
        const results = await Promise.all(
            Array.from({ length: 10 }).map(() => client.getOrSet('user:score:stampede', fetchFn, 10))
        );

        // All 10 requests should return the exact same result
        results.forEach((res) => expect(res).toEqual({ score: 99 }));

        // Critical check: fetchFn MUST be called exactly ONCE due to in-flight deduplication!
        expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    test('should handle hash (hset, hget, hgetall, hsetnx)', async () => {
        await client.hset('user:100', { name: 'Bob', role: 'admin' }, 60);
        expect(await client.hget('user:100', 'name')).toBe('Bob');

        const all = await client.hgetall('user:100');
        expect(all).toEqual({ name: 'Bob', role: 'admin' });

        await client.hsetnx('user:100', 'status', 'active');
        expect(await client.hget('user:100', 'status')).toBe('active');
    });

    test('should handle sets (sadd, scard, isSetMember)', async () => {
        await client.sadd('tags', ['ts', 'js', 'node'], 60);
        expect(await client.scard('tags')).toBe(3);
        expect(await client.isSetMember('tags', 'ts')).toBe(true);
        expect(await client.isSetMember('tags', 'python')).toBe(false);
    });

    test('should handle lists (rpush, lrange, lrangeObject, llen, lpop)', async () => {
        await client.rpush('logs', { event: 'login' }, 60);
        await client.rpush('logs', { event: 'logout' });

        expect(await client.llen('logs')).toBe(2);

        const listObjects = await client.lrangeObject('logs', 0, -1);
        expect(listObjects).toEqual([{ event: 'login' }, { event: 'logout' }]);

        const popped = await client.lpop('logs');
        expect(JSON.parse(popped!)).toEqual({ event: 'login' });
        expect(await client.llen('logs')).toBe(1);
    });

    test('should support expire alias and close idempotency', async () => {
        await client.set('expireKey', 'val');
        await client.expire('expireKey', 30);
        
        await client.close();
        // Repeating close should not throw
        await expect(client.close()).resolves.not.toThrow();
    });

    test('should support Pub/Sub publishing and subscription unbinding', async () => {
        const handler1 = jest.fn();
        const handler2 = jest.fn();

        await client.subscribe('notifications', handler1);
        await client.subscribe('notifications', handler2);

        await client.publish('notifications', { msg: 'hello' });

        await new Promise((r) => setTimeout(r, 50));

        expect(handler1).toHaveBeenCalledWith('notifications', { msg: 'hello' });
        expect(handler2).toHaveBeenCalledWith('notifications', { msg: 'hello' });

        await client.unsubscribe('notifications', handler1);
        await client.publish('notifications', { msg: 'world' });
        await new Promise((r) => setTimeout(r, 50));

        expect(handler1).toHaveBeenCalledTimes(1);
        expect(handler2).toHaveBeenCalledTimes(2);

        await client.unsubscribe('notifications');
    });
});
