import { DBConnection, DBFactory, Field, FieldType, InsertResult, UpdateResult } from "@ticatec/keelson-core";
import dmdb, { Pool, Connection, Result, ExecuteOptions } from "dmdb";

/**
 * 达梦数据库连接实现类，继承自 DBConnection
 */
class DMDBConnection extends DBConnection {

    #connection: Connection;
    #inTransaction: boolean = false;

    /**
     * 构造函数
     * @param conn 达梦数据库连接对象
     */
    constructor(conn: Connection) {
        super();
        this.#connection = conn;
    }

    /**
     * 获取当前执行选项
     * autoCommit 优先遵从当前事务状态（最高优先级 ExecuteOptions.autoCommit）
     */
    private get execOptions(): ExecuteOptions {
        return { autoCommit: !this.#inTransaction };
    }

    /**
     * 断言单一结果集。若驱动返回多结果集（二维元数据数组），显式抛出异常，防止产生静默空行。
     * @param metaData 元数据
     */
    private assertSingleResultSet(metaData: any): void {
        if (Array.isArray(metaData) && metaData.length > 0 && Array.isArray(metaData[0])) {
            throw new Error('Multiple result sets are not supported by DMDBConnection');
        }
    }

    /**
     * 获取参数占位符（达梦使用?）
     * @param _index 参数索引
     * @returns 占位符字符串
     */
    public override getPlaceholder(_index: number): string {
        return '?';
    }

    /**
     * 开始数据库事务
     */
    async beginTransaction(): Promise<void> {
        this.#inTransaction = true;
    }

    /**
     * 关闭连接
     */
    async close(): Promise<void> {
        this.#inTransaction = false;
        await this.#connection.close();
    }

    /**
     * 提交当前事务
     */
    async commit(): Promise<void> {
        try {
            await this.#connection.commit();
        } finally {
            this.#inTransaction = false;
        }
    }

    /**
     * 回滚当前事务
     */
    async rollback(): Promise<void> {
        try {
            await this.#connection.rollback();
        } catch (e: any) {
            this.logger.error({ error: e?.message || e }, 'Cannot rollback the database.');
        } finally {
            this.#inTransaction = false;
        }
    }

    /**
     * 执行更新 SQL 语句并返回影响的行数
     * @param sql SQL 语句
     * @param params 参数数组
     * @returns 影响的行数
     */
    async executeUpdate(sql: string, params: Array<any>): Promise<number> {
        const cleanParams = this.sanitizeParams(params) || [];
        this.logger.debug(this.safeLogMeta(sql, cleanParams), 'Executing SQL update');
        const result: Result<any> = await this.#connection.execute(sql, cleanParams, this.execOptions);
        return result?.rowsAffected ?? 0;
    }

    /**
     * 插入记录
     * @template T 记录类型
     * @param sql INSERT 语句
     * @param params 参数数组
     * @returns InsertResult 结构
     */
    async insertRecord<T = any>(sql: string, params: Array<any>): Promise<InsertResult<T>> {
        const cleanParams = this.sanitizeParams(params) || [];
        this.logger.debug(this.safeLogMeta(sql, cleanParams), 'Inserting DM record');
        const result: Result<any> = await this.#connection.execute(sql, cleanParams, this.execOptions);
        return {
            affectedRows: result?.rowsAffected ?? 0,
            record: (this.getFirstRow(result) as T) ?? null
        };
    }

    /**
     * 更新记录
     * @template T 记录类型
     * @param sql UPDATE 语句
     * @param params 参数数组
     * @returns UpdateResult 结构
     */
    async updateRecord<T = any>(sql: string, params: Array<any>): Promise<UpdateResult<T>> {
        const cleanParams = this.sanitizeParams(params) || [];
        this.logger.debug(this.safeLogMeta(sql, cleanParams), 'Updating DM record');
        const result: Result<any> = await this.#connection.execute(sql, cleanParams, this.execOptions);
        return {
            affectedRows: result?.rowsAffected ?? 0,
            record: (this.getFirstRow(result) as T) ?? null
        };
    }

    /**
     * 删除记录
     * @param sql DELETE 语句
     * @param params 参数数组
     * @returns 影响的行数
     */
    async deleteRecord(sql: string, params: Array<any>): Promise<number> {
        return await this.executeUpdate(sql, params);
    }

    /**
     * 执行原生 SQL 语句
     * @param sql SQL 语句
     * @returns 执行结果
     */
    protected async executeSQL(sql: string): Promise<any> {
        return await this.#connection.execute(sql, [], this.execOptions);
    }

    /**
     * 执行查询 SQL 并获取数据
     * @param sql SQL 语句
     * @param params 参数数组
     * @returns 结果集
     */
    async fetchData(sql: string, params?: Array<any> | null): Promise<any> {
        const cleanParams = this.sanitizeParams(params) || [];
        this.logger.debug(this.safeLogMeta(sql, cleanParams), 'Fetching DM data');
        return await this.#connection.execute(sql, cleanParams, this.execOptions);
    }

    /**
     * 从结果集中提取字段信息
     * @param result 查询结果
     * @returns 字段数组
     */
    getFields(result: any): Array<Field> {
        const list: Array<Field> = [];
        const metaData = result?.metaData;
        if (result && Array.isArray(metaData)) {
            this.assertSingleResultSet(metaData);
            metaData.forEach((field: any) => {
                if (field && field.name) {
                    const type = this.getFieldType(field);
                    list.push({ name: this.toCamel(field.name), type });
                }
            });
        }
        return list;
    }

    /**
     * 获取行数据集
     * @param result 查询结果
     * @returns 行数据数组
     */
    protected getRowSet(result: any): Array<any> {
        return Array.isArray(result?.rows) ? result.rows : [];
    }

    /**
     * 获取受影响行数
     * @param result 查询结果
     * @returns 受影响行数
     */
    getAffectRows(result: any): number {
        return result?.rowsAffected ?? 0;
    }

    /**
     * 将列名转换为驼峰命名。
     * 只对全大写+下划线的标识符（如 USER_NAME -> userName）做预处理，
     * 避免破坏 SQL 中显式加引号的驼峰别名（如 "itemCount"）。
     * @param name 字段名
     * @returns 驼峰字符串
     */
    protected override toCamel(name: string): string {
        const s = /^[A-Z0-9_]+$/.test(name) ? name.toLowerCase() : name;
        return s.replace(/_(\w)/g, (_a, c) => c.toUpperCase());
    }

    /**
     * 设置嵌套属性值，支持点号与双下划线作为层级分隔符
     * @param obj 目标对象
     * @param field 字段路径
     * @param value 属性值
     */
    protected override setNestObj(obj: any, field: string, value: any): void {
        if (value !== undefined) {
            const separator = field.includes('__') ? '__' : '.';
            const attrs = field.split(separator);
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
     * 获取首行数据并转换为对象
     * @param result 查询结果
     * @returns 首行对象或 null
     */
    protected getFirstRow(result: any): any {
        if (result && Array.isArray(result.rows) && result.rows.length > 0) {
            const firstRow = result.rows[0];
            if (!firstRow) return null;
            const ds: any = {};
            const metaData = result?.metaData;
            if (Array.isArray(metaData) && metaData.length > 0) {
                this.assertSingleResultSet(metaData);
                metaData.forEach((field: any, idx: number) => {
                    if (field && field.name) {
                        const rawValue = Array.isArray(firstRow)
                            ? firstRow[idx]
                            : (firstRow[field.name] !== undefined ? firstRow[field.name] : firstRow[this.toCamel(field.name)]);
                        this.setNestObj(ds, field.name, rawValue);
                    }
                });
            } else if (typeof firstRow === 'object') {
                Object.keys(firstRow).forEach(key => {
                    this.setNestObj(ds, key, firstRow[key]);
                });
            }
            return ds;
        }
        return null;
    }

    /**
     * 将查询结果转换为对象列表，兼容达梦二维数组行与对象行，保留 explicit null
     * @param result 查询结果
     * @returns 对象列表
     */
    protected override resultToList(result: any): Array<any> {
        const list: Array<any> = [];
        const rows = this.getRowSet(result);
        if (!rows || rows.length === 0) {
            return list;
        }
        const metaData = result?.metaData;
        if (Array.isArray(metaData) && metaData.length > 0) {
            this.assertSingleResultSet(metaData);
        }
        rows.forEach((row: any) => {
            const obj: any = {};
            if (Array.isArray(metaData) && metaData.length > 0) {
                metaData.forEach((field: any, idx: number) => {
                    if (field && field.name) {
                        const raw = Array.isArray(row)
                            ? row[idx]
                            : (Object.prototype.hasOwnProperty.call(row, field.name) ? row[field.name] : row[this.toCamel(field.name)]);
                        this.setNestObj(obj, field.name, raw);
                    }
                });
            } else if (typeof row === 'object' && row !== null) {
                Object.assign(obj, row);
            }
            list.push(obj);
        });
        return list;
    }

    /**
     * 获取字段类型。读取 dmdb 真实的 dbTypeName / dbType 字段。
     * 避免 INTERVAL DAY TO SECOND 等类型因包含 'INT' 被误判为数字。
     * @param field 字段元数据
     * @returns 字段类型
     */
    private getFieldType(field: any): FieldType {
        const typeStr = (field?.dbTypeName || '').toUpperCase();
        if (typeStr.startsWith('INTERVAL')) {
            return FieldType.Text;
        }
        if (typeStr.includes('INT') || typeStr.includes('NUMBER') || typeStr.includes('DECIMAL') || typeStr.includes('FLOAT') || typeStr.includes('DOUBLE')) {
            return FieldType.Number;
        }
        if (typeStr.includes('DATE') || typeStr.includes('TIME')) {
            return FieldType.Date;
        }
        return FieldType.Text;
    }
}

/**
 * 达梦数据库工厂类，实现 DBFactory 接口
 */
class DMDBFactory implements DBFactory {

    #poolPromise?: Promise<Pool>;
    #config: any;

    /**
     * 构造函数
     * @param config 达梦数据库连接配置
     */
    constructor(config: any) {
        this.#config = config;
    }

    /**
     * 获取连接池 Promise（缓存并防止并发创建竞态，建池失败时清理缓存允许后续重试）
     */
    private getPool(): Promise<Pool> {
        if (!this.#poolPromise) {
            this.#poolPromise = dmdb.createPool(this.#config).catch(err => {
                this.#poolPromise = undefined;
                throw err;
            });
        }
        return this.#poolPromise;
    }

    /**
     * 创建数据库连接
     * @returns 数据库连接实例
     */
    async createDBConnection(): Promise<DBConnection> {
        const pool = await this.getPool();
        const conn = await pool.getConnection();
        return new DMDBConnection(conn);
    }

    /**
     * 关闭数据库连接池
     */
    async close(): Promise<void> {
        if (this.#poolPromise) {
            const poolPromise = this.#poolPromise;
            this.#poolPromise = undefined;
            const pool = await poolPromise;
            await pool.close();
        }
    }

}

/**
 * 初始化达梦数据库工厂
 * @param config 达梦数据库连接配置
 * @returns 数据库工厂实例
 */
export const initializeDmDB = (config: any): DBFactory => {
    return new DMDBFactory(config);
};

export { DMDBConnection, DMDBFactory };
