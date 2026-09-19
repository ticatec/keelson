import {DBConnection, DBFactory, Field, FieldType, InsertResult, UpdateResult} from '@ticatec/keelson-core';
import mysql, {Pool, PoolConnection} from "mysql2/promise";

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
        await this.#client.beginTransaction();
    }

    /**
     * 关闭数据库连接，释放连接回连接池
     * @returns Promise<void>
     */
    async close(): Promise<void> {
        this.#client.release();
    }

    /**
     * 提交当前事务
     * @returns Promise<void>
     */
    async commit(): Promise<void> {
        await this.#client.commit();
    }

    /**
     * 回滚当前事务
     * @returns Promise<void>
     */
    async rollback(): Promise<void> {
        try {
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
                    list.push({ name: this.toCamel(field.name), type: FieldType.Text });
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
     * 构造函数
     * @param pool MySQL连接池对象
     */
    constructor(pool: Pool) {
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
        await this.#pool.end();
    }

}

/**
 * 初始化MySQL数据库工厂
 * @param config MySQL连接配置对象
 * @returns DBFactory MySQL数据库工厂实例
 */
export const initializeMySQL = (config: any): DBFactory => {
    return new MysqlDBFactory(mysql.createPool(config));
}

export { MysqlDBConnection, MysqlDBFactory };

