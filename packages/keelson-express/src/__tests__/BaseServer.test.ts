import { setLoggerProvider, resetLoggerProvider } from '@ticatec/logger-api';
import type { Logger } from '@ticatec/logger-api';
import http from 'http';
import net from 'net';
import fs from 'fs';

import AppConf from '../AppConf.js';
import ProcessorManager from '../ProcessorManager.js';
import CommonProcessor from '../CommonProcessor.js';
import routerHelper from '../RouterHelper.js';
import UserResolver, { HeaderUserResolver, setUserResolver, resetUserResolver, getUserResolver } from '../UserResolver.js';
import CommonController from '../common/CommonController.js';
import Controller from '../common/Controller.js';
import CommonSearchController from '../common/CommonSearchController.js';
import BaseController from '../common/BaseController.js';
import CommonRoutes, { AuthenticatedRoutes } from '../CommonRoutes.js';
import BaseServer from '../BaseServer.js';
import LoggedUser, { CommonUser } from '../LoggedUser.js';
import { HealthCheckRegistry } from '../health/HealthCheckRegistry.js';
import { createSystemHealthIndicator } from '../health/BuiltinHealthIndicators.js';
import { HealthRoutes } from '../health/HealthRoutes.js';
import { StringValidator, NumberValidator } from '@ticatec/bean-validator';

/** Silences framework logging for the duration of the suite. */
const SILENT: Logger = (() => {
    const noop = () => { /* discard */ };
    return { trace: noop, debug: noop, info: noop, warn: noop, error: noop };
})();


class MockProcessor extends CommonProcessor<string> {
    public processedItems: string[] = [];
    public inFlightDelayMs: number = 0;

    constructor() {
        super(1, 2);
    }

    protected async loadToProcessData(): Promise<string[]> {
        return ['item1'];
    }

    protected async processItem(item: string): Promise<void> {
        if (this.inFlightDelayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, this.inFlightDelayMs));
        }
        this.processedItems.push(item);
    }
}

class MockService {
    async createNew(userOrData: any, dataOrNil?: any) {
        return { id: 1, userOrData, dataOrNil };
    }
    async update(userOrData: any, dataOrNil?: any) {
        return { updated: true, userOrData, dataOrNil };
    }
    async search(userOrQuery: any, queryOrNil?: any) {
        return [{ id: 1, userOrQuery, queryOrNil }];
    }
}

class TestCommonController extends CommonController<MockService> {
    constructor(service: MockService) {
        super(service);
    }
}

class TestSearchController extends CommonSearchController<MockService> {
    constructor(service: MockService) {
        super(service);
    }
}

class TestEmptySearchController extends CommonSearchController<any> {
    constructor() {
        super({});
    }
}

class PublicRoutes extends CommonRoutes {
    protected bindRoutes() {
        this.get('/test', async (_req) => ({ ok: true }));
    }
}

class ProtectedRoutes extends AuthenticatedRoutes {
    protected bindRoutes() {
        this.get('/test', async (_req) => ({ ok: true }));
    }
}

/** 一条故意慢的路由：关停开始时它还在处理中。 */
let slowRequestStarted: (() => void) | null = null;

class SlowRoutes extends CommonRoutes {
    protected bindRoutes() {
        this.get('/ping', routerHelper.invokeController(async (_req, res) => {
            slowRequestStarted?.();
            await new Promise(resolve => setTimeout(resolve, 300));
            res.json({ done: true });
        }));
    }
}

class SlowServer extends BaseServer {
    public listenPort: number = 0;
    public readonly inFlight: Promise<void>;

    constructor() {
        super();
        this.inFlight = new Promise<void>(resolve => { slowRequestStarted = resolve; });
    }

    protected async loadConfigFile(): Promise<void> {}
    protected getWebConf() {
        return { port: this.listenPort, ip: '127.0.0.1', contextRoot: '/api' };
    }
    protected async setupRoutes(): Promise<void> {
        await this.bindRoutes('/slow', async () => ({ default: SlowRoutes }));
    }
}

class TestServer extends BaseServer {
    public listenPort: number = 0;
    public failPostCreate: boolean = false;

    constructor() {
        super();
    }

