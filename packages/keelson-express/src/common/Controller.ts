import {getLogger, Logger} from "@ticatec/logger-api";
import {Request} from "express";
import LoggedUser, { RegisteredUser } from "../LoggedUser.js";

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
 * Base Controller providing logger and logged user access
 */
export default abstract class Controller {

    /** Flag to enable debug logging, shared across the CommonJS and ESM builds */
    static get debugEnabled(): boolean {
        return debugState.enabled;
    }

    static set debugEnabled(value: boolean) {
        debugState.enabled = value;
    }

    /** Logger instance for this controller */
    protected get logger(): Logger {
        return getLogger(this.constructor.name);
    }

    /**
     * Constructor for base controller
     * @protected
     */
    protected constructor() {
    }

    /**
     * Gets the current logged user, if acting as another user, returns the acted user,
     * returns null for requests without user injection.
     * Automatically resolves to the server-wide RegisteredUser type.
     * @param req Express request object
     * @returns The current user typed as RegisteredUser or null if no user is logged in
     */
    protected getLoggedUser = (req: Request): RegisteredUser => {
        const user: LoggedUser | undefined = req.user;
        return (user?.actAs || user) as RegisteredUser;
    }
}