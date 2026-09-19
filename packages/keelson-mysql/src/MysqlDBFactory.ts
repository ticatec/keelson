import {DBConnection, DBFactory, Field, FieldType, InsertResult, UpdateResult, getLogger} from '@ticatec/keelson-core';
import type {Logger} from '@ticatec/logger-api';
import mysql, {Pool, PoolConnection} from "mysql2/promise";

/**
 * mysql2 在每个 field 上带着 columnType（MySQL 协议的列类型编号）。
 * 数值类：DECIMAL(0) TINY(1) SHORT(2) LONG(3) FLOAT(4) DOUBLE(5) LONGLONG(8) INT24(9) NEWDECIMAL(246)。
 */
const NUMERIC_COLUMN_TYPES = new Set([0, 1, 2, 3, 4, 5, 8, 9, 246]);

/**
 * 时间类：TIMESTAMP(7) DATE(10) TIME(11) DATETIME(12) YEAR(13) NEWDATE(14)。
 */
const TEMPORAL_COLUMN_TYPES = new Set([7, 10, 11, 12, 13, 14]);

/**
 * 按 mysql2 的列类型编号映射到框架的字段类型。
 *
 * 此前 getFields() 对所有列一律返回 Text，是个对谁都成立的假值。
 * 编号取不到时仍退回 Text——宁可保守，也不要猜错类型。
 * @param field mysql2 字段元数据
 * @returns 字段类型
 */
const resolveFieldType = (field: any): FieldType => {
    const columnType = field?.columnType;
    if (typeof columnType !== 'number') {
        return FieldType.Text;
    }
    if (NUMERIC_COLUMN_TYPES.has(columnType)) {
        return FieldType.Number;
    }
    if (TEMPORAL_COLUMN_TYPES.has(columnType)) {
        return FieldType.Date;
    }
    return FieldType.Text;
};

/**
 * MySQL数据库连接实现类，继承自DBConnection
 */
class MysqlDBConnection extends DBConnection {

    #client: PoolConnection;

    /**
     * 构造函数
     * @param conn MySQL连接池连接对象
     */
    constructor(conn: PoolConnection) {
        super();
        this.#client = conn;
    }


    /**
     * 获取参数占位符（MySQL使用?）
     * @param _idx 参数索引（从1开始）
     * @returns string 占位符
     */
    public override getPlaceholder(_idx: number): string {
        return '?';
    }

    /**
     * 开始数据库事务
     * @returns Promise<void>
     */
    async beginTransaction(): Promise<void> {
        this.logger.debug({}, 'Beginning MySQL transaction');
        await this.#client.beginTransaction();
    }

    /**
     * 关闭数据库连接，释放连接回连接池
     * @returns Promise<void>
     */
    async close(): Promise<void> {
        this.logger.debug({}, 'Releasing MySQL connection to pool');
        this.#client.release();
    }

    /**
     * 提交当前事务
     * @returns Promise<void>
     */
    async commit(): Promise<void> {
        this.logger.debug({}, 'Committing MySQL transaction');
        await this.#client.commit();
    }

    /**
     * 回滚当前事务
     * @returns Promise<void>
     */
    async rollback(): Promise<void> {
        try {
            this.logger.debug({}, 'Rolling back MySQL transaction');
            await this.#client.rollback();
        } catch (e: any) {
            this.logger.error({ error: e?.message || e }, 'Cannot rollback the database.');
        }
    }

    /**
     * 执行更新SQL语句
     * @param sql SQL语句
     * @param params 参数数组
     * @returns Promise<number> 受影响的行数
     */
    async executeUpdate(sql: string, params: Array<any>): Promise<number> {
        const cleanParams = this.sanitizeParams(params) || [];
        this.logger.debug(this.safeLogMeta(sql, cleanParams), 'Executing SQL update');
        const result = await this.#client.execute(sql, cleanParams);
        return this.getAffectRows(result);
    }

    /**
     * 从查询结果中提取字段信息
     * @param result 查询结果对象
     * @returns Array<Field> 字段数组
     */
    getFields(result: any): Array<Field>{
        const fields = result?.fields;
        const list: Array<Field> = [];
        if (Array.isArray(fields)) {
            fields.forEach(field => {
                if (field && field.name) {
                    list.push({ name: this.toCamel(field.name), type: resolveFieldType(field) });
                }
            });
        }
        return list;
    }

    /**
     * 从查询结果中提取行数据
     * @param result 查询结果对象
     * @returns Array<any> 行数据数组
     */
    getRowSet(result: any): Array<any> {
        return Array.isArray(result?.rows) ? result.rows : [];
    }

    /**
     * 获取受影响的行数
     * @param result 查询结果对象
     * @returns number 受影响的行数
     */
    getAffectRows(result: any): number {
        if (!result) return 0;
        if (Array.isArray(result)) {
            return (result[0] as any)?.affectedRows ?? 0;
        }
        return (result as any)?.affectedRows ?? 0;
    }

    /**
     * 构建字段名映射表
     * @param fields 字段数组
     * @returns Map<string, string> 字段名映射表
     */
    protected override buildFieldsMap(fields: Array<any>): Map<string, string> {
        const map: Map<string, string> = new Map<string, string>();
        if (Array.isArray(fields)) {
            fields.forEach(field => {
                const name = typeof field === 'string' ? field : field?.name;
                if (name) {
                    map.set(name, this.toCamel(name));
                }
            });
        }
        return map;
    }

