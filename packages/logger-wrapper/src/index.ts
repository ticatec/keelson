import { initialize, getLogger, getPinoLogger, resetForTest, fallbackLoggingConf } from "./Logger.js";
import type { Logger, PinoLogger } from "./Logger.js";
import type {
    AppenderType,
    AppenderOptions,
    AppenderConfig,
    LoggerEntry,
    LoggingConfig
} from "./types.js";

export {
    initialize,
    getLogger,
    getPinoLogger,
    resetForTest,
    fallbackLoggingConf
};

export type {
    Logger,
    PinoLogger,
    AppenderType,
    AppenderOptions,
    AppenderConfig,
    LoggerEntry,
    LoggingConfig
};
