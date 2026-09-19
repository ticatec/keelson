import {getLogger} from "../Logger.js";
import type {Logger} from "../Logger.js";
import DBConnection from "./DBConnection.js";
import DBFactory from "./DBFactory.js";

/**
 * 进程级状态锚定到 globalThis，键为众所周知的 Symbol。
 *
 * 本包同时发布 CommonJS 与 ESM 两份构建，Node 把它们当作两个互不相干的模块实例，
 * 因此类静态字段会一分为二。对这个包来说后果尤其严重：应用以 ESM 启动并调用
 * DBManager.init()，而某个以 CJS 加载的 DAO 调用 getInstance() 时，拿到的是另一份
 * 尚未初始化的静态字段，直接抛「未初始化」；事务上下文更隐蔽——ESM 的 @Transaction
 * 开启的连接存在 ESM 那份 ThreadLocal 里，CJS 的 DAO 取到的是空的另一份，于是报
 * 「No database connection available」，而调用方明明就在事务里。
 */
interface DBManagerState {
    instance?: DBManager;
}

const STATE_KEY = Symbol.for('@ticatec/keelson-core.db-manager');

const state: DBManagerState = ((globalThis as any)[STATE_KEY] ??= {});

export default class DBManager {

    private static get instance(): DBManager | undefined {
        return state.instance;
    }

    private static set instance(value: DBManager | undefined) {
        state.instance = value;
    }
    private static _logger: Logger | null = null;

    private static get logger(): Logger {
        if (!DBManager._logger) {
            DBManager._logger = getLogger('DBManager', 'db');
        }
        return DBManager._logger;
    }

    private factory: DBFactory;

    private constructor(factory: DBFactory) {
        this.factory = factory;
    }

    /**
     * Initializes the database manager with a database factory.
     * @param factory - Database connection factory.
     * @returns DBManager singleton instance.
     */
    static init(factory: DBFactory): DBManager {
        if (DBManager.instance == null) {
            // 只记工厂的类名。DBFactory 持有完整的连接配置，其中包含数据库口令，
            // 整个对象丢进日志等于把口令写进日志系统。
            DBManager.logger.debug(
                { factory: factory?.constructor?.name ?? 'unknown' },
                'Initializing database manager factory'
            );
            DBManager.instance = new DBManager(factory);
        }
        return DBManager.instance;
    }

    /**
     * Obtains the singleton instance of DBManager.
     * Throws an Error if init() has not been called.
     * @returns DBManager singleton instance.
     */
    static getInstance(): DBManager {
        if (!DBManager.instance) {
            throw new Error('DBManager is not initialized. Please call DBManager.init(factory) first at application startup.');
        }
        return DBManager.instance;
    }

    /**
     * Resets the singleton instance (primarily for testing).
     */
    static resetInstance(): void {
        DBManager.instance = undefined;
    }

    /**
     * Creates a new database connection.
     * @returns Promise resolving to a DBConnection instance.
     */
    async connect(): Promise<DBConnection> {
        return await this.factory.createDBConnection();
    }
}