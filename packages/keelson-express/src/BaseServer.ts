import express, {Express, NextFunction, Request, Response} from 'express';
import {handleError} from "@ticatec/node-exception";
import fs from 'fs';
import http from "http";
import net from "net";
import {getLogger, Logger} from "@ticatec/logger-api";
import CommonRoutes from "./CommonRoutes.js";
import {HealthCheckRegistry} from "./health/HealthCheckRegistry.js";
import type {HealthCheckIndicator} from "./health/HealthCheckRegistry.js";
import {createSystemHealthIndicator} from "./health/BuiltinHealthIndicators.js";
import {HealthRoutes} from "./health/HealthRoutes.js";

/**
 * Function signature for module loader
 */
export type moduleLoader = () => Promise<any>;

/**
 * Abstract base server class providing common functionality for Express servers
 */
export default abstract class BaseServer {

    /** Logger instance for this server */
    protected get logger(): Logger {
        return getLogger(this.constructor.name);
    }

    /**
     * Context root path for the server. Set by {@link startup} from `getWebConf()`.
     * 在 startup() 跑完之前是 undefined——子类若在此之前用它，拼出来的路径会带上
     * 字面量 "undefined"，所以 bindRoutes() 里加了显式检查。
     */
    protected contextRoot?: string;
    /**
     * Express application. Created by {@link startWebServer}; undefined before startup.
     */
    protected app?: Express;
    protected httpServer: http.Server | null = null;
    /** Health check registry for application probe indicators */
    protected healthRegistry: HealthCheckRegistry;

    /**
     * Constructor for base server
     */
    protected constructor() {
        this.healthRegistry = new HealthCheckRegistry();
        // Register default system health indicator
        this.healthRegistry.register('system', createSystemHealthIndicator());
    }


    /**
     * Loads configuration file
     * @returns Promise that resolves when configuration is loaded
     * @protected
     * @abstract
     */
    protected abstract loadConfigFile(): Promise<void>;

    /**
     * Writes the listening port to check.dat file
     * @param port The port number to write
     * @param fileName The file name to write to (default: './check.dat')
     * @protected
     */
    protected writeCheckFile(port: number, fileName: string = './check.dat') {
        try {
            this.logger.debug({port, fileName}, 'Writing listening port to check file');
            fs.writeFileSync(fileName, `${port}`);
        } catch (err) {
            // 传 Error 本身，不要包成 {err}：Error 的 message 与 stack 都不是可枚举属性，
            // 包进对象后经 JSON 序列化只剩 {"err":{"code":"ENOSPC"}} 这种残骸，
            // 真正要看的那行没了。
            this.logger.error(err, 'Error writing port file');
        }
    }

    /**
     * Starts up the server
     * @returns Promise that resolves when server startup is complete
     */
    async startup() {
        await this.loadConfigFile();
        this.logger.info({}, 'Starting server');
        try {
            await this.beforeStart();
            const webConf = this.getWebConf();
            this.logger.debug({port: webConf.port, ip: webConf.ip, contextRoot: webConf.contextRoot}, 'Web configuration loaded');
            this.contextRoot = webConf.contextRoot;
            await this.startWebServer(webConf);
        } catch (err) {
            this.logger.error(err, 'Startup failed');
            throw err;
        }
    }

    /**
     * Interceptor function called after web server is created
     * @param _server The HTTP server instance
     * @returns Promise that resolves when post-creation setup is complete
     * @protected
     */
    protected async postServerCreated(_server: http.Server): Promise<void> {

    }

    /**
     * Gets web configuration
     * @returns Web configuration object
     * @protected
     * @abstract
     */
    protected abstract getWebConf(): any;

    /**
     * Interceptor function called before startup
     * @returns Promise that resolves when pre-startup setup is complete
     * @protected
     */
    protected async beforeStart(): Promise<void> {

    }

