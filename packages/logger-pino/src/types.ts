/**
 * Supported appender destination types.
 */
export type AppenderType = 'console' | 'file';

/**
 * Free-form options bag passed through to the appender destination factory.
 * Recognised keys depend on {@link AppenderConfig.type}.
 */
export interface AppenderOptions {
    /** Required for `file` appenders: path to the log file. */
    filename?: string;
    /** `file` appenders: when false (default), writes are asynchronous. */
    sync?: boolean;
    /** `console` appenders: acknowledged but not yet implemented in v1. */
    pretty?: boolean;
    [key: string]: any;
}

/**
 * Definition of a single log destination (console stream, file, etc.).
 */
export interface AppenderConfig {
    name: string;
    type: AppenderType;
    /** Minimum level this appender will emit. Defaults to `info`. */
    level?: string;
    options?: AppenderOptions;
}

/**
 * Configuration for one named logger (e.g. `root`, `controller`, `service`).
 */
export interface LoggerEntry {
    /** Minimum level this logger will emit. */
    level: string;
    /** Names of appenders (from {@link LoggingConfig.appenders}) this logger writes to. */
    appenders: string[];
}

/**
 * Top-level shape of a logger configuration document.
 */
export interface LoggingConfig {
    appenders: AppenderConfig[];
    loggers: Record<string, LoggerEntry>;
}
