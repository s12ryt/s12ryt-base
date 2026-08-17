/**
 * Host - 主機核心，聚合所有子系統並編排啟動/關閉流程。
 *
 * start()：掃描 pluginsDir 載入插件 → applyPersistedState（啟用該啟用的）→ lifecycle.startup
 * stop()：停用所有 enabled 插件 → lifecycle.shutdown
 *
 * 各子系統預設自行建立，亦可透過 options 注入（測試或客製）。
 */

import { readdir as fsReaddir } from 'node:fs/promises';
import path from 'node:path';
import type { Host as IHost, PluginManager } from './context/contract.js';
import type { Logger } from './context/logger.js';
import type { Config } from './context/config.js';
import type { EventBus } from './context/eventbus.js';
import type { ServiceRegistry } from './context/service-registry.js';
import type { Lifecycle } from './context/lifecycle.js';
import { createLogger } from './context/logger.js';
import { createEventBus } from './context/eventbus.js';
import { createServiceRegistry } from './context/service-registry.js';
import { createLifecycle } from './context/lifecycle.js';

export interface HostOptions {
  name?: string;
  version?: string;
  pluginsDir?: string;
  logger?: Logger;
  config: Config;
  eventBus?: EventBus;
  services?: ServiceRegistry;
  lifecycle?: Lifecycle;
  utils: typeof import('./utils/index.js');
  /** 注入插件管理器（預設需外部提供）。 */
  manager: PluginManager;
  /** 掃描目錄（預設 node:fs/promises readdir）。 */
  readDir?: (p: string) => Promise<string[]>;
}

export type Host = IHost;

export function createHost(options: HostOptions): Host {
  const name = options.name ?? 's12ryt-base';
  const version = options.version ?? '0.0.0';
  const pluginsDir = options.pluginsDir ?? 'plugins';
  const logger = options.logger ?? createLogger({ name });
  const eventBus = options.eventBus ?? createEventBus();
  const services = options.services ?? createServiceRegistry();
  const lifecycle = options.lifecycle ?? createLifecycle();
  const readDir = options.readDir ?? ((p) => fsReaddir(p));

  return {
    name,
    version,
    getLogger: () => logger,
    getConfig: () => options.config,
    getEventBus: () => eventBus,
    getServices: () => services,
    getLifecycle: () => lifecycle,
    getPluginManager: () => options.manager,
    async start() {
      try {
        const entries = await readDir(pluginsDir);
        for (const sub of entries) {
          try {
            await options.manager.load(path.join(pluginsDir, sub));
          } catch {
            // 個別插件載入失敗不中斷整體啟動
          }
        }
      } catch {
        // pluginsDir 不存在或無法讀取，跳過載入
      }
      await options.manager.applyPersistedState();
      await lifecycle.startup();
    },
    async stop() {
      for (const handle of options.manager.list()) {
        if (handle.state === 'enabled') {
          try {
            await options.manager.deactivate(handle.manifest.name);
          } catch {
            // 停用失敗不中斷關閉流程
          }
        }
      }
      await lifecycle.shutdown();
    },
  };
}
