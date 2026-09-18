import type { AppenderConfig, AppenderType, LoggingConfig, LoggerEntry } from './types.js';

const DEFAULT_APPENDER_LEVEL = 'info';

/**
 * Validates and normalises a raw parsed config object.
 *
 * @throws When the structure is invalid or appender references don't resolve.
 */
export function validateConfig(parsed: unknown): LoggingConfig {
    if (!parsed || typeof parsed !== 'object') {
        throw new Error('Logger config must be a top-level object.');
    }
    const obj = parsed as Record<string, unknown>;

    const appenders = obj.appenders;
    if (!Array.isArray(appenders) || appenders.length === 0) {
        throw new Error('Logger config must define a non-empty "appenders" array.');
    }

    const loggers = obj.loggers;
    if (!loggers || typeof loggers !== 'object' || Array.isArray(loggers)) {
        throw new Error('Logger config must define a "loggers" object.');
    }

    const appenderNames = new Set<string>();
    const normalisedAppenders: AppenderConfig[] = appenders.map((raw: any, i: number) => {
        if (!raw || typeof raw !== 'object') {
            throw new Error(`Appender at index ${i} must be an object.`);
        }
        const name: string = raw.name;
        const type: AppenderType = raw.type;
        if (!name || typeof name !== 'string') {
            throw new Error(`Appender at index ${i} is missing a string "name".`);
        }
        if (type !== 'console' && type !== 'file') {
            throw new Error(`Appender "${name}" has unsupported type "${type}". Supported: console, file.`);
        }
        if (type === 'file' && (!raw.options || !raw.options.filename)) {
            throw new Error(`File appender "${name}" requires options.filename.`);
        }
        if (appenderNames.has(name)) {
            throw new Error(`Duplicate appender name "${name}".`);
        }
        appenderNames.add(name);
        return {
            name,
            type,
            level: typeof raw.level === 'string' ? raw.level : DEFAULT_APPENDER_LEVEL,
            options: raw.options && typeof raw.options === 'object' ? { ...raw.options } : {}
        };
    });

    const loggersObj = loggers as Record<string, any>;
    if (!loggersObj.root) {
        throw new Error('Logger config must define a "root" logger entry.');
    }

    const normalisedLoggers: Record<string, LoggerEntry> = {};
    for (const [loggerName, entry] of Object.entries(loggersObj)) {
        if (!entry || typeof entry !== 'object') {
            throw new Error(`Logger "${loggerName}" must be an object with level and appenders.`);
        }
        if (typeof entry.level !== 'string' || !entry.level) {
            throw new Error(`Logger "${loggerName}" must define a string "level".`);
        }
        if (!Array.isArray(entry.appenders) || entry.appenders.length === 0) {
            throw new Error(`Logger "${loggerName}" must define a non-empty "appenders" array.`);
        }
        for (const ref of entry.appenders) {
            if (typeof ref !== 'string' || !appenderNames.has(ref)) {
                throw new Error(`Logger "${loggerName}" references unknown appender "${ref}".`);
            }
        }
        normalisedLoggers[loggerName] = { level: entry.level, appenders: [...entry.appenders] };
    }

    return { appenders: normalisedAppenders, loggers: normalisedLoggers };
}
