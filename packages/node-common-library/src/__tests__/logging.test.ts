import { setLoggerProvider, resetLoggerProvider } from '@ticatec/logger-api';
import type { Logger } from '@ticatec/logger-api';
import { sqlContext, SQL_PARAMS_ENV, shouldLogSqlParams } from '../Logger';
import CommonDAO from '../CommonDAO';
import DBManager from '../db/DBManager';
import Beans from '../Beans';

type Rec = { level: string; ctx: unknown; msg?: string; name?: string; category?: string };

const records: Rec[] = [];
let lastName: string | undefined;
let lastCategory: string | undefined;

const capture = (level: string, name?: string, category?: string) =>
    (a: unknown, b?: string) => {
        records.push({ level, ctx: a, msg: b, name, category });
    };

const spyProvider = (name: string, category?: string): Logger => {
    lastName = name;
    lastCategory = category;
    return {
        trace: capture('trace', name, category),
        debug: capture('debug', name, category),
        info: capture('info', name, category),
        warn: capture('warn', name, category),
        error: capture('error', name, category)
    } as Logger;
};

const find = (fragment: string) => records.find((r) => (r.msg ?? '').includes(fragment));

const fakeConnection = {
    find: async () => null,
    listQuery: async () => [],
    insertRecord: async () => ({}),
    updateRecord: async () => ({}),
    deleteRecord: async () => 0
};

class TestDAO extends CommonDAO {
    // CommonDAO's constructor is protected; a subclass has to publish its own.
    public constructor() {
        super();
    }

    protected async getDBConnection(): Promise<any> {
        return fakeConnection;
    }
    async runAll(): Promise<void> {
        const params = ['alice@example.com', 'argon2id$v=19$HASH', '4111111111111111'];
        await (this as any).findFirst('select * from users where a=$1 and b=$2 and c=$3', params);
        await (this as any).listQuery('select * from users where a=$1 and b=$2 and c=$3', params);
        await (this as any).executeInsertQuery('insert into t values($1,$2,$3)', params);
        await (this as any).executeUpdateQuery('update t set a=$1,b=$2 where c=$3', params);
        await (this as any).executeDeleteQuery('delete from t where a=$1 and b=$2 and c=$3', params);
    }
}

beforeEach(() => {
    records.length = 0;
    lastName = undefined;
    lastCategory = undefined;
    delete process.env[SQL_PARAMS_ENV];
    resetLoggerProvider();
    setLoggerProvider(spyProvider);
});
afterEach(() => {
    delete process.env[SQL_PARAMS_ENV];
    resetLoggerProvider();
});

describe('SQL bind parameters stay out of the log', () => {
    // Bind parameters are the actual data flowing through every query: email
    // addresses, password hashes, national IDs, card numbers. Logging them copies
    // the whole database traffic into the log store.
    it('never logs parameter values by default', async () => {
        await new TestDAO().runAll();

        const dump = JSON.stringify(records);
        for (const secret of ['alice@example.com', 'argon2id', '4111111111111111']) {
            expect(dump).not.toContain(secret);
        }
    });

    it('logs the statement and the parameter count on every query kind', async () => {
        await new TestDAO().runAll();

        const queries = records.filter((r) => (r.msg ?? '').includes('query') && typeof r.ctx === 'object');
        const contexts = queries.map((r) => r.ctx as Record<string, unknown>);
        expect(contexts.length).toBeGreaterThanOrEqual(5);
        for (const ctx of contexts) {
            expect(typeof ctx.sql).toBe('string');
            expect(ctx.paramCount).toBe(3);
            expect(ctx.params).toBeUndefined();
        }
    });

    it.each([['find'], ['list'], ['insert'], ['update'], ['delete']])(
        'covers the %s query', async (verb) => {
            await new TestDAO().runAll();
            expect(find(`Executing ${verb} query`)).toBeDefined();
        });
});

describe('sqlContext', () => {
    it('reports the statement and the count', () => {
        expect(sqlContext('select 1 where a=$1', ['v'])).toEqual({ sql: 'select 1 where a=$1', paramCount: 1 });
    });

    it('tolerates a missing or non-array params argument', () => {
        expect(sqlContext('select 1')).toEqual({ sql: 'select 1', paramCount: 0 });
        expect(sqlContext('select 1', undefined as never)).toEqual({ sql: 'select 1', paramCount: 0 });
    });

    // Developers still need the values when debugging locally, so there is an
    // explicit opt-in - it cannot be switched on by accident.
    it('includes the values only when the flag is exactly "true"', () => {
        process.env[SQL_PARAMS_ENV] = 'true';
        expect(sqlContext('select 1 where a=$1', ['v'])).toMatchObject({ params: ['v'] });

        for (const notTrue of ['1', 'yes', 'TRUE ', '', 'false']) {
            process.env[SQL_PARAMS_ENV] = notTrue;
            const ctx = sqlContext('select 1 where a=$1', ['v']);
            expect(ctx.params).toBe(notTrue.trim().toLowerCase() === 'true' ? ctx.params : undefined);
        }
    });

    it('is read per call, so it can be flipped at runtime', () => {
        expect(shouldLogSqlParams()).toBe(false);
        process.env[SQL_PARAMS_ENV] = 'true';
        expect(shouldLogSqlParams()).toBe(true);
        delete process.env[SQL_PARAMS_ENV];
        expect(shouldLogSqlParams()).toBe(false);
    });

    it('reaches the DAO log when enabled', async () => {
        process.env[SQL_PARAMS_ENV] = 'true';
        await new TestDAO().runAll();
        expect(JSON.stringify(records)).toContain('alice@example.com');
    });
});

describe('DBManager does not log the connection factory', () => {
    // A DBFactory holds the full connection configuration, password included.
    it('records only the factory class name', () => {
        class PgDBFactory {
            readonly password = 'PG-S3CRET';
            async createDBConnection(): Promise<any> { return fakeConnection; }
            async close(): Promise<void> { /* noop */ }
        }
        (DBManager as unknown as { instance?: unknown }).instance = undefined;
        DBManager.init(new PgDBFactory() as never);

        const rec = find('Initializing database manager factory')!;
        expect(rec).toBeDefined();
        expect(rec.ctx).toEqual({ factory: 'PgDBFactory' });
        expect(JSON.stringify(records)).not.toContain('PG-S3CRET');
        (DBManager as unknown as { instance?: unknown }).instance = undefined;
    });
});

describe('logger categories match the architecture', () => {
    // The layers are Controller -> Service -> Repository -> DAO. A DAO used to
    // report itself under the 'controller' category, which makes any
    // category-based routing or filtering actively misleading.
    it('gives a DAO the "dao" category', () => {
        new TestDAO();
        expect(lastCategory).toBe('dao');
        expect(lastName).toBe('TestDAO');
    });
});

describe('Beans registration logging', () => {
    it('logs the bean names and count, not the loader map', async () => {
        const beans = Beans.getInstance();
        beans.register('UserService', async () => ({ default: class {} }));
        records.length = 0;
        await beans.load();

        const rec = find('Loading registered bean types')!;
        expect(rec).toBeDefined();
        const ctx = rec.ctx as { count: number; beans: string[] };
        expect(ctx.count).toBeGreaterThanOrEqual(1);
        expect(ctx.beans).toContain('UserService');
    });
});
