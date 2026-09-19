/**
 * PostgreSQL driver for @ticatec/keelson-core.
 *
 * 除工厂函数外，连接与工厂两个类也一并导出：`@ticatec/keelson-mysql`、
 * `@ticatec/keelson-dm` 都是这样做的，使用方要继承 `PgDBConnection` 改写某个
 * 方言细节时，此前在本包里无从下手。
 * @author Henry Feng
 */

import { initializePg, PgDBConnection, PgDBFactory } from "./PgDBFactory.js";
import type { PostConnection } from "./PgDBFactory.js";

export { initializePg, PgDBConnection, PgDBFactory };
export type { PostConnection };