    /**
     * Registers a health check indicator on this server's registry.
     *
     * 两份 README 的核心示例一直教人在 beforeStart() 里调这个方法，但它此前并不存在
     * ——照着文档抄会直接撞上 "Property 'registerHealthCheck' does not exist"，
     * 连本包自己的测试也只能强转到 healthRegistry 上绕过去。
     * @param name Indicator name, unique per server (e.g. `database`, `redis`).
     * @param indicator Function returning the component's health.
     * @param isCritical When true (the default), `DOWN` makes the whole readiness probe
     *   `DOWN` and `/health/ready` answers 503; when false it answers `DEGRADED` with a 200.
     * @param timeoutMs How long the indicator may take before it counts as `DOWN`. Default 3000.
     */
    public registerHealthCheck(name: string, indicator: HealthCheckIndicator, isCritical: boolean = true, timeoutMs: number = 3000): void {
        this.healthRegistry.register(name, indicator, isCritical, timeoutMs);
    }

    /**
     * Removes a previously registered health check indicator.
     * @param name Indicator name.
     */
    public unregisterHealthCheck(name: string): void {
        this.healthRegistry.unregister(name);
    }

    /**
     * Adds health check endpoints (/health/live, /health/ready, /health) to the Express app
     * @protected
     */
    protected async addHealthCheck() {
        const webConf = this.getWebConf?.() || {};
        const healthPrefix = webConf.healthPath || '/health';
        this.logger.debug({healthPrefix}, 'Mounting health check subsystem routes');
        const healthRoutes = new HealthRoutes(this.healthRegistry);
        await healthRoutes.bind(this.requireApp(), healthPrefix);
    }

