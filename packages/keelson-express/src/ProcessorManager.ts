import CommonProcessor from "./CommonProcessor.js";
import {getLogger, Logger} from "@ticatec/logger-api";

/**
 * 单例挂在 globalThis 上，而不是类静态字段。
 *
 * CJS 与 ESM 两份产物各自求值一次模块顶层代码，类静态字段因此会得到两个管理器。
 * 应用在一侧注册处理器，BaseServer.shutdown() 在另一侧调 stopAll()，后果是关停时
 * 一个处理器都没停掉——定时器还在跑，进程也退不干净。
 */
const REGISTRY_KEY = Symbol.for('@ticatec/keelson-express.processor-manager');

interface ProcessorManagerState {
    instance: ProcessorManager | null;
}

const state: ProcessorManagerState = ((globalThis as any)[REGISTRY_KEY] ??= { instance: null });

export default class ProcessorManager {

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

    static getInstance(): ProcessorManager {
        return (state.instance ??= new ProcessorManager());
    }

    /**
     * 按注册名取处理器。没有注册过就是 `undefined`——此前签名写的是非空，
     * 调用方拿到 undefined 也不会被类型检查拦住。
     * @param name 处理器类名
     */
    get(name: string): CommonProcessor<any> | undefined {
        return this.map.get(name);
    }

    /**
     * Registers a processor, keyed by its class name. Registering the same class twice
     * returns the instance created the first time.
     *
     * 构造参数的类型此前写的是 `new (name: string) => ...`，但传进去的是 `args`，
     * 而 CommonProcessor 的构造函数签名是 `(interval: number, ants?: number)`——
     * 这个声明和实际调用、和被构造的类三方都对不上。改成如实描述。
     * @param Constructor 处理器类
     * @param args 传给构造函数的第一个参数
     */
    register(Constructor: new (args?: any) => CommonProcessor<any>, args?: any): CommonProcessor<any> {
        const constructorName = Constructor.name;
        this.logger.info({ processor: constructorName }, 'Registering processor');
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
        this.logger.info({}, 'Starting all registered processors');
        for (const processor of this.map.values()) {
            processor.startup();
        }
    }

    /**
     * Stops all registered processors and awaits in-flight task completion
     */
    async stopAll(): Promise<void> {
        this.logger.info({}, 'Stopping all registered processors');
        const tasks: Promise<void>[] = [];
        for (const processor of this.map.values()) {
            tasks.push(processor.stop());
        }
        await Promise.all(tasks);
    }
}