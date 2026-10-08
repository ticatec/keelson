import http from "node:http";

export interface ProbeOptions {
    /** Host to connect to. Default `127.0.0.1` */
    host?: string;
    port: number;
    /** Request path. Default `/health/live` */
    path?: string;
    /** Give up after this many milliseconds. Default 2000 */
    timeoutMs?: number;
}

export interface ProbeResult {
    /** True only for a 2xx answer */
    ok: boolean;
    statusCode?: number;
    /** Why the probe failed, when it did */
    error?: string;
}

/**
 * Makes one HTTP GET against a health endpoint and reports whether the service is healthy.
 *
 * Healthy means a 2xx answer. A 404 or 5xx counts as unhealthy: a service that answers but
 * does not serve the health endpoint is misconfigured, not healthy. A connection that is
 * refused, or that does not answer within `timeoutMs`, is unhealthy too — the request is
 * destroyed on timeout, because Node's `timeout` option alone only emits an event and
 * leaves the socket hanging.
 */
export function probeHealth(options: ProbeOptions): Promise<ProbeResult> {
    const timeoutMs = options.timeoutMs ?? 2000;
    return new Promise<ProbeResult>((resolve) => {
        const request = http.request({
            host: options.host ?? '127.0.0.1',
            port: options.port,
            path: options.path ?? '/health/live',
            method: 'GET',
            timeout: timeoutMs
        }, (res) => {
            res.resume();
            const statusCode = res.statusCode;
            if (statusCode != null && statusCode >= 200 && statusCode < 300) {
                resolve({ ok: true, statusCode });
            } else {
                resolve({ ok: false, statusCode, error: `Unexpected status code ${statusCode}` });
            }
        });
        request.on('timeout', () => request.destroy(new Error(`Timed out after ${timeoutMs}ms`)));
        request.on('error', (err) => resolve({ ok: false, error: err.message }));
        request.end();
    });
}
