import { setLoggerProvider, resetLoggerProvider } from '@ticatec/logger-api';
import type { Logger } from '@ticatec/logger-api';
import { initializePg } from '../PgDBFactory.js';
import { DBConnection, FieldType } from '@ticatec/keelson-core';
import * as pg from 'pg';

/** Silences framework logging for the duration of the suite. */
const SILENT: Logger = (() => {
    const noop = () => { /* discard */ };
    return { trace: noop, debug: noop, info: noop, warn: noop, error: noop };
})();


let lastConnectHandler: ((client: any) => Promise<void>) | null = null;
let currentMockRelease: jest.Mock;
let shouldFailRollback = false;

jest.mock('pg', () => {
    const mockRelease = jest.fn();
    const mockClient = {
        query: jest.fn().mockImplementation(async (sql: string, _params?: any[]) => {
            if (sql === 'BEGIN' || sql === 'COMMIT') {
                return { rowCount: 0, rows: [] };
            }
            if (sql === 'ROLLBACK') {
                if (shouldFailRollback) {
                    throw new Error('Rollback failed');
                }
                return { rowCount: 0, rows: [] };
            }
            if (sql.includes('users')) {
                return {
                    rowCount: 1,
                    rows: [{ id: 1, name: 'Alice', is_active: 't', is_admin: '1', null_field: null }],
                    fields: [{ name: 'id' }, { name: 'name' }, { name: 'is_active' }, { name: 'is_admin' }, { name: 'null_field' }]
                };
            }
            if (sql.includes('empty_table')) {
                return { rowCount: 0, rows: [], fields: [{ name: 'id' }] };
            }
            if (sql.includes('no_fields')) {
                return { rowCount: 1, rows: [{ id: 100 }] };
            }
            return { rowCount: 1, rows: [], fields: [] };
        }),
        release: mockRelease
    };

    // 用真正的 EventEmitter 作为连接池替身。此前的替身把 on() 换成了 jest.fn()，
    // 于是“没有 error 监听器的 EventEmitter 会 throw”这一关键行为在测试里被抹掉了，
    // 空闲连接出错崩进程的缺陷才能长期潜伏。
    // jest.mock 的工厂函数会被提升到 import 之前执行，无法引用模块顶部的导入绑定，
    // 只能在工厂内部 require。
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { EventEmitter } = require('events');
    let lastPool: any = null;
    let endCalls = 0;

    class MockPool extends EventEmitter {
        async connect() {
            this.emit('connect', mockClient);
            if (lastConnectHandler) {
                lastConnectHandler(mockClient);
            }
            return mockClient;
        }
        async end() {
            endCalls += 1;
            if (endCalls > 1) {
                throw new Error('Called end on pool more than once');
            }
        }
    }

    return {
        Pool: jest.fn().mockImplementation(function (this: any) {
            const pool = new MockPool();
            lastPool = pool;
            return pool;
        }),
        __getMockRelease: () => mockRelease,
        __getLastPool: () => lastPool,
        __getEndCalls: () => endCalls,
        __resetEndCalls: () => { endCalls = 0; }
    };
});

