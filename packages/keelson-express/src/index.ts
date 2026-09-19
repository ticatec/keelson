// Main entry point for @ticatec/keelson-express

import BaseServer from './BaseServer.js';

export { default as routerHelper } from './RouterHelper.js';
export { default as CommonRoutes, AuthenticatedRoutes } from './CommonRoutes.js';
export { default as AppConf } from './AppConf.js';

// 这四个全是接口/类型别名，必须走 export type：当作值导出会让 esbuild、swc 这类
// 只做转译的工具链在运行时去找并不存在的导出。
export type { default as LoggedUser, CommonUser, CustomUserRegistry, RegisteredUser } from './LoggedUser.js';

export { default as Controller } from './common/Controller.js';
export { default as BaseController } from './common/BaseController.js';
export { default as CommonController } from './common/CommonController.js';
export { default as CommonSearchController } from './common/CommonSearchController.js';

// 后台处理器子系统此前没有从这里导出，而 exports 映射只开放了 "." 与
// "./package.json"，深层导入也被挡住——BaseServer.shutdown() 会调
// ProcessorManager.getInstance().stopAll()，但使用方根本拿不到这个类去注册处理器。
// 代码一直跟着 lib/ 发布出去，只是谁都用不上。
export { default as ProcessorManager } from './ProcessorManager.js';
export { default as CommonProcessor, ProcessStatus } from './CommonProcessor.js';

export { HealthCheckRegistry } from './health/HealthCheckRegistry.js';
export { HealthRoutes } from './health/HealthRoutes.js';
export { createSystemHealthIndicator } from './health/BuiltinHealthIndicators.js';
export type { HealthStatus, HealthCheckResult, HealthCheckIndicator, RegisteredCheck, ReadinessResponse } from './health/HealthCheckRegistry.js';

export { getLogger } from '@ticatec/logger-api';
export type { Logger } from '@ticatec/logger-api';

export type { RestfulFunction, ControlFunction } from './RouterHelper.js';
export type { moduleLoader } from './BaseServer.js';

export default BaseServer;