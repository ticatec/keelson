import Field from "./Field.js";
import fs from "fs";
import {getLogger} from "../Logger.js";
import type {Logger} from "../Logger.js";
import PaginationList from "./PaginationList.js";
import CommonSearchCriteria from "./CommonSearchCriteria.js";

type PostConstructionFun = (obj: any) => void;

export {PostConstructionFun};

/**
 * Result structure of an update record operation.
 * @template T - Type of the updated record object.
 */
export interface UpdateResult<T = any> {
    /**
     * Number of affected rows.
     */
    affectedRows: number;

    /**
     * Updated record object instance, or null if no record was returned or affected.
     */
    record: T | null;
}

/**
 * Result structure of an insert record operation.
 * @template T - Type of the inserted record object.
 */
export interface InsertResult<T = any> {
    /**
     * Number of affected rows (typically 1 on successful insert, or 0).
     */
    affectedRows: number;

    /**
     * Inserted record object instance, or null if no record was returned or affected.
     */
    record: T | null;

    /**
     * Generated auto-increment primary key ID (if supported by driver, e.g. MySQL).
     */
    insertId?: number | string | null;
}

export interface ExecuteSQLFileOptions {
    stopOnError?: boolean;
    throwOnError?: boolean;
}

export default abstract class DBConnection {

    protected readonly logger: Logger;

    public constructor() {
        this.logger = getLogger("SQL", "db");
    }

    /**
     * Begins a database transaction.
     * @abstract
     */
    abstract beginTransaction(): Promise<void>;

    /**
     * Commits the current database transaction.
     * @abstract
     */
    abstract commit(): Promise<void>;

    /**
     * Rolls back the current database transaction.
     * @abstract
     */
    abstract rollback(): Promise<void>;

    /**
     * Closes the underlying database connection.
     * @abstract
     */
    abstract close(): Promise<void>;

    /**
     * Executes a raw SQL statement.
     * @param sql - SQL query string.
     * @protected
     * @abstract
     * @returns Promise resolving to execution result.
     */
    protected abstract executeSQL(sql: string): Promise<any>;

    /**
     * Executes an UPDATE / DELETE / INSERT query and returns the number of affected rows.
     * @param sql - SQL query string.
     * @param params - Parameter array.
     * @abstract
     * @returns Promise resolving to the number of affected rows.
     */
    abstract executeUpdate(sql: string, params: Array<any>): Promise<number>;

    /**
     * Inserts a single record.
     * @template T - Result record type.
     * @param sql - INSERT SQL query string.
     * @param params - Parameter array.
     * @abstract
     * @returns Promise resolving to InsertResult<T>.
     */
    abstract insertRecord<T = any>(sql: string, params: Array<any>): Promise<InsertResult<T>>;

    /**
     * Updates matching records.
     * @template T - Result record type.
     * @param sql - UPDATE SQL query string.
     * @param params - Parameter array.
     * @abstract
     * @returns Promise resolving to UpdateResult<T>.
     */
    abstract updateRecord<T = any>(sql: string, params: Array<any>): Promise<UpdateResult<T>>;

    /**
     * Deletes matching records.
     * @param sql - DELETE SQL query string.
     * @param params - Parameter array.
     * @abstract
     * @returns Promise resolving to the number of affected rows.
     */
    abstract deleteRecord(sql: string, params: Array<any>): Promise<number>;

    /**
     * Extracts the count value from a query result object (defaults to key 'cc').
     * @param data - Result object containing count information.
     * @param key - Column key for the count (defaults to 'cc').
     * @protected
     * @returns Parsed integer count.
     */
    protected getCount(data: any, key: string = 'cc'): number {
        if (data == null) return 0;
        const s = data[key];
        if (s == null) return 0;
        const parsed = parseInt(s, 10);
        return isNaN(parsed) ? 0 : parsed;
    }

