/**
 * Severity levels, ordered from most to least verbose.
 * `silent` suppresses every record.
 */
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'silent';

/**
 * A single logging call.
 *
 * Two shapes are supported, and both are used throughout the framework:
 *
 * ```typescript
 * logger.info('user logged in');
 * logger.debug({ sql, paramCount }, 'Executing SQL update');
 * ```
 *
 * The structured form puts the context object first, mirroring the convention
 * used by pino, bunyan and most structured loggers.
 *
 * The string overload is declared first on purpose: `obj: unknown` also accepts
 * a string, so putting it first would shadow the other signature and make an
 * editor suggest `obj: unknown` for the common `logger.info('...')` call.
 */
export interface LogFn {
    (msg: string, ...args: unknown[]): void;
    (obj: unknown, msg?: string, ...args: unknown[]): void;
}

/**
 * The logging contract every Keelson package is written against.
 *
 * It is deliberately minimal — five methods, no `child()`, no transports, no
 * configuration. Anything richer belongs to the concrete logging library behind
 * a {@link LoggerProvider}, not to this interface.
 */
export interface Logger {
    trace: LogFn;
    debug: LogFn;
    info: LogFn;
    warn: LogFn;
    error: LogFn;
}

/**
 * Produces a {@link Logger} for a given source.
 *
 * @param name - Usually the class or module name, e.g. `'UserService'`.
 * @param category - Optional grouping, e.g. `'db'`, `'service'`, `'repository'`, `'controller'`.
 */
export type LoggerProvider = (name: string, category?: string) => Logger;
