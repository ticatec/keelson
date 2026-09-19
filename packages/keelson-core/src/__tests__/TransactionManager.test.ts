import { setLoggerProvider, resetLoggerProvider } from '@ticatec/logger-api';
import type { Logger } from '@ticatec/logger-api';
import TransactionManager from '../TransactionManager.js';
import CommonService from '../CommonService.js';
import DBManager from '../db/DBManager.js';
import DBConnection from '../db/DBConnection.js';
import { Transaction, Propagation } from '../db/Transaction.js';

/** Silences framework logging for the duration of the suite. */
const SILENT: Logger = (() => {
    const noop = () => { /* discard */ };
    return { trace: noop, debug: noop, info: noop, warn: noop, error: noop };
})();


class MockDBConnection extends DBConnection {
    public isTxActive = false;
    public isClosed = false;

    async beginTransaction(): Promise<void> { this.isTxActive = true; }
    async commit(): Promise<void> { this.isTxActive = false; }
    async rollback(): Promise<void> { this.isTxActive = false; }
    async close(): Promise<void> { this.isClosed = true; }
    getPlaceholder(index: number): string { return `$${index}`; }
    protected async executeSQL(sql: string): Promise<any> { return []; }
    async executeUpdate(sql: string, params: Array<any>): Promise<number> { return 1; }
    async insertRecord<T = any>(sql: string, params: Array<any>): Promise<any> { return { affectedRows: 1, record: null }; }
    async updateRecord<T = any>(sql: string, params: Array<any>): Promise<any> { return { affectedRows: 0, record: null }; }
    async deleteRecord(sql: string, params: Array<any>): Promise<number> { return 1; }
    protected async fetchData(sql: string, params?: Array<any>): Promise<any> { return { rows: [], fields: [] }; }
    getFields(result: any): any[] { return []; }
    protected getRowSet(result: any): any[] { return []; }
    protected getAffectRows(result: any): number { return 1; }
    protected getFirstRow(result: any): any { return null; }
}

describe('TransactionManager & @Transaction Decorator', () => {
    let mockFactory: any;

    beforeAll(() => {
        resetLoggerProvider();
        setLoggerProvider(() => SILENT);
    });

    beforeEach(() => {
        DBManager.resetInstance();
        mockFactory = {
            createDBConnection: jest.fn().mockImplementation(async () => new MockDBConnection()),
            close: jest.fn().mockResolvedValue(undefined)
        };
        DBManager.init(mockFactory);
    });

    abstract class BaseService extends CommonService {
        @Transaction(Propagation.REQUIRES_NEW)
        async parentRequiresNewMethod(): Promise<string> {
            const conn = await this.getDBConnection();
            return 'PARENT_REQUIRES_NEW';
        }
    }

    class TestService extends BaseService {
        public constructor() {
            super();
        }

        @Transaction(Propagation.REQUIRED)
        async requiredMethod(): Promise<string> {
            const conn = await this.getDBConnection();
            return 'REQUIRED_RESULT';
        }

        @Transaction(Propagation.REQUIRES_NEW)
        async requiresNewMethod(): Promise<string> {
            const conn = await this.getDBConnection();
            return 'REQUIRES_NEW_RESULT';
        }

        @Transaction(Propagation.NONE)
        async noneMethod(): Promise<string> {
            const conn = await this.getDBConnection();
            return 'NONE_RESULT';
        }
    }

    test('should execute REQUIRED method successfully', async () => {
        const service = new TestService();
        const res = await service.requiredMethod();
        expect(res).toBe('REQUIRED_RESULT');
        expect(mockFactory.createDBConnection).toHaveBeenCalledTimes(1);
    });

    test('should execute REQUIRES_NEW method without throwing error', async () => {
        const service = new TestService();
        const res = await service.requiresNewMethod();
        expect(res).toBe('REQUIRES_NEW_RESULT');
        expect(mockFactory.createDBConnection).toHaveBeenCalledTimes(1);
    });

    test('should execute inherited parent REQUIRES_NEW method correctly via prototype hierarchy', async () => {
        const service = new TestService();
        const res = await service.parentRequiresNewMethod();
        expect(res).toBe('PARENT_REQUIRES_NEW');
    });

    class NestedTxService extends CommonService {
        public constructor() {
            super();
        }

        @Transaction(Propagation.REQUIRED)
        async outerRequired(): Promise<string> {
            const innerRes = await this.requiresNew();
            return `OUTER_${innerRes}`;
        }

        @Transaction(Propagation.REQUIRES_NEW)
        async requiresNew(): Promise<string> {
            return 'INNER_NEW';
        }

        @Transaction(Propagation.NONE)
        async outerNone(): Promise<string> {
            const connNone = await this.getDBConnection();
            const innerRes = await this.innerRequired();
            return `NONE_${innerRes}`;
        }

        @Transaction(Propagation.REQUIRED)
        async innerRequired(): Promise<string> {
            const connReq = await this.getDBConnection();
            return 'INNER_REQUIRED';
        }
    }

    test('should open 2 separate DB connections when REQUIRED calls nested REQUIRES_NEW', async () => {
        const service = new NestedTxService();
        const res = await service.outerRequired();
        expect(res).toBe('OUTER_INNER_NEW');
        expect(mockFactory.createDBConnection).toHaveBeenCalledTimes(2);
    });

    test('should open separate transactional DB connection when REQUIRED is nested inside NONE', async () => {
        const service = new NestedTxService();
        const res = await service.outerNone();
        expect(res).toBe('NONE_INNER_REQUIRED');
        expect(mockFactory.createDBConnection).toHaveBeenCalledTimes(2);
    });

    test('should throw error if DBManager is not initialized', () => {
        DBManager.resetInstance();
        expect(() => DBManager.getInstance()).toThrow(/DBManager is not initialized/);
    });
});
