/**
 * @ticatec/logger-api
 *
 * The logging contract shared by every Keelson package. Zero dependencies:
 * packages are written against the {@link Logger} interface, and the application
 * decides which logging library actually backs it by installing a
 * {@link LoggerProvider}. Without one, records go to the console.
 */
import { getLogger, setLoggerProvider, resetLoggerProvider, hasLoggerProvider } from './registry.js';
import { createConsoleLogger } from './ConsoleLogger.js';
import type { Logger, LogFn, LogLevel, LoggerProvider } from './types.js';

export { getLogger, setLoggerProvider, resetLoggerProvider, hasLoggerProvider, createConsoleLogger };
export type { Logger, LogFn, LogLevel, LoggerProvider };