    /**
     * Evaluates whether a value represents a boolean true.
     * Supports 1/0, '1'/'0', 'T'/'F', 't'/'f', true/false.
     * @param value - Target value.
     * @protected
     * @returns True if value represents boolean truth.
     */
    protected getBoolean(value: any): boolean {
        if (value === 1 || value === '1' || value === 'T' || value === 't' || value === true) {
            return true;
        }
        if (value === 0 || value === '0' || value === 'F' || value === 'f' || value === false) {
            return false;
        }
        return !!value;
    }

    /**
     * Converts specified fields on an object to boolean values.
     * Supports nested field paths (e.g. 'user.isActive').
     * @param data - Data object.
     * @param fields - Array of field property paths.
     */
    public convertBooleanFields(data: any, fields: Array<string>): void {
        if (!data || !fields || fields.length === 0) {
            return;
        }

        fields.forEach(fieldPath => {
            const parts = fieldPath.split('.');
            let current = data;

            for (let i = 0; i < parts.length - 1; i++) {
                const part = parts[i];
                if (current[part] == null) {
                    return;
                }
                current = current[part];
            }

            const lastKey = parts[parts.length - 1];
            if (current && current[lastKey] != null) {
                current[lastKey] = this.getBoolean(current[lastKey]);
            }
        });
    }

    /**
     * Executes a count query and returns the count value.
     * @param sql - Count SQL query.
     * @param params - Query parameters.
     * @param key - Column key for count (defaults to 'cc').
     */
    async executeCountSQL(sql: string, params: Array<any>, key: string = 'cc'): Promise<number> {
        return this.getCount(await this.find(sql, params), key);
    }

    /**
     * Executes a quick paginated query.
     * @param sql - SQL query string.
     * @param params - Parameter array.
     * @param pageNo - Page number (defaults to 1).
     * @param rowCount - Number of rows per page (defaults to 25).
     */
    async quickSearch<T = any>(sql: string, params: Array<any> = [], pageNo: number = 1, rowCount: number = 25, booleanFields?: Array<string>): Promise<{ list: Array<T>, hasMore: boolean }> {
        pageNo = pageNo < 1 ? 1 : pageNo;
        const offset = (pageNo - 1) * rowCount;
        const count = await this.executeCountSQL(`select count(*) as cc from (${sql}) a`, params);
        if (count > 0 && offset < count) {
            const list = await this.listQuery<T>(`${sql} ${this.getRowSetLimitClause(rowCount, offset)}`, params, null, booleanFields);
            return {
                list,
                hasMore: list.length + offset < count
            };
        } else {
            return {
                list: [],
                hasMore: false
            };
        }
    }

    /**
     * Sanitizes parameter array by converting any undefined elements to null.
     * @param params - Parameter array or null/undefined.
     * @public
     * @returns Processed parameter array with undefined elements mapped to null, or null if empty.
     */
    public sanitizeParams(params?: Array<any> | null): Array<any> | null {
        if (!params) return null;
        return params.map(p => (p === undefined ? null : p));
    }

    /**
     * Executes a SELECT query returning a list of mapped objects.
     * @template T - Result item type.
     * @param sql - SQL query string.
     * @param params - Parameter array.
     * @param postConstruction - Optional post-construction callback per object.
     * @param booleanFields - Field names to coerce to boolean values.
     */
    async listQuery<T = any>(sql: string, params: Array<any> | null = null, postConstruction: PostConstructionFun | null = null, booleanFields?: Array<string>): Promise<Array<T>> {
        const result = await this.fetchData(sql, this.sanitizeParams(params));
        const list = this.resultToList(result);
        list.forEach(data => {
            if (booleanFields && booleanFields.length > 0) {
                this.convertBooleanFields(data, booleanFields);
            }
            if (postConstruction) {
                postConstruction(data);
            }
        });
        return list as Array<T>;
    }

