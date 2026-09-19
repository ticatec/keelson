import DBConnection from './db/DBConnection.js';
import DBManager from './db/DBManager.js';
import ThreadLocal from './ThreadLocal.js';
import {Propagation} from "./db/Transaction.js";
import { getLogger } from './Logger.js';
import type { Logger } from './Logger.js';

interface TransactionContext {
    connection: DBConnection;
    isTransaction: boolean;
}

/**
 * 事务上下文锚定到 globalThis，理由见 DBManager 中的说明：CJS 与 ESM 两份构建各持
 * 一个 ThreadLocal 时，跨模块格式的调用会看不到彼此的事务连接。
 */
interface TransactionState {
    threadLocal: ThreadLocal<TransactionContext>;
}

const STATE_KEY = Symbol.for('@ticatec/keelson-core.transaction');

const state: TransactionState = ((globalThis as any)[STATE_KEY] ??= {
    threadLocal: new ThreadLocal<TransactionContext>()
});

export default class TransactionManager {
    private static get threadLocal(): ThreadLocal<TransactionContext> {
        return state.threadLocal;
    }
    private static _logger: Logger | null = null;

    private static get logger(): Logger {
        if (!TransactionManager._logger) {
            TransactionManager._logger = getLogger('TransactionManager', 'db');
        }
        return TransactionManager._logger;
    }

    static getCurrentConnection(): DBConnection | undefined {
        return this.threadLocal.get()?.connection;
    }

    /**
     * Executes database operations while managing connection lifecycle and transaction state automatically.
     * Supports REQUIRED, REQUIRES_NEW, and NONE propagation behaviors.
     * @param propagation Transaction propagation behavior.
     * @param fn Business processor function receiving the database connection.
     */
    static async execute(
        propagation: Propagation,
        fn: (conn: DBConnection) => Promise<any>
    ): Promise<any> {
        const currentCtx = this.threadLocal.get();

        // 1. Reuse existing transaction connection if REQUIRED propagation and active transaction context exists
        if (propagation === Propagation.REQUIRED && currentCtx?.isTransaction) {
            return await fn(currentCtx.connection);
        }

        // 2. Open a new connection for NONE, REQUIRED (no outer transaction context), or REQUIRES_NEW (new isolated context)
        if (
            propagation === Propagation.NONE ||
            propagation === Propagation.REQUIRES_NEW ||
            (propagation === Propagation.REQUIRED && (!currentCtx || !currentCtx.isTransaction))
        ) {
            const conn = await DBManager.getInstance().connect();
            const ctx: TransactionContext = { connection: conn, isTransaction: false };

            return await this.threadLocal.run(ctx, async () => {
                try {
                    if (propagation !== Propagation.NONE) {
                        await conn.beginTransaction();
                        ctx.isTransaction = true;
                    }
                    const result = await fn(conn);
                    if (ctx.isTransaction) {
                        await conn.commit();
                    }
                    return result;
                } catch (error) {
                    if (ctx.isTransaction) {
                        try {
                            await conn.rollback();
                        } catch (rollbackErr) {
                            this.logger?.error({ rollbackErr }, 'Transaction rollback failed');
                        }
                    }
                    throw error;
                } finally {
                    try {
                        await conn.close();
                    } catch (closeErr) {
                        this.logger?.error({ closeErr }, 'Failed to close database connection');
                    }
                }
            });
        }

        throw new Error('Unsupported transaction propagation: ' + propagation);
    }
}