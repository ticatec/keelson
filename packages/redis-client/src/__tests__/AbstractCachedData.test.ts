import { setLoggerProvider, resetLoggerProvider } from '@ticatec/logger-api';
import type { Logger } from '@ticatec/logger-api';
import RedisClient from '../RedisClient.js';
import AbstractCachedData from '../cached-data/AbstractCachedData.js';
import CachedDataManager from '../cached-data/CachedDataManager.js';

/** Silences framework logging for the duration of the suite. */
const SILENT: Logger = (() => {
    const noop = () => { /* discard */ };
    return { trace: noop, debug: noop, info: noop, warn: noop, error: noop };
})();


interface UserProfile {
    userId: string;
    name: string;
    email: string;
}

class UserProfileCache extends AbstractCachedData<UserProfile> {
    constructor() {
        super((key) => `user:profile:${key.userId}`, 3600);
    }
}

describe('AbstractCachedData & CachedDataManager', () => {
    let redisClient: RedisClient;

    beforeAll(() => {
        resetLoggerProvider();
        setLoggerProvider(() => SILENT);
    });

    beforeEach(async () => {
        RedisClient.resetInstances();
        CachedDataManager.resetInstance();
        redisClient = await RedisClient.init(null);
    });

    afterEach(async () => {
        await redisClient.close();
    });

    test('should load, save, and clean cached data safely', async () => {
        const cache = new UserProfileCache();
        const user: UserProfile = { userId: '1001', name: 'Charlie', email: 'charlie@example.com' };

        await cache.save(user);

        const loaded = await cache.load({ userId: '1001' });
        expect(loaded).toEqual(user);

        await cache.clean({ userId: '1001' });
        const empty = await cache.load({ userId: '1001' });
        expect(empty).toBeNull();
    });

    test('should support getOrSet Cache-Aside method in AbstractCachedData', async () => {
        const cache = new UserProfileCache();
        const fetchDb = jest.fn().mockResolvedValue({ userId: '2002', name: 'Dave', email: 'dave@example.com' });

        const data1 = await cache.getOrSet({ userId: '2002' }, fetchDb);
        expect(data1.name).toBe('Dave');
        expect(fetchDb).toHaveBeenCalledTimes(1);

        const data2 = await cache.getOrSet({ userId: '2002' }, fetchDb);
        expect(data2.name).toBe('Dave');
        expect(fetchDb).toHaveBeenCalledTimes(1);
    });

    test('should register and retrieve cache instances via CachedDataManager', () => {
        const manager = CachedDataManager.getInstance();
        const userCache = new UserProfileCache();

        manager.register(UserProfileCache, userCache);

        // Automatic type inference without explicit generic argument:
        const retrieved = manager.get(UserProfileCache);
        expect(retrieved).toBe(userCache);
    });
});
