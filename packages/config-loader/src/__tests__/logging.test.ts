import { setLoggerProvider, resetLoggerProvider } from '@ticatec/logger-api';
import type { Logger } from '@ticatec/logger-api';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { getLoader, loadConfig } from '../lib/BaseLoader';
import LocalFileLoader from '../lib/local-file/LocalFileLoader';

type Rec = { level: string; ctx: unknown; msg?: string };
const records: Rec[] = [];
const capture = (level: string) => (a: unknown, b?: string) => {
    records.push({ level, ctx: a, msg: b });
};
const spy: Logger = {
    trace: capture('trace'), debug: capture('debug'), info: capture('info'),
    warn: capture('warn'), error: capture('error')
} as Logger;
const find = (fragment: string) => records.find((r) => (r.msg ?? '').includes(fragment));
const all = (fragment: string) => records.filter((r) => (r.msg ?? '').includes(fragment));

const SECRET = 'sup3r-s3cret-db-password';
let tmp: string;
let cwd: string;

beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-'));
    fs.mkdirSync(path.join(tmp, 'config'));
    fs.writeFileSync(path.join(tmp, 'config', 'db.yaml'), `user: devuser\npassword: ${SECRET}\nport: 5432\n`);
    fs.writeFileSync(path.join(tmp, 'config', 'app.yaml'),
        `includes:\n  - file: db.yaml\n    key: database\nname: demo\n`);
    fs.writeFileSync(path.join(tmp, 'config', 'empty.yaml'), '');
    fs.writeFileSync(path.join(tmp, 'config', 'logger.yaml'), 'level: info\n');
    cwd = process.cwd();
    process.chdir(tmp);
});
afterAll(() => {
    process.chdir(cwd);
    fs.rmSync(tmp, { recursive: true, force: true });
});

beforeEach(() => {
    records.length = 0;
    resetLoggerProvider();
    setLoggerProvider(() => spy);
});
afterEach(() => resetLoggerProvider());

describe('configuration loading is observable without leaking config', () => {
    // Configuration files hold database passwords and API keys. Names and shape
    // are safe to log; content never is.
    it('never writes configuration values into the log', async () => {
        const loader = new LocalFileLoader();
        const config = await loader.load('db.yaml');

        expect(config.password).toBe(SECRET);
        expect(JSON.stringify(records)).not.toContain(SECRET);
        expect(JSON.stringify(records)).not.toContain('devuser');
    });

    it('records the file, the source and the top-level key count', async () => {
        await new LocalFileLoader().load('db.yaml');

        const rec = find('Configuration loaded')!;
        expect(rec).toBeDefined();
        expect(rec.level).toBe('debug');
        expect(rec.ctx).toMatchObject({ file: 'db.yaml', source: 'LocalFileLoader', keys: 3 });
        expect(typeof (rec.ctx as { ms: number }).ms).toBe('number');
    });

    it('traces include resolution, which is otherwise opaque', async () => {
        await new LocalFileLoader().load('app.yaml');

        const rec = find('Resolving include')!;
        expect(rec).toBeDefined();
        expect(rec.level).toBe('debug');
        expect(rec.ctx).toEqual({ parent: 'app.yaml', include: 'db.yaml', key: 'database' });

        // One summary per load() call, plus one trace per include - not one
        // summary per file, which would make a deep include tree unreadable.
        expect(all('Configuration loaded')).toHaveLength(1);
        expect(all('Configuration loaded')[0].ctx).toMatchObject({ file: 'app.yaml', keys: 2 });
    });

    // load() returns null rather than throwing, so an empty source is otherwise silent.
    it('warns when a source returns no content', async () => {
        const config = await new LocalFileLoader().load('empty.yaml');

        expect(config).toBeNull();
        const rec = find('returned no content')!;
        expect(rec.level).toBe('warn');
        expect(rec.ctx).toEqual({ file: 'empty.yaml', source: 'LocalFileLoader' });
    });

    it('warns on a path that escapes the configuration directory', async () => {
        await expect(new LocalFileLoader().load('../../etc/passwd')).rejects.toThrow(/traversal/i);

        const rec = find('escapes the configuration directory')!;
        expect(rec).toBeDefined();
        expect(rec.level).toBe('warn');
        expect(rec.ctx).toMatchObject({ file: '../../etc/passwd' });
    });

    it('reports the resolved configuration directory', () => {
        new LocalFileLoader();
        const rec = find('Resolved local configuration directory')!;
        expect(rec.level).toBe('debug');
        expect((rec.ctx as { root: string }).root).toBe(path.resolve(tmp, 'config'));
    });

    it('reports which loader was selected', async () => {
        await getLoader('local');
        expect(find('Selecting configuration loader')!.ctx).toEqual({ mode: 'local' });
    });

    it('reports the files loadConfig was asked for', async () => {
        await loadConfig('local', 'app.yaml', 'logger.yaml');

        const rec = find('Loading application and logger configuration')!;
        expect(rec.ctx).toEqual({ mode: 'local', configFile: 'app.yaml', logFile: 'logger.yaml' });
        expect(JSON.stringify(records)).not.toContain(SECRET);
    });
});

describe('Consul connection logging', () => {
    const saved = { ...process.env };
    afterEach(() => {
        process.env = { ...saved };
        jest.resetModules();
    });

    // CONSUL_TOKEN is an access credential.
    it('reports whether a token is configured, never the token', async () => {
        process.env.CONSUL_HOST = 'consul.internal';
        process.env.CONSUL_PORT = '8501';
        process.env.CONSUL_SSL = 'true';
        process.env.CONSUL_TOKEN = 'consul-token-DO-NOT-LOG';

        const { default: ConsulLoader } = await import('../lib/consul/ConsulLoader');
        records.length = 0;
        new ConsulLoader();

        const rec = find('Connecting to Consul')!;
        expect(rec).toBeDefined();
        expect(rec.ctx).toEqual({
            host: 'consul.internal', port: 8501, secure: true, authenticated: true
        });
        expect(JSON.stringify(records)).not.toContain('consul-token-DO-NOT-LOG');
    });

    it('reports an unauthenticated connection as such', async () => {
        delete process.env.CONSUL_TOKEN;
        process.env.CONSUL_HOST = 'consul.internal';
        delete process.env.CONSUL_PORT;
        process.env.CONSUL_SSL = 'false';

        const { default: ConsulLoader } = await import('../lib/consul/ConsulLoader');
        records.length = 0;
        new ConsulLoader();

        expect(find('Connecting to Consul')!.ctx).toMatchObject({ authenticated: false, port: 8500 });
    });
});

describe('Nacos connection logging', () => {
    const saved = { ...process.env };
    afterEach(() => {
        process.env = { ...saved };
        jest.resetModules();
    });

    it('reports the target without echoing the whole environment', async () => {
        process.env.NACOS_SERVER_ADDR = '127.0.0.1:8848';
        process.env.NACOS_NAMESPACE = 'prod';
        process.env.NACOS_GROUP = 'services';

        const { default: NacosConfigLoader } = await import('../lib/nacos/NacosConfigLoader');
        records.length = 0;
        new NacosConfigLoader();

        expect(find('Connecting to Nacos')!.ctx).toEqual({
            serverAddr: '127.0.0.1:8848', endpoint: null, namespace: 'prod', group: 'services', ssl: false
        });
    });
});
