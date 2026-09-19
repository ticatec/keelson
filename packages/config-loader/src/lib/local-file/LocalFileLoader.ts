import BaseLoader from "../BaseLoader.js";
import path from "node:path";
import * as fs from "node:fs";
import { getLogger } from "@ticatec/logger-api";
import type { Logger } from "@ticatec/logger-api";

const logger: Logger = getLogger('LocalFileLoader');

export default class LocalFileLoader extends BaseLoader {

    private readonly root: string;

    /**
     * 创建一个本地文件加载器。
     *
     * 根目录按以下顺序确定：
     * 1. 构造参数 `rootPath`
     * 2. 环境变量 `CONFIG_DIR`
     * 3. `process.cwd()/config`
     *
     * 此前只有第 3 条，写死在构造函数里。而 Kubernetes 把 ConfigMap 挂到
     * /etc/app/config、monorepo 多包共用一份配置等场景下，配置目录都不在 ./config。
     *
     * @param rootPath - 配置目录，相对路径按 process.cwd() 解析
     */
    constructor(rootPath?: string) {
        super();
        const configured = rootPath ?? process.env['CONFIG_DIR'];
        this.root = configured && configured.trim()
            ? path.resolve(process.cwd(), configured.trim())
            : path.resolve(process.cwd(), 'config');
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