import { HealthCheckIndicator, HealthCheckResult } from "./HealthCheckRegistry.js";

/**
 * Creates a built-in system health check indicator inspecting memory RSS/heap and process uptime.
 * @param maxMemoryRssBytes Optional maximum memory RSS threshold in bytes (default: 2GB)
 */
export function createSystemHealthIndicator(maxMemoryRssBytes: number = 2 * 1024 * 1024 * 1024): HealthCheckIndicator {
    return async (): Promise<HealthCheckResult> => {
        const memoryUsage = process.memoryUsage();
        const rss = memoryUsage.rss;
        const isRssHigh = rss > maxMemoryRssBytes;

        return {
            status: isRssHigh ? 'DEGRADED' : 'UP',
            details: {
                uptimeSeconds: Math.floor(process.uptime()),
                memoryRssMb: Math.round(rss / (1024 * 1024)),
                heapUsedMb: Math.round(memoryUsage.heapUsed / (1024 * 1024)),
                heapTotalMb: Math.round(memoryUsage.heapTotal / (1024 * 1024))
            },
            ...(isRssHigh ? { error: `High RSS memory usage: ${Math.round(rss / (1024 * 1024))}MB exceeds limit ${Math.round(maxMemoryRssBytes / (1024 * 1024))}MB` } : {})
        };
    };
}