    protected async loadConfigFile(): Promise<void> {}
    protected getWebConf() {
        return { port: this.listenPort, ip: '127.0.0.1', contextRoot: '/api' };
    }
    protected async postServerCreated(_server: http.Server): Promise<void> {
        if (this.failPostCreate) {
            throw new Error('Post server creation failed intentionally');
        }
    }
    protected async setupRoutes(): Promise<void> {
        await this.bindRoutes('/pub', async () => ({ default: PublicRoutes }));
        await this.bindRoutes('/priv', async () => ({ default: ProtectedRoutes }));
    }
    public exposeBindRoutes(path: string, loader: any): Promise<void> {
        return this.bindRoutes(path, loader);
    }
}

describe('keelson-express comprehensive test suite', () => {
    beforeAll(() => {
        resetLoggerProvider();
        setLoggerProvider(() => SILENT);
    });

    afterEach(() => {
        if (fs.existsSync('./check.dat')) {
            try {
                fs.unlinkSync('./check.dat');
            } catch {
                // Ignore cleanup error
            }
        }
    });

    test('should initialize AppConf singleton and fetch nested properties', () => {
        const conf = AppConf.init({ server: { port: 8080, db: { host: 'localhost' } } });
        expect(conf).toBeDefined();
        expect(AppConf.getInstance()).toBe(conf);

        expect(conf.get('server.port')).toBe(8080);
        expect(conf.get('server.db.host')).toBe('localhost');
        expect(conf.get('invalid.key')).toBeUndefined();
        expect(conf.get('')).toBeUndefined();
    });

    test('should register, start, and await in-flight tasks when stopping processors', async () => {
        const manager = ProcessorManager.getInstance();
        const processor = manager.register(MockProcessor as any) as MockProcessor;
        processor.inFlightDelayMs = 10;

        expect(processor).toBeDefined();
        expect(processor.isRunning).toBe(false);
        expect(manager.get('MockProcessor')).toBe(processor);

        processor.runImmediately();
        await (processor as any).checkNap();

        await manager.stopAll();
        expect(processor.isRunning).toBe(false);
        expect(processor.processedItems).toContain('item1');
    });

    test('should invoke routerHelper middlewares without throwing', async () => {
        const req: any = { headers: { user: encodeURIComponent(JSON.stringify({ accountCode: 'U100', name: 'Alice' })) } };
        const res: any = { header: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn(), send: jest.fn() };
        const next = jest.fn();

        routerHelper.setJsonHeader(req, res, next);
        expect(res.header).toHaveBeenCalledWith('Content-Type', 'application/json');

        routerHelper.setNoCache(req, res, next);
        expect(res.header).toHaveBeenCalledWith('Pragma', 'no-cache');

        await routerHelper.retrieveUser()(req, res, next);
        expect(req.user).toBeDefined();
        expect(req.user.accountCode).toBe('U100');
    });

    test('should execute Common controller methods with logged user as first argument', async () => {
        const service = new MockService();
        const commonCtrl = new TestCommonController(service);
        const searchCtrl = new TestSearchController(service);

        const mockReq: any = {
            method: 'POST',
            originalUrl: '/test',
            body: { title: 'New Item' },
            query: { name: 'filter' },
            user: { accountCode: 'U1' }
        };

        const created = await commonCtrl.createNew()(mockReq);
        expect(created).toEqual({ id: 1, userOrData: { accountCode: 'U1' }, dataOrNil: { title: 'New Item' } });

        const updated = await commonCtrl.update()(mockReq);
        expect(updated).toEqual({ updated: true, userOrData: { accountCode: 'U1' }, dataOrNil: { title: 'New Item' } });

        const searched = await searchCtrl.search()(mockReq);
        expect(searched).toEqual([{ id: 1, userOrQuery: { accountCode: 'U1' }, queryOrNil: { name: 'filter' } }]);
    });

    test('should throw ActionNotFoundError when service lacks search interface', async () => {
        const emptySearch = new TestEmptySearchController();
        const mockReq: any = { query: {} };
        await expect(emptySearch.search()(mockReq)).rejects.toThrow();
    });

    test('should validate create and update with template method rules independently', async () => {
        const service = new MockService();
        class CustomValidationController extends CommonController<MockService> {
            constructor(svc: MockService) {
                super(svc);
            }
            protected override getCreateRules(): any {
                return [new StringValidator('name', { required: true })];
            }
            protected override getUpdateRules(): any {
                return [new NumberValidator('id', { required: true })];
            }
        }

        const ctrl = new CustomValidationController(service);

        // Valid create request
        const createReqValid: any = { method: 'POST', originalUrl: '/test', body: { name: 'ValidName' } };
        await expect(ctrl.createNew()(createReqValid)).resolves.toBeDefined();

        // Invalid create request (missing name)
        const createReqInvalid: any = { method: 'POST', originalUrl: '/test', body: {} };
        await expect(ctrl.createNew()(createReqInvalid)).rejects.toThrow();

        // Valid update request
        const updateReqValid: any = { method: 'PUT', originalUrl: '/test', body: { id: 123 } };
        await expect(ctrl.update()(updateReqValid)).resolves.toBeDefined();

        // Invalid update request (missing id)
        const updateReqInvalid: any = { method: 'PUT', originalUrl: '/test', body: { name: 'NoId' } };
        await expect(ctrl.update()(updateReqInvalid)).rejects.toThrow();
    });

    test('should verify public vs authenticated route authorization rules', async () => {
        const publicRoutes = new PublicRoutes();
        const protectedRoutes = new ProtectedRoutes();

        // Public route allows requests without user
        expect(await (publicRoutes as any).isValidUser(null)).toBe(true);

        // Protected route rejects requests without user and allows authenticated user
        expect(await (protectedRoutes as any).isValidUser(null)).toBe(false);
        expect(await (protectedRoutes as any).isValidUser({ accountCode: 'U1', name: 'Bob' })).toBe(true);
    });

    test('should reject unauthenticated request in checkLoggedUser middleware', async () => {
        const req: any = {
            headers: {},
            path: '/priv/test',
            method: 'GET',
            get: jest.fn().mockReturnValue(null),
            accepts: jest.fn().mockReturnValue('json')
        };
        const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn(), setHeader: jest.fn() };
        const next = jest.fn();

        await routerHelper.checkLoggedUser()(req, res, next);
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
    });

    test('should start, write check.dat with actual port, and shutdown server gracefully', async () => {
        const server = new TestServer();
        server.listenPort = 0; // Dynamic port

        await server.startup();

        expect(fs.existsSync('./check.dat')).toBe(true);
        const writtenPort = parseInt(fs.readFileSync('./check.dat', 'utf-8'), 10);
        expect(writtenPort).toBeGreaterThan(0);

        await server.shutdown();
        expect(fs.existsSync('./check.dat')).toBe(false);
    });


    test('shutdown lets an in-flight request finish and does not truncate it', async () => {
        const server = new SlowServer();
        server.listenPort = 0;
        await server.startup();
        const port = parseInt(fs.readFileSync('./check.dat', 'utf-8'), 10);

        // 关停期间必须让已经在处理的请求写完响应。closeAllConnections() 会把这条
        // 连接一起销毁，客户端拿到的是被截断的响应——那不是优雅关停。
        const responded = new Promise<string>((resolve, reject) => {
            const socket = net.connect({ port, host: '127.0.0.1' }, () => {
                socket.write('GET /api/slow/ping HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: keep-alive\r\n\r\n');
            });
            let buffer = '';
            socket.on('data', chunk => {
                buffer += chunk.toString();
                if (buffer.includes('"done":true')) {
                    socket.destroy();
                    resolve(buffer);
                }
            });
            socket.on('error', reject);
        });

        await server.inFlight;      // 请求已进入处理函数
        const shutdown = server.shutdown();

        const body = await Promise.race([
            responded,
            new Promise<string>((_, reject) => setTimeout(() => reject(new Error('in-flight request was cut off by shutdown')), 5000))
        ]);
        expect(body).toContain('"done":true');

        await Promise.race([
            shutdown,
            new Promise((_, reject) => setTimeout(() => reject(new Error('shutdown() never resolved')), 5000))
        ]);
    }, 15000);

    test('contextRoot and app report a usable error before startup', async () => {
        const server = new TestServer();

        await expect(server.exposeBindRoutes('/x', async () => ({ default: PublicRoutes })))
            .rejects.toThrow(/Express application is not created yet/);
    });

    describe('state shared across the CommonJS and ESM builds', () => {
        test('AppConf keeps its instance on a well-known global symbol', () => {
            const key = Symbol.for('@ticatec/keelson-express.app-conf');
            AppConf.init({ server: { port: 8080 } });

            // 两份产物各自求值一次模块顶层代码。单例若是类静态字段，一个进程里
            // 就会有两个 AppConf：ESM 侧 init() 写入的配置，CJS 侧 getInstance()
            // 读不到。挂在 Symbol.for 的键上，两份拿到的才是同一个对象。
            const shared = (globalThis as any)[key];
            expect(shared).toBeDefined();
            expect(shared.instance).toBe(AppConf.getInstance());
            expect(AppConf.getInstance()?.get('server.port')).toBe(8080);
        });

        test('Controller.debugEnabled is the same switch on both sides', () => {
            const key = Symbol.for('@ticatec/keelson-express.controller-debug');
            const previous = Controller.debugEnabled;
            try {
                Controller.debugEnabled = true;
                expect((globalThis as any)[key].enabled).toBe(true);

                // 模拟另一份产物：它读到的是同一个状态对象
                (globalThis as any)[key].enabled = false;
                expect(Controller.debugEnabled).toBe(false);
            } finally {
                Controller.debugEnabled = previous;
            }
        });

        test('ProcessorManager resolves to one manager', () => {
            const key = Symbol.for('@ticatec/keelson-express.processor-manager');
            const manager = ProcessorManager.getInstance();
            expect((globalThis as any)[key].instance).toBe(manager);
            expect(ProcessorManager.getInstance()).toBe(manager);
        });
    });

    test('AppConf.get() does not reach up the prototype chain', () => {
        AppConf.init({ server: { port: 8080 } });
        const conf = AppConf.getInstance()!;

        // 此前用的是 `k in result`，会顺着原型链找，于是这些键都能取到
        // Object.prototype 上的成员，而配置里根本没有它们。
        expect(conf.get('constructor')).toBeUndefined();
        expect(conf.get('toString')).toBeUndefined();
        expect(conf.get('server.constructor')).toBeUndefined();
        expect(conf.get('server.port')).toBe(8080);
    });

    test('the processor subsystem is reachable from the package entry point', async () => {
        const entry: any = await import('../index.js');
        // ProcessorManager / CommonProcessor 此前没有从 index 导出，而 exports 映射
        // 只开放了 "." 与 "./package.json"，深层导入同样被挡住——BaseServer.shutdown()
        // 会调 stopAll()，使用方却拿不到这个类去注册处理器。
        expect(typeof entry.ProcessorManager?.getInstance).toBe('function');
        expect(typeof entry.CommonProcessor).toBe('function');
        expect(entry.ProcessStatus?.Running).toBe(1);
    });

    test('should reject startup if postServerCreated fails', async () => {
        const server = new TestServer();
        server.listenPort = 0;
        server.failPostCreate = true;

        await expect(server.startup()).rejects.toThrow('Post server creation failed intentionally');
        expect(fs.existsSync('./check.dat')).toBe(false);
    });

    test('should reject startup if port is invalid or occupied', async () => {
        const server = new TestServer();
        server.listenPort = -1; // Invalid port

        await expect(server.startup()).rejects.toThrow();
    });

    test('should set process.exitCode = 1 on BaseServer.startup static failure', async () => {
        const server = new TestServer();
        server.listenPort = -1;

        process.exitCode = 0;
        await expect(BaseServer.startup(server)).rejects.toThrow();
        expect(process.exitCode).toBe(1);
        process.exitCode = 0; // Reset
    });

    describe('CommonUser and LoggedUser Interface Suite', () => {
        interface AppUser extends LoggedUser {
            userId: string;
            userName?: string;
            role?: string;
        }

        class UserTestController extends BaseController<MockService> {
            constructor(service: MockService) {
                super(service);
            }
            public getDirectUser(req: any) {
                return this.getLoggedUser(req);
            }
        }

        test('should allow custom user structures extending CommonUser and LoggedUser', () => {
            const basicUser: CommonUser = {};
            expect(basicUser).toBeDefined();

            const loggedUser: LoggedUser = {
                actAs: {
                    targetId: 'target-123'
                } as any
            };
            expect(loggedUser.actAs).toBeDefined();

            const appUser: AppUser = {
                userId: 'usr-001',
                userName: 'Alice',
                role: 'admin',
                actAs: {
                    userId: 'usr-002',
                    userName: 'ImpersonatedBob'
                } as any
            };
            expect(appUser.userId).toBe('usr-001');
            expect((appUser.actAs as any).userId).toBe('usr-002');
        });

        test('should return actAs user when impersonation is present in getLoggedUser', () => {
            const ctrl = new UserTestController(new MockService());

            // 1. With actAs impersonation
            const impersonatedReq: any = {
                user: {
                    userId: 'admin-1',
                    actAs: { userId: 'tenant-user-2', name: 'Impersonated User' }
                }
            };
            const activeUser: any = ctrl.getDirectUser(impersonatedReq);
            expect(activeUser.userId).toBe('tenant-user-2');
            expect(activeUser.name).toBe('Impersonated User');

            // 2. Direct user without actAs
            const directReq: any = {
                user: { userId: 'normal-user-1', name: 'Direct User' }
            };
            const directUser: any = ctrl.getDirectUser(directReq);
            expect(directUser.userId).toBe('normal-user-1');
            expect(directUser.name).toBe('Direct User');

            // 3. No logged in user
            const anonReq: any = {};
            expect(ctrl.getDirectUser(anonReq)).toBeUndefined();
        });

        test('should decode user header and inject x-language into both user and actAs', async () => {
            const rawUser = {
                userId: 'admin-root',
                actAs: { userId: 'client-user' }
            };
            const req: any = {
                headers: {
                    user: encodeURIComponent(JSON.stringify(rawUser)),
                    'x-language': 'zh-CN'
                }
            };
            const res: any = {};
            const next = jest.fn();

            await routerHelper.retrieveUser()(req, res, next);

            expect(next).toHaveBeenCalled();
            expect(req.user).toBeDefined();
            expect(req.user.userId).toBe('admin-root');
            expect(req.user.language).toBe('zh-CN');
            expect(req.user.actAs.userId).toBe('client-user');
            expect(req.user.actAs.language).toBe('zh-CN');
        });

        test('should validate actAs user in CommonRoutes when impersonating', async () => {
            let validatedUser: any = null;
            class TestImpersonationRoutes extends CommonRoutes {
                protected override isValidUser(user: any): boolean {
                    validatedUser = user;
                    return user?.userId === 'allowed-tenant-user';
                }
                protected bindRoutes() {
                    this.get('/profile', async (_req) => ({ ok: true }));
                }
            }

            const app: any = {
                use: jest.fn()
            };
            const routes = new TestImpersonationRoutes();
            await routes.bind(app, '/test');

            const routerInstance = app.use.mock.calls[0][1];
            const validationLayer = routerInstance.stack.find((layer: any) => layer.handle && layer.handle.length === 3);

            const mockReq: any = {
                user: {
                    userId: 'admin-super',
                    actAs: { userId: 'allowed-tenant-user' }
                }
            };
            const nextFn = jest.fn();
            await validationLayer.handle(mockReq, {}, nextFn);

            expect(validatedUser).toEqual({ userId: 'allowed-tenant-user' });
            expect(nextFn).toHaveBeenCalledWith();
        });
    });


    describe('user resolution', () => {

        const runResolver = async (req: any) => {
            const next = jest.fn();
            await routerHelper.retrieveUser()(req, {} as any, next);
            return { req, next };
        };

        afterEach(() => {
            resetUserResolver();
        });

        test('the built-in resolver reads the gateway header and the language header', async () => {
            const req: any = {
                path: '/x',
                headers: {
                    user: encodeURIComponent(JSON.stringify({ accountCode: 'U1', actAs: { accountCode: 'U2' } })),
                    'x-language': 'zh-CN'
                }
            };
            await runResolver(req);
            expect(req.user.accountCode).toBe('U1');
            expect(req.user.language).toBe('zh-CN');
            expect(req.user.actAs.language).toBe('zh-CN');
        });

        test('a malformed header leaves the request anonymous instead of failing it', async () => {
            const req: any = { path: '/x', headers: { user: '%%%not-json%%%' } };
            const { next } = await runResolver(req);
            expect(req.user).toBeUndefined();
            expect(next).toHaveBeenCalledWith();
        });

        test('a header that decodes to a non-object is rejected', async () => {
            const req: any = { path: '/x', headers: { user: encodeURIComponent('"just-a-string"') } };
            await runResolver(req);
            expect(req.user).toBeUndefined();
        });

        test('a repeated header is read as its first value, not as an array', async () => {
            // 客户端可以把同一个头发两次；Express 会给出数组，直接 JSON.parse 会抛。
            const req: any = {
                path: '/x',
                headers: { user: [encodeURIComponent(JSON.stringify({ accountCode: 'U1' })), 'junk'] }
            };
            await runResolver(req);
            expect(req.user.accountCode).toBe('U1');
        });

        test('a subclass can change one step and keep the rest', async () => {
            class BearerResolver extends HeaderUserResolver {
                protected override userHeader(): string {
                    return 'authorization';
                }
                protected override decode(raw: string): unknown {
                    return { accountCode: raw.replace(/^Bearer /, '') };
                }
            }
            setUserResolver(new BearerResolver());

            const req: any = { path: '/x', headers: { authorization: 'Bearer U9', 'x-language': 'en' } };
            await runResolver(req);
            expect(req.user).toEqual({ accountCode: 'U9', language: 'en' });
        });

        test('a resolver from a different source entirely can replace the header pipeline', async () => {
            class SessionResolver extends UserResolver {
                async resolve(req: any) {
                    return req.session?.user;
                }
            }
            setUserResolver(new SessionResolver());

            const req: any = { path: '/x', headers: {}, session: { user: { accountCode: 'S1' } } };
            await runResolver(req);
            expect(req.user).toEqual({ accountCode: 'S1' });
        });

        test('the installed resolver is shared across the CommonJS and ESM builds', () => {
            const key = Symbol.for('@ticatec/keelson-express.user-resolver');
            class Custom extends UserResolver {
                resolve() { return undefined; }
            }
            const custom = new Custom();
            setUserResolver(custom);

            // 解析器若存在模块级变量里，两份产物各有一个：应用在 ESM 侧换掉解析器，
            // CJS 侧的 RouterHelper 仍用默认实现，自定义认证静默失效。
            expect((globalThis as any)[key].resolver).toBe(custom);
            expect(getUserResolver()).toBe(custom);
        });

        test('checkLoggedUser rejects a request the resolver left anonymous', async () => {
            const req: any = { path: '/x', method: 'GET', headers: {}, accepts: jest.fn().mockReturnValue('json') };
            const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn(), setHeader: jest.fn() };
            const next = jest.fn();

            await routerHelper.checkLoggedUser()(req, res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(401);
        });
    });

    describe('Health Check Subsystem', () => {
        test('should execute checkLiveness and checkReadiness on HealthCheckRegistry', async () => {
            const registry = new HealthCheckRegistry();
            registry.register('system', createSystemHealthIndicator());

            const liveness = registry.checkLiveness();
            expect(liveness.status).toBe('UP');
            expect(liveness.details?.uptime).toBeGreaterThanOrEqual(0);

            const readiness = await registry.checkReadiness();
            expect(readiness.status).toBe('UP');
            expect(readiness.checks.system.status).toBe('UP');
        });

        test('should execute checks concurrently and handle timeout protection for slow/hung probes', async () => {
            const registry = new HealthCheckRegistry();

            // Fast check
            registry.register('fast', async () => ({ status: 'UP' }), true, 1000);

            // Hung check (never resolves)
            registry.register('hung', () => new Promise(() => {}), true, 50);

            const startTime = Date.now();
            const readiness = await registry.checkReadiness();
            const elapsedTime = Date.now() - startTime;

            expect(elapsedTime).toBeLessThan(300); // Should resolve around 50ms without hanging
            expect(readiness.status).toBe('DOWN');
            expect(readiness.checks.fast.status).toBe('UP');
            expect(readiness.checks.hung.status).toBe('DOWN');
            expect(readiness.checks.hung.error).toContain('timed out after 50ms');
        });

        test('should return DOWN and overall status DOWN when a critical check fails', async () => {
            const registry = new HealthCheckRegistry();
            registry.register('db', async () => ({
                status: 'DOWN',
                error: 'DB Connection Error'
            }), true);

            const readiness = await registry.checkReadiness();
            expect(readiness.status).toBe('DOWN');
            expect(readiness.checks.db.status).toBe('DOWN');
            expect(readiness.checks.db.error).toBe('DB Connection Error');
        });

        test('should return DEGRADED when non-critical check is DOWN or DEGRADED', async () => {
            const registry = new HealthCheckRegistry();
            registry.register('cache', async () => ({
                status: 'DOWN',
                error: 'Cache connection dropped'
            }), false); // non-critical

            const readiness = await registry.checkReadiness();
            // Overall status MUST be DEGRADED (not UP and not DOWN)
            expect(readiness.status).toBe('DEGRADED');
            expect(readiness.checks.cache.status).toBe('DOWN');

            // Verify HTTP handler returns 200 for DEGRADED
            const routes = new HealthRoutes(registry);
            const mockRes: any = {
                statusCode: 200,
                status: function(code: number) { this.statusCode = code; return this; },
                json: function(data: any) { this.body = data; return this; }
            };
            await (routes as any).getReadinessCustomHandler({}, mockRes);
            expect(mockRes.statusCode).toBe(200);
            expect(mockRes.body.status).toBe('DEGRADED');
        });

        test('should validate timeoutMs parameter and throw on invalid values', () => {
            const registry = new HealthCheckRegistry();
            const dummyIndicator = async () => ({ status: 'UP' as const });

            expect(() => registry.register('t1', dummyIndicator, true, 0)).toThrow("Invalid timeoutMs '0': Must be a positive finite number.");
            expect(() => registry.register('t2', dummyIndicator, true, -500)).toThrow("Invalid timeoutMs '-500': Must be a positive finite number.");
            expect(() => registry.register('t3', dummyIndicator, true, NaN)).toThrow("Invalid timeoutMs 'NaN': Must be a positive finite number.");
            expect(() => registry.register('t4', dummyIndicator, true, Infinity)).toThrow("Invalid timeoutMs 'Infinity': Must be a positive finite number.");
        });

        test('should omit details and sanitize error strings in production mode', async () => {
            const oldEnv = process.env.NODE_ENV;
            process.env.NODE_ENV = 'production';

            const registry = new HealthCheckRegistry();
            registry.register('redis', async () => ({
                status: 'DOWN',
                error: 'Secret stack trace with Authorization: Bearer abc123secret and dsn=redis://user:pass@127.0.0.1:6379',
                details: {
                    host: '127.0.0.1',
                    password: 'secretpass',
                    token: 'bearer-token'
                }
            }));

            const readiness = await registry.checkReadiness();
            expect(readiness.status).toBe('DOWN');
            expect(readiness.checks.redis.error).toBe('Health check failed');
            expect(readiness.checks.redis.details).toBeUndefined();

            process.env.NODE_ENV = oldEnv;
        });

        test('should register custom health check on BaseServer and expose HealthRoutes', async () => {
            const server = new TestServer();
            ((server as any).healthRegistry as HealthCheckRegistry).register('custom', async () => ({ status: 'UP' }));

            const registry = (server as any).healthRegistry as HealthCheckRegistry;
            expect(registry.getRegisteredNames()).toContain('system');
            expect(registry.getRegisteredNames()).toContain('custom');

            const routes = new HealthRoutes(registry);
            const mockReq: any = {};
            const mockRes: any = {
                statusCode: 200,
                status: function(code: number) { this.statusCode = code; return this; },
                json: function(data: any) { this.body = data; return this; }
            };

            await (routes as any).getReadinessCustomHandler(mockReq, mockRes);
            expect(mockRes.statusCode).toBe(200);
            expect(mockRes.body.status).toBe('UP');
            expect(mockRes.body.checks.custom.status).toBe('UP');
        });
    });
});
