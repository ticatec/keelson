import { setLoggerProvider, resetLoggerProvider } from '@ticatec/logger-api';
import type { Logger } from '@ticatec/logger-api';
import CommonSearchCriteria from '../db/CommonSearchCriteria.js';
import DBConnection from '../db/DBConnection.js';

/** Silences framework logging for the duration of the suite. */
const SILENT: Logger = (() => {
    const noop = () => { /* discard */ };
    return { trace: noop, debug: noop, info: noop, warn: noop, error: noop };
})();


class MockDBConnectionForCriteria extends DBConnection {
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
            return { rows: [{ cc: '35' }], fields: ['cc'] };
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

class SampleSearchCriteria extends CommonSearchCriteria {
    public constructor(criteria?: any) {
        super(criteria);
        this.sql = 'select * from users where 1=1';
    }

    protected buildDynamicQuery(): void {}

    public testBuildRange(from: any, to: any, field: string) {
        return this.addRangeCriteria(from, to, field);
    }

    public testBuildStar(text: string, field: string) {
        return this.addWildcardCriteria(text, field);
    }

    public getSql() { return this.sql; }
    public getParams() { return this.params; }

    protected override getPostProcessor() {
        return (obj: any) => {
            obj.processed = true;
        };
    }
}

describe('CommonSearchCriteria', () => {
    beforeAll(() => {
        resetLoggerProvider();
        setLoggerProvider(() => SILENT);
    });

    test('should build star and range criteria correctly', () => {
        const criteria = new SampleSearchCriteria();
        criteria.testBuildStar('Al*', 'name');
        expect(criteria.getSql()).toContain('name like $1');
        expect(criteria.getParams()).toEqual(['Al%']);

        const startDate = new Date('2024-01-01T00:00:00Z');
        const endDate = new Date('2024-01-31T00:00:00Z');
        criteria.testBuildRange(startDate, endDate, 'created_at');
        expect(criteria.getSql()).toContain('created_at >= $2 and created_at < $3');
    });

    test('should calculate pages correctly using Math.ceil', async () => {
        const conn = new MockDBConnectionForCriteria();
        const criteria = new SampleSearchCriteria({ page: 1, pageSize: 10 });
        const res = await criteria.paginationQuery(conn);

        expect(res.count).toBe(35);
        expect(res.pages).toBe(4); // Math.ceil(35 / 10) = 4
        expect(res.hasMore).toBe(true);
        expect(res.list[0].processed).toBe(true);
    });

    test('should apply postConstructor in unpaginated query() method', async () => {
        const conn = new MockDBConnectionForCriteria();
        const criteria = new SampleSearchCriteria();
        const list = await criteria.query(conn);

        expect(list.length).toBe(2);
        expect(list[0].processed).toBe(true);
        expect(list[1].processed).toBe(true);
    });

    test('should be safely re-entrant across multiple executions without duplicating conditions', async () => {
        const conn = new MockDBConnectionForCriteria();
        const criteria = new SampleSearchCriteria();
        await criteria.query(conn);
        const paramsCountFirst = criteria.getParams().length;

        await criteria.query(conn);
        const paramsCountSecond = criteria.getParams().length;

        expect(paramsCountSecond).toBe(paramsCountFirst);
    });

    test('should use dialect placeholders when driver provides them', async () => {
        class MySQLMockConnection extends MockDBConnectionForCriteria {
            override getPlaceholder(_idx: number): string { return '?'; }
        }

        class DynamicCriteria extends CommonSearchCriteria {
            public constructor() {
                super();
            }

            protected buildDynamicQuery(): void {
                this.sql = 'select * from users where 1=1';
                this.addEqualsCriteria(123, 'status');
            }
            public getSql() { return this.sql; }
        }

        const conn = new MySQLMockConnection();
        const criteria = new DynamicCriteria();
        await criteria.query(conn);

        expect(criteria.getSql()).toContain('status = ?');
        expect(criteria.getSql()).not.toContain('$1');
    });

    test('should preserve baseline sql, params, and orderBy from constructor across multiple queries', async () => {
        const BASE_SQL = 'select * from products where tenant_code = $1';
        class TenantDocSearchCriteria extends CommonSearchCriteria {
            public constructor(tenantCode: string, criteria: any) {
                super(criteria);
                this.sql = BASE_SQL;
                this.params = [tenantCode];
                this.orderBy = 'ORDER BY p.name';
            }

            protected buildDynamicQuery(): void {
                if (this.criteria?.name) {
                    this.addEqualsCriteria(this.criteria.name, 'p.name');
                }
            }

            public getSql() { return this.sql; }
            public getParams() { return this.params; }
            public getOrderBy() { return this.orderBy; }
        }

        const conn = new MockDBConnectionForCriteria();
        const criteria = new TenantDocSearchCriteria('TENANT_A', { name: 'Widget' });

        // First run
        await criteria.query(conn);
        expect(criteria.getSql()).toBe('select * from products where tenant_code = $1 and p.name = $2');
        expect(criteria.getParams()).toEqual(['TENANT_A', 'Widget']);
        expect(criteria.getOrderBy()).toBe('ORDER BY p.name');

        // Second run (re-entrancy check)
        await criteria.query(conn);
        expect(criteria.getSql()).toBe('select * from products where tenant_code = $1 and p.name = $2');
        expect(criteria.getParams()).toEqual(['TENANT_A', 'Widget']);
        expect(criteria.getOrderBy()).toBe('ORDER BY p.name');
    });
});
