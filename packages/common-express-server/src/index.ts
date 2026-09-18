// Main entry point for @ticatec/common-express-server

import BaseServer from './BaseServer.js';

export { default as routerHelper } from './RouterHelper.js';
export { default as CommonRoutes, AuthenticatedRoutes } from './CommonRoutes.js';
export { default as AppConf } from './AppConf.js';

export { default as LoggedUser, CommonUser, CustomUserRegistry, RegisteredUser } from './LoggedUser.js';

export { default as Controller } from './common/Controller.js';
export { default as BaseController } from './common/BaseController.js';
export { default as CommonController } from './common/CommonController.js';
export { default as CommonSearchController } from './common/CommonSearchController.js';

export { HealthCheckRegistry } from './health/HealthCheckRegistry.js';
export { HealthRoutes } from './health/HealthRoutes.js';
export { createSystemHealthIndicator } from './health/BuiltinHealthIndicators.js';
export type { HealthStatus, HealthCheckResult, HealthCheckIndicator, RegisteredCheck, ReadinessResponse } from './health/HealthCheckRegistry.js';

export { getLogger } from '@ticatec/logger-api';
export type { Logger } from '@ticatec/logger-api';

export type { RestfulFunction, ControlFunction } from './RouterHelper.js';
export type { moduleLoader } from './BaseServer.js';

export default BaseServer;