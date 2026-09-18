import { DBConnection, DBFactory, Field, FieldType, InsertResult, UpdateResult } from "@ticatec/node-common-library";
import { Pool, PoolClient, QueryResult } from 'pg';

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
     * Evaluates whether a value represents boolean truth in PostgreSQL (supports true/false, t/f, 1/0).
     * @param value - Target value.
     * @protected
     * @returns True if value represents boolean truth.
     */
    protected override getBoolean(value: any): boolean {
        if (value === true || value === 't' || value === 'true') {
            return true;
        }
        if (value === false || value === 'f' || value === 'false') {
            return false;
        }
        if (value === 1 || value === '1') {
            return true;
        }
        if (value === 0 || value === '0') {
            return false;
        }
        return !!value;
    }

    /**
     * Begins a PostgreSQL database transaction.
     */
    async beginTransaction(): Promise<void> {
        this.logger.debug('Beginning PostgreSQL transaction');
        await this.#client.query('BEGIN');
    }

    /**
     * Closes the database connection and releases it back to the connection pool.
     */
    async close(): Promise<void> {
        this.logger.debug('Releasing PostgreSQL connection to pool');
        this.#client.release();
    }

    /**
     * Commits the current PostgreSQL database transaction.
     */
    async commit(): Promise<void> {
        this.logger.debug('Committing PostgreSQL transaction');
        await this.#client.query('COMMIT');
    }

    /**
     * Rolls back the current PostgreSQL database transaction.
     */
    async rollback(): Promise<void> {
        try {
            this.logger.debug('Rolling back PostgreSQL transaction');
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
     * Builds field name mapping map (converting column names to camelCase).
     * @param fields - Array of field metadata objects.
     * @protected
     */
    protected override buildFieldsMap(fields: Array<any>): Map<string, string> {
        const map = new Map<string, string>();
        if (Array.isArray(fields)) {
            fields.forEach(field => {
                const rawName = typeof field === 'string' ? field : field?.name;
                if (rawName) {
                    map.set(rawName, this.toCamel(rawName));
                }
            });
        }
        return map;
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
     * Retrieves the field type definition.
     * @param _field - Database field metadata.
     * @private
     */
    private getFieldType(_field: any): FieldType {
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
     * Creates a new PostgreSQL database factory.
     * @param config - PostgreSQL connection configuration object.
     * @param postConnection - Optional post-connection hook callback.
     */
    constructor(config: any, postConnection: PostConnection = null) {
        this.#pool = new Pool(config);
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
     */
    async close(): Promise<void> {
        await this.#pool.end();
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
