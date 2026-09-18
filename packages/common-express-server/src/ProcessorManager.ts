import CommonProcessor from "./CommonProcessor.js";
import {getLogger, Logger} from "@ticatec/logger-api";

export default class ProcessorManager {

    private static instance: ProcessorManager = new ProcessorManager();
    private map: Map<string, CommonProcessor<any>>;
    private _logger?: Logger;

    private get logger(): Logger {
        if (!this._logger) {
            this._logger = getLogger("ProcessorManager");
        }
        return this._logger;
    }

    private constructor() {
        this.map = new Map<string, CommonProcessor<any>>();
    }

    static getInstance() {
        return ProcessorManager.instance;
    }

    get(name: string): CommonProcessor<any> {
        return this.map.get(name);
    }

    register(Constructor: new (name: string) => CommonProcessor<any>, args?: any): CommonProcessor<any> {
        const constructorName = Constructor.name;
        this.logger.info(`Registering processor ${constructorName}`);
        let processor = this.map.get(constructorName);
        if (!processor) {
            processor = new Constructor(args);
            this.map.set(constructorName, processor);
        }
        return processor;
    }

    /**
     * Starts all registered processors
     */
    startAll(): void {
        this.logger.info('Starting all registered processors');
        for (const processor of this.map.values()) {
            processor.startup();
        }
    }

    /**
     * Stops all registered processors and awaits in-flight task completion
     */
    async stopAll(): Promise<void> {
        this.logger.info('Stopping all registered processors');
        const tasks: Promise<void>[] = [];
        for (const processor of this.map.values()) {
            tasks.push(processor.stop());
        }
        await Promise.all(tasks);
    }
}