import pino, { Logger as PinoLogger, DestinationStream, Level, StreamEntry } from 'pino';
import { getLogger, setLoggerProvider, resetLoggerProvider } from '@ticatec/logger-api';
import type { Logger } from '@ticatec/logger-api';
import type { AppenderConfig, LoggingConfig, LoggerEntry } from './types.js';
import { validateConfig } from './validate.js';

export type { Logger, PinoLogger };

/**
 * Re-exported from `@ticatec/logger-api`. Records go to pino once
 * {@link initialize} has run, and to the console until then.
 */
export { getLogger };

const DEFAULT_APPENDER_LEVEL = 'info';
let prettyWarningEmitted = false;

let rootLoggerInstance: PinoLogger | null = null;
let isFallbackInitialized = false;
const cache: Map<string, PinoLogger> = new Map();
const categoryLoggers: Map<string, PinoLogger> = new Map();

/**
 * Constructs a fallback LoggingConfig with a single console appender and root logger.
 * @param level - Log level for appender and root logger (default 'info').
 */
export const fallbackLoggingConf = (level: string = 'info'): LoggingConfig => ({
    appenders: [{ name: 'console', type: 'console', level }],
    loggers: { root: { level, appenders: ['console'] } }
});

/**
 * Initializes the Logger wrapper from a parsed config object or a direct PinoLogger instance.
 *
 * Builds one pino multistream logger per configured logger entry (the `root`
 * entry plus any named categories such as `controller`, `service`, etc.).
 * Subsequent {@link getLogger} calls return child loggers bound to the root,
 * or to a specific category when its name is passed as the second argument.
 *
 * Must be called at application startup. If called after auto-fallback initialization,
 * the custom configuration will override the fallback logger.
 *
 * @param config - Parsed config object or a Pino Logger instance.
 * @throws When called more than once explicitly, or when the config is invalid.
 */
export function initialize(config: LoggingConfig | PinoLogger): void {
    if (rootLoggerInstance !== null && !isFallbackInitialized) {
        throw new Error('LoggerWrapper has already been initialized. initialize() can only be called once.');
    }

    if (!config) {
        throw new Error('Invalid logger config or instance provided to LoggerWrapper.initialize().');
    }

    if (typeof (config as any).child === 'function') {
        rootLoggerInstance = config as PinoLogger;
        isFallbackInitialized = false;
        cache.clear();
        categoryLoggers.clear();
        installProvider();
        return;
    }

    const validated = validateConfig(config as LoggingConfig);
    const appenderByName = new Map<string, AppenderConfig>(
        validated.appenders.map((a) => [a.name, a])
    );

    rootLoggerInstance = buildLogger(validated.loggers.root, appenderByName);
    isFallbackInitialized = false;
    cache.clear();
    categoryLoggers.clear();

    for (const [name, entry] of Object.entries(validated.loggers)) {
        if (name === 'root') continue;
        categoryLoggers.set(name, buildLogger(entry, appenderByName));
    }

    installProvider();
}

/**
 * Registers this adapter as the process-wide logging implementation.
 * Every Keelson package resolves its logger through `@ticatec/logger-api`,
 * so this single call is what routes the whole framework into pino.
 */
function installProvider(): void {
    setLoggerProvider((name: string, category?: string): Logger => {
        const cacheKey = `${category ?? ''}::${name}`;
        const hit = cache.get(cacheKey);
        if (hit) return hit as unknown as Logger;

        const parent = (category && categoryLoggers.get(category)) || rootLoggerInstance!;
        const child = parent.child({ module: name });
        cache.set(cacheKey, child);
        return child as unknown as Logger;
    });
}

/**
 * Resets the initialization state (primarily for unit testing environments).
 */
export function resetForTest(): void {
    resetLoggerProvider();
    rootLoggerInstance = null;
    isFallbackInitialized = false;
    cache.clear();
    categoryLoggers.clear();
    prettyWarningEmitted = false;
}

/**
 * Returns the raw pino child logger behind a given source.
 *
 * This is the adapter's escape hatch: {@link getLogger} hands back the
 * framework-neutral `Logger` contract, which deliberately exposes only the five
 * level methods. Reach for this when you genuinely need pino specifics —
 * `level`, `child()`, `bindings()` — and accept the coupling that comes with it.
 *
 * @param name - Module or class name, bound as the `module` context field.
 * @param category - Optional category name (e.g. `'controller'`, `'service'`).
 * @throws When {@link initialize} has not been called yet.
 */
export function getPinoLogger(name: string, category?: string): PinoLogger {
    if (rootLoggerInstance === null) {
        throw new Error('LoggerWrapper is not initialized. Call initialize(config) before getPinoLogger().');
    }

    const cacheKey = `${category ?? ''}::${name}`;
    const hit = cache.get(cacheKey);
    if (hit) return hit;

    const parent = (category && categoryLoggers.get(category)) || rootLoggerInstance;
    const child = parent.child({ module: name });
    cache.set(cacheKey, child);
    return child;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function createDestination(appender: AppenderConfig): DestinationStream {
    if (appender.type === 'console') {
        if (appender.options?.pretty && !prettyWarningEmitted) {
            prettyWarningEmitted = true;
            process.stderr.write(
                '[logger-pino] "pretty: true" on console appender is not yet supported; emitting raw JSON to stdout.\n'
            );
        }
        return process.stdout as unknown as DestinationStream;
    }

    if (appender.type === 'file') {
        const filename = appender.options?.filename as string;
        const sync = appender.options?.sync === true;
        return pino.destination({ dest: filename, sync, mkdir: true }) as unknown as DestinationStream;
    }

    throw new Error(`Unsupported appender type "${appender.type}".`);
}

function buildLogger(entry: LoggerEntry, appenderByName: Map<string, AppenderConfig>): PinoLogger {
    const streams: StreamEntry[] = entry.appenders.map((name) => {
        const appender = appenderByName.get(name)!;
        return {
            stream: createDestination(appender),
            level: (appender.level ?? DEFAULT_APPENDER_LEVEL) as Level
        };
    });
    return pino({ level: entry.level as Level }, pino.multistream(streams));
}
