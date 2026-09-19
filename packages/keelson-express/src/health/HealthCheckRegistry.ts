export type HealthStatus = 'UP' | 'DOWN' | 'DEGRADED';

export interface HealthCheckResult {
    status: HealthStatus;
    details?: Record<string, any>;
    error?: string;
}

export type HealthCheckIndicator = () => Promise<HealthCheckResult> | HealthCheckResult;

export interface RegisteredCheck {
    name: string;
    indicator: HealthCheckIndicator;
    isCritical: boolean;
    timeoutMs: number;
}

export interface ReadinessResponse {
    status: HealthStatus;
    timestamp: string;
    uptime: number;
    checks: Record<string, HealthCheckResult>;
}

export class HealthCheckRegistry {
    private checks: Map<string, RegisteredCheck> = new Map();

    /**
     * Register a health check indicator
     * @param name Unique indicator name (e.g., 'database', 'redis')
     * @param indicator Indicator function returning HealthCheckResult
     * @param isCritical Whether failure of this check marks overall status as DOWN (default: true)
     * @param timeoutMs Timeout in milliseconds for this check (default: 3000ms)
     */
    register(name: string, indicator: HealthCheckIndicator, isCritical: boolean = true, timeoutMs: number = 3000): void {
        if (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
            throw new Error(`Invalid timeoutMs '${timeoutMs}': Must be a positive finite number.`);
        }
        this.checks.set(name, { name, indicator, isCritical, timeoutMs });
    }

    /**
     * Unregister a health check indicator
     * @param name Indicator name to remove
     */
    unregister(name: string): void {
        this.checks.delete(name);
    }

    /**
     * Get list of registered health check names
     */
    getRegisteredNames(): string[] {
        return Array.from(this.checks.keys());
    }

    /**
     * Perform liveness check (fast check for process availability)
     */
    checkLiveness(): HealthCheckResult {
        return {
            status: 'UP',
            details: {
                uptime: process.uptime(),
                timestamp: new Date().toISOString()
            }
        };
    }

    /**
     * Executes a single health check with timeout protection
     */
    private executeCheckWithTimeout(registered: RegisteredCheck): Promise<HealthCheckResult> {
        const timeout = registered.timeoutMs || 3000;
        return new Promise((resolve) => {
            let timer: NodeJS.Timeout | null = null;
            let isSettled = false;

            timer = setTimeout(() => {
                if (!isSettled) {
                    isSettled = true;
                    resolve({
                        status: 'DOWN',
                        error: `Health check timed out after ${timeout}ms`
                    });
                }
            }, timeout);

            Promise.resolve()
                .then(() => registered.indicator())
                .then((res) => {
                    if (!isSettled) {
                        isSettled = true;
                        if (timer) clearTimeout(timer);
                        resolve(res || { status: 'UP' });
                    }
                })
                .catch((err) => {
                    if (!isSettled) {
                        isSettled = true;
                        if (timer) clearTimeout(timer);
                        resolve({
                            status: 'DOWN',
                            error: err instanceof Error ? err.message : String(err)
                        });
                    }
                });
        });
    }

    /**
     * Perform full readiness check across all registered indicators in parallel with timeout protection
     */
    async checkReadiness(): Promise<ReadinessResponse> {
        const checkResults: Record<string, HealthCheckResult> = {};
        let overallStatus: HealthStatus = 'UP';
        const isProd = process.env.NODE_ENV === 'production';

        const entries = Array.from(this.checks.entries());
        const promises = entries.map(([_, registered]) => this.executeCheckWithTimeout(registered));

        const settledResults = await Promise.allSettled(promises);

        entries.forEach(([name, registered], index) => {
            const settled = settledResults[index];
            let result: HealthCheckResult;

            if (settled.status === 'fulfilled') {
                result = settled.value;
            } else {
                result = {
                    status: 'DOWN',
                    error: settled.reason instanceof Error ? settled.reason.message : String(settled.reason)
                };
            }

            const status = result.status || 'UP';

            if (status === 'DOWN') {
                if (registered.isCritical) {
                    overallStatus = 'DOWN';
                } else if (overallStatus !== 'DOWN') {
                    overallStatus = 'DEGRADED';
                }
            } else if (status === 'DEGRADED' && overallStatus !== 'DOWN') {
                overallStatus = 'DEGRADED';
            }

            checkResults[name] = this.sanitizeResult(result, isProd);
        });

        return {
            status: overallStatus,
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            checks: checkResults
        };
    }

    /**
     * Sanitize health check results for production environment
     * In production, error strings are desensitized and details are completely omitted to prevent credential leaks.
     */
    private sanitizeResult(result: HealthCheckResult, isProd: boolean): HealthCheckResult {
        if (!isProd) {
            return result;
        }

        const sanitized: HealthCheckResult = { status: result.status };

        if (result.error) {
            sanitized.error = 'Health check failed';
        }

        // In production mode, omit details by default to prevent leaking internal strings/configs
        return sanitized;
    }
}