    /**
     * Starts the web server with given configuration
     * @param webConf Web server configuration
     * @returns Promise that resolves to the HTTP server instance
     * @protected
     */
    protected async startWebServer(webConf: any): Promise<http.Server> {
        const app = express();
        app.disable("x-powered-by");
        const routerHelper = (await import("./RouterHelper.js")).default;
        app.use(routerHelper.setNoCache);
        this.app = app;
        await this.addHealthCheck();
        this.setupExpress();
        await this.bindStaticSite();
        app.use(routerHelper.retrieveUser());
        await this.setupRoutes();
        app.use(routerHelper.actionNotFound());
        app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
            handleError(err, req, res, next);
        });

        return new Promise<http.Server>((resolve, reject) => {
            const onError = (err: Error) => {
                this.logger.error(err, 'Server listen error');
                reject(err);
            };

            const server: http.Server = app.listen(webConf.port, webConf.ip, async () => {
                server.removeListener('error', onError);
                server.on('error', (err) => this.logger.error(err, 'Runtime server error'));
                try {
                    const address = server.address() as net.AddressInfo;
                    const actualPort = address?.port || webConf.port;
                    await this.postServerCreated(server);
                    this.writeCheckFile(actualPort);
                    this.httpServer = server;
                    this.logger.info({ip: webConf.ip, port: actualPort}, 'Web service started');
                    resolve(server);
                } catch (err) {
                    this.logger.error(err, 'Post server creation setup failed, closing server');
                    server.close(() => reject(err));
                }
            });
            server.once('error', onError);
        });
    }

    /**
     * Gracefully shuts down the HTTP server and stops background processors
     */
    async shutdown(checkFileName: string = './check.dat'): Promise<void> {
        this.logger.info({}, 'Shutting down server');
        try {
            const {default: ProcessorManager} = await import('./ProcessorManager.js');
            await ProcessorManager.getInstance().stopAll();
        } catch (err) {
            this.logger.warn(err, 'Error stopping processor manager');
        }

        if (fs.existsSync(checkFileName)) {
            try {
                fs.unlinkSync(checkFileName);
            } catch (err) {
                this.logger.warn(err, 'Error removing check file');
            }
        }

        if (this.httpServer) {
            const server = this.httpServer;
            await new Promise<void>((resolve) => {
                server.close(() => {
                    this.httpServer = null;
                    resolve();
                });
                // Node 18 的 close() 只停止接受新连接，空闲的 keep-alive 连接会一直
                // 把服务器占住，close 的回调因此可能迟迟不触发；Node 19 起 close()
                // 自己会断开空闲连接。engines 允许 >=18，所以显式调一次，在新版本上
                // 等价于空操作。
                //
                // 只断空闲连接，不调 closeAllConnections()——后者会把正在处理请求的
                // 连接一并销毁，正在写的响应会被截断，那就不叫优雅关停了。
                server.closeIdleConnections?.();
            });
        }
        this.logger.info({}, 'Server shutdown completed');
    }

    /**
     * Binds static site resources
     * @returns Promise that resolves when static binding is complete
     * @protected
     */
    protected async bindStaticSite() {

    }

    /**
     * Initializes Express application
     * @protected
     */
    protected setupExpress(): void {

    }

    /**
     * Binds a route to the Express application
     * @param path The route path
     * @param loader Module loader function that returns the route class
     * @returns Promise that resolves when route binding is complete
     * @protected
     */
    protected async bindRoutes(path: string, loader: moduleLoader): Promise<void> {
        const clazz: any = (await loader()).default;
        const routes: CommonRoutes = new clazz();
        await routes.bind(this.requireApp(), `${this.requireContextRoot()}${path}`);
    }

    /**
     * Returns the Express application, or fails with a message that says what went wrong.
     *
     * 直接用 this.app 的话，startup() 之前调用会报 "Cannot read properties of
     * undefined"，看不出是生命周期用错了。
     * @protected
     */
    protected requireApp(): Express {
        if (!this.app) {
            throw new Error('Express application is not created yet. Routes can only be bound from setupRoutes(), which startup() calls after the app exists.');
        }
        return this.app;
    }

    /**
     * Returns the context root, or fails if startup() has not resolved it yet.
     *
     * 此前这里是 `${this.contextRoot}${path}` 的模板字符串，undefined 会被静默地
     * 拼成字面量 "undefined"，路由挂到 /undefined/... 上，启动不报错、请求全 404。
     * @protected
     */
    protected requireContextRoot(): string {
        if (this.contextRoot == null) {
            throw new Error('contextRoot is not resolved yet. It is read from getWebConf() during startup().');
        }
        return this.contextRoot;
    }

    /**
     * Sets up routes for the application
     * @returns Promise that resolves when all routes are set up
     * @protected
     * @abstract
     */
    protected abstract setupRoutes(): Promise<void>;

    /**
     * Starts a server as the process entry point.
     *
     * Deliberately returns `void`: this is the last call in `main`, so there is no caller
     * left to await it or to handle a rejection. A startup failure is therefore logged
     * here and turned into a non-zero exit code — the chain ends, it does not rethrow.
     *
     * 这里不能 `throw ex`。抛出的异常落进一条没人 await 的 promise 链，变成
     * unhandled rejection；Node 15 起默认直接终止进程，于是启动失败时拿到的是一段
     * 裸栈，而不是一条记好的日志，`process.exitCode = 1` 也会被崩溃的退出码覆盖。
     * 实测：端口传 -1 时进程直接以 ERR_SOCKET_BAD_PORT 退出，`startup()` 之后的任何
     * 代码都不会执行。
     *
     * 需要自己决定失败后做什么（重试、上报、优雅退出）的调用方，直接 await
     * `server.startup()`，它照常抛。
     * @param server The server instance to start
     */
    static startup(server: BaseServer): void {
        server.startup().then(() => {
            server.logger.info({}, 'Server started');
        }).catch(() => {
            // 不在这里重复记一遍：实例的 startup() 已经记过并 rethrow，
            // 这里只负责把失败变成退出码。
            process.exitCode = 1;
        });
    }
}