    /**
     * Queries a single record. Returns the first record if multiple match.
     * @template T - Result record type.
     * @param sql - SQL query string.
     * @param params - Parameter array.
     * @param postConstruction - Optional post-construction callback for the mapped object.
     * @param booleanFields - Field names to coerce to boolean values.
     */
    async find<T = any>(sql: string, params: Array<any> | null = null, postConstruction: PostConstructionFun | null = null, booleanFields?: Array<string>): Promise<T | null> {
        const result = await this.fetchData(sql, this.sanitizeParams(params));
        const row = this.getFirstRow(result);
        if (row) {
            if (booleanFields && booleanFields.length > 0) {
                this.convertBooleanFields(row, booleanFields);
            }
            if (postConstruction) {
                postConstruction(row);
            }
        }
        return (row ?? null) as T | null;
    }

    /**
     * Reads a SQL file, strips comments, and splits into individual SQL statements.
     * Note: This is a lightweight script splitter for standard DDL/DML migrations and does not parse
     * complex PL/SQL blocks or escaped semicolons inside string literals.
     * @param file - File path.
     * @private
     */
    private loadAndSplitSQL(file: string) {
        let sql = fs.readFileSync(file, 'utf8');

        // Strip multi-line comments /* ... */
        sql = sql.replace(/\/\*[\s\S]*?\*\//g, '');

        // Strip single-line comments -- ...
        // Note: Standard SQL uses -- for line comments.
        sql = sql.replace(/--.*$/gm, '');

        // Split by semicolons at line end or EOF
        return sql
            .split(/;\s*[\r\n]+|;\s*$/)
            .map(stmt => stmt.trim())
            .filter(stmt => stmt.length > 0);
    }

    /**
     * Executes a SQL file containing multiple statements.
     * By default stops and throws an Error on statement failure to protect database integrity.
     * @param file - SQL file path.
     * @param options - Execution control options (stopOnError, throwOnError).
     * @returns Promise resolving to true if any error occurred.
     */
    async executeSQLFile(
        file: string,
        options?: ExecuteSQLFileOptions
    ): Promise<boolean> {
        const { stopOnError = true, throwOnError = true } = options ?? {};
        let hasError = false;
        const sqlStatements = this.loadAndSplitSQL(file);
        for (const statement of sqlStatements) {
            try {
                this.logger.debug({ sql: statement }, 'Executing SQL statement');
                await this.executeSQL(statement);
            } catch (error: any) {
                hasError = true;
                this.logger.error({ error, sql: statement }, 'Failed executing SQL statement');
                if (stopOnError) {
                    if (throwOnError) {
                        throw new Error(`Execution failed for SQL statement in file ${file}: "${statement}". Error: ${error?.message || error}`);
                    }
                    break;
                }
            }
        }
        return hasError;
    }

    /**
     * Executes a paginated search query using the provided criteria.
     * @param criteria - CommonSearchCriteria object.
     * @returns Promise resolving to PaginationList.
     */
    async executePaginationSQL(criteria: CommonSearchCriteria): Promise<PaginationList> {
        return criteria.paginationQuery(this);
    }

    /**
     * Queries all records matching criteria, ignoring pagination.
     * @param criteria - CommonSearchCriteria object.
     * @returns Promise resolving to array of objects.
     */
    async queryByCriteria(criteria: CommonSearchCriteria): Promise<Array<any>> {
        return criteria.query(this);
    }

    /**
     * Executes a raw query statement to fetch database data.
     * @param sql - SQL query string.
     * @param params - Optional parameter array.
     * @protected
     * @abstract
     * @returns Promise resolving to raw database result.
     */
    protected abstract fetchData(sql: string, params?: Array<any>): Promise<any>;

    /**
     * Retrieves field definitions from a query result.
     * @param result - Raw query result.
     * @abstract
     * @returns Array of Field metadata objects.
     */
    abstract getFields(result: any): Array<Field>;

    /**
     * Retrieves row dataset array from a raw query result.
     * @param result - Raw query result.
     * @protected
     * @abstract
     * @returns Array of row data.
     */
    protected abstract getRowSet(result: any): Array<any>;

    /**
     * Retrieves affected row count from an execution result.
     * @param result - Raw execution result.
     * @protected
     * @abstract
     * @returns Affected row count.
     */
    protected abstract getAffectRows(result: any): number;

    /**
     * Converts underscore_case to camelCase.
     * @param name - Field name to convert.
     * @protected
     * @returns CamelCase string.
     */
    protected toCamel(name: string) {
        return name.replace(/_(\w)/g, (all, letter) => {
            return letter.toUpperCase();
        });
    }

    /**
     * Builds field name mapping map.
     * Default implementation maps raw field names to camelCase property names (e.g. user_name -> userName).
     * Subclasses can override for custom mapping.
     * @param fields - Array of field metadata.
     * @protected
     * @returns Field mapping Map.
     */
    protected buildFieldsMap(fields: Array<any>): Map<string, string> {
        const map = new Map<string, string>();
        if (Array.isArray(fields)) {
            fields.forEach(f => {
                const rawName = typeof f === 'string' ? f : f?.name;
                if (rawName) {
                    map.set(rawName, this.toCamel(rawName));
                }
            });
        }
        return map;
    }

    /**
     * Sets property value on a nested object path (supports dot-separated fields like 'profile.name').
     * Preserves explicit null values returned by database queries.
     * @param obj - Target object.
     * @param field - Field path string.
     * @param value - Value to set.
     * @protected
     */
    protected setNestObj(obj: any, field: string, value: any): void {
        if (value !== undefined) {
            const attrs = field.split('.');
            let attr = this.toCamel(attrs[0]);
            let nestObj = obj;
            for (let i = 0; i < attrs.length - 1; i++) {
                nestObj[attr] = nestObj[attr] ?? {};
                nestObj = nestObj[attr];
                attr = this.toCamel(attrs[i + 1]);
            }
            nestObj[attr] = value;
        }
    }

    /**
     * Helper to format SQL statements and parameter count for safe logging without leaking parameter values.
     * @param sql - SQL query string.
     * @param params - Parameter array or null/undefined.
     * @protected
     */
    protected safeLogMeta(sql: string, params?: Array<any> | null) {
        return {
            sql,
            paramCount: params ? params.length : 0
        };
    }

    /**
     * Gets parameter placeholder based on database dialect (e.g. $1 for PostgreSQL, ? for MySQL).
     * @param index 1-based parameter index.
     * @returns Placeholder string.
     */
    abstract getPlaceholder(index: number): string;

    /**
     * Maps raw database rows into mapped JavaScript object array.
     * Preserves explicit database null values and avoids swallowing null via nullish coalescing.
     * @param result - Raw query result.
     * @protected
     * @returns Array of mapped objects.
     */
    protected resultToList(result: any): Array<any> {
        const list: Array<any> = [];
        const rows = this.getRowSet(result);
        if (!rows || !Array.isArray(rows) || rows.length === 0) {
            return list;
        }
        const fields = this.buildFieldsMap(result?.fields || this.getFields(result));
        rows.forEach((row: any) => {
            let obj = {};
            if (fields && fields.size > 0) {
                fields.forEach((value, key) => {
                    const raw = Object.prototype.hasOwnProperty.call(row, key) ? row[key] : row[value];
                    this.setNestObj(obj, value, raw);
                });
            } else if (typeof row === 'object' && row !== null) {
                obj = { ...row };
            }
            list.push(obj);
        });
        return list;
    }

    /**
     * Returns the LIMIT and OFFSET clause for the active database dialect.
     * @param rowCount - Maximum row count.
     * @param offset - Query offset.
     * @returns LIMIT and OFFSET clause string.
     */
    getRowSetLimitClause(rowCount: number, offset: number): string {
        return ` limit ${rowCount} offset ${offset}`;
    }

    /**
     * Converts the first row of a result into a mapped object, or null if empty.
     * @param result - Raw query result.
     * @protected
     * @abstract
     * @returns First row object or null.
     */
    protected abstract getFirstRow(result: any): any;
}