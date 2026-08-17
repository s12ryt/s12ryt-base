/**
 * PluginManager - 管理已安裝插件的生命週期與狀態。
 *
 * 狀態機：
 *   (load) loaded → (activate) enabled → (deactivate) disabled
 *   任何步驟失敗 → error
 *
 * 透過 createPluginContext 為每個插件組裝完整的 PluginContext。
 * enabled/disabled 狀態透過 readState/writeState 持久化，
 * applyPersistedState() 可在載入後依持久化狀態自動啟用插件。
 */

import type { PluginLoader } from './loader.js';
import type {
  PluginHandle,
  PluginContext,
  PluginManager,
  Host,
} from '../context/contract.js';
import type { Logger } from '../context/logger.js';
import type { Config } from '../context/config.js';
import type { EventBus } from '../context/eventbus.js';
import type { ServiceRegistry } from '../context/service-registry.js';
import type { Lifecycle } from '../context/lifecycle.js';

export interface PluginManagerOptions {
  loader: PluginLoader;
  logger: Logger;
  config: Config;
  eventBus: EventBus;
  services: ServiceRegistry;
  lifecycle: Lifecycle;
  utils: typeof import('../utils/index.js');
  host: Host;
  /** 讀取持久化狀態（{ [pluginName]: enabled }）。 */
  readState?: () => Record<string, boolean>;
  /** 寫入持久化狀態。 */
  writeState?: (state: Record<string, boolean>) => void;
}

export type { PluginManager };

export function createPluginManager(options: PluginManagerOptions): PluginManager {
  const handles = new Map<string, PluginHandle>();
  const persisted: Record<string, boolean> = options.readState ? options.readState() : {};

  function buildContext(handle: PluginHandle): PluginContext {
    return {
      host: options.host,
      pluginManager: manager,
      logger: options.logger.child(handle.manifest.name),
      config: options.config,
      eventBus: options.eventBus,
      services: options.services,
      lifecycle: options.lifecycle,
      utils: options.utils,
      manifest: handle.manifest,
      pluginPath: handle.path,
    };
  }

  async function load(pluginPath: string): Promise<PluginHandle> {
    const { plugin, manifest } = await options.loader.load(pluginPath);
    const handle: PluginHandle = {
      manifest,
      state: 'loaded',
      plugin,
      path: pluginPath,
    };
    handles.set(manifest.name, handle);
    return handle;
  }

  async function activate(name: string): Promise<void> {
    const handle = handles.get(name);
    if (!handle) throw new Error(`Plugin not found: ${name}`);
    if (handle.state === 'enabled') {
      throw new Error(`Plugin already enabled: ${name}`);
    }
    if (handle.state !== 'loaded' && handle.state !== 'disabled') {
      throw new Error(`Cannot activate plugin "${name}" in state: ${handle.state}`);
    }
    const ctx = buildContext(handle);
    try {
      await handle.plugin!.activate(ctx);
      handle.state = 'enabled';
      handle.error = undefined;
      persisted[name] = true;
      options.writeState?.(structuredClone(persisted));
    } catch (err) {
      handle.state = 'error';
      handle.error = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }

  async function deactivate(name: string): Promise<void> {
    const handle = handles.get(name);
    if (!handle) throw new Error(`Plugin not found: ${name}`);
    if (handle.state !== 'enabled') {
      throw new Error(`Cannot deactivate plugin "${name}" in state: ${handle.state}`);
    }
    try {
      await handle.plugin?.deactivate?.(buildContext(handle));
    } catch (err) {
      handle.state = 'error';
      handle.error = err instanceof Error ? err.message : String(err);
      throw err;
    }
    handle.state = 'disabled';
    persisted[name] = false;
    options.writeState?.(structuredClone(persisted));
  }

  async function unload(name: string): Promise<void> {
    const handle = handles.get(name);
    if (!handle) return;
    if (handle.state === 'enabled') {
      await deactivate(name);
    }
    handles.delete(name);
    delete persisted[name];
    options.writeState?.(structuredClone(persisted));
  }

  function get(name: string): PluginHandle | undefined {
    return handles.get(name);
  }

  function list(): PluginHandle[] {
    return Array.from(handles.values());
  }

  function has(name: string): boolean {
    return handles.has(name);
  }

  async function applyPersistedState(): Promise<void> {
    for (const [name, handle] of handles) {
      if (persisted[name] && handle.state === 'loaded') {
        await activate(name);
      }
    }
  }

  function getPersistedState(): Record<string, boolean> {
    return structuredClone(persisted);
  }

  const manager: PluginManager = {
    load,
    activate,
    deactivate,
    unload,
    get,
    list,
    has,
    applyPersistedState,
    getPersistedState,
  };

  return manager;
}
