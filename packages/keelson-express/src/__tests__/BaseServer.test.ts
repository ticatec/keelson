import { setLoggerProvider, resetLoggerProvider } from '@ticatec/logger-api';
import type { Logger } from '@ticatec/logger-api';
import http from 'http';
import net from 'net';

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
import { probeHealth } from '../health/HealthProbe.js';
import { parseListenPort } from '../Port.js';
import BaseServer from '../BaseServer.js';
import LoggedUser, {
    CommonUser,
    getEffectiveUser,
    getLoggedUser,
    getRealUser,
    isImpersonating
} from '../LoggedUser.js';
import { HealthCheckRegistry } from '../health/HealthCheckRegistry.js';
import { createSystemHealthIndicator } from '../health/BuiltinHealthIndicators.js';
import { HealthRoutes } from '../health/HealthRoutes.js';
import { StringValidator, NumberValidator } from '@ticatec/bean-validator';
import { UnauthenticatedError } from '@ticatec/node-exception';

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
        return { ip: '127.0.0.1', contextRoot: '/api' };
    }
    protected getPort(): number {
        return this.listenPort;
    }
    protected async setupRoutes(): Promise<void> {
        await this.bindRoutes('/slow', async () => ({ default: SlowRoutes }));
    }
}

/**
 * Races a promise against a deadline and **clears the timer** when the promise wins.
 *
 * 裸写 `Promise.race([p, new Promise((_, r) => setTimeout(r, 5000))])` 的问题是：
 * p 先完成时那个 setTimeout 没人清，它会把事件循环多撑 5 秒，于是 Jest 打出
 * "Jest did not exit one second after the test run has completed"。
 */
const withDeadline = async <T>(promise: Promise<T>, ms: number, message: string): Promise<T> => {
    let timer: NodeJS.Timeout | undefined;
    try {
        return await Promise.race([
            promise,
            new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new Error(message)), ms);
            })
        ]);
    } finally {
        if (timer) {
            clearTimeout(timer);
        }
    }
};

/** Polls until `condition` holds, so a test waits on the event rather than on a guessed delay. */
const waitFor = async (condition: () => boolean, timeoutMs: number = 3000): Promise<void> => {
    const deadline = Date.now() + timeoutMs;
    while (!condition()) {
        if (Date.now() > deadline) {
            throw new Error('Timed out waiting for the expected condition');
        }
        await new Promise(resolve => setTimeout(resolve, 10));
    }
};

class TestServer extends BaseServer {
    public listenPort: number = 0;
    public failPostCreate: boolean = false;

    constructor() {
        super();
    }

