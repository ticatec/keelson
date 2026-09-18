import BaseLoader from "../BaseLoader.js";
import path from "node:path";
import * as fs from "node:fs";

export default class LocalFileLoader extends BaseLoader {

    private readonly root: string;

    /**
     * Create a new LocalFileLoader instance with config directory set to process.cwd() + '/config'
     */
    constructor() {
        super();
        this.root = path.resolve(process.cwd(), 'config');
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