import { describe, it, expect, vi } from 'vitest';
import path from 'node:path';
import { createCli } from '../src/cli.js';
import type { PluginManager, PluginHandle, Host } from '../src/context/contract.js';
import type { RegistryClient, Registry, RegistryEntry } from '../src/plugin/registry-client.js';
import type { Installer, InstallResult } from '../src/plugin/installer.js';

type MockFn = ReturnType<typeof vi.fn>;

function makeHandle(over: Partial<PluginHandle> = {}): PluginHandle {
  return {
    manifest: {
      name: 'demo',
      version: '1.0.0',
      description: 'a demo plugin',
      author: 'tester',
      hostCompatibility: '*',
    },
    state: 'enabled',
    path: path.join('plugins', 'demo'),
    ...over,
  };
}

function makeEntry(over: Partial<RegistryEntry> = {}): RegistryEntry {
  return { name: 'demo', version: '1.0.0', repo: 'owner/repo', path: 'plugins/demo', ...over };
}

interface DepsBundle {
  deps: Parameters<typeof createCli>[0];
  fakes: {
    output: MockFn;
    fetchRegistry: MockFn;
    findPlugin: MockFn;
    install: MockFn;
    uninstall: MockFn;
    isInstalled: MockFn;
    load: MockFn;
    activate: MockFn;
    deactivate: MockFn;
    list: MockFn;
    get: MockFn;
    has: MockFn;
    applyPersistedState: MockFn;
    getPersistedState: MockFn;
    start: MockFn;
    stop: MockFn;
  };
}

function makeDeps(over: Partial<{
  registry: Registry;
  handles: PluginHandle[];
  installResult: InstallResult;
}> = {}): DepsBundle {
  const registry: Registry = over.registry ?? { plugins: [makeEntry()] };
  const handles: PluginHandle[] = over.handles ?? [makeHandle()];
  const installResult: InstallResult =
    over.installResult ?? { name: 'demo', version: '1.0.0', strategy: 'release', path: path.join('plugins', 'demo') };

  const output = vi.fn();
  const fetchRegistry = vi.fn().mockResolvedValue(registry);
  const findPlugin = vi.fn().mockImplementation((_reg: Registry, name: string) =>
    registry.plugins.find((p) => p.name === name),
  );
  const registryClient: RegistryClient = { fetchRegistry, findPlugin };

  const install = vi.fn().mockResolvedValue(installResult);
  const uninstall = vi.fn().mockResolvedValue(undefined);
  const isInstalled = vi.fn().mockResolvedValue(false);
  const installer: Installer = { install, uninstall, isInstalled };

  const load = vi.fn().mockImplementation(async (p: string) => {
    const name = path.basename(p);
    return handles.find((h) => h.manifest.name === name) ?? makeHandle({ manifest: { ...makeHandle().manifest, name } });
  });
  const activate = vi.fn().mockResolvedValue(undefined);
  const deactivate = vi.fn().mockResolvedValue(undefined);
  const list = vi.fn().mockReturnValue(handles);
  const get = vi.fn().mockImplementation((n: string) => handles.find((h) => h.manifest.name === n));
  const has = vi.fn().mockImplementation((n: string) => handles.some((h) => h.manifest.name === n));
  const applyPersistedState = vi.fn().mockResolvedValue(undefined);
  const getPersistedState = vi.fn().mockReturnValue({});
  const manager: PluginManager = {
    load, activate, deactivate, list, get, has, applyPersistedState, getPersistedState,
    unload: vi.fn().mockResolvedValue(undefined),
  };

  const start = vi.fn().mockResolvedValue(undefined);
  const stop = vi.fn().mockResolvedValue(undefined);
  const host: Host = {
    name: 's12ryt-base',
    version: '1.0.0',
    getLogger: () => ({ child: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), log: vi.fn() }) as never,
    getConfig: vi.fn(),
    getEventBus: vi.fn(),
    getServices: vi.fn(),
    getLifecycle: vi.fn(),
    getPluginManager: () => manager,
    start,
    stop,
  };

  const deps = {
    registrySource: 'registry.json',
    pluginsDir: 'plugins',
    registryClient,
    installer,
    manager,
    host,
    output,
  };

  return {
    deps,
    fakes: { output, fetchRegistry, findPlugin, install, uninstall, isInstalled, load, activate, deactivate, list, get, has, applyPersistedState, getPersistedState, start, stop },
  };
}

