import { getLogger } from '@ticatec/logger-api';

/**
 * Application configuration singleton class
 */
export default class AppConf {

    /** Configuration object */
    private readonly conf: any;
    /** Singleton instance */
    static instance: AppConf = null;

    /**
     * Private constructor for singleton pattern
     * @param conf Configuration object
     */
    private constructor(conf: any) {
        this.conf = conf;
    }

    /**
     * Gets the singleton instance
     * @returns AppConf instance or null if not initialized
     */
    static getInstance(): AppConf {
        return AppConf.instance;
    }

    /**
     * Initializes the configuration singleton
     * @param config Configuration object
     * @returns AppConf instance
     */
    static init(config: any): AppConf {
        getLogger('AppConf').info('Initializing configuration center');
        if (AppConf.instance == null) {
            AppConf.instance = new AppConf(config);
        }
        return AppConf.instance;
    }

    /**
     * Gets configuration value by key (supports dot notation)
     * @param key Configuration key (can use dot notation like 'server.port')
     * @returns Configuration value or undefined if not found
     */
    get(key: string): any {
        if (!key) return undefined;

        const keys = key.split('.');
        let result = this.conf;

        for (const k of keys) {
            if (result && typeof result === 'object' && k in result) {
                result = result[k];
            } else {
                return undefined;
            }
        }

        return result;
    }
}
