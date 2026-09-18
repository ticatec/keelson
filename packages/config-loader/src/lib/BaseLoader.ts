import YAML from "yaml";

export type PostLoader = ((content: string) => string) | null;
export type ConfigMode = 'local' | 'consul' | 'nacos';

export default abstract class BaseLoader {

    protected constructor() {}

    /**
     * Load configuration file content
     * @param fileName - The name of the configuration file to load
     * @returns Promise that resolves to the file content as string
     * @protected
     */
    protected abstract loadFile(fileName: string): Promise<string>;

    /**
     * Load and parse configuration file with optional post-processing
     * @param fileName - The name of the configuration file to load
     * @param postLoader - Optional function to process the file content before parsing
     * @returns Promise that resolves to the parsed configuration object
     * @protected
     */
    protected async loadConfig(fileName: string, postLoader?: PostLoader): Promise<any> {
        let text = await this.loadFile(fileName);
        if (text == null) {
            return null;
        }
        if (postLoader) {
            text = postLoader(text);
        }
        try {
            return YAML.parse(text);
        } catch (err) {
            throw new Error(`Failed to parse YAML configuration file '${fileName}': ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    /**
     * Internal recursive loader supporting nested includes and cyclic dependency detection
     */
    private async loadInternal(fileName: string, postLoader: PostLoader, loadingChain: Set<string>): Promise<any> {
        if (loadingChain.has(fileName)) {
            const chainStr = Array.from(loadingChain).concat(fileName).join(' -> ');
            throw new Error(`Circular include detected: ${chainStr}`);
        }

        const newChain = new Set(loadingChain);
        newChain.add(fileName);

        let config = await this.loadConfig(fileName, postLoader);
        if (this.isPlainObject(config) && Object.prototype.hasOwnProperty.call(config, 'includes')) {
            const includeFiles: any[] = Array.isArray(config.includes) ? config.includes : [config.includes];
            delete config.includes;

            for (let index = 0; index < includeFiles.length; index++) {
                const includeItem = includeFiles[index];
                if (includeItem == null || typeof includeItem !== 'object') {
                    throw new Error(`Invalid include item at index ${index} in '${fileName}': Must be an object.`);
                }
                const file = includeItem.file;
                if (typeof file !== 'string' || !file.trim()) {
                    throw new Error(`Invalid include item at index ${index} in '${fileName}': 'file' property must be a non-empty string.`);
                }

                if (includeItem.key !== undefined) {
                    if (typeof includeItem.key !== 'string') {
                        throw new Error(`Invalid include item at index ${index} in '${fileName}': 'key' property must be a string.`);
                    }
                    const trimmedKey = includeItem.key.trim();
                    if (trimmedKey === '__proto__' || trimmedKey === 'constructor' || trimmedKey === 'prototype') {
                        throw new Error(`Invalid include item at index ${index} in '${fileName}': 'key' cannot be reserved prototype property '${trimmedKey}'.`);
                    }
                }

                if (includeItem.params !== undefined && !this.isPlainObject(includeItem.params)) {
                    throw new Error(`Invalid include item at index ${index} in '${fileName}': 'params' property must be a plain object.`);
                }

                const key = includeItem.key;
                const params = includeItem.params || {};
                const nestedContent = await this.loadInternal(file.trim(), postLoader, newChain);

                let nestConfig: any = {};
                if (typeof key === 'string' && key.trim()) {
                    nestConfig[key.trim()] = {
                        ...(this.isPlainObject(nestedContent) ? nestedContent : {}),
                        ...params
                    };
                } else {
                    nestConfig = {
                        ...(this.isPlainObject(nestedContent) ? nestedContent : {}),
                        ...params
                    };
                }
                config = this.deepMerge(nestConfig, config);
            }
        }
        return config;
    }

    /**
     * Load a configuration file with support for nested includes
     * @param fileName - The name of the configuration file to load
     * @param postLoader - Optional function to process the file content before parsing
     * @returns Promise that resolves to the complete configuration object with includes merged
     */
    async load(fileName: string, postLoader: PostLoader = null): Promise<any> {
        return await this.loadInternal(fileName, postLoader, new Set<string>());
    }

    /**
     * Check if a value is a plain JavaScript object, avoiding false positives from YAML 'constructor' keys or prototype methods
     */
    private isPlainObject(val: any): boolean {
        if (val === null || typeof val !== 'object' || Array.isArray(val)) {
            return false;
        }
        const proto = Object.getPrototypeOf(val);
        return proto === null || proto === Object.prototype;
    }

    /**
     * Recursively merge two objects, combining arrays and nested objects
     * @param obj1 - The first object to merge
     * @param obj2 - The second object to merge (takes precedence)
     * @returns The merged object
     * @protected
     */
    protected deepMerge(obj1: any, obj2: any): any {
        if (!this.isPlainObject(obj1)) return this.isPlainObject(obj2) ? { ...obj2 } : obj2;
        if (!this.isPlainObject(obj2)) return obj1;

        const result: Record<string, any> = { ...obj1 };
        const keys = Object.keys(obj2);

        for (const key of keys) {
            if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
                continue; // Protection against prototype pollution
            }
            const val1 = obj1[key];
            const val2 = obj2[key];

            if (Array.isArray(val2)) {
                result[key] = [...(Array.isArray(val1) ? val1 : []), ...val2];
            } else if (this.isPlainObject(val2) && this.isPlainObject(val1)) {
                result[key] = this.deepMerge(val1, val2);
            } else {
                result[key] = val2;
            }
        }
        return result;
    }
}

/**
 * Get configuration loader instance based on type
 * @param type - The type of loader ('nacos', 'consul', or default 'local')
 * @returns Promise that resolves to a BaseLoader instance
 */
const getLoader = async (type: string = 'local'): Promise<BaseLoader> => {
    const normalizedType = (type || 'local').toLowerCase();
    switch (normalizedType) {
        case 'local':
            let LocalFileLoader = (await import('./local-file/LocalFileLoader.js')).default;
            return new LocalFileLoader();
        case 'nacos':
            let NacosLoader = (await import('./nacos/NacosConfigLoader.js')).default;
            return new NacosLoader();
        case 'consul':
            let ConsulLoader = (await import('./consul/ConsulLoader.js')).default;
            return new ConsulLoader();
        default:
            throw new Error(`Unknown or unsupported config mode '${type}'. Allowed modes: 'local', 'consul', 'nacos'`);
    }
}

/**
 * Load both application configuration and logger configuration
 * @param configMode - The configuration mode ('nacos', 'consul', or 'local')
 * @param configFile - The path to the application configuration file
 * @param logFile - The path to the logger configuration file
 * @param loggerPostLoader - Function to process logger configuration content
 * @returns Promise that resolves to an object containing appConf and loggerConf
 */
const loadConfig = async (configMode: string, configFile: string, logFile: string, loggerPostLoader?: PostLoader): Promise<any> => {
    let loader = await getLoader(configMode);
    let loggerConf = await loader.load(logFile, loggerPostLoader ?? null);
    let appConf = await loader.load(configFile);
    return { appConf, loggerConf };
}

export {
    getLoader,
    loadConfig
}
