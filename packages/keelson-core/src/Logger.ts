import { getLogger } from "@ticatec/logger-api";
import type { Logger } from "@ticatec/logger-api";

/**
 * 打开后，SQL 日志会连绑定参数的值一起记录。
 *
 * 默认关闭，且**只能**通过这个环境变量显式打开——绑定参数就是查询里流动的真实数据：
 * 邮箱、密码散列、身份证号、卡号。把它们写进日志，等于把整个数据库的流量复制进了
 * 日志系统，而那通常是权限最宽、留存最久、最容易被导出的地方。
 */
const SQL_PARAMS_ENV = 'KEELSON_LOG_SQL_PARAMS';

/**
 * 是否记录绑定参数的值。每次调用时读取环境变量，便于在运行期临时开关。
 */
const shouldLogSqlParams = (): boolean =>
    (process.env[SQL_PARAMS_ENV] || '').trim().toLowerCase() === 'true';

/**
 * 构造一条可安全写入日志的 SQL 上下文。
 *
 * 语句本身是参数化的，不含任何值，可以照记；参数个数对排查占位符数量不匹配很有用；
 * 参数的值默认不记，除非显式设置了 `KEELSON_LOG_SQL_PARAMS=true`。
 *
 * @param sql - 参数化的 SQL 语句
 * @param params - 绑定参数
 * @returns 供 logger 使用的上下文对象
 */
const sqlContext = (sql: string, params: Array<any> = []): Record<string, unknown> => {
    const context: Record<string, unknown> = {
        sql,
        paramCount: Array.isArray(params) ? params.length : 0
    };
    if (shouldLogSqlParams()) {
        context.params = params;
    }
    return context;
};

export { getLogger, sqlContext, shouldLogSqlParams, SQL_PARAMS_ENV };
export type { Logger };
