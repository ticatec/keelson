import StringUtils from "./StringUtils.js";
import DBConnection, {UpdateResult, InsertResult} from "./db/DBConnection.js";
import {getLogger, Logger} from "./Logger.js";
import TransactionManager from "./TransactionManager.js";
import CommonSearchCriteria from "./db/CommonSearchCriteria.js";
import PaginationList from "./db/PaginationList.js";

/**
 * Quick search result interface.
 * @template T Type of items in the list.
 */
export interface QuickSearchResult<T = any> {
    /**
     * Result list.
     */
    list: Array<T>;
    /**
     * Whether more data is available beyond the current page.
     */
    hasMore: boolean;
}

export default abstract class CommonDAO {

    protected readonly logger: Logger;

    protected constructor() {
        this.logger = getLogger(this.constructor.name, "controller");
        this.logger.debug(`Created DAO instance: ${this.constructor.name}`);
    }

    /**
     * Retrieves the database connection for the current execution thread (transaction-aware).
     * - Returns active transaction connection if inside a transaction.
     * - Otherwise throws an error if no connection is active in the context.
     */
    protected async getDBConnection(): Promise<DBConnection> {
        const conn = TransactionManager.getCurrentConnection();
        if (!conn) {
            throw new Error('No database connection available. Ensure you are inside a @Transaction or using TransactionManager.execute().');
        }
        return conn;
    }

    /**
     * Generates a 32-character UUID string.
     * @protected
     * @returns Generated 32-character UUID string.
     */
    protected genID(): string {
        return StringUtils.genID();
    }

    /**
     * Executes a count query and returns the count value.
     * Handles NaN gracefully.
     * @param sql - Count SQL query to execute.
     * @param params - Array of SQL query parameters.
     * @param key - Key name of the count column, defaults to 'cc'.
     * @protected
     * @returns Promise resolving to the count number.
     */
    protected async executeCountSQL(sql: string, params: Array<any>, key: string = 'cc'): Promise<number> {
        const conn: DBConnection = await this.getDBConnection();
        const data = await conn.find(sql, params);
        if (data == null) return 0;
        const s = data[key];
        if (s == null) return 0;
        const parsed = parseInt(s, 10);
        return isNaN(parsed) ? 0 : parsed;
    }

    /**
     * Converts a boolean value to an integer (true=1, false=0).
     * @param value - Boolean value to convert.
     * @protected
     * @returns Integer value (1 or 0).
     */
    protected getBooleanValue(value: boolean): number {
        return value === true ? 1 : 0;
    }

    /**
     * Converts a boolean value to a character ('T' or 'F').
     * @param value - Boolean value to convert.
     * @protected
     * @returns String ('T' or 'F').
     */
    protected getBoolean(value: boolean): string {
        return value === true ? 'T' : 'F';
    }

    /**
     * Quick paginated search query using driver-independent limit/offset clauses.
     * @template T - Type of items in the result list.
     * @param sql - Base SQL query statement.
     * @param params - Array of SQL query parameters (defaults to empty array).
     * @param pageNo - Page number (defaults to 1).
     * @param rowCount - Number of rows per page (defaults to 25).
     * @param booleanFields - Field names to coerce to boolean (supports nested properties like 'user.isActive').
     * @protected
     * @returns Promise resolving to QuickSearchResult containing list data and hasMore flag.
     */
    protected async quickSearch<T = any>(
        sql: string,
        params: Array<any> = [],
        pageNo: number = 1,
        rowCount: number = 25,
        booleanFields?: Array<string>
    ): Promise<QuickSearchResult<T>> {
        const conn: DBConnection = await this.getDBConnection();
        return conn.quickSearch<T>(sql, params, pageNo, rowCount, booleanFields);
    }

    /**
     * Executes a query and returns the first row of the result.
     * @param sql - SQL query statement to execute.
     * @param params - Array of SQL query parameters (defaults to empty array).
     * @protected
     * @returns Promise resolving to the first row, or null if no rows match.
     */
    protected async findFirst(sql: string, params: Array<any> = []): Promise<any> {
        const conn = await this.getDBConnection();
        this.logger.debug({sql, params}, 'Executing find query');
        return await conn.find(sql, params);
    }

    protected findByPK(sql: string, params: Array<any> = []): Promise<any> {
        return this.findFirst(sql, params);
    }

    /**
     * Executes a query and returns all matching rows as a list.
     * @param sql - SQL query statement to execute.
     * @param params - Array of SQL query parameters (defaults to empty array).
     * @protected
     * @returns Promise resolving to the array of result rows.
     */
    protected async listQuery(sql: string, params: Array<any> = []): Promise<any> {
        const conn = await this.getDBConnection();
        this.logger.debug({sql, params}, 'Executing list query');
        const list = await conn.listQuery(sql, params);
        this.logger.debug(`List query returned ${Array.isArray(list) ? list.length : 0} rows`);
        return list;
    }

    /**
     * Executes an INSERT statement.
     * @template T - Type of the returned record object.
     * @param sql - INSERT SQL statement to execute.
     * @param params - Array of SQL query parameters (defaults to empty array).
     * @protected
     * @returns Promise resolving to InsertResult<T>.
     */
    protected async executeInsertQuery<T = any>(sql: string, params: Array<any> = []): Promise<InsertResult<T>> {
        const conn = await this.getDBConnection();
        this.logger.debug({sql, params}, 'Executing insert query');
        return conn.insertRecord<T>(sql, params);
    }

    /**
     * Executes an UPDATE statement.
     * @template T - Type of the returned record object.
     * @param sql - UPDATE SQL statement to execute.
     * @param params - Array of SQL query parameters (defaults to empty array).
     * @protected
     * @returns Promise resolving to UpdateResult<T>.
     */
    protected async executeUpdateQuery<T = any>(sql: string, params: Array<any> = []): Promise<UpdateResult<T>> {
        const conn = await this.getDBConnection();
        this.logger.debug({sql, params}, 'Executing update query');
        return conn.updateRecord<T>(sql, params);
    }

    /**
     * Executes a DELETE statement and returns the number of deleted rows.
     * @param sql - DELETE SQL statement to execute.
     * @param params - Array of SQL query parameters (defaults to empty array).
     * @protected
     * @returns Promise resolving to the number of deleted rows.
     */
    protected async executeDeleteQuery(sql: string, params: Array<any> = []): Promise<number> {
        const conn = await this.getDBConnection();
        this.logger.debug({sql, params}, 'Executing delete query');
        const affected = await conn.deleteRecord(sql, params);
        this.logger.debug(`Delete query affected ${affected} rows`);
        return affected;
    }

    /**
     * Executes a paginated search query using the provided CommonSearchCriteria object.
     * Automatically obtains the active database connection from the current context.
     * @param criteria - CommonSearchCriteria instance defining dynamic query conditions, pagination, and sorting.
     * @protected
     * @returns Promise resolving to PaginationList containing paginated records and metadata.
     */
    protected async executePaginationQuery(criteria: CommonSearchCriteria): Promise<PaginationList> {
        const conn = await this.getDBConnection();
        return criteria.paginationQuery(conn);
    }
}