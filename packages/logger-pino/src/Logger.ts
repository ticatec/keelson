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

/**
 * Adapter state, anchored on a well-known global symbol.
 *
 * This package ships both a CommonJS and an ESM build, and a process can load
 * both — an application importing the ESM entry while some transitive
 * dependency `require()`s the CommonJS one. Those are two module instances with
 * two sets of module-scoped variables, so `initialize()` through one would leave
 * the other believing it was never initialised, and `getPinoLogger()` there
 * would throw. `@ticatec/logger-api` anchors its registry the same way.
 */
interface AdapterState {
    root: PinoLogger | null;
    categories: Map<string, PinoLogger>;
    children: Map<string, PinoLogger>;
    prettyWarningEmitted: boolean;
}

const STATE_KEY = Symbol.for('@ticatec/logger-pino.state');

const state: AdapterState = ((globalThis as any)[STATE_KEY] ??= {
    root: null,
    categories: new Map<string, PinoLogger>(),
    children: new Map<string, PinoLogger>(),
    prettyWarningEmitted: false
}) as AdapterState;

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
    if (state.root !== null) {
        throw new Error('logger-pino has already been initialized. initialize() can only be called once.');
    }

    if (!config) {
        throw new Error('Invalid logger config or instance provided to logger-pino initialize().');
    }

    if (typeof (config as any).child === 'function') {
        state.root = config as PinoLogger;
        state.children.clear();
        state.categories.clear();
        installProvider();
        return;
    }

    const validated = validateConfig(config as LoggingConfig);
    const appenderByName = new Map<string, AppenderConfig>(
        validated.appenders.map((a) => [a.name, a])
    );

    // One physical destination per appender, built once and shared by every
    // logger that references it. Building per logger entry would open the same
    // file several times over, each with its own sonic-boom buffer — wasted
    // descriptors, and interleaved writes under load.
    const destinationByName = new Map<string, DestinationStream>(
        validated.appenders.map((a) => [a.name, createDestination(a)])
    );

    state.children.clear();
    state.categories.clear();
    state.root = buildLogger(validated.loggers.root, appenderByName, destinationByName);

    for (const [name, entry] of Object.entries(validated.loggers)) {
        if (name === 'root') continue;
        state.categories.set(name, buildLogger(entry, appenderByName, destinationByName));
    }

    installProvider();
}

/**
 * Registers this adapter as the process-wide logging implementation.
 * Every Keelson package resolves its logger through `@ticatec/logger-api`,
 * so this single call is what routes the whole framework into pino.
 */
function installProvider(): void {
    setLoggerProvider((name: string, category?: string): Logger =>
        resolveChild(name, category) as unknown as Logger);
}

/**
 * Resolves — and caches — the pino child logger for a source.
 *
 * `category` selects the parent logger (its level and appender set) *and* is
 * bound onto the child, so it reaches the log payload and downstream systems can
 * aggregate on it. Binding only `module` would make the category invisible
 * everywhere except in the choice of destination.
 */
function resolveChild(name: string, category?: string): PinoLogger {
    const cacheKey = `${category ?? ''}::${name}`;
    const hit = state.children.get(cacheKey);
    if (hit) return hit;

    const parent = (category && state.categories.get(category)) || state.root!;
    const child = parent.child(category ? { module: name, category } : { module: name });
    state.children.set(cacheKey, child);
    return child;
}

/**
 * Resets the initialization state (primarily for unit testing environments).
 */
export function resetForTest(): void {
    resetLoggerProvider();
    state.root = null;
    state.children.clear();
    state.categories.clear();
    state.prettyWarningEmitted = false;
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
    if (state.root === null) {
        throw new Error('logger-pino is not initialized. Call initialize(config) before getPinoLogger().');
    }
    return resolveChild(name, category);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function createDestination(appender: AppenderConfig): DestinationStream {
    if (appender.type === 'console') {
        if (appender.options?.pretty && !state.prettyWarningEmitted) {
            state.prettyWarningEmitted = true;
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

function buildLogger(
    entry: LoggerEntry,
    appenderByName: Map<string, AppenderConfig>,
    destinationByName: Map<string, DestinationStream>
): PinoLogger {
    const streams: StreamEntry[] = entry.appenders.map((name) => ({
        stream: destinationByName.get(name)!,
        level: (appenderByName.get(name)!.level ?? DEFAULT_APPENDER_LEVEL) as Level
    }));
    return pino({ level: entry.level as Level }, pino.multistream(streams));
}
