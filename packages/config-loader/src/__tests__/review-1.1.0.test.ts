import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import BaseLoader, { LocalFileLoader, getLoader, loadConfig } from '../index';

jest.mock('nacos');
jest.mock('consul');

let tmp: string;
let cwd: string;

beforeAll(() => {
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cfg2-')));
    fs.mkdirSync(path.join(tmp, 'config'));
    fs.mkdirSync(path.join(tmp, 'custom-config'));
    fs.writeFileSync(path.join(tmp, 'config', 'app.yaml'), 'name: "#{service-name}"\nport: 8080\n');
    fs.writeFileSync(path.join(tmp, 'config', 'logger.yaml'), 'file: "#{service-name}.log"\n');
    fs.writeFileSync(path.join(tmp, 'custom-config', 'app.yaml'), 'from: custom\n');
    cwd = process.cwd();
    process.chdir(tmp);
});
afterAll(() => {
    process.chdir(cwd);
    fs.rmSync(tmp, { recursive: true, force: true });
});

describe('LocalFileLoader root directory', () => {
    const saved = process.env.CONFIG_DIR;
    afterEach(() => {
        if (saved === undefined) delete process.env.CONFIG_DIR;
        else process.env.CONFIG_DIR = saved;
    });

    it('defaults to ./config', async () => {
        delete process.env.CONFIG_DIR;
        expect(await new LocalFileLoader().load('app.yaml')).toMatchObject({ port: 8080 });
    });

    // Kubernetes mounts a ConfigMap wherever it likes; a monorepo may share one
    // config directory across packages. The root used to be hardcoded.
    it('accepts a constructor argument', async () => {
        const loader = new LocalFileLoader(path.join(tmp, 'custom-config'));
        expect(await loader.load('app.yaml')).toEqual({ from: 'custom' });
    });

    it('falls back to CONFIG_DIR', async () => {
        process.env.CONFIG_DIR = path.join(tmp, 'custom-config');
        expect(await new LocalFileLoader().load('app.yaml')).toEqual({ from: 'custom' });
    });

    it('prefers the constructor argument over CONFIG_DIR', async () => {
        process.env.CONFIG_DIR = path.join(tmp, 'custom-config');
        expect(await new LocalFileLoader('config').load('app.yaml')).toMatchObject({ port: 8080 });
    });

    it('resolves a relative argument against the cwd', async () => {
        expect(await new LocalFileLoader('custom-config').load('app.yaml')).toEqual({ from: 'custom' });
    });

    it('still rejects a path that escapes the configured root', async () => {
        const loader = new LocalFileLoader(path.join(tmp, 'custom-config'));
        await expect(loader.load('../config/app.yaml')).rejects.toThrow(/traversal/i);
    });
});

describe('loadConfig post-processing', () => {
    const substitute = (content: string) => content.replace(/#\{service-name\}/g, 'billing');

    // The 4th argument only ever reached the logger file, while the README's
    // example implied it transformed the application config.
    it('applies the 5th argument to the application config', async () => {
        const { appConf, loggerConf } = await loadConfig('local', 'app.yaml', 'logger.yaml', substitute, substitute);
        expect(appConf.name).toBe('billing');
        expect(loggerConf.file).toBe('billing.log');
    });

    it('leaves the application config untouched when only the 4th is given', async () => {
        const { appConf, loggerConf } = await loadConfig('local', 'app.yaml', 'logger.yaml', substitute);
        expect(appConf.name).toBe('#{service-name}');
        expect(loggerConf.file).toBe('billing.log');
    });

    it('works with neither', async () => {
        const { appConf } = await loadConfig('local', 'app.yaml', 'logger.yaml');
        expect(appConf.name).toBe('#{service-name}');
    });
});

describe('loader lifecycle', () => {
    it('BaseLoader exposes a no-op close()', async () => {
        const loader = await getLoader('local');
        expect(loader).toBeInstanceOf(BaseLoader);
        await expect(loader.close()).resolves.toBeUndefined();
    });

    // NacosConfigClient keeps heartbeats and a cluster process alive; without an
    // explicit close the Node process cannot exit.
    it('NacosConfigLoader.close() closes the underlying client', async () => {
        process.env.NACOS_SERVER_ADDR = '127.0.0.1:8848';
        const { default: NacosConfigLoader } = await import('../lib/nacos/NacosConfigLoader');
        const loader = new NacosConfigLoader();

        const client = (loader as unknown as { client: { close?: jest.Mock } }).client;
        client.close = jest.fn().mockResolvedValue(undefined);

        await loader.close();
        expect(client.close).toHaveBeenCalled();
        delete process.env.NACOS_SERVER_ADDR;
    });

    it('loadConfig releases the loader when it is done', async () => {
        const spy = jest.spyOn(BaseLoader.prototype, 'close');
        await loadConfig('local', 'app.yaml', 'logger.yaml');
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });

    it('releases the loader even when a file is missing', async () => {
        const spy = jest.spyOn(BaseLoader.prototype, 'close');
        await expect(loadConfig('local', 'nope.yaml', 'logger.yaml')).rejects.toThrow();
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });
});

describe('read failures carry context', () => {
    // A bare ENOENT says nothing about which source or which file.
    it('names the file and the loader', async () => {
        await expect(new LocalFileLoader().load('missing.yaml'))
            .rejects.toThrow(/Failed to read configuration 'missing.yaml' via LocalFileLoader/);
    });

    it('keeps the original error as the cause', async () => {
        const err = await new LocalFileLoader().load('missing.yaml').catch((e: Error) => e);
        expect((err as Error & { cause?: NodeJS.ErrnoException }).cause?.code).toBe('ENOENT');
    });

    it('still reports a YAML parse failure with the file name', async () => {
        fs.writeFileSync(path.join(tmp, 'config', 'broken.yaml'), 'a:\n  - b\n c: bad indent\n');
        await expect(new LocalFileLoader().load('broken.yaml'))
            .rejects.toThrow(/broken\.yaml/);
    });
});

describe('package entry point', () => {
    // LocalFileLoader needs no optional peer, so it is exported directly;
    // consul / nacos stay behind getLoader's dynamic import.
    it('exports LocalFileLoader directly', () => {
        expect(typeof LocalFileLoader).toBe('function');
        expect(new LocalFileLoader()).toBeInstanceOf(BaseLoader);
    });
});
