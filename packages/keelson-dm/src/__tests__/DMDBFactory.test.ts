import { setLoggerProvider, resetLoggerProvider } from '@ticatec/logger-api';
import type { Logger } from '@ticatec/logger-api';
import { initializeDmDB, DMDBConnection, DMDBFactory } from '../DMDBFactory.js';
import dmdb from 'dmdb';

/** Silences framework logging for the duration of the suite. */
const SILENT: Logger = (() => {
    const noop = () => { /* discard */ };
    return { trace: noop, debug: noop, info: noop, warn: noop, error: noop };
})();


jest.mock('dmdb');

describe('DMDBFactory & DMDBConnection Test Suite', () => {
    let mockPool: any;
    let mockConnection: any;

    beforeAll(() => {
        resetLoggerProvider();
        setLoggerProvider(() => SILENT);
    });

    beforeEach(() => {
        mockConnection = {
            commit: jest.fn().mockResolvedValue(undefined),
            rollback: jest.fn().mockResolvedValue(undefined),
            close: jest.fn().mockResolvedValue(undefined),
            execute: jest.fn()
        };

        mockPool = {
            getConnection: jest.fn().mockResolvedValue(mockConnection),
            close: jest.fn().mockResolvedValue(undefined)
        };

        (dmdb.createPool as jest.Mock).mockResolvedValue(mockPool);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    test('should initialize DMDBFactory and create DBConnection', async () => {
        const factory = initializeDmDB({ connectString: 'dm://SYSDBA:SYSDBA@localhost:5236' });
        expect(factory).toBeInstanceOf(DMDBFactory);

        const conn = await factory.createDBConnection();
        expect(conn).toBeInstanceOf(DMDBConnection);
        expect(mockPool.getConnection).toHaveBeenCalledTimes(1);

        await conn.close();
        expect(mockConnection.close).toHaveBeenCalledTimes(1);

        await (factory as DMDBFactory).close();
        expect(mockPool.close).toHaveBeenCalledTimes(1);
    });

    test('should cache pool creation promise preventing race conditions, and clean rejected promise on failure', async () => {
        const factory = initializeDmDB({ connectString: 'dm://SYSDBA:SYSDBA@localhost:5236' });

        // Concurrent checkout calls
        const [conn1, conn2] = await Promise.all([
            factory.createDBConnection(),
            factory.createDBConnection()
        ]);

        expect(dmdb.createPool).toHaveBeenCalledTimes(1);
        expect(conn1).toBeInstanceOf(DMDBConnection);
        expect(conn2).toBeInstanceOf(DMDBConnection);

        await (factory as DMDBFactory).close();
        expect(mockPool.close).toHaveBeenCalledTimes(1);

        // Test failure clean-up
        const failFactory = initializeDmDB({});
        const poolError = new Error('Connection refused');
        (dmdb.createPool as jest.Mock).mockRejectedValueOnce(poolError);

        await expect(failFactory.createDBConnection()).rejects.toThrow('Connection refused');

        // Next call should retry dmdb.createPool, not return cached rejection
        (dmdb.createPool as jest.Mock).mockResolvedValueOnce(mockPool);
        const retryConn = await failFactory.createDBConnection();
        expect(retryConn).toBeInstanceOf(DMDBConnection);
    });

    test('should return ? for SQL placeholders', async () => {
        const factory = initializeDmDB({});
        const conn = await factory.createDBConnection();

        expect(conn.getPlaceholder(1)).toBe('?');
        expect(conn.getPlaceholder(2)).toBe('?');
        expect(conn.getPlaceholder(100)).toBe('?');
    });

    test('should execute raw SQL via executeSQL with autoCommit true when not in transaction', async () => {
        const factory = initializeDmDB({});
        const conn = await factory.createDBConnection();

        mockConnection.execute.mockResolvedValue({ rowsAffected: 0 });
        await (conn as any).executeSQL('CREATE TABLE test (id INT)');

        expect(mockConnection.execute).toHaveBeenCalledWith(
            'CREATE TABLE test (id INT)',
            [],
            { autoCommit: true }
        );
    });

    test('should insert record with autoCommit true outside transaction and false inside transaction', async () => {
        const factory = initializeDmDB({});
        const conn = await factory.createDBConnection();

        mockConnection.execute.mockResolvedValue({
            rowsAffected: 1,
            metaData: [{ name: 'ID', dbTypeName: 'INT' }, { name: 'NAME', dbTypeName: 'VARCHAR' }],
            rows: [[1, 'Alice']]
        });

        // Outside transaction: autoCommit should be true
        const result1 = await conn.insertRecord('INSERT INTO users (id, name) VALUES (?, ?)', [1, 'Alice']);
        expect(mockConnection.execute).toHaveBeenCalledWith(
            'INSERT INTO users (id, name) VALUES (?, ?)',
            [1, 'Alice'],
            { autoCommit: true }
        );
        expect(result1).toEqual({
            affectedRows: 1,
            record: { id: 1, name: 'Alice' }
        });

        // Inside transaction: autoCommit must be false
        await conn.beginTransaction();
        await conn.insertRecord('INSERT INTO users (id, name) VALUES (?, ?)', [2, 'Bob']);
        expect(mockConnection.execute).toHaveBeenCalledWith(
            'INSERT INTO users (id, name) VALUES (?, ?)',
            [2, 'Bob'],
            { autoCommit: false }
        );

        // After commit: autoCommit reverts to true
        await conn.commit();
        await conn.insertRecord('INSERT INTO users (id, name) VALUES (?, ?)', [3, 'Charlie']);
        expect(mockConnection.execute).toHaveBeenCalledWith(
            'INSERT INTO users (id, name) VALUES (?, ?)',
            [3, 'Charlie'],
            { autoCommit: true }
        );
    });

    test('should update record and return UpdateResult with affectedRows and record', async () => {
        const factory = initializeDmDB({});
        const conn = await factory.createDBConnection();

        mockConnection.execute.mockResolvedValue({
            rowsAffected: 2,
            metaData: [{ name: 'STATUS', dbTypeName: 'VARCHAR' }],
            rows: [['active']]
        });

        const result = await conn.updateRecord('UPDATE users SET status = ? WHERE age > ?', ['active', 18]);

        expect(mockConnection.execute).toHaveBeenCalledWith(
            'UPDATE users SET status = ? WHERE age > ?',
            ['active', 18],
            { autoCommit: true }
        );
        expect(result).toEqual({
            affectedRows: 2,
            record: { status: 'active' }
        });
    });

    test('should delete records and return affected rows count', async () => {
        const factory = initializeDmDB({});
        const conn = await factory.createDBConnection();

        mockConnection.execute.mockResolvedValue({
            rowsAffected: 4
        });

        const affected = await conn.deleteRecord('DELETE FROM users WHERE age < ?', [18]);
        expect(affected).toBe(4);
    });

    test('should manage transaction lifecycle, handle rollback error gracefully, and restore autoCommit state', async () => {
        const factory = initializeDmDB({});
        const conn = await factory.createDBConnection();

        await conn.beginTransaction();

        // Rollback with failure should be swallowed and log error, but still reset transaction state
        mockConnection.rollback.mockRejectedValueOnce(new Error('Rollback failed'));
        await expect(conn.rollback()).resolves.toBeUndefined();
        expect(mockConnection.rollback).toHaveBeenCalledTimes(1);

        // Next statement should have autoCommit = true restored
        mockConnection.execute.mockResolvedValue({ rowsAffected: 1 });
        await conn.executeUpdate('UPDATE test SET val = 1', []);
        expect(mockConnection.execute).toHaveBeenCalledWith('UPDATE test SET val = 1', [], { autoCommit: true });
    });

    test('should extract field metadata via getFields using real dmdb Metadata dbTypeName and avoid INTERVAL misclassification', async () => {
        const factory = initializeDmDB({});
        const conn = await factory.createDBConnection();

        const fields = conn.getFields({
            metaData: [
                { name: 'USER_ID', dbTypeName: 'INT' },
                { name: 'USER_NAME', dbTypeName: 'VARCHAR' },
                { name: 'CREATED_AT', dbTypeName: 'TIMESTAMP' },
                { name: 'TOTAL_BALANCE', dbTypeName: 'DECIMAL' },
                { name: 'DURATION', dbTypeName: 'INTERVAL DAY TO SECOND' }
            ]
        });

        expect(fields).toEqual([
            { name: 'userId', type: 'Number' },
            { name: 'userName', type: 'Text' },
            { name: 'createdAt', type: 'Date' },
            { name: 'totalBalance', type: 'Number' },
            { name: 'duration', type: 'Text' }
        ]);

        expect(conn.getFields(null)).toEqual([]);
        expect(conn.getFields({})).toEqual([]);
        expect(conn.getFields({ metaData: null })).toEqual([]);

        // Explicit error when multiple result sets (2D array) passed to getFields
        expect(() => conn.getFields({ metaData: [[{ name: 'ID' }]] })).toThrow(
            'Multiple result sets are not supported by DMDBConnection'
        );
    });

    test('should throw error when multiple result sets passed to getFirstRow or resultToList', async () => {
        const factory = initializeDmDB({});
        const conn = await factory.createDBConnection();

        const multiResult = {
            metaData: [[{ name: 'ID' }]],
            rows: [[[1]]]
        };

        expect(() => (conn as any).getFirstRow(multiResult)).toThrow(
            'Multiple result sets are not supported by DMDBConnection'
        );
        expect(() => (conn as any).resultToList(multiResult)).toThrow(
            'Multiple result sets are not supported by DMDBConnection'
        );
    });

    test('should preserve quoted camelCase aliases while transforming UPPER_SNAKE to camelCase in toCamel', async () => {
        const factory = initializeDmDB({});
        const conn = await factory.createDBConnection();

        expect((conn as any).toCamel('USER_NAME')).toBe('userName');
        expect((conn as any).toCamel('ITEM_COUNT')).toBe('itemCount');
        expect((conn as any).toCamel('ID')).toBe('id');
        // Quoted alias preserving mixedCase
        expect((conn as any).toCamel('itemCount')).toBe('itemCount');
        expect((conn as any).toCamel('totalRows_count')).toBe('totalRowsCount');
    });

    test('should extract row set and affected rows defensively', async () => {
        const factory = initializeDmDB({});
        const conn = await factory.createDBConnection();

        expect((conn as any).getRowSet({ rows: [[1], [2]] })).toEqual([[1], [2]]);
        expect((conn as any).getRowSet(null)).toEqual([]);
        expect((conn as any).getRowSet({})).toEqual([]);

        expect((conn as any).getAffectRows({ rowsAffected: 7 })).toBe(7);
        expect((conn as any).getAffectRows(null)).toBe(0);
        expect((conn as any).getAffectRows({})).toBe(0);
    });

    test('should extract getFirstRow defensively for both array-of-values and object-rows', async () => {
        const factory = initializeDmDB({});
        const conn = await factory.createDBConnection();

        // Array-of-values row
        const arrayResult = {
            metaData: [{ name: 'USER_NAME' }, { name: 'AGE' }, { name: 'MEMO' }],
            rows: [['Bob', 30, null]]
        };
        const firstRowFromArray = (conn as any).getFirstRow(arrayResult);
        expect(firstRowFromArray).toEqual({
            userName: 'Bob',
            age: 30,
            memo: null
        });

        // Object row with metaData
        const objectResult = {
            metaData: [{ name: 'USER_NAME' }, { name: 'AGE' }, { name: 'MEMO' }],
            rows: [{ USER_NAME: 'Bob', AGE: 30, MEMO: null }]
        };
        const firstRowFromObject = (conn as any).getFirstRow(objectResult);
        expect(firstRowFromObject).toEqual({
            userName: 'Bob',
            age: 30,
            memo: null
        });

        // Object row without metaData fallback
        const objectNoMetaResult = {
            rows: [{ USER_NAME: 'Bob', AGE: 30 }]
        };
        const firstRowNoMeta = (conn as any).getFirstRow(objectNoMetaResult);
        expect(firstRowNoMeta).toEqual({
            userName: 'Bob',
            age: 30
        });

        expect((conn as any).getFirstRow(null)).toBeNull();
        expect((conn as any).getFirstRow({ rows: [] })).toBeNull();
    });

    test('should support fetchData, listQuery, and find queries with explicit nulls and fallback paths preserved', async () => {
        const factory = initializeDmDB({});
        const conn = await factory.createDBConnection();

        mockConnection.execute.mockResolvedValue({
            metaData: [{ name: 'USER_ID' }, { name: 'USER_INFO__AGE' }, { name: 'MEMO' }],
            rows: [
                [1, 25, null],
                [2, 30, 'developer']
            ]
        });

        const fetched = await (conn as any).fetchData('SELECT * FROM users');
        expect(mockConnection.execute).toHaveBeenCalledWith('SELECT * FROM users', [], { autoCommit: true });
        expect(fetched.rows).toHaveLength(2);

        const list = await conn.listQuery('SELECT * FROM users');
        expect(list).toEqual([
            {
                userId: 1,
                userInfo: { age: 25 },
                memo: null
            },
            {
                userId: 2,
                userInfo: { age: 30 },
                memo: 'developer'
            }
        ]);

        // listQuery with empty row set fallback
        mockConnection.execute.mockResolvedValue({ rows: [] });
        const emptyList = await conn.listQuery('SELECT * FROM users WHERE 1=0');
        expect(emptyList).toEqual([]);

        // listQuery without metaData fallback
        mockConnection.execute.mockResolvedValue({
            rows: [{ id: 1, name: 'Alice' }]
        });
        const fallbackList = await conn.listQuery('SELECT * FROM users');
        expect(fallbackList).toEqual([{ id: 1, name: 'Alice' }]);

        mockConnection.execute.mockResolvedValue({
            metaData: [{ name: 'USER_ID' }, { name: 'MEMO' }],
            rows: [[1, null]]
        });
        const single = await conn.find('SELECT * FROM users WHERE USER_ID = ?', [1]);
        expect(single).toEqual({
            userId: 1,
            memo: null
        });
    });

    test('should handle LIMIT and OFFSET clause', async () => {
        const factory = initializeDmDB({});
        const conn = await factory.createDBConnection();

        const clause = conn.getRowSetLimitClause(10, 20);
        expect(clause).toBe(' limit 10 offset 20');
    });
});
