import { DBConnection, DBFactory, Field, FieldType, InsertResult, UpdateResult, getLogger } from "@ticatec/keelson-core";
import type { Logger } from "@ticatec/logger-api";
import { Pool, PoolClient, QueryResult } from 'pg';

/**
 * PostgreSQL 内置数值类型的 OID：int2 / int4 / int8 / float4 / float8 / numeric / money。
 */
const NUMERIC_OIDS = new Set([21, 23, 20, 700, 701, 1700, 790]);

/**
 * PostgreSQL 内置时间类型的 OID：date / time / timetz / timestamp / timestamptz。
 */
const TEMPORAL_OIDS = new Set([1082, 1083, 1266, 1114, 1184]);


/**
 * PostgreSQL database connection implementation.
 * Extends the base DBConnection class to provide PostgreSQL-specific database functionality.
 */
class PgDBConnection extends DBConnection {

    /**
     * PostgreSQL client instance from connection pool.
     * @private
     */
    #client: PoolClient;

    /**
     * Creates a new PostgreSQL database connection instance.
     * @param conn - PostgreSQL pool client instance.
     */
    constructor(conn: PoolClient) {
        super();
        this.#client = conn;
    }


    /**
     * Parameter placeholder for PostgreSQL ($1, $2, etc.).
     * @param index - 1-based parameter index.
     */
    override getPlaceholder(index: number): string {
        return `$${index}`;
    }

    /**
     * Begins a PostgreSQL database transaction.
     */
    async beginTransaction(): Promise<void> {
        this.logger.debug({}, 'Beginning PostgreSQL transaction');
        await this.#client.query('BEGIN');
    }

    /**
     * Closes the database connection and releases it back to the connection pool.
     */
    async close(): Promise<void> {
        this.logger.debug({}, 'Releasing PostgreSQL connection to pool');
        this.#client.release();
    }

    /**
     * Commits the current PostgreSQL database transaction.
     */
    async commit(): Promise<void> {
        this.logger.debug({}, 'Committing PostgreSQL transaction');
        await this.#client.query('COMMIT');
    }

    /**
     * Rolls back the current PostgreSQL database transaction.
     */
    async rollback(): Promise<void> {
        try {
            this.logger.debug({}, 'Rolling back PostgreSQL transaction');
            await this.#client.query('ROLLBACK');
        } catch (e: any) {
            this.logger.error({ error: e?.message || e }, 'Failed to rollback PostgreSQL transaction');
        }
    }

    /**
     * Executes a raw SQL query.
     * @param sql - SQL query string.
     * @protected
     */
    protected executeSQL(sql: string): Promise<any> {
        this.logger.debug({ sql }, 'Executing raw SQL query');
        return this.#client.query(sql);
    }

    /**
     * Executes an UPDATE / DELETE / INSERT SQL query and returns the affected row count.
     * @param sql - SQL query string.
     * @param params - Parameter array.
     */
    async executeUpdate(sql: string, params: any[]): Promise<number> {
        const cleanParams = this.sanitizeParams(params) || [];
        this.logger.debug(this.safeLogMeta(sql, cleanParams), 'Executing SQL update');
        const result: QueryResult = await this.#client.query(sql, cleanParams);
        return result?.rowCount || 0;
    }

    /**
     * Retrieves field definitions from a query result.
     * @param result - Query result object.
     * @returns Array of Field metadata definitions.
     */
    getFields(result: any): Array<Field> {
        const list: Array<Field> = [];
        if (result && result.fields && Array.isArray(result.fields)) {
            result.fields.forEach((field: any) => {
                if (field && field.name) {
                    const type = this.getFieldType(field);
                    list.push({ name: this.toCamel(field.name), type });
                }
            });
        }
        return list;
    }

    /**
     * Retrieves row dataset array from a query result.
     * @param result - Query result object.
     * @protected
     */
    protected getRowSet(result: any): Array<any> {
        return result?.rows || [];
    }

    /**
     * Gets affected row count from execution result.
     * @param result - Query result object.
     */
    getAffectRows(result: any): number {
        return result?.rowCount || 0;
    }