    /**
     * 获取查询结果的第一行数据
     * @param result 查询结果对象
     * @returns any 第一行数据对象或null
     */
    protected getFirstRow(result: any): any {
        if (result && Array.isArray(result.rows) && result.rows.length > 0) {
            const ds = {};
            const firstRow = result.rows[0];
            if (!firstRow) return null;
            if (Array.isArray(result.fields) && result.fields.length > 0) {
                result.fields.forEach((field: any) => {
                    if (field && field.name) {
                        this.setNestObj(ds, field.name, firstRow[field.name]);
                    }
                });
            } else {
                Object.keys(firstRow).forEach(key => {
                    this.setNestObj(ds, key, firstRow[key]);
                });
            }
            return ds;
        } else {
            return null;
        }
    }

    /**
     * 执行查询SQL并获取数据
     * @param sql SQL查询语句
     * @param params 查询参数数组或undefined
     * @returns Promise<any> 包含rows和fields的结果对象
     */
    async fetchData(sql: string, params?: Array<any> | null): Promise<any> {
        const cleanParams = this.sanitizeParams(params);
        this.logger.debug(this.safeLogMeta(sql, cleanParams || undefined), 'Fetching MySQL data');
        const [rows, fields] = await this.#client.execute(sql, cleanParams || []);
        return {rows, fields};
    }

    /**
     * 执行原生SQL语句（使用query支持DDL等语句）
     * @param sql SQL语句
     * @returns Promise<any> 执行结果
     */
    protected async executeSQL(sql: string): Promise<any> {
        this.logger.debug({sql}, 'Executing raw SQL statement');
        return this.#client.query(sql);
    }
    
    /**
     * 插入记录
     * @template T 记录类型
     * @param sql 插入SQL语句
     * @param params 参数数组
     * @returns Promise<InsertResult<T>> 插入结果
     */
    async insertRecord<T = any>(sql: string, params: Array<any>): Promise<InsertResult<T>> {
        const cleanParams = this.sanitizeParams(params) || [];
        this.logger.debug(this.safeLogMeta(sql, cleanParams), 'Inserting MySQL record');
        const result = await this.#client.execute(sql, cleanParams);
        const header = Array.isArray(result) ? (result[0] as any) : (result as any);
        return {
            affectedRows: this.getAffectRows(result),
            record: null,
            insertId: header?.insertId ?? null
        };
    }
    
    /**
     * 更新记录
     * @template T 记录类型
     * @param sql 更新SQL语句
     * @param params 参数数组
     * @returns Promise<UpdateResult<T>> 更新结果
     */
    async updateRecord<T = any>(sql: string, params: Array<any>): Promise<UpdateResult<T>> {
        const cleanParams = this.sanitizeParams(params) || [];
        this.logger.debug(this.safeLogMeta(sql, cleanParams), 'Updating MySQL record');
        const result = await this.#client.execute(sql, cleanParams);
        return {
            affectedRows: this.getAffectRows(result),
            record: null
        };
    }
    
    /**
     * 删除记录
     * @param sql 删除SQL语句
     * @param params 参数数组
     * @returns Promise<number> 受影响的行数
     */
    deleteRecord(sql: string, params: Array<any>): Promise<number> {
        return this.executeUpdate(sql, params);
    }

}

/**
 * MySQL数据库工厂类，实现DBFactory接口
 */
class MysqlDBFactory implements DBFactory {

    #pool: Pool;

    /**
     * 关停标记。mysql2 的 pool.end() 重复调用本身不报错，这里仍然记住状态，
     * 避免重复打出关池日志，也与 pg / 达梦两个驱动的行为保持一致。
     */
    #closed: boolean = false;

    #logger: Logger;

    /**
     * 构造函数
     * @param pool MySQL连接池对象
     */
    constructor(pool: Pool) {
        this.#logger = getLogger('MysqlDBFactory', 'db');
        this.#pool = pool;
    }

    /**
     * 创建数据库连接实例
     * @returns Promise<DBConnection> 数据库连接实例
     */
    async createDBConnection(): Promise<DBConnection> {
        return new MysqlDBConnection(await this.#pool.getConnection());
    }

    /**
     * 关闭连接池，释放所有资源
     * @returns Promise<void>
     */
    async close(): Promise<void> {
        if (this.#closed) {
            return;
        }
        this.#closed = true;
        this.#logger.info({}, 'Closing MySQL connection pool');
        await this.#pool.end();
    }

}

/**
 * 汇总连接配置用于日志。绝不返回任何凭据：password 与 uri 都携带口令，
 * 只降级成一个布尔值。
 * @param config MySQL连接配置对象
 * @returns 可安全写入日志的摘要
 */
const describePool = (config: any): Record<string, unknown> => {
    if (config == null || typeof config !== 'object') {
        return {configured: false};
    }
    return {
        host: config.host ?? null,
        port: config.port ?? null,
        database: config.database ?? null,
        connectionLimit: config.connectionLimit ?? null,
        ssl: config.ssl != null && config.ssl !== false,
        authenticated: config.password != null || config.uri != null
    };
};

/**
 * 初始化MySQL数据库工厂
 * @param config MySQL连接配置对象
 * @returns DBFactory MySQL数据库工厂实例
 */
export const initializeMySQL = (config: any): DBFactory => {
    const factory = new MysqlDBFactory(mysql.createPool(config));
    getLogger('MysqlDBFactory', 'db').info(describePool(config), 'MySQL connection pool created');
    return factory;
}

export { MysqlDBConnection, MysqlDBFactory };

