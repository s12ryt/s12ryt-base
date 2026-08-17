import { describe, it, expect, vi } from 'vitest';
import { createPluginManager, type PluginManager } from '../src/plugin/manager.js';
import type { PluginLoader, LoadedPlugin } from '../src/plugin/loader.js';
import type { Plugin, PluginManifest } from '../src/context/contract.js';
import { createLogger } from '../src/context/logger.js';
import { createEventBus } from '../src/context/eventbus.js';
import { createServiceRegistry } from '../src/context/service-registry.js';
import { createLifecycle } from '../src/context/lifecycle.js';
import { createConfig } from '../src/context/config.js';
import * as utils from '../src/utils/index.js';

function makeManifest(over: Partial<PluginManifest> = {}): PluginManifest {
  return {
    name: 'demo',
    version: '1.0.0',
    description: 'd',
    author: 'a',
    hostCompatibility: '>=1.0.0',
    ...over,
  };
}

function makePlugin(over: Partial<PluginManifest> = {}): Plugin {
  return { manifest: makeManifest(over), activate: vi.fn(), deactivate: vi.fn() };
}

async function makeManager(
  over: {
    loader?: Partial<PluginLoader>;
    state?: Record<string, boolean>;
    host?: unknown;
  } = {},
): Promise<{ mgr: PluginManager; writeState: ReturnType<typeof vi.fn> }> {
  const manifest = makeManifest();
  const plugin = makePlugin();
  const loaded: LoadedPlugin = { plugin, manifest };
  const loader: PluginLoader = {
    load: over.loader?.load ?? vi.fn().mockResolvedValue(loaded),
  };
  const logger = createLogger({ transport: () => {} });
  const eventBus = createEventBus();
  const services = createServiceRegistry();
  const lifecycle = createLifecycle();
  const config = await createConfig({ path: 'x.yaml', readFile: vi.fn().mockResolvedValue('') });
  let currentState: Record<string, boolean> = { ...(over.state ?? {}) };
  const readState = vi.fn().mockImplementation(() => structuredClone(currentState));
  const writeState = vi.fn().mockImplementation((s: Record<string, boolean>) => {
    currentState = s;
  });
  const host = over.host ?? { name: 'host', version: '1.0.0' };

  const mgr = createPluginManager({
    loader,
    logger,
    config,
    eventBus,
    services,
    lifecycle,
    utils,
    host: host as never,
    readState,
    writeState,
  });
  return { mgr, writeState };
}

describe('PluginManager', () => {
  it('load 載入插件後 handle.state 為 loaded', async () => {
    const { mgr } = await makeManager();
    const handle = await mgr.load('plugins/demo');
    expect(handle.state).toBe('loaded');
    expect(handle.manifest.name).toBe('demo');
    expect(mgr.has('demo')).toBe(true);
    expect(mgr.get('demo')).toBe(handle);
  });

  it('activate 呼叫 plugin.activate(ctx) 並將狀態設為 enabled', async () => {
    const { mgr } = await makeManager();
    const handle = await mgr.load('plugins/demo');
    const plugin = handle.plugin!;
    await mgr.activate('demo');
    expect(plugin.activate).toHaveBeenCalledOnce();
    expect(handle.state).toBe('enabled');
  });

  it('activate 傳入的 ctx 包含以插件名為前綴的 logger 與完整 API', async () => {
    const { mgr } = await makeManager();
    await mgr.load('plugins/demo');
    const handle = await (async () => mgr.get('demo'))();
    const captured = vi.fn();
    (handle!.plugin as Plugin).activate = async (ctx) => {
      captured({
        hasLogger: typeof ctx.logger,
        hasConfig: typeof ctx.config,
        hasEventBus: typeof ctx.eventBus,
        hasServices: typeof ctx.services,
        hasLifecycle: typeof ctx.lifecycle,
        hasUtils: typeof ctx.utils,
        hasHost: typeof ctx.host,
        hasPluginManager: typeof ctx.pluginManager,
        manifestName: ctx.manifest.name,
        pluginPath: ctx.pluginPath,
      });
    };
    await mgr.activate('demo');
    expect(captured).toHaveBeenCalledWith({
      hasLogger: 'object',
      hasConfig: 'object',
      hasEventBus: 'object',
      hasServices: 'object',
      hasLifecycle: 'object',
      hasUtils: 'object',
      hasHost: 'object',
      hasPluginManager: 'object',
      manifestName: 'demo',
      pluginPath: 'plugins/demo',
    });
  });

  it('deactivate 呼叫 plugin.deactivate 並將狀態設為 disabled', async () => {
    const { mgr } = await makeManager();
    await mgr.load('plugins/demo');
    await mgr.activate('demo');
    const handle = mgr.get('demo')!;
    await mgr.deactivate('demo');
    expect(handle.plugin!.deactivate).toHaveBeenCalledOnce();
    expect(handle.state).toBe('disabled');
  });

  it('deactivate 不存在的插件拋錯', async () => {
    const { mgr } = await makeManager();
    await expect(mgr.deactivate('none')).rejects.toThrow(/none/);
  });

  it('activate 非 loaded/disabled 狀態（已 enabled）拋錯', async () => {
    const { mgr } = await makeManager();
    await mgr.load('plugins/demo');
    await mgr.activate('demo');
    await expect(mgr.activate('demo')).rejects.toThrow(/enabled|state/i);
  });

  it('activate 時 plugin.activate 拋錯，狀態設為 error', async () => {
    const { mgr } = await makeManager();
    const handle = await mgr.load('plugins/demo');
    (handle.plugin as Plugin).activate = async () => {
      throw new Error('activate boom');
    };
    await expect(mgr.activate('demo')).rejects.toThrow('activate boom');
    expect(handle.state).toBe('error');
    expect(handle.error).toBeTruthy();
  });

  it('unload 先停用再移除，has 變 false', async () => {
    const { mgr } = await makeManager();
    await mgr.load('plugins/demo');
    await mgr.activate('demo');
    await mgr.unload('demo');
    expect(mgr.has('demo')).toBe(false);
  });

  it('list 回傳所有 handle', async () => {
    const { mgr } = await makeManager();
    await mgr.load('plugins/demo');
    expect(mgr.list()).toHaveLength(1);
  });

  it('activate 成功後持久化 enabled=true，deactivate 後 enabled=false', async () => {
    const { mgr, writeState } = await makeManager();
    await mgr.load('plugins/demo');
    await mgr.activate('demo');
    expect(writeState).toHaveBeenCalledWith(expect.objectContaining({ demo: true }));
    await mgr.deactivate('demo');
    expect(writeState).toHaveBeenCalledWith(expect.objectContaining({ demo: false }));
  });

  it('載入時依已持久化的 enabled 狀態可選擇自動啟用（applyPersistedState）', async () => {
    const { mgr } = await makeManager({ state: { demo: true } });
    await mgr.load('plugins/demo');
    await mgr.applyPersistedState();
    expect(mgr.get('demo')!.state).toBe('enabled');
  });

  it('deactivate 缺乏 deactivate 實作時視為成功（狀態 disabled）', async () => {
    const { mgr } = await makeManager();
    const handle = await mgr.load('plugins/demo');
    delete (handle.plugin as Plugin).deactivate;
    await mgr.activate('demo');
    await mgr.deactivate('demo');
    expect(handle.state).toBe('disabled');
  });
});
