import {clearInterval} from "node:timers";
import {getLogger, Logger} from "@ticatec/logger-api";

export enum ProcessStatus {
    Napping,
    Running = 1
}

export default abstract class CommonProcessor<T> {

    protected get logger(): Logger {
        return getLogger(this.constructor.name);
    }
    protected interval: number;
    protected processInterval: any;
    private nappingDuration!: number;
    private status: ProcessStatus;
    private readonly ants: number;
    private runningPromise: Promise<void> | null = null;

    /**
     * Constructor
     * @param interval Check interval in seconds
     * @param ants Number of worker threads that can execute concurrently (default: 5, min: 1)
     * @protected
     */
    protected constructor(interval: number, ants: number = 5) {
        this.interval = Math.max(Math.round(interval), 5);
        this.ants = Math.max(1, Math.round(ants || 5));
        this.nappingDuration = 0;
        this.status = ProcessStatus.Napping;
    }

    /**
     * Checks if the processor is currently executing tasks
     */
    get isRunning(): boolean {
        return this.status === ProcessStatus.Running;
    }

    /**
     * Startup processor
     */
    startup() {
        if (!this.processInterval) {
            this.logger.debug('Starting processor');
            this.nappingDuration = this.interval;
            this.status = ProcessStatus.Napping;
            this.processInterval = setInterval(() => this.checkNap(), 1000);
        }
    }

    /**
     * Stop processor and await in-flight task execution if running
     */
    async stop(): Promise<void> {
        if (this.processInterval) {
            this.logger.debug('Stopping processor');
            clearInterval(this.processInterval);
            this.processInterval = null;
        }
        if (this.runningPromise) {
            this.logger.debug('Waiting for in-flight processor tasks to complete');
            await this.runningPromise;
        }
    }

    private async checkNap() {
        this.nappingDuration++;

        if (this.status === ProcessStatus.Running) {
            return;
        }

        if (this.nappingDuration >= this.interval && this.status === ProcessStatus.Napping) {
            this.status = ProcessStatus.Running;
            this.runningPromise = this.startProcess()
                .catch((error) => {
                    this.logger.error({ error }, "Uncaught exception during processor execution");
                })
                .finally(() => {
                    this.status = ProcessStatus.Napping;
                    this.nappingDuration = 0;
                    this.runningPromise = null;
                });
            await this.runningPromise;
        }
    }

    /**
     * Start processing pending data
     * @protected
     */
    protected async startProcess(): Promise<void> {
        const arr = await this.loadToProcessData();
        if (arr.length > 0) {
            this.logger.debug('Pending items found, starting processing');
            const pool = new Set<Promise<void>>();
            for (const item of arr) {
                const task = this.processItem(item)
                    .catch((ex) => {
                        this.logger.error({ ex }, 'Error executing task');
                    })
                    .finally(() => {
                        pool.delete(task);
                    });
                pool.add(task);
                if (pool.size >= this.ants) {
                    await Promise.race(pool);
                }
            }
            await Promise.all(pool);
        } else {
            this.nappingDuration = 0;
        }
    }

    /**
     * Load data to process
     * @protected
     */
    protected abstract loadToProcessData(): Promise<Array<T>>;

    /**
     * Trigger immediate execution
     */
    runImmediately() {
        this.logger.debug('Triggering immediate execution');
        this.nappingDuration = this.interval;
    }

    /**
     * Process single data item
     * @protected
     * @param item
     */
    protected abstract processItem(item: T): Promise<void>;
}