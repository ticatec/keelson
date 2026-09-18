import type { Logger, LoggerProvider } from './types.js';
import { createConsoleLogger } from './ConsoleLogger.js';

/**
 * Registry state, anchored on a well-known global symbol.
 *
 * This package ships both a CommonJS and an ESM build, and a process can load
 * both at once — an application importing the ESM entry while some transitive
 * dependency `require()`s the CommonJS one. Those are two module instances with
 * two sets of module-scoped variables, so a provider installed through one
 * would be invisible to the other (the "dual package hazard"). Keying the state
 * off `Symbol.for()` gives both instances the same registry.
 */
interface RegistryState {
    provider: LoggerProvider | null;
    /** Bumped on every provider change so previously handed-out loggers re-resolve. */
    generation: number;
}

const REGISTRY_KEY = Symbol.for('@ticatec/logger-api.registry');

const state: RegistryState = ((globalThis as any)[REGISTRY_KEY] ??= {
    provider: null,
    generation: 0
}) as RegistryState;

/**
 * Installs the logging implementation for the whole process.
 *
 * Call it once, as early as convenient — but note that loggers obtained before
 * this call are *not* stale: they resolve the active provider on every write,
 * so ordering between `setLoggerProvider()` and object construction does not matter.
 *
 * @param next - The provider, or `null` to fall back to the console logger.
 */
export function setLoggerProvider(next: LoggerProvider | null): void {
    state.provider = next;
    state.generation++;
}

/**
 * Whether a provider has been installed. Mostly useful in tests and diagnostics.
 */
export function hasLoggerProvider(): boolean {
    return state.provider !== null;
}

/**
 * Clears the installed provider, restoring the console fallback.
 * Intended for tests.
 */
export function resetLoggerProvider(): void {
    setLoggerProvider(null);
}

/**
 * Returns a logger for the given source.
 *
 * The returned object is a thin indirection: each call resolves the currently
 * installed provider, caching the underlying logger until the provider changes.
 * That is what makes it safe to capture a logger in a constructor — a common
 * pattern in this framework — without caring whether the application has
 * installed its provider yet.
 *
 * @param name - Usually the class or module name.
 * @param category - Optional grouping such as `'db'`, `'service'`, `'repository'`.
 */
export function getLogger(name: string, category?: string): Logger {
    let cached: Logger | null = null;
    let cachedGeneration = -1;

    const resolve = (): Logger => {
        if (cached === null || cachedGeneration !== state.generation) {
            cached = (state.provider ?? createConsoleLogger)(name, category);
            cachedGeneration = state.generation;
        }
        return cached;
    };

    // Arguments are forwarded exactly as received — passing an explicit
    // `undefined` through would show up in a naive provider's output.
    return {
        trace: (...args: unknown[]) => (resolve().trace as (...a: unknown[]) => void)(...args),
        debug: (...args: unknown[]) => (resolve().debug as (...a: unknown[]) => void)(...args),
        info: (...args: unknown[]) => (resolve().info as (...a: unknown[]) => void)(...args),
        warn: (...args: unknown[]) => (resolve().warn as (...a: unknown[]) => void)(...args),
        error: (...args: unknown[]) => (resolve().error as (...a: unknown[]) => void)(...args)
    } as Logger;
}
