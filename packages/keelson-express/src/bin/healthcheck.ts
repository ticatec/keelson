#!/usr/bin/env node
import { parseListenPort } from "../Port.js";
import { probeHealth } from "../health/HealthProbe.js";

/**
 * `keelson-healthcheck` - container health check for a service built on BaseServer.
 *
 * Probes `http://127.0.0.1:$PORT/health/live` and exits 0 when it answers 2xx, 1 otherwise.
 * `PORT` is read exactly as the server reads it (unset = 80).
 *
 * Overrides:
 * - the first argument, or `HEALTH_CHECK_PATH`: the path to probe (default `/health/live`)
 * - `HEALTH_CHECK_HOST`: the host to connect to (default `127.0.0.1`)
 * - `HEALTH_CHECK_TIMEOUT_MS`: how long to wait (default 2000)
 *
 * Dockerfile:
 *   HEALTHCHECK CMD node ./node_modules/@ticatec/keelson-express/lib/cjs/bin/healthcheck.js
 */
const main = async (): Promise<void> => {
    let port: number;
    try {
        port = parseListenPort(process.env.PORT);
        if (port === 0) {
            throw new Error("Invalid PORT environment variable '0': there is no port to probe.");
        }
    } catch (err) {
        process.stderr.write(`${(err as Error).message}\n`);
        process.exit(1);
    }

    const timeout = Number(process.env.HEALTH_CHECK_TIMEOUT_MS);
    const result = await probeHealth({
        host: process.env.HEALTH_CHECK_HOST || undefined,
        port,
        path: process.argv[2] || process.env.HEALTH_CHECK_PATH || undefined,
        timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : undefined
    });
    if (!result.ok) {
        process.stderr.write(`Health check failed: ${result.error}\n`);
        process.exit(1);
    }
    process.exit(0);
};

void main();