    protected async loadConfigFile(): Promise<void> {}
    protected getWebConf() {
        return { ip: '127.0.0.1', contextRoot: '/api' };
    }
    protected getPort(): number {
        return this.listenPort;
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

    test('should start on a dynamic port and shutdown server gracefully', async () => {
        const server = new TestServer();
        server.listenPort = 0; // Dynamic port

        await server.startup();

        const address = (server as any).httpServer.address();
        expect(address.port).toBeGreaterThan(0);

        await server.shutdown();
        expect((server as any).httpServer).toBeNull();
    });

    describe('health probe', () => {
        test('probeHealth treats a 2xx answer from /health/live as healthy', async () => {
            const server = new TestServer();
            server.listenPort = 0;
            await server.startup();
            try {
                const port = (server as any).httpServer.address().port as number;
                expect(await probeHealth({ port })).toEqual({ ok: true, statusCode: 200 });
            } finally {
                await server.shutdown();
            }
        });

        test('probeHealth treats a missing health endpoint (404) as unhealthy, not as alive', async () => {
            const server = new TestServer();
            server.listenPort = 0;
            await server.startup();
            try {
                const port = (server as any).httpServer.address().port as number;
                const result = await probeHealth({ port, path: '/health-check' });
                expect(result.ok).toBe(false);
                expect(result.statusCode).toBe(404);
            } finally {
                await server.shutdown();
            }
        });

        test('probeHealth reports a refused connection as unhealthy', async () => {
            const probe = http.createServer();
            await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve));
            const port = (probe.address() as net.AddressInfo).port;
            await new Promise<void>(resolve => probe.close(() => resolve()));
            const result = await probeHealth({ port });
            expect(result.ok).toBe(false);
            expect(result.error).toBeDefined();
        });

        test('probeHealth gives up on a server that never answers instead of hanging', async () => {
            const silent = http.createServer(() => { /* never respond */ });
            await new Promise<void>(resolve => silent.listen(0, '127.0.0.1', resolve));
            const port = (silent.address() as net.AddressInfo).port;
            try {
                const started = Date.now();
                const result = await probeHealth({ port, timeoutMs: 100 });
                expect(result.ok).toBe(false);
                expect(result.error).toMatch(/Timed out/);
                expect(Date.now() - started).toBeLessThan(2000);
            } finally {
                silent.closeAllConnections?.();
                await new Promise<void>(resolve => silent.close(() => resolve()));
            }
        });

        test('parseListenPort is the one rule shared by the server and the health check', () => {
            expect(parseListenPort(undefined)).toBe(80);
            expect(parseListenPort('  ')).toBe(80);
            expect(parseListenPort('8123')).toBe(8123);
            expect(parseListenPort('0')).toBe(0);
            for (const bad of ['abc', '80.5', '-1', '65536']) {
                expect(() => parseListenPort(bad)).toThrow(/Invalid PORT/);
            }
        });
    });

    describe('listening port from the PORT environment variable', () => {
        class EnvPortServer extends BaseServer {
            protected async loadConfigFile(): Promise<void> {}
            protected getWebConf() { return { ip: '127.0.0.1', contextRoot: '/api' }; }
            protected async setupRoutes(): Promise<void> {}
            public resolvePort(): number { return this.getPort(); }
            public constructor() { super(); }
        }
        const saved = process.env.PORT;
        afterEach(() => {
            if (saved === undefined) { delete process.env.PORT; } else { process.env.PORT = saved; }
        });

        test('defaults to 80 when PORT is unset or empty', () => {
            delete process.env.PORT;
            expect(new EnvPortServer().resolvePort()).toBe(80);
            process.env.PORT = '  ';
            expect(new EnvPortServer().resolvePort()).toBe(80);
        });

        test('reads the port from PORT', () => {
            process.env.PORT = '8123';
            expect(new EnvPortServer().resolvePort()).toBe(8123);
            process.env.PORT = '0';
            expect(new EnvPortServer().resolvePort()).toBe(0);
        });

        test('rejects a PORT that is not a valid port instead of falling back to 80', () => {
            for (const bad of ['abc', '80.5', '-1', '65536', '8080x']) {
                process.env.PORT = bad;
                expect(() => new EnvPortServer().resolvePort()).toThrow(/Invalid PORT/);
            }
        });

        test('a server binds the port named by PORT and ignores a port in getWebConf()', async () => {
            process.env.PORT = '0';
            class Conf extends EnvPortServer {
                protected getWebConf() { return { port: 1, ip: '127.0.0.1', contextRoot: '/api' }; }
            }
            const server = new Conf();
            await server.startup();
            try {
                expect((server as any).httpServer.address().port).toBeGreaterThan(1);
            } finally {
                await server.shutdown();
            }
        });
    });


    test('shutdown lets an in-flight request finish and does not truncate it', async () => {
        const server = new SlowServer();
        server.listenPort = 0;
        await server.startup();
        const port = (server as any).httpServer.address().port as number;

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

        const body = await withDeadline(responded, 5000, 'in-flight request was cut off by shutdown');
        expect(body).toContain('"done":true');

        await withDeadline(shutdown, 5000, 'shutdown() never resolved');
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
    });

    test('should reject startup if port is invalid or occupied', async () => {
        const server = new TestServer();
        server.listenPort = -1; // Invalid port

        await expect(server.startup()).rejects.toThrow();
    });

    test('BaseServer.startup() reports a failed startup as an exit code, not an unhandled rejection', async () => {
        const errors: Array<any> = [];
        setLoggerProvider(() => ({ ...SILENT, error: (...args: Array<any>) => { errors.push(args); } } as any));

        // 静态 startup() 是 void 的：没有调用方能 await 它，也就没人处理它的拒绝。
        // catch 里若 rethrow，异常会变成 unhandled rejection——Node 15 起默认直接
        // 终止进程，启动失败时拿到的是一段裸栈而不是一条日志，process.exitCode
        // 也会被崩溃的退出码覆盖。这条断言守的就是这个。
        const unhandled: Array<any> = [];
        const onUnhandled = (reason: any) => { unhandled.push(reason); };
        process.on('unhandledRejection', onUnhandled);

        const previousExitCode = process.exitCode;
        try {
            const server = new TestServer();
            server.listenPort = -1;
            process.exitCode = 0;

            expect(BaseServer.startup(server)).toBeUndefined();

            // 等错误日志出现，而不是猜一个 sleep 时长
            await waitFor(() => errors.length > 0);
            // 再多放几轮微任务，让本会变成 unhandled 的拒绝有机会冒出来
            await new Promise(resolve => setImmediate(resolve));
            await new Promise(resolve => setImmediate(resolve));

            expect(process.exitCode).toBe(1);
            expect(unhandled).toHaveLength(0);

            // 失败只记一次：实例的 startup() 记，静态的只负责置退出码
            const startupFailures = errors.filter(e => String(e[1]).includes('Startup failed'));
            expect(startupFailures).toHaveLength(1);
            // 传的是 Error 本身而不是 {err}，message 与 stack 才留得住。
            // 这里不用 toBeInstanceOf：错误由 Node 内部构造，与测试所在的 realm
            // 不是同一个 Error，instanceof 会失败——要断言的本来也是内容还在。
            const logged = startupFailures[0][0];
            expect(typeof logged.message).toBe('string');
            expect(logged.message).toContain('port');
            expect(typeof logged.stack).toBe('string');
        } finally {
            process.off('unhandledRejection', onUnhandled);
            process.exitCode = previousExitCode;
            setLoggerProvider(() => SILENT);
        }
    });

    test('BaseServer.startup() logs once on success and leaves the exit code alone', async () => {
        const infos: Array<any> = [];
        setLoggerProvider(() => ({ ...SILENT, info: (...args: Array<any>) => { infos.push(args); } } as any));

        const previousExitCode = process.exitCode;
        const server = new TestServer();
        server.listenPort = 0;
        try {
            process.exitCode = 0;
            BaseServer.startup(server);

            await waitFor(() => infos.some(e => String(e[1]) === 'Server started'));
            expect(process.exitCode).toBe(0);
        } finally {
            await server.shutdown();
            process.exitCode = previousExitCode;
            setLoggerProvider(() => SILENT);
        }
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
            public getEffective(req: any) {
                return this.getEffectiveUser(req);
            }
            public getReal(req: any) {
                return this.getRealUser(req);
            }
            public checkImpersonating(req: any) {
                return this.isImpersonating(req);
            }
        }

        test('should allow custom user structures extending CommonUser and LoggedUser', () => {
            const basicUser: CommonUser = {};
            expect(basicUser).toBeDefined();

            // Option A: impersonatedUser
            const loggedUserWithImpersonation: LoggedUser = {
                impersonatedUser: {
                    targetId: 'target-123'
                } as any
            };
            expect(loggedUserWithImpersonation.impersonatedUser).toBeDefined();

            const appUser: AppUser = {
                userId: 'usr-001',
                userName: 'Alice',
                role: 'admin',
                impersonatedUser: {
                    userId: 'usr-002',
                    userName: 'ImpersonatedBob'
                } as any
            };
            expect(appUser.userId).toBe('usr-001');
            expect((appUser.impersonatedUser as any).userId).toBe('usr-002');
        });

        test('should allow pure Controller without service or getLoggedUser for public APIs', () => {
            class PublicPingController extends Controller {
                constructor() {
                    super();
                }
                public ping() {
                    return 'pong';
                }
                public checkLogger() {
                    return this.logger;
                }
            }

            const pingCtrl = new PublicPingController();
            expect(pingCtrl.ping()).toBe('pong');
            expect(pingCtrl.checkLogger()).toBeDefined();
            // getLoggedUser is not on Controller
            expect((pingCtrl as any).getLoggedUser).toBeUndefined();
            expect((pingCtrl as any).getEffectiveUser).toBeUndefined();
        });

        test('should support specific user generic on BaseController and return strongly-typed user', () => {
            class SpecificAdminController extends BaseController<MockService, AppUser> {
                constructor(service: MockService) {
                    super(service);
                }
                public getUserRole(req: any): string | undefined {
                    const user = this.getEffectiveUser(req);
                    return user?.role;
                }
            }

            const adminCtrl = new SpecificAdminController(new MockService());
            const reqWithAdmin: any = {
                user: { userId: 'admin-1', role: 'SUPER_ADMIN' }
            };
            expect(adminCtrl.getUserRole(reqWithAdmin)).toBe('SUPER_ADMIN');
        });

        test('should handle impersonatedUser, real user and impersonating status correctly', () => {
            const ctrl = new UserTestController(new MockService());

            // 1. With impersonatedUser
            const impersonatedReq: any = {
                user: {
                    userId: 'admin-1',
                    name: 'Admin Operator',
                    impersonatedUser: { userId: 'tenant-user-2', name: 'Impersonated User' }
                }
            };
            expect(ctrl.getEffective(impersonatedReq)).toEqual({ userId: 'tenant-user-2', name: 'Impersonated User' });
            expect(ctrl.getDirectUser(impersonatedReq)).toEqual({ userId: 'tenant-user-2', name: 'Impersonated User' });
            expect(ctrl.getReal(impersonatedReq)).toEqual(impersonatedReq.user);
            expect(ctrl.checkImpersonating(impersonatedReq)).toBe(true);

            // Also check routerHelper helpers and standalone LoggedUser functions
            expect(routerHelper.getEffectiveUser(impersonatedReq)).toEqual({ userId: 'tenant-user-2', name: 'Impersonated User' });
            expect(routerHelper.getRealUser(impersonatedReq)).toEqual(impersonatedReq.user);
            expect(getEffectiveUser(impersonatedReq)).toEqual({ userId: 'tenant-user-2', name: 'Impersonated User' });
            expect(getLoggedUser(impersonatedReq)).toEqual({ userId: 'tenant-user-2', name: 'Impersonated User' });
            expect(getRealUser(impersonatedReq)).toEqual(impersonatedReq.user);
            expect(isImpersonating(impersonatedReq)).toBe(true);

            // 2. Direct user without impersonation
            const directReq: any = {
                user: { userId: 'normal-user-1', name: 'Direct User' }
            };
            expect(ctrl.getEffective(directReq)).toEqual(directReq.user);
            expect(ctrl.getDirectUser(directReq)).toEqual(directReq.user);
            expect(ctrl.getReal(directReq)).toEqual(directReq.user);
            expect(ctrl.checkImpersonating(directReq)).toBe(false);
            expect(routerHelper.isImpersonating(directReq)).toBe(false);

            // 3. No logged in user (anonymous)
            const anonReq: any = {};
            expect(ctrl.getEffective(anonReq)).toBeUndefined();
            expect(ctrl.getDirectUser(anonReq)).toBeUndefined();
            expect(ctrl.getReal(anonReq)).toBeUndefined();
            expect(ctrl.checkImpersonating(anonReq)).toBe(false);
            expect(routerHelper.isImpersonating(anonReq)).toBe(false);
        });

        test('should ignore obsolete actAs field and not treat as impersonation', async () => {
            const rawUser = {
                userId: 'admin-root',
                actAs: { userId: 'client-user' }
            };
            const req: any = {
                headers: {
                    user: encodeURIComponent(JSON.stringify(rawUser))
                }
            };
            const next = jest.fn();
            await routerHelper.retrieveUser()(req, {} as any, next);

            expect(next).toHaveBeenCalled();
            expect(req.user.userId).toBe('admin-root');
            expect(req.user.impersonatedUser).toBeUndefined();
            expect(getEffectiveUser(req)).toEqual(req.user);
            expect(isImpersonating(req)).toBe(false);
        });

        test('should decode user header and inject x-language into user and impersonatedUser', async () => {
            const rawUser = {
                userId: 'admin-root',
                impersonatedUser: { userId: 'client-user' }
            };
            const req: any = {
                headers: {
                    user: encodeURIComponent(JSON.stringify(rawUser)),
                    'x-language': 'zh-CN'
                }
            };
            const next = jest.fn();
            await routerHelper.retrieveUser()(req, {} as any, next);

            expect(next).toHaveBeenCalled();
            expect(req.user.userId).toBe('admin-root');
            expect(req.user.language).toBe('zh-CN');
            expect(req.user.impersonatedUser.userId).toBe('client-user');
            expect(req.user.impersonatedUser.language).toBe('zh-CN');
        });

        test('should validate impersonatedUser in CommonRoutes when impersonating', async () => {
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
                    impersonatedUser: { userId: 'allowed-tenant-user' }
                }
            };
            const nextFn = jest.fn();
            await validationLayer.handle(mockReq, {}, nextFn);

            expect(validatedUser).toEqual({ userId: 'allowed-tenant-user' });
            expect(nextFn).toHaveBeenCalledWith();
        });

        test('should support custom user generic on CommonRoutes and AuthenticatedRoutes', async () => {
            interface CustomCommonUser extends CommonUser {
                customId: string;
                level: number;
            }

            class CustomCommonRoutes extends CommonRoutes<CustomCommonUser> {
                public directGetUser(req: any): CustomCommonUser {
                    return this.getLoggedUser(req);
                }

                protected override isValidUser(user: CustomCommonUser): boolean {
                    return user.level > 1;
                }

                protected bindRoutes() {}
            }

            class CustomAuthRoutes extends AuthenticatedRoutes<CustomCommonUser> {
                public directGetUser(req: any): CustomCommonUser {
                    return this.getLoggedUser(req);
                }

                protected bindRoutes() {}
            }

            const routes = new CustomCommonRoutes();
            const authRoutes = new CustomAuthRoutes();

            const req: any = {
                user: {
                    customId: 'c-1',
                    level: 2
                }
            };

            expect(routes.directGetUser(req)).toEqual({ customId: 'c-1', level: 2 });
            expect(await (routes as any).isValidUser(req.user)).toBe(true);
            expect(await (routes as any).isValidUser({ customId: 'c-2', level: 0 })).toBe(false);

            expect(await (authRoutes as any).isValidUser(null)).toBe(false);
            expect(await (authRoutes as any).isValidUser(req.user)).toBe(true);
        });

        test('should support routerHelper getLoggedUser and invokeRestfulAction with custom user generic', async () => {
            interface OmniCubeUser extends CommonUser {
                id: string;
                organization?: { id: string; name: string } | null;
            }

            const req: any = {
                user: {
                    id: 'cube-001',
                    organization: { id: 'org-1', name: 'Ticatec' }
                }
            };

            // 1. routerHelper.getLoggedUser with generic
            const extractedCubeUser = routerHelper.getLoggedUser<OmniCubeUser>(req);
            expect(extractedCubeUser.id).toBe('cube-001');
            expect(extractedCubeUser.organization?.name).toBe('Ticatec');

            // 2. routerHelper.invokeRestfulAction passes typed user
            let handlerPassedUser: OmniCubeUser | undefined = undefined;
            const res: any = {
                json: jest.fn(),
                status: jest.fn().mockReturnThis(),
                send: jest.fn()
            };
            const next = jest.fn();

            const action = routerHelper.invokeRestfulAction<OmniCubeUser>(async (_req, user) => {
                handlerPassedUser = user;
                return { success: true, userId: user?.id };
            });

            await action(req, res, next);
            expect(handlerPassedUser).toEqual(req.user);
            expect(res.json).toHaveBeenCalledWith({ success: true, userId: 'cube-001' });
        });
        test('CommonRoutes.invokeRestfulAction and invokeController receive the effective user typed by the route group', async () => {
            interface CubeUser extends CommonUser { id: string }

            const captured: any = {};
            class CubeRoutes extends AuthenticatedRoutes<CubeUser> {
                public restful = this.invokeRestfulAction(async (_req, user) => {
                    captured.restful = user;
                    return { id: user?.id };
                });
                public controller = this.invokeController(async (_req, res, user) => {
                    captured.controller = user;
                    res.json({ id: user?.id });
                });
            }
            const routes = new CubeRoutes();
            const req: any = { user: { id: 'real', impersonatedUser: { id: 'target' } } };
            const res: any = { json: jest.fn(), status: jest.fn().mockReturnThis(), send: jest.fn() };

            await routes.restful(req, res, jest.fn());
            expect(captured.restful).toEqual({ id: 'target' });
            expect(res.json).toHaveBeenCalledWith({ id: 'target' });

            res.json.mockClear();
            await routes.controller(req, res, jest.fn());
            expect(captured.controller).toEqual({ id: 'target' });
            expect(res.json).toHaveBeenCalledWith({ id: 'target' });
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
                    user: encodeURIComponent(JSON.stringify({ accountCode: 'U1', impersonatedUser: { accountCode: 'U2' } })),
                    'x-language': 'zh-CN'
                }
            };
            await runResolver(req);
            expect(req.user.accountCode).toBe('U1');
            expect(req.user.language).toBe('zh-CN');
            expect(req.user.impersonatedUser.language).toBe('zh-CN');
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

        test('AuthenticatedRoutes rejects a request the resolver left anonymous', async () => {
            class TestAuthRoutes extends AuthenticatedRoutes {
                protected bindRoutes() {
                    this.get('/profile', async (_req) => ({ ok: true }));
                }
            }
            const app: any = { use: jest.fn() };
            const routes = new TestAuthRoutes();
            await routes.bind(app, '/test');

            const routerInstance = app.use.mock.calls[0][1];
            const validationLayer = routerInstance.stack.find((layer: any) => layer.handle && layer.handle.length === 3);

            const mockReq: any = { user: undefined };
            const nextFn = jest.fn();
            await validationLayer.handle(mockReq, {}, nextFn);

            expect(nextFn).toHaveBeenCalledWith(expect.any(UnauthenticatedError));
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
            server.registerHealthCheck('custom', async () => ({ status: 'UP' }));

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

        test('registerHealthCheck is the public API the README documents', async () => {
            // 两份 README 的核心示例一直是 this.registerHealthCheck(...)，而这个方法
            // 此前不存在——照文档抄会编译不过，连本用例自己都只能强转到私有的
            // healthRegistry 上绕过去。
            const server = new TestServer();

            server.registerHealthCheck('database', async () => ({ status: 'UP', details: { latencyMs: 5 } }));
            server.registerHealthCheck('redis', async () => ({ status: 'DOWN' }), false);

            const registry = (server as any).healthRegistry as HealthCheckRegistry;
            expect(registry.getRegisteredNames()).toEqual(expect.arrayContaining(['system', 'database', 'redis']));

            // 非关键组件 DOWN 只降级，不把整体判成 DOWN
            const readiness = await registry.checkReadiness();
            expect(readiness.status).toBe('DEGRADED');
            expect(readiness.checks.database.status).toBe('UP');

            server.unregisterHealthCheck('redis');
            expect(registry.getRegisteredNames()).not.toContain('redis');
            expect((await registry.checkReadiness()).status).toBe('UP');
        });

        test('registerHealthCheck rejects an invalid timeout the same way the registry does', () => {
            const server = new TestServer();
            expect(() => server.registerHealthCheck('x', async () => ({ status: 'UP' }), true, 0))
                .toThrow(/Invalid timeoutMs/);
        });
    });
});
