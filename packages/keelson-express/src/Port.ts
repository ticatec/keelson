/**
 * Resolves a TCP port from the `PORT` environment variable value.
 *
 * Shared by {@link BaseServer} (the port it listens on) and the `keelson-healthcheck`
 * command (the port it probes), so the two can never disagree about which port a service
 * uses: unset or blank means 80; anything that is not an integer in 0-65535 throws rather
 * than silently becoming 80.
 *
 * @param raw The value of `process.env.PORT`.
 * @returns The port; `0` means "any free port" and is only meaningful when listening.
 */
export function parseListenPort(raw: string | undefined): number {
    if (raw == null || raw.trim() === '') {
        return 80;
    }
    const port = Number(raw);
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
        throw new Error(`Invalid PORT environment variable '${raw}': must be an integer between 0 and 65535.`);
    }
    return port;
}