    /**
     * Returns LIMIT and OFFSET clause for PostgreSQL.
     * @param rowCount - Maximum row count.
     * @param offset - Query offset.
     */
    override getRowSetLimitClause(rowCount: number, offset: number): string {
        return ` limit ${rowCount} offset ${offset}`;
    }

    /**
     * Gets the first row mapped object from a query result.
     * Handles null fields and preserved casing.
     * @param result - Query result object.
     * @protected
     */
    protected getFirstRow(result: any): any {
        if (result && result.rows && Array.isArray(result.rows) && result.rows.length > 0) {
            const firstRow = result.rows[0];
            if (!firstRow) return null;
            const ds: any = {};
            if (result.fields && Array.isArray(result.fields)) {
                result.fields.forEach((field: any) => {
                    if (field && field.name) {
                        const rawValue = firstRow[field.name];
                        this.setNestObj(ds, field.name, rawValue);
                    }
                });
            } else {
                Object.keys(firstRow).forEach(key => {
                    this.setNestObj(ds, key, firstRow[key]);
                });
            }
            return ds;
        }
        return null;
    }

    /**
     * Fetches query dataset from database.
     * @param sql - SQL query string.
     * @param params - Optional parameter array.
     */
    async fetchData(sql: string, params: Array<any> | null = null): Promise<any> {
        const cleanParams = this.sanitizeParams(params);
        this.logger.debug(this.safeLogMeta(sql, cleanParams || undefined), 'Fetching PostgreSQL data');
        return this.#client.query(sql, cleanParams || undefined);
    }

    /**
     * Maps a PostgreSQL type OID onto the framework's field type.
     *
     * 此前这个方法忽略入参、恒返回 Text，于是 `getFields()` 给出的 type 是一个
     * 对所有列都成立的假值。pg 在每个 field 上都带了 `dataTypeID`（类型 OID），
     * 按它判断即可；OID 是 PostgreSQL 内置类型的固定值，不随数据库实例变化。
     * 枚举、数组、JSON 等类型没有对应的框架类型，仍落到 Text。
     * @param field - Database field metadata.
     * @private
     */
    private getFieldType(field: any): FieldType {
        const oid = field?.dataTypeID;
        if (typeof oid !== 'number') {
            return FieldType.Text;
        }
        if (NUMERIC_OIDS.has(oid)) {
            return FieldType.Number;
        }
        if (TEMPORAL_OIDS.has(oid)) {
            return FieldType.Date;
        }
        return FieldType.Text;
    }

    /**
     * Deletes matching records.
     * @param sql - DELETE SQL query.
     * @param params - Parameter array.
     */
    async deleteRecord(sql: string, params: Array<any>): Promise<number> {
        return await this.executeUpdate(sql, params);
    }

    /**
     * Inserts a single record.
     * @template T - Result record type.
     * @param sql - INSERT SQL query.
     * @param params - Parameter array.
     * @returns Promise resolving to InsertResult<T>.
     */
    async insertRecord<T = any>(sql: string, params: Array<any>): Promise<InsertResult<T>> {
        const cleanParams = this.sanitizeParams(params) || [];
        this.logger.debug(this.safeLogMeta(sql, cleanParams), 'Inserting PostgreSQL record');
        const result: QueryResult = await this.#client.query(sql, cleanParams);
        return {
            affectedRows: result?.rowCount ?? 0,
            record: (this.getFirstRow(result) as T) ?? null
        };
    }

    /**
     * Updates matching records.
     * @template T - Result record type.
     * @param sql - UPDATE SQL query.
     * @param params - Parameter array.
     * @returns Promise resolving to UpdateResult<T>.
     */
    async updateRecord<T = any>(sql: string, params: Array<any>): Promise<UpdateResult<T>> {
        const cleanParams = this.sanitizeParams(params) || [];
        this.logger.debug(this.safeLogMeta(sql, cleanParams), 'Updating PostgreSQL record');
        const result: QueryResult = await this.#client.query(sql, cleanParams);
        return {
            affectedRows: result?.rowCount ?? 0,
            record: (this.getFirstRow(result) as T) ?? null
        };
    }
}

export type PostConnection = ((client: PoolClient) => Promise<void>) | null;

