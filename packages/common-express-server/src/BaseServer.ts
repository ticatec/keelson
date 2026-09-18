import express, {Express, NextFunction, Request, Response} from 'express';
import {handleError} from "@ticatec/node-exception";
import fs from 'fs';
import http from "http";
import net from "net";
import { getLogger, Logger } from "@ticatec/logger-api";
import CommonRoutes from "./CommonRoutes.js";
import { HealthCheckRegistry } from "./health/HealthCheckRegistry.js";
import { createSystemHealthIndicator } from "./health/BuiltinHealthIndicators.js";
import { HealthRoutes } from "./health/HealthRoutes.js";

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
    /** Context root path for the server */
    protected contextRoot: string;
    protected app: Express;
    protected httpServer: http.Server = null;
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
            this.logger.debug({ port }, 'Port');
            fs.writeFileSync(fileName, `${port}`);
        } catch (err) {
            this.logger.error({ err }, 'Error writing port file');
        }
    }

    /**
     * Starts up the server
     * @returns Promise that resolves when server startup is complete
     */
    async startup() {
        await this.loadConfigFile();
        this.logger.info('Starting server...');
        try {
            await this.beforeStart();
            const webConf = this.getWebConf();
            this.logger.debug({ port: webConf.port, ip: webConf.ip, contextRoot: webConf.contextRoot }, 'Web configuration loaded');
            this.contextRoot = webConf.contextRoot;
            await this.startWebServer(webConf);
        } catch (err) {
            this.logger.error({ err }, 'Startup failed');
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
     * Adds health check endpoints (/health/live, /health/ready, /health) to the Express app
     * @protected
     */
    protected async addHealthCheck() {
        const webConf = this.getWebConf?.() || {};
        const healthPrefix = webConf.healthPath || '/health';
        this.logger.debug({ healthPrefix }, 'Mounting health check subsystem routes');
        const healthRoutes = new HealthRoutes(this.healthRegistry);
        await healthRoutes.bind(this.app, healthPrefix);
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
            this.logger.debug({ err }, "Application error");
            handleError(err, req, res, next);
        });

        return new Promise<http.Server>((resolve, reject) => {
            const onError = (err: Error) => {
                this.logger.error({ err }, 'Server listen error');
                reject(err);
            };

            const server: http.Server = app.listen(webConf.port, webConf.ip, async () => {
                server.removeListener('error', onError);
                server.on('error', (err) => this.logger.error({ err }, 'Runtime server error'));
                try {
                    const address = server.address() as net.AddressInfo;
                    const actualPort = address?.port || webConf.port;
                    await this.postServerCreated(server);
                    this.writeCheckFile(actualPort);
                    this.httpServer = server;
                    this.logger.info(`Web service started successfully, listening on IP: ${webConf.ip}, port: ${actualPort}`);
                    resolve(server);
                } catch (err) {
                    this.logger.error({ err }, 'Post server creation setup failed, closing server');
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
        this.logger.info('Shutting down server...');
        try {
            const { default: ProcessorManager } = await import('./ProcessorManager.js');
            await ProcessorManager.getInstance().stopAll();
        } catch (err) {
            this.logger.warn({ err }, 'Error stopping processor manager');
        }

        if (fs.existsSync(checkFileName)) {
            try {
                fs.unlinkSync(checkFileName);
            } catch (err) {
                this.logger.warn({ err }, 'Error removing check file');
            }
        }

        if (this.httpServer) {
            await new Promise<void>((resolve) => {
                this.httpServer.close(() => {
                    this.httpServer = null;
                    resolve();
                });
            });
        }
        this.logger.info('Server shutdown completed');
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
        await routes.bind(this.app, `${this.contextRoot}${path}`);
    }

    /**
     * Sets up routes for the application
     * @returns Promise that resolves when all routes are set up
     * @protected
     * @abstract
     */
    protected abstract setupRoutes(): Promise<void>;

    /**
     * Static method to start a server instance
     * @param server The server instance to start
     */
    static startup(server: BaseServer): Promise<void> {
        return server.startup().catch(ex => {
            process.exitCode = 1;
            throw ex;
        });
    }
}
