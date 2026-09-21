import {getLogger, Logger} from "@ticatec/logger-api";

/**
 * 开关挂在 globalThis 上，而不是类静态字段。
 *
 * 这个包同时发布 CJS 与 ESM 两份产物。开关若是类静态字段，一个进程里同时出现
 * 两份时就有两个开关：应用在 ESM 侧打开 debugEnabled，CJS 侧加载的控制器读到的
 * 仍是 false，日志怎么都打不出来，而且没有任何迹象说明为什么。
 */
const DEBUG_KEY = Symbol.for('@ticatec/keelson-express.controller-debug');

interface ControllerDebugState {
    enabled: boolean;
}

const debugState: ControllerDebugState = ((globalThis as any)[DEBUG_KEY] ??= { enabled: false });

/**
 * Lightweight root Controller class providing structured logging and global debug flag.
 * Ideal for public APIs, webhooks, health probes, or endpoints that do not depend on
 * a business service or authenticated user context.
 */
export default abstract class Controller {

    protected logger: Logger = getLogger(this.constructor.name);

    /** Flag to enable debug logging, shared across the CommonJS and ESM builds */
    static get debugEnabled(): boolean {
        return debugState.enabled;
    }

    static set debugEnabled(value: boolean) {
        debugState.enabled = value;
    }

    /**
     * Constructor for base controller
     * @protected
     */
    protected constructor() {
    }
}