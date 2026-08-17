import { describe, it, expect, vi } from 'vitest';
import path from 'node:path';
import { createHost, type Host } from '../src/host.js';
import type { PluginManager, PluginHandle } from '../src/context/contract.js';
import { createLogger } from '../src/context/logger.js';
import { createEventBus } from '../src/context/eventbus.js';
import { createServiceRegistry } from '../src/context/service-registry.js';
import { createLifecycle, type Lifecycle } from '../src/context/lifecycle.js';
import { createConfig } from '../src/context/config.js';
import * as utils from '../src/utils/index.js';

function makeHandle(name: string): PluginHandle {
  return {
    manifest: { name, version: '1.0.0', description: 'd', author: 'a', hostCompatibility: '*' },
    state: 'loaded',
    plugin: { manifest: { name, version: '1.0.0', description: 'd', author: 'a', hostCompatibility: '*' }, activate: vi.fn() },
    path: path.join('plugins', name),
  };
}

async function makeTestHost(over: { readDir?: ReturnType<typeof vi.fn>; manager?: Partial<PluginManager>; lifecycle?: Lifecycle } = {}) {
  const logger = createLogger({ transport: () => {} });
  const eventBus = createEventBus();
  const services = createServiceRegistry();
  const lifecycle = over.lifecycle ?? createLifecycle();
  const config = await createConfig({ path: 'c.yaml', readFile: vi.fn().mockResolvedValue('') });
  const readDir = over.readDir ?? vi.fn().mockResolvedValue(['a', 'b']);
  const handles: PluginHandle[] = [makeHandle('a'), makeHandle('b')];
  const manager: PluginManager = {
    load: over.manager?.load ?? vi.fn().mockImplementation(async (p: string) => {
      const name = path.basename(p);
      return handles.find((h) => h.manifest.name === name) ?? makeHandle(name);
    }),
    activate: over.manager?.activate ?? vi.fn().mockResolvedValue(undefined),
    deactivate: over.manager?.deactivate ?? vi.fn().mockResolvedValue(undefined),
    unload: over.manager?.unload ?? vi.fn().mockResolvedValue(undefined),
    get: over.manager?.get ?? ((n: string) => handles.find((h) => h.manifest.name === n)),
    list: over.manager?.list ?? (() => handles),
    has: over.manager?.has ?? ((n: string) => handles.some((h) => h.manifest.name === n)),
    applyPersistedState: over.manager?.applyPersistedState ?? vi.fn().mockResolvedValue(undefined),
    getPersistedState: over.manager?.getPersistedState ?? (() => ({})),
  };

  const host = createHost({
    name: 's12ryt-base',
    version: '1.0.0',
    pluginsDir: 'plugins',
    logger,
    config,
    eventBus,
    services,
    lifecycle,
    utils,
    manager,
    readDir,
  });
  return { host, manager, readDir, lifecycle };
}

describe('Host', () => {
  it('getter 回傳各子系統', async () => {
    const { host } = await makeTestHost();
    expect(host.name).toBe('s12ryt-base');
    expect(host.version).toBe('1.0.0');
    expect(typeof host.getLogger().info).toBe('function');
    expect(host.getConfig()).toBeDefined();
    expect(host.getEventBus()).toBeDefined();
    expect(host.getServices()).toBeDefined();
    expect(host.getLifecycle()).toBeDefined();
    expect(host.getPluginManager()).toBeDefined();
  });

  it('start 掃描 pluginsDir 並對每個子目錄 load', async () => {
    const { host, readDir, manager } = await makeTestHost();
    await host.start();
    expect(readDir).toHaveBeenCalledWith('plugins');
    expect(manager.load).toHaveBeenCalledWith(path.join('plugins', 'a'));
    expect(manager.load).toHaveBeenCalledWith(path.join('plugins', 'b'));
  });

  it('start 載入後呼叫 applyPersistedState 啟用該啟用的插件', async () => {
    const { host, manager } = await makeTestHost();
    await host.start();
    expect(manager.applyPersistedState).toHaveBeenCalledOnce();
  });

  it('start 最後執行 lifecycle.startup，phase=running', async () => {
    const { host, lifecycle } = await makeTestHost();
    await host.start();
    expect(lifecycle.phase).toBe('running');
  });

  it('stop 停用所有 enabled 插件後執行 lifecycle.shutdown，phase=stopped', async () => {
    const { host, manager, lifecycle } = await makeTestHost({
      manager: {
        list: () => [
          { ...makeHandle('a'), state: 'enabled' },
          { ...makeHandle('b'), state: 'disabled' },
        ],
      },
    });
    await host.start();
    await host.stop();
    expect(manager.deactivate).toHaveBeenCalledWith('a');
    // disabled 的不重複 deactivate
    expect(lifecycle.phase).toBe('stopped');
  });

  it('start 時 pluginsDir 不存在（readDir 拋錯）則跳過載入仍完成 startup', async () => {
    const readDir = vi.fn().mockRejectedValue(new Error('ENOENT'));
    const { host, lifecycle } = await makeTestHost({ readDir });
    await host.start();
    expect(lifecycle.phase).toBe('running');
  });

  it('重複 start 拋錯', async () => {
    const { host } = await makeTestHost();
    await host.start();
    await expect(host.start()).rejects.toThrow();
  });
});