describe('PgDBFactory & PgDBConnection Comprehensive Test Suite', () => {
    beforeEach(() => {
        lastConnectHandler = null;
        shouldFailRollback = false;
        currentMockRelease = (pg as any).__getMockRelease();
        currentMockRelease.mockReset();
        (pg as any).__resetEndCalls();
        resetLoggerProvider();
        setLoggerProvider(() => SILENT);
    });

    test('should initialize PgDBFactory and create DBConnection', async () => {
        const factory = initializePg({ host: 'localhost', user: 'postgres' });
        expect(factory).toBeDefined();

        const conn = await factory.createDBConnection();
        expect(conn).toBeInstanceOf(DBConnection);
    });

    test('should execute async postConnection hook on physical connect and await completion', async () => {
        let hookExecuted = false;
        const postConn = async (client: any) => {
            await new Promise(resolve => setTimeout(resolve, 20));
            hookExecuted = true;
            await client.query("SET timezone = 'UTC'");
        };

        const factory = initializePg({ host: 'localhost' }, postConn);
        const conn = await factory.createDBConnection();

        expect(hookExecuted).toBe(true);
        expect(conn).toBeDefined();
    });

    test('should release client with error argument and throw with cause if postConnection hook fails', async () => {
        const hookError = new Error('Connection initialization failed');
        const failingHook = async () => {
            throw hookError;
        };

        const factory = initializePg({ host: 'localhost' }, failingHook);

        try {
            await factory.createDBConnection();
            fail('Should have thrown an error');
        } catch (err: any) {
            expect(err.message).toContain('Post-connection hook failed');
            expect(err.cause).toBe(hookError);
            expect(currentMockRelease).toHaveBeenCalledWith(hookError);
        }
    });

    test('should extract field metadata via getFields', async () => {
        const factory = initializePg({ host: 'localhost' });
        const conn = await factory.createDBConnection();

        const result = {
            fields: [{ name: 'user_id' }, { name: 'is_active' }]
        };
        const fields = conn.getFields(result);

        expect(fields).toHaveLength(2);
        expect(fields[0]).toEqual({ name: 'userId', type: FieldType.Text });
        expect(fields[1]).toEqual({ name: 'isActive', type: FieldType.Text });

        expect(conn.getFields(null)).toEqual([]);
        expect(conn.getFields({})).toEqual([]);
    });

    test('should map the PostgreSQL type OID onto the framework field type', async () => {
        const factory = initializePg({ host: 'localhost' });
        const conn = await factory.createDBConnection();

        // dataTypeID 是 PostgreSQL 内置类型的固定 OID：int4=23 numeric=1700
        // timestamptz=1184 text=25 bool=16。
        const fields = conn.getFields({
            fields: [
                { name: 'user_id', dataTypeID: 23 },
                { name: 'amount', dataTypeID: 1700 },
                { name: 'created_at', dataTypeID: 1184 },
                { name: 'user_name', dataTypeID: 25 },
                { name: 'is_active', dataTypeID: 16 },
                { name: 'legacy_col' }
            ]
        });

        expect(fields).toEqual([
            { name: 'userId', type: FieldType.Number },
            { name: 'amount', type: FieldType.Number },
            { name: 'createdAt', type: FieldType.Date },
            { name: 'userName', type: FieldType.Text },
            // FieldType 里没有布尔类型，bool 只能落到 Text；布尔值的转换走
            // listQuery/find 的 booleanFields 参数，与这里的元数据无关。
            { name: 'isActive', type: FieldType.Text },
            { name: 'legacyCol', type: FieldType.Text }
        ]);
    });

    test('should handle NULL fields and preserve explicit null in getFirstRow', async () => {
        const factory = initializePg({ host: 'localhost' });
        const conn = await factory.createDBConnection();

        const row = await conn.find('SELECT * FROM users');
        expect(row).toBeDefined();
        expect(row.nullField).toBeNull();
    });

    test('should map list results with boolean field coercion', async () => {
        const factory = initializePg({ host: 'localhost' });
        const conn = await factory.createDBConnection();

        const list = await conn.listQuery(
            'SELECT * FROM users',
            null,
            null,
            ['isActive', 'isAdmin']
        );

        expect(list).toHaveLength(1);
        expect(list[0].isActive).toBe(true);
        expect(list[0].isAdmin).toBe(true);
    });

    test('should return null or empty structures when querying empty table or missing fields', async () => {
        const factory = initializePg({ host: 'localhost' });
        const conn = await factory.createDBConnection();

        const emptyRow = await conn.find('SELECT * FROM empty_table');
        expect(emptyRow).toBeNull();

        const noFieldsRow = await conn.find('SELECT * FROM no_fields');
        expect(noFieldsRow).toBeDefined();
        expect(noFieldsRow.id).toBe(100);
    });

    test('should manage transaction lifecycle and handle rollback failure gracefully', async () => {
        const factory = initializePg({ host: 'localhost' });
        const conn = await factory.createDBConnection();

        await expect(conn.beginTransaction()).resolves.not.toThrow();
        await expect(conn.commit()).resolves.not.toThrow();
        await expect(conn.rollback()).resolves.not.toThrow();

        shouldFailRollback = true;
        await expect(conn.rollback()).resolves.not.toThrow();

        await expect(conn.close()).resolves.not.toThrow();
    });

    test('should return correct limit and offset clause for PostgreSQL', async () => {
        const factory = initializePg({ host: 'localhost' });
        const conn = await factory.createDBConnection();

        const limitClause = conn.getRowSetLimitClause(20, 40);
        expect(limitClause).toBe(' limit 20 offset 40');
    });

    test('should execute update, insert, updateRecord, deleteRecord, and getAffectRows', async () => {
        const factory = initializePg({ host: 'localhost' });
        const conn = await factory.createDBConnection();

        const affected = await conn.executeUpdate('UPDATE users SET name = $1 WHERE id = $2', ['Bob', 1]);
        expect(affected).toBe(1);

        const inserted = await conn.insertRecord('INSERT INTO users (name) VALUES ($1) RETURNING *', ['Alice']);
        expect(inserted).toBeDefined();
        expect(inserted.affectedRows).toBe(1);
        expect(inserted.record).toBeDefined();
        expect(inserted.record.name).toBe('Alice');

        const updated = await conn.updateRecord('UPDATE users SET name = $1 RETURNING *', ['Alice']);
        expect(updated).toBeDefined();
        expect(updated.affectedRows).toBe(1);
        expect(updated.record).toBeDefined();
        expect(updated.record.name).toBe('Alice');

        const deleted = await conn.deleteRecord('DELETE FROM users WHERE id = $1', [1]);
        expect(deleted).toBe(1);

        expect((conn as any).getAffectRows({ rowCount: 5 })).toBe(5);
        expect((conn as any).getAffectRows(null)).toBe(0);
        expect(conn.getPlaceholder(1)).toBe('$1');
        expect(conn.getPlaceholder(5)).toBe('$5');

        await (factory as any).close();
    });

    test('survives an idle client error instead of crashing the process', async () => {
        const errors: Array<any> = [];
        setLoggerProvider(() => ({ ...SILENT, error: (...args: Array<any>) => { errors.push(args); } } as any));

        initializePg({ host: 'localhost', database: 'app' });
        const pool = (pg as any).__getLastPool();

        // pg-pool 的 idleListener 就是这样把空闲连接的 socket 错误转发到连接池上的。
        // 没有 'error' 监听器时，EventEmitter 会在这一行同步 throw；那一行跑在 socket
        // 的事件回调里，进程只能以 uncaughtException 退出。
        expect(() => pool.emit('error', new Error('Connection terminated unexpectedly'), {})).not.toThrow();
        expect(errors).toHaveLength(1);
        expect(errors[0][0]).toBeInstanceOf(Error);
        expect(errors[0][1]).toContain('Idle PostgreSQL client errored');
    });

    test('never logs the password or connection string when the pool is created', () => {
        const infos: Array<any> = [];
        setLoggerProvider(() => ({ ...SILENT, info: (...args: Array<any>) => { infos.push(args); } } as any));

        initializePg({
            host: 'db.internal',
            port: 5432,
            database: 'app',
            user: 'app_rw',
            password: 'super-secret',
            connectionString: 'postgres://app_rw:super-secret@db.internal/app',
            max: 10
        });

        expect(infos).toHaveLength(1);
        const meta = infos[0][0];
        expect(meta).toMatchObject({ host: 'db.internal', port: 5432, database: 'app', max: 10, authenticated: true });
        const serialized = JSON.stringify(meta);
        expect(serialized).not.toContain('super-secret');
        expect(serialized).not.toContain('postgres://');
    });

    test('close() is idempotent', async () => {
        const factory = initializePg({ host: 'localhost' });

        await expect(factory.close()).resolves.toBeUndefined();
        // pg 的 pool.end() 第二次调用会 reject（Called end on pool more than once），
        // 两条关停路径或重复的 shutdown hook 都会踩到。
        await expect(factory.close()).resolves.toBeUndefined();
        expect((pg as any).__getEndCalls()).toBe(1);
    });
});