/**
 * PostgreSQL database factory implementation.
 * Implements DBFactory interface for creating PostgreSQL database connections.
 */
class PgDBFactory implements DBFactory {

    /**
     * PostgreSQL connection pool.
     * @private
     */
    #pool: Pool;

    /**
     * Tracks initialization promises for newly established physical socket connections.
     * @private
     */
    #initPromises = new WeakMap<PoolClient, Promise<void>>();

    /**
     * Guards against `pool.end()` being called twice: pg rejects the second call with
     * "Called end on pool more than once", which would turn an idempotent shutdown hook
     * into a failing one.
     * @private
     */
    #closed = false;

    /**
     * @private
     */
    #logger: Logger;

    /**
     * Creates a new PostgreSQL database factory.
     * @param config - PostgreSQL connection configuration object.
     * @param postConnection - Optional post-connection hook callback.
     */
    constructor(config: any, postConnection: PostConnection = null) {
        this.#logger = getLogger('PgDBFactory', 'db');
        this.#pool = new Pool(config);
        // pg 在空闲连接的 socket 上挂了 idleListener，连接被数据库或中间设备切断时
        // 它会调用 pool.emit('error', ...)。EventEmitter 对没有监听器的 'error'
        // 事件直接 throw，而这一句跑在 socket 的事件回调里，没有任何 try/catch 能接住，
        // 于是数据库重启、空闲连接被回收、网络抖动都会让整个 Node 进程以
        // uncaughtException 退出。挂上监听器是 pg 官方文档明确要求的。
        this.#pool.on('error', (err: Error, client?: PoolClient) => {
            this.#logger.error(err, `Idle PostgreSQL client errored and was removed from the pool${client ? '' : ' (no client attached)'}`);
        });
        this.#logger.info(PgDBFactory.describePool(config), 'PostgreSQL connection pool created');
        if (postConnection) {
            this.#pool.on('connect', (client: PoolClient) => {
                const initPromise = Promise.resolve().then(() => postConnection(client));
                initPromise.catch(() => {}); // Prevent unhandledRejection; real error is awaited in createDBConnection
                this.#initPromises.set(client, initPromise);
            });
        }
    }

    /**
     * Creates a new database connection from the pool.
     * Awaits completion of postConnection hook for newly established physical socket connections.
     * Releases physical client connection with error parameter if postConnection hook fails so pg destroys the socket.
     * @returns Promise resolving to a DBConnection instance.
     */
    async createDBConnection(): Promise<DBConnection> {
        const client: PoolClient = await this.#pool.connect();
        const initPromise = this.#initPromises.get(client);
        if (initPromise) {
            try {
                await initPromise;
            } catch (err: any) {
                client.release(err ?? true);
                throw new Error(`Post-connection hook failed: ${err?.message || err}`, { cause: err });
            }
        }
        return new PgDBConnection(client);
    }

    /**
     * Closes the PostgreSQL connection pool and releases all resources.
     * Safe to call more than once.
     */
    async close(): Promise<void> {
        if (this.#closed) {
            return;
        }
        this.#closed = true;
        this.#logger.info({}, 'Closing PostgreSQL connection pool');
        await this.#pool.end();
    }

    /**
     * Summarises the pool configuration for logging. Never returns credentials:
     * `password` and `connectionString` both carry secrets and are reduced to a boolean.
     * @param config - PostgreSQL connection configuration object.
     * @private
     */
    private static describePool(config: any): Record<string, unknown> {
        if (config == null || typeof config !== 'object') {
            return { configured: false };
        }
        return {
            host: config.host ?? null,
            port: config.port ?? null,
            database: config.database ?? null,
            max: config.max ?? null,
            ssl: config.ssl != null && config.ssl !== false,
            authenticated: config.password != null || config.connectionString != null
        };
    }
}

/**
 * Initializes a new PostgreSQL database factory instance.
 * @param config - PostgreSQL connection configuration.
 * @param postConnection - Optional post-connection hook callback.
 * @returns DBFactory instance.
 */
export const initializePg = (config: any, postConnection: PostConnection = null): DBFactory => {
    return new PgDBFactory(config, postConnection);
};

export { PgDBConnection, PgDBFactory };
