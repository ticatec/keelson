import { setLoggerProvider, resetLoggerProvider } from '@ticatec/logger-api';
import type { Logger } from '@ticatec/logger-api';
import { initializeMySQL, MysqlDBConnection, MysqlDBFactory } from '../MysqlDBFactory.js';
import mysql from 'mysql2/promise';

/** Silences framework logging for the duration of the suite. */
const SILENT: Logger = (() => {
    const noop = () => { /* discard */ };
    return { trace: noop, debug: noop, info: noop, warn: noop, error: noop };
})();


jest.mock('mysql2/promise');

describe('MysqlDBFactory & MysqlDBConnection Test Suite', () => {
    let mockPool: any;
    let mockConnection: any;

    beforeAll(() => {
        resetLoggerProvider();
        setLoggerProvider(() => SILENT);
    });

    beforeEach(() => {
        mockConnection = {
            beginTransaction: jest.fn().mockResolvedValue(undefined),
            commit: jest.fn().mockResolvedValue(undefined),
            rollback: jest.fn().mockResolvedValue(undefined),
            release: jest.fn().mockReturnValue(undefined),
            execute: jest.fn(),
            query: jest.fn()
        };

        mockPool = {
            getConnection: jest.fn().mockResolvedValue(mockConnection),
            end: jest.fn().mockResolvedValue(undefined)
        };

        (mysql.createPool as jest.Mock).mockReturnValue(mockPool);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    test('should initialize MysqlDBFactory and create DBConnection', async () => {
        const factory = initializeMySQL({ host: 'localhost' });
        expect(factory).toBeInstanceOf(MysqlDBFactory);

        const conn = await factory.createDBConnection();
        expect(conn).toBeInstanceOf(MysqlDBConnection);
        expect(mockPool.getConnection).toHaveBeenCalledTimes(1);

        await conn.close();
        expect(mockConnection.release).toHaveBeenCalledTimes(1);

        await (factory as MysqlDBFactory).close();
        expect(mockPool.end).toHaveBeenCalledTimes(1);
    });

    test('should return ? for SQL placeholders', async () => {
        const factory = initializeMySQL({});
        const conn = await factory.createDBConnection();

        expect(conn.getPlaceholder(1)).toBe('?');
        expect(conn.getPlaceholder(2)).toBe('?');
        expect(conn.getPlaceholder(99)).toBe('?');
    });

    test('should execute raw SQL using client.query to support DDL', async () => {
        const factory = initializeMySQL({});
        const conn = await factory.createDBConnection();

        mockConnection.query.mockResolvedValue([[], []]);
        await (conn as any).executeSQL('CREATE TABLE test (id INT)');

        expect(mockConnection.query).toHaveBeenCalledWith('CREATE TABLE test (id INT)');
    });

    test('should insert record and return InsertResult with insertId and affectedRows', async () => {
        const factory = initializeMySQL({});
        const conn = await factory.createDBConnection();

        const resultSetHeader = {
            affectedRows: 1,
            insertId: 101,
            warningStatus: 0
        };
        mockConnection.execute.mockResolvedValue([resultSetHeader, []]);

        const result = await conn.insertRecord('INSERT INTO users (name) VALUES (?)', ['Alice']);

        expect(mockConnection.execute).toHaveBeenCalledWith('INSERT INTO users (name) VALUES (?)', ['Alice']);
        expect(result).toEqual({
            affectedRows: 1,
            record: null,
            insertId: 101
        });
    });

    test('should update record and return UpdateResult with affectedRows', async () => {
        const factory = initializeMySQL({});
        const conn = await factory.createDBConnection();

        const resultSetHeader = {
            affectedRows: 3,
            warningStatus: 0
        };
        mockConnection.execute.mockResolvedValue([resultSetHeader, []]);

        const result = await conn.updateRecord('UPDATE users SET status = ? WHERE age > ?', [1, 20]);

        expect(mockConnection.execute).toHaveBeenCalledWith('UPDATE users SET status = ? WHERE age > ?', [1, 20]);
        expect(result).toEqual({
            affectedRows: 3,
            record: null
        });
    });

    test('should delete records and return affected rows count', async () => {
        const factory = initializeMySQL({});
        const conn = await factory.createDBConnection();

        const resultSetHeader = {
            affectedRows: 5
        };
        mockConnection.execute.mockResolvedValue([resultSetHeader, []]);

        const affected = await conn.deleteRecord('DELETE FROM users WHERE inactive = ?', [true]);

        expect(affected).toBe(5);
    });

    test('should manage transaction lifecycle and handle rollback error gracefully', async () => {
        const factory = initializeMySQL({});
        const conn = await factory.createDBConnection();

        await conn.beginTransaction();
        expect(mockConnection.beginTransaction).toHaveBeenCalledTimes(1);

        await conn.commit();
        expect(mockConnection.commit).toHaveBeenCalledTimes(1);

        mockConnection.rollback.mockRejectedValueOnce(new Error('Rollback failed'));
        // Should catch and not throw
        await expect(conn.rollback()).resolves.toBeUndefined();
        expect(mockConnection.rollback).toHaveBeenCalledTimes(1);
    });

    test('should extract field metadata via getFields defensively', async () => {
        const factory = initializeMySQL({});
        const conn = await factory.createDBConnection();

        const fields = conn.getFields({
            fields: [
                { name: 'user_id' },
                { name: 'user_name' }
            ]
        });

        expect(fields).toEqual([
            { name: 'userId', type: 'Text' },
            { name: 'userName', type: 'Text' }
        ]);

        // Defensive checks
        expect(conn.getFields(null)).toEqual([]);
        expect(conn.getFields({})).toEqual([]);
        expect(conn.getFields({ fields: null })).toEqual([]);
    });

    test('should extract row set defensively', async () => {
        const factory = initializeMySQL({});
        const conn = await factory.createDBConnection();

        expect((conn as any).getRowSet({ rows: [{ id: 1 }, { id: 2 }] })).toEqual([{ id: 1 }, { id: 2 }]);
        expect((conn as any).getRowSet(null)).toEqual([]);
        expect((conn as any).getRowSet({})).toEqual([]);
    });

    test('should extract getFirstRow defensively without case destruction', async () => {
        const factory = initializeMySQL({});
        const conn = await factory.createDBConnection();

        const sampleResult = {
            rows: [{ user_name: 'Bob', age: 30 }],
            fields: [{ name: 'user_name' }, { name: 'age' }]
        };

        const firstRow = (conn as any).getFirstRow(sampleResult);
        expect(firstRow).toEqual({
            userName: 'Bob',
            age: 30
        });

        expect((conn as any).getFirstRow(null)).toBeNull();
        expect((conn as any).getFirstRow({ rows: [] })).toBeNull();
    });

    test('should handle LIMIT and OFFSET clause', async () => {
        const factory = initializeMySQL({});
        const conn = await factory.createDBConnection();

        const clause = conn.getRowSetLimitClause(10, 20);
        expect(clause).toBe(' limit 10 offset 20');
    });
});
