/* eslint-disable no-console */
import type { Logger, LogLevel, LoggerProvider } from './types.js';

const ORDER: Record<Exclude<LogLevel, 'silent'>, number> = {
    trace: 10,
    debug: 20,
    info: 30,
    warn: 40,
    error: 50
};

const DEFAULT_LEVEL: LogLevel = 'info';

/**
 * Resolves the threshold for the console fallback from `LOG_LEVEL`.
 * An unrecognised value falls back to `info` rather than failing at startup.
 */
const resolveLevel = (): LogLevel => {
    const raw = (process.env['LOG_LEVEL'] || '').trim().toLowerCase();
    if (raw === 'silent') return 'silent';
    return (raw in ORDER ? raw : DEFAULT_LEVEL) as LogLevel;
};

const isEnabled = (level: Exclude<LogLevel, 'silent'>, threshold: LogLevel): boolean => {
    if (threshold === 'silent') return false;
    return ORDER[level] >= ORDER[threshold as Exclude<LogLevel, 'silent'>];
};

/**
 * Renders a context object without throwing on circular references.
 */
const renderContext = (obj: unknown): string => {
    if (obj instanceof Error) {
        return ` ${obj.stack || `${obj.name}: ${obj.message}`}`;
    }
    try {
        return ` ${JSON.stringify(obj)}`;
    } catch {
        return ` ${String(obj)}`;
    }
};

const label = (name: string, category?: string): string =>
    category ? `[${category}/${name}]` : `[${name}]`;

/**
 * Minimal console-backed logger used when no provider has been injected.
 *
 * Output is intentionally plain — one line per record, level filtered by
 * `LOG_LEVEL` (default `info`). It exists so a library consumer gets sensible
 * output with zero configuration, not to be a production logging solution.
 * Inject a real provider via `setLoggerProvider()` for that.
 */
export const createConsoleLogger: LoggerProvider = (name: string, category?: string): Logger => {

    const write = (level: Exclude<LogLevel, 'silent'>, sink: (...a: unknown[]) => void) =>
        (first: unknown, second?: string, ...rest: unknown[]): void => {
            if (!isEnabled(level, resolveLevel())) return;

            const stamp = new Date().toISOString();
            const tag = `${stamp} ${level.toUpperCase().padEnd(5)} ${label(name, category)}`;

            if (typeof first === 'string') {
                sink(`${tag} ${first}`, ...(second === undefined ? [] : [second]), ...rest);
            } else {
                sink(`${tag} ${second ?? ''}${renderContext(first)}`.trimEnd(), ...rest);
            }
        };

    return {
        trace: write('trace', console.debug.bind(console)),
        debug: write('debug', console.debug.bind(console)),
        info: write('info', console.info.bind(console)),
        warn: write('warn', console.warn.bind(console)),
        error: write('error', console.error.bind(console))
    } as Logger;
};
