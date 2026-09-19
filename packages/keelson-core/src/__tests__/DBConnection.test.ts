import DBConnection, {UpdateResult, InsertResult} from '../db/DBConnection.js';
import Field from '../db/Field.js';

class MockConnection extends DBConnection {
    public fetchedParams: any[] | null | undefined;

    public constructor() {
        super();
        (this as any).logger = { debug: () => {}, info: () => {}, error: () => {}, warn: () => {}, trace: () => {} };
    }

    beginTransaction(): Promise<void> { return Promise.resolve(); }
    commit(): Promise<void> { return Promise.resolve(); }
    rollback(): Promise<void> { return Promise.resolve(); }
    close(): Promise<void> { return Promise.resolve(); }
    protected executeSQL(_sql: string): Promise<any> { return Promise.resolve(); }
    executeUpdate(_sql: string, _params: Array<any>): Promise<number> { return Promise.resolve(0); }
    insertRecord<T = any>(_sql: string, _params: Array<any>): Promise<InsertResult<T>> {
        return Promise.resolve({ affectedRows: 1, record: null });
    }
    updateRecord<T = any>(_sql: string, _params: Array<any>): Promise<UpdateResult<T>> {
        return Promise.resolve({ affectedRows: 0, record: null });
    }
    deleteRecord(_sql: string, _params: Array<any>): Promise<number> { return Promise.resolve(0); }
    getPlaceholder(index: number): string { return `$${index}`; }
    getFields(_result: any): Array<Field> { return []; }
    protected getRowSet(_result: any): Array<any> { return []; }
    protected getAffectRows(_result: any): number { return 0; }
    protected getFirstRow(_result: any): any { return null; }

    protected async fetchData(_sql: string, params?: Array<any>): Promise<any> {
        this.fetchedParams = params;
        return { rows: [], fields: [] };
    }
}

describe('DBConnection.sanitizeParams', () => {
    let conn: MockConnection;

    beforeEach(() => {
        conn = new MockConnection();
    });

    test('should convert undefined array elements to null', () => {
        const input = [1, undefined, 'hello', undefined, null];
        const result = conn.sanitizeParams(input);
        expect(result).toEqual([1, null, 'hello', null, null]);
    });

    test('should return null for null or undefined input', () => {
        expect(conn.sanitizeParams(null)).toBeNull();
        expect(conn.sanitizeParams(undefined)).toBeNull();
    });

    test('should automatically sanitize params in listQuery', async () => {
        await conn.listQuery('SELECT * FROM test WHERE id = $1 AND name = $2', [42, undefined]);
        expect(conn.fetchedParams).toEqual([42, null]);
    });

    test('should return UpdateResult structure from updateRecord', async () => {
        const result = await conn.updateRecord<{ id: number; name: string }>('UPDATE test SET name = $1', ['test']);
        expect(result).toHaveProperty('affectedRows');
        expect(result).toHaveProperty('record');
        expect(result.affectedRows).toBe(0);
        expect(result.record).toBeNull();
    });

    test('should return InsertResult structure from insertRecord', async () => {
        const result = await conn.insertRecord<{ id: number; name: string }>('INSERT INTO test (name) VALUES ($1)', ['test']);
        expect(result).toHaveProperty('affectedRows');
        expect(result).toHaveProperty('record');
        expect(result.affectedRows).toBe(1);
        expect(result.record).toBeNull();
    });

    test('should preserve explicit null columns in listQuery and find', async () => {
        class NullTestConnection extends MockConnection {
            protected override async fetchData(_sql: string, _params?: Array<any>): Promise<any> {
                return {
                    rows: [{ user_name: null, memo: null }],
                    fields: [{ name: 'user_name' }, { name: 'memo' }]
                };
            }
            protected override getRowSet(result: any): any[] {
                return result.rows;
            }
            protected override getFirstRow(result: any): any {
                return { userName: null, memo: null };
            }
        }
        const nullConn = new NullTestConnection();
        const list = await nullConn.listQuery('SELECT user_name, memo FROM users');
        expect(list).toEqual([{ userName: null, memo: null }]);
        const first = await nullConn.find('SELECT user_name, memo FROM users');
        expect(first).toEqual({ userName: null, memo: null });
    });
});

describe('DBConnection.getBoolean', () => {
    let conn: any;

    beforeEach(() => {
        conn = new MockConnection();
    });

    test('reads the string forms of false as false, in any case', () => {
        // 这是修复前最容易伤人的一组：'false' 走到末尾的 !!value，非空字符串一律为真，
        // 于是文本列里的 'false' 被读成 true——不是读不出来，是读反了。
        ['false', 'FALSE', 'False', ' false ', 'f', 'F', '0', ' 0 '].forEach(v => {
            expect(conn.getBoolean(v)).toBe(false);
        });
    });

    test('reads the string forms of true as true, in any case', () => {
        ['true', 'TRUE', 'True', ' true ', 't', 'T', '1', ' 1 '].forEach(v => {
            expect(conn.getBoolean(v)).toBe(true);
        });
    });

    test('passes booleans and 1/0 straight through', () => {
        expect(conn.getBoolean(true)).toBe(true);
        expect(conn.getBoolean(false)).toBe(false);
        expect(conn.getBoolean(1)).toBe(true);
        expect(conn.getBoolean(0)).toBe(false);
    });

    test('falls back to truthiness for anything it does not recognise', () => {
        expect(conn.getBoolean(null)).toBe(false);
        expect(conn.getBoolean(undefined)).toBe(false);
        expect(conn.getBoolean('')).toBe(false);
        expect(conn.getBoolean('yes')).toBe(true);
        expect(conn.getBoolean(2)).toBe(true);
        expect(conn.getBoolean({})).toBe(true);
    });

    test('convertBooleanFields applies the same rule to a mapped row', () => {
        const row: any = { active: 'false', admin: 'TRUE', deleted: 'f' };
        conn.convertBooleanFields(row, ['active', 'admin', 'deleted']);
        expect(row).toEqual({ active: false, admin: true, deleted: false });
    });
});
