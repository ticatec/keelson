import BaseLoader from "../BaseLoader.js";
import Consul from "consul";

function parsePort(portStr: string | undefined, envName: string): number | undefined {
    if (portStr == null || portStr.trim() === '') {
        return undefined;
    }
    const trimmed = portStr.trim();
    const num = Number(trimmed);
    if (!Number.isInteger(num) || num < 1 || num > 65535 || String(num) !== trimmed) {
        throw new Error(`Invalid ${envName} '${portStr}': Must be a positive integer between 1 and 65535.`);
    }
    return num;
}

export default class ConsulLoader extends BaseLoader {

    private readonly consul: Consul;

    /**
     * Create a new ConsulLoader instance with configuration from environment variables
     */
    constructor() {
        super();
        const sslEnv = (process.env['CONSUL_SSL'] ?? process.env['SSL'] ?? 'false').toLowerCase() === 'true';
        const config: any = {
            host: process.env['CONSUL_HOST'],
            secure: sslEnv,
            defaults: {
                token: process.env['CONSUL_TOKEN']
            }
        };

        const port = parsePort(process.env['CONSUL_PORT'], 'CONSUL_PORT');
        if (port !== undefined) {
            config.port = port;
        } else {
            config.port = config.secure ? 443 : 8500;
        }

        this.consul = new Consul(config);
    }

    /**
     * Load configuration file content from Consul KV store
     * @param fileName - The key name in Consul KV store
     * @returns Promise that resolves to the configuration content as string
     * @protected
     */
    protected async loadFile(fileName: string): Promise<string> {
        let result = await this.consul.kv.get(fileName);
        return result === null ? null : result?.Value;
    }
}