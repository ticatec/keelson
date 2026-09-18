import { ClientOptions, NacosConfigClient } from 'nacos';
import BaseLoader from "../BaseLoader.js";

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

export default class NacosConfigLoader extends BaseLoader {

    private readonly group: string;
    private client: NacosConfigClient;

    /**
     * Create a new NacosConfigLoader instance with configuration from environment variables
     */
    constructor() {
        super();
        const rawAddr = process.env['NACOS_SERVER_ADDR'] || process.env['NACOS_ENDPOINT'];
        if (!rawAddr || !rawAddr.trim()) {
            throw new Error('NACOS_SERVER_ADDR or NACOS_ENDPOINT environment variable is required');
        }

        const cleanAddr = rawAddr.trim();
        const namespace = process.env['NACOS_NAMESPACE'];
        this.group = process.env['NACOS_GROUP'] ?? 'default';

        const port = parsePort(process.env['NACOS_PORT'], 'NACOS_PORT');
        const sslEnv = (process.env['NACOS_SSL'] ?? process.env['SSL'] ?? 'false').toLowerCase() === 'true';

        const options: ClientOptions = { namespace };
        const lowerAddr = cleanAddr.toLowerCase();

        if (lowerAddr.startsWith('http://') || lowerAddr.startsWith('https://')) {
            // URL format provided via NACOS_SERVER_ADDR or NACOS_ENDPOINT
            const parsedUrl = new URL(cleanAddr);
            const isSSL = sslEnv || parsedUrl.protocol === 'https:';
            const urlPort = parsedUrl.port ? parsePort(parsedUrl.port, 'URL port') : undefined;
            const finalPort = port ?? urlPort ?? (isSSL ? 443 : 8848);

            options.serverAddr = `${parsedUrl.hostname}:${finalPort}`;
            if (isSSL) {
                options.ssl = true;
            }
        } else if (process.env['NACOS_SERVER_ADDR'] || cleanAddr.includes(',') || cleanAddr.includes(':')) {
            // Direct Nacos Server address or cluster list format (e.g. 'nacos1:8848,nacos2:8848', '[::1]:8848', '127.0.0.1:8848')
            if (cleanAddr.includes(',')) {
                options.serverAddr = cleanAddr;
            } else if (!cleanAddr.includes(':') && !cleanAddr.startsWith('[')) {
                const finalPort = port ?? (sslEnv ? 443 : 8848);
                options.serverAddr = `${cleanAddr}:${finalPort}`;
            } else {
                options.serverAddr = cleanAddr;
            }

            if (sslEnv) {
                options.ssl = true;
            }
        } else {
            // Domain endpoint mode for Aliyun ACM / MSE (e.g. 'acm.aliyun.com')
            options.endpoint = cleanAddr;
            if (port !== undefined) {
                options.serverPort = port;
            }
            if (sslEnv) {
                options.ssl = true;
            }
        }

        this.client = new NacosConfigClient(options);
    }

    /**
     * Load configuration file content from Nacos configuration center
     * @param fileName - The data ID of the configuration in Nacos
     * @returns Promise that resolves to the configuration content as string
     * @protected
     */
    protected async loadFile(fileName: string): Promise<string> {
        return await this.client.getConfig(fileName, this.group);
    }
}
