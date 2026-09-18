import { setLoggerProvider, resetLoggerProvider } from '@ticatec/logger-api';
import type { Logger } from '@ticatec/logger-api';
import { initializePg } from '../PgDBFactory.js';
import { DBConnection, FieldType } from '@ticatec/node-common-library';
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

    return {
        Pool: jest.fn().mockImplementation(() => ({
            connect: jest.fn().mockImplementation(async () => {
                if (lastConnectHandler) {
                    lastConnectHandler(mockClient);
                }
                return mockClient;
            }),
            on: jest.fn().mockImplementation((event: string, handler: any) => {
                if (event === 'connect') {
                    lastConnectHandler = handler;
                }
            }),
            end: jest.fn().mockResolvedValue(undefined)
        })),
        __getMockRelease: () => mockRelease
    };
});

describe('PgDBFactory & PgDBConnection Comprehensive Test Suite', () => {
    beforeEach(() => {
        lastConnectHandler = null;
        shouldFailRollback = false;
        currentMockRelease = (pg as any).__getMockRelease();
        currentMockRelease.mockReset();
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
});
