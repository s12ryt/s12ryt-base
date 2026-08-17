/**
 * 插件契約型別定義。
 *
 * 定義 PluginManifest / Plugin / PluginContext / Host / PluginManager 等核心介面，
 * 作為主機與插件之間的穩定契約。Host/PluginManager 的「介面」在此前向定義，
 * 實作分別於 host.ts / plugin-manager.ts。
 *
 * 本檔案為純型別定義（無 runtime 值），驗證方式為 TypeScript 型別檢查。
 */

import type { Logger } from './logger.js';
import type { Config } from './config.js';
import type { EventBus } from './eventbus.js';
import type { ServiceRegistry } from './service-registry.js';
import type { Lifecycle } from './lifecycle.js';

/** 插件清單（Manifest），描述插件的中繼資料。 */
export interface PluginManifest {
  /** 唯一名稱（建議 kebab-case）。 */
  name: string;
  /** 語意化版本（semver），如 "1.0.0"。 */
  version: string;
  /** 簡短描述。 */
  description: string;
  /** 作者。 */
  author: string;
  /** 進入點相對於插件目錄的路徑，預設 "dist/index.js"。 */
  main?: string;
  /** 相容的主機版本範圍（semver range），如 "^1.0.0"。 */
  hostCompatibility: string;
  /** 依賴的其他插件名稱（選填）。 */
  dependencies?: string[];
}

/** 插件執行狀態。 */
export type PluginState =
  | 'installed' // 已安裝但未載入
  | 'loaded' // 已載入模組，未啟用
  | 'enabled' // 已啟用（activate 完成）
  | 'disabled' // 已停用（deactivate 完成）
  | 'error'; // 載入/啟用/停用失敗

/** 插件執行個體的控制代碼，由 PluginManager 維護。 */
export interface PluginHandle {
  manifest: PluginManifest;
  state: PluginState;
  /** 載入後的插件模組（activate/deactivate 前 undefined）。 */
  plugin?: Plugin;
  /** 插件安裝目錄絕對路徑。 */
  path: string;
  /** 進入失敗狀態時的錯誤訊息。 */
  error?: string;
}

/**
 * 插件執行時可取得的 Context。
 * 聚合所有 Context API 子系統 + 核心 API（host/pluginManager）+ 自身資訊。
 */
export interface PluginContext {
  /** 主機核心 API。 */
  host: Host;
  /** 插件管理器。 */
  pluginManager: PluginManager;
  /** 以插件名稱為前綴的 Logger。 */
  logger: Logger;
  /** 主設定（含熱重載）。 */
  config: Config;
  /** 事件匯流排。 */
  eventBus: EventBus;
  /** 共用服務註冊表。 */
  services: ServiceRegistry;
  /** 生命週期（可註冊 host 啟動/關閉鉤子）。 */
  lifecycle: Lifecycle;
  /** 共用工具函數。 */
  utils: typeof import('../utils/index.js');
  /** 本插件的 Manifest。 */
  manifest: PluginManifest;
  /** 本插件安裝目錄絕對路徑。 */
  pluginPath: string;
}

/** 插件模組需實作的介面。 */
export interface Plugin {
  manifest: PluginManifest;
  /** 啟用插件；可為 async。 */
  activate(ctx: PluginContext): void | Promise<void>;
  /** 停用插件（選填）；可為 async。 */
  deactivate?(ctx?: PluginContext): void | Promise<void>;
}

/** 主機核心 API（前向介面，實作於 host.ts）。 */
export interface Host {
  readonly name: string;
  readonly version: string;
  getLogger(): Logger;
  getConfig(): Config;
  getEventBus(): EventBus;
  getServices(): ServiceRegistry;
  getLifecycle(): Lifecycle;
  getPluginManager(): PluginManager;
  /** 啟動主機（執行生命週期啟動鉤子、載入並啟用已安裝插件）。 */
  start(): Promise<void>;
  /** 關閉主機（停用插件、執行關閉鉤子）。 */
  stop(): Promise<void>;
}

/** 插件管理器（前向介面，實作於 plugin-manager.ts）。 */
export interface PluginManager {
  /** 由指定路徑載入插件模組並解析 manifest。 */
  load(path: string): Promise<PluginHandle>;
  /** 啟用已載入的插件（執行 activate）。 */
  activate(name: string): Promise<void>;
  /** 停用插件（執行 deactivate）。 */
  deactivate(name: string): Promise<void>;
  /** 卸載插件（停用後移除控制代碼）。 */
  unload(name: string): Promise<void>;
  /** 取得插件控制代碼。 */
  get(name: string): PluginHandle | undefined;
  /** 列出所有已管理的插件控制代碼。 */
  list(): PluginHandle[];
  /** 是否已管理某插件。 */
  has(name: string): boolean;
  /** 依已持久化的 enabled 狀態自動啟用已載入的插件。 */
  applyPersistedState(): Promise<void>;
  /** 取得目前持久化狀態快照。 */
  getPersistedState(): Record<string, boolean>;
}