describe('CLI', () => {
  describe('install', () => {
    it('從 registry 拉取後安裝插件並輸出結果', async () => {
      const { deps, fakes } = makeDeps();
      const cli = createCli(deps);
      const code = await cli.run(['install', 'demo', '--yes']);
      expect(code).toBe(0);
      expect(fakes.fetchRegistry).toHaveBeenCalledWith('registry.json');
      expect(fakes.findPlugin).toHaveBeenCalled();
      expect(fakes.install).toHaveBeenCalledWith(expect.objectContaining({ name: 'demo' }), { yes: true });
      expect(fakes.output).toHaveBeenCalled();
      const out = fakes.output.mock.calls.map((c) => c[0]).join('\n');
      expect(out).toContain('demo');
    });

    it('找不到插件時輸出錯誤並回傳非零 exit code', async () => {
      const { deps, fakes } = makeDeps({ registry: { plugins: [] } });
      const cli = createCli(deps);
      const code = await cli.run(['install', 'missing', '--yes']);
      expect(code).not.toBe(0);
      const out = fakes.output.mock.calls.map((c) => c[0]).join('\n');
      expect(out.toLowerCase()).toContain('not found');
      expect(fakes.install).not.toHaveBeenCalled();
    });

    it('無 --yes 時安裝前不跳過確認（installer 自行處理 confirm）', async () => {
      const { deps, fakes } = makeDeps();
      const cli = createCli(deps);
      await cli.run(['install', 'demo']);
      expect(fakes.install).toHaveBeenCalledWith(expect.objectContaining({ name: 'demo' }), { yes: false });
    });
  });

  describe('uninstall', () => {
    it('移除插件並輸出', async () => {
      const { deps, fakes } = makeDeps();
      const cli = createCli(deps);
      const code = await cli.run(['uninstall', 'demo']);
      expect(code).toBe(0);
      expect(fakes.uninstall).toHaveBeenCalledWith('demo');
      expect(fakes.output).toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('列出已載入插件的名稱、版本與狀態', async () => {
      const { deps, fakes } = makeDeps();
      const cli = createCli(deps);
      const code = await cli.run(['list']);
      expect(code).toBe(0);
      const out = fakes.output.mock.calls.map((c) => c[0]).join('\n');
      expect(out).toContain('demo');
      expect(out).toContain('1.0.0');
      expect(out.toLowerCase()).toContain('enabled');
    });

    it('無插件時輸出提示', async () => {
      const { deps, fakes } = makeDeps({ handles: [] });
      const cli = createCli(deps);
      const code = await cli.run(['list']);
      expect(code).toBe(0);
      const out = fakes.output.mock.calls.map((c) => c[0]).join('\n');
      expect(out.length).toBeGreaterThan(0);
    });
  });

  describe('enable', () => {
    it('啟用已載入的插件', async () => {
      const { deps, fakes } = makeDeps({ handles: [makeHandle({ state: 'loaded' })] });
      const cli = createCli(deps);
      const code = await cli.run(['enable', 'demo']);
      expect(code).toBe(0);
      expect(fakes.activate).toHaveBeenCalledWith('demo');
    });

    it('插件不存在時回傳非零', async () => {
      const { deps } = makeDeps({ handles: [] });
      const cli = createCli(deps);
      const code = await cli.run(['enable', 'none']);
      expect(code).not.toBe(0);
    });
  });

  describe('disable', () => {
    it('停用已啟用的插件', async () => {
      const { deps, fakes } = makeDeps();
      const cli = createCli(deps);
      const code = await cli.run(['disable', 'demo']);
      expect(code).toBe(0);
      expect(fakes.deactivate).toHaveBeenCalledWith('demo');
    });
  });

  describe('start', () => {
    it('啟動主機', async () => {
      const { deps, fakes } = makeDeps();
      const cli = createCli(deps);
      const code = await cli.run(['start']);
      expect(code).toBe(0);
      expect(fakes.start).toHaveBeenCalledOnce();
    });
  });

  describe('info', () => {
    it('顯示插件詳情（manifest 欄位、狀態、路徑）', async () => {
      const { deps, fakes } = makeDeps();
      const cli = createCli(deps);
      const code = await cli.run(['info', 'demo']);
      expect(code).toBe(0);
      const out = fakes.output.mock.calls.map((c) => c[0]).join('\n');
      expect(out).toContain('demo');
      expect(out).toContain('a demo plugin');
      expect(out).toContain('tester');
    });

    it('插件不存在時回傳非零', async () => {
      const { deps } = makeDeps({ handles: [] });
      const cli = createCli(deps);
      const code = await cli.run(['info', 'none']);
      expect(code).not.toBe(0);
    });
  });

  describe('update', () => {
    it('指定插件且有新版時先卸載再安裝', async () => {
      const { deps, fakes } = makeDeps({
        registry: { plugins: [makeEntry({ version: '2.0.0' })] },
        handles: [makeHandle({ manifest: { name: 'demo', version: '1.0.0', description: 'd', author: 'a', hostCompatibility: '*' } })],
      });
      const cli = createCli(deps);
      const code = await cli.run(['update', 'demo', '--yes']);
      expect(code).toBe(0);
      expect(fakes.uninstall).toHaveBeenCalledWith('demo');
      expect(fakes.install).toHaveBeenCalledWith(expect.objectContaining({ name: 'demo', version: '2.0.0' }), { yes: true });
    });

    it('已是最新版時輸出提示不安裝', async () => {
      const { deps, fakes } = makeDeps({
        registry: { plugins: [makeEntry({ version: '1.0.0' })] },
        handles: [makeHandle()],
      });
      const cli = createCli(deps);
      const code = await cli.run(['update', 'demo', '--yes']);
      expect(code).toBe(0);
      expect(fakes.uninstall).not.toHaveBeenCalled();
      expect(fakes.install).not.toHaveBeenCalled();
    });
  });

  describe('分派與錯誤處理', () => {
    it('未知指令回傳非零並輸出提示', async () => {
      const { deps, fakes } = makeDeps();
      const cli = createCli(deps);
      const code = await cli.run(['whatever']);
      expect(code).not.toBe(0);
      const out = fakes.output.mock.calls.map((c) => c[0]).join('\n');
      expect(out.toLowerCase()).toContain('unknown');
    });

    it('無指令時輸出可用指令列表', async () => {
      const { deps, fakes } = makeDeps();
      const cli = createCli(deps);
      const code = await cli.run([]);
      expect(code).not.toBe(0);
    });

    it('install 拋錯時回傳非零且輸出錯誤訊息', async () => {
      const { deps, fakes } = makeDeps();
      fakes.install.mockRejectedValue(new Error('disk full'));
      const cli = createCli(deps);
      const code = await cli.run(['install', 'demo', '--yes']);
      expect(code).not.toBe(0);
      const out = fakes.output.mock.calls.map((c) => c[0]).join('\n');
      expect(out).toContain('disk full');
    });
  });
});
