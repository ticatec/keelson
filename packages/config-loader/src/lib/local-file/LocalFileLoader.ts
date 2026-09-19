import BaseLoader from "../BaseLoader.js";
import path from "node:path";
import * as fs from "node:fs";
import { getLogger } from "@ticatec/logger-api";
import type { Logger } from "@ticatec/logger-api";

const logger: Logger = getLogger('LocalFileLoader');

export default class LocalFileLoader extends BaseLoader {

    private readonly root: string;

    /**
     * Create a new LocalFileLoader instance with config directory set to process.cwd() + '/config'
     */
    constructor() {
        super();
        this.root = path.resolve(process.cwd(), 'config');
        logger.debug({ root: this.root }, 'Resolved local configuration directory');
    }

    /**
     * Load configuration file content from local file system
     * @param fileName - The name of the file relative to the config directory
     * @returns Promise that resolves to the file content as string
     * @protected
     */
    protected loadFile(fileName: string): Promise<string> {
        const resolvedFile = path.resolve(this.root, fileName);
        const relative = path.relative(this.root, resolvedFile);
        if (relative.startsWith('..') || path.isAbsolute(relative)) {
            // 越权读取值得留痕：这类请求要么是配置写错了，要么是有人在探路。
            logger.warn({ file: fileName, root: this.root }, 'Rejected a path that escapes the configuration directory');
            return Promise.reject(new Error(`Path traversal rejected: '${fileName}' escapes root directory '${this.root}'`));
        }

        return new Promise((resolve, reject) => {
            fs.readFile(resolvedFile, 'utf8', (err, data) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(data);
                }
            });
        });
    }
}