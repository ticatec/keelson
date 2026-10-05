import CommonDAO from '../CommonDAO';
import DBConnection from '../db/DBConnection.js';
import CommonSearchCriteria from '../db/CommonSearchCriteria.js';
import PaginationList from '../db/PaginationList.js';

interface UserEntity {
    id: number;
    name: string;
}

class MockConnection extends DBConnection {
    async beginTransaction(): Promise<void> {}
    async commit(): Promise<void> {}
    rollback(): Promise<void> { return Promise.resolve(); }
    close(): Promise<void> { return Promise.resolve(); }
    protected async executeSQL(sql: string): Promise<any> { return []; }
    async executeUpdate(sql: string, params: Array<any>): Promise<number> { return 1; }
    async insertRecord<T = any>(sql: string, params: Array<any>): Promise<any> { return { affectedRows: 1, record: null }; }
    async updateRecord<T = any>(sql: string, params: Array<any>): Promise<any> { return { affectedRows: 0, record: null }; }
    async deleteRecord(sql: string, params: Array<any>): Promise<number> { return 1; }
    protected async fetchData(sql: string, params?: Array<any>): Promise<any> {
        if (sql.includes('count(*)')) {
            return { rows: [{ cc: '2' }], fields: ['cc'] };
        }
        return {
            rows: [
                { id: 1, name: 'Alice' },
                { id: 2, name: 'Bob' }
            ],
            fields: ['id', 'name']
        };
    }
    getPlaceholder(idx: number): string { return `$${idx}`; }
    getFields(result: any): any[] { return result?.fields ?? []; }
    protected getRowSet(result: any): any[] { return result?.rows ?? []; }
    protected getAffectRows(result: any): number { return 1; }
    protected getFirstRow(result: any): any {
        return result?.rows?.[0] ?? null;
    }
}

class UserSearchCriteria extends CommonSearchCriteria {
    public constructor(conn: DBConnection) {
        super(conn);
        this.sql = 'select id, name from users where 1=1';
    }
    protected buildDynamicQuery(): void {}
}

class TestUserDAO extends CommonDAO {
    private readonly mockConn = new MockConnection();

    public constructor() {
        super();
    }

    protected override async getDBConnection(): Promise<DBConnection> {
        return this.mockConn;
    }

    public async testFindFirst(): Promise<UserEntity | null> {
        return await this.findFirst<UserEntity>('select id, name from users where id = $1', [1]);
    }

    public async testFindByPK(): Promise<UserEntity | null> {
        return await this.findByPK<UserEntity>('select id, name from users where id = $1', [1]);
    }

    public async testListQuery(): Promise<Array<UserEntity>> {
        return await this.listQuery<UserEntity>('select id, name from users');
    }

    public async testPagination(): Promise<PaginationList<UserEntity>> {
        const conn = await this.getDBConnection();
        return await this.executePaginationQuery<UserEntity>(new UserSearchCriteria(conn));
    }
}

describe('CommonDAO generics', () => {
    const dao = new TestUserDAO();

    test('findFirst returns typed entity or null', async () => {
        const user: UserEntity | null = await dao.testFindFirst();
        expect(user).not.toBeNull();
        expect(user?.id).toBe(1);
        expect(user?.name).toBe('Alice');
    });

    test('findByPK returns typed entity or null', async () => {
        const user: UserEntity | null = await dao.testFindByPK();
        expect(user).not.toBeNull();
        expect(user?.id).toBe(1);
        expect(user?.name).toBe('Alice');
    });

    test('listQuery returns typed array', async () => {
        const list: Array<UserEntity> = await dao.testListQuery();
        expect(list.length).toBe(2);
        expect(list[0].name).toBe('Alice');
        expect(list[1].name).toBe('Bob');
    });

    test('executePaginationQuery returns typed PaginationList', async () => {
        const pList: PaginationList<UserEntity> = await dao.testPagination();
        expect(pList.count).toBe(2);
        expect(pList.list.length).toBe(2);
        expect(pList.list[0].name).toBe('Alice');
    });

    test('CommonSearchCriteria supports generic typed criteria with default any', () => {
        const conn = new MockConnection();

        interface CustomCriteria {
            keyword: string;
            status?: number;
        }

        class TypedSearchCriteria extends CommonSearchCriteria<CustomCriteria> {
            public constructor(c: DBConnection, crit: CustomCriteria) {
                super(c, crit);
            }
            protected buildDynamicQuery(): void {
                if (this.criteria?.keyword) {
                    this.sql += ` and name = '${this.criteria.keyword}'`;
                }
            }
            public getCriteria(): CustomCriteria | undefined {
                return this.criteria;
            }
        }

        const crit = new TypedSearchCriteria(conn, { keyword: 'test', status: 1 });
        expect(crit.getCriteria()?.keyword).toBe('test');
        expect(crit.getCriteria()?.status).toBe(1);

        // Untyped subclass defaults to any
        class UntypedCriteria extends CommonSearchCriteria {
            public constructor(c: DBConnection, crit?: any) {
                super(c, crit);
            }
            public getCriteria(): any {
                return this.criteria;
            }
        }
        const untyped = new UntypedCriteria(conn, { anyProp: 123 });
        expect(untyped.getCriteria().anyProp).toBe(123);
    });
});
