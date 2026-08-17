/**
 * s12ryt-base — 公開 API 匯出入口
 *
 * 匯出所有供外部使用的程式化 API：Context API、Host、插件子系統、CLI、共用工具與契約型別。
 */

// ── 共用工具 ──
export {
  isObject,
  isPlainObject,
  isFunction,
  isString,
  isNumber,
  isBoolean,
  isArray,
  deepMerge,
  debounce,
  throttle,
} from './utils/index.js';
export type { Debounced } from './utils/index.js';

// ── Context API：Logger ──
export {
  LOG_LEVEL_ORDER,
  createLogger,
} from './context/logger.js';
export type {
  LogLevel,
  LogEntry,
  LogTransport,
  Logger,
  LoggerOptions,
} from './context/logger.js';

// ── Context API：Config ──
export { createConfig } from './context/config.js';
export type {
  Config,
  ReadFileFn,
  WatchFileFn,
  ConfigOptions,
} from './context/config.js';

// ── Context API：EventBus ──
export { createEventBus } from './context/eventbus.js';
export type { EventHandler, EventBus } from './context/eventbus.js';

// ── Context API：ServiceRegistry ──
export { createServiceRegistry } from './context/service-registry.js';
export type {
  Service,
  ServiceRegistryOptions,
  ServiceRegistry,
} from './context/service-registry.js';

// ── Context API：Lifecycle ──
export { createLifecycle } from './context/lifecycle.js';
export type {
  LifecyclePhase,
  LifecycleHook,
  Lifecycle,
} from './context/lifecycle.js';

// ── 插件契約型別 ──
export type {
  PluginManifest,
  PluginState,
  PluginHandle,
  PluginContext,
  Plugin,
  Host as IHost,
  PluginManager as IPluginManager,
} from './context/contract.js';

// ── 插件子系統：Loader ──
export { createPluginLoader } from './plugin/loader.js';
export type {
  LoadedPlugin,
  PluginLoaderOptions,
  PluginLoader,
} from './plugin/loader.js';

// ── 插件子系統：Manager ──
export { createPluginManager } from './plugin/manager.js';
export type { PluginManagerOptions, PluginManager } from './plugin/manager.js';

// ── 插件子系統：RegistryClient ──
export { createRegistryClient } from './plugin/registry-client.js';
export type {
  RegistryEntry,
  Registry,
  RegistryClientOptions,
  RegistryClient,
} from './plugin/registry-client.js';

// ── 插件子系統：Installer ──
export { createInstaller } from './plugin/installer.js';
export type {
  InstallStrategy,
  InstallResult,
  InstallOpts,
  InstallerOptions,
  Installer,
} from './plugin/installer.js';

// ── 插件子系統：預設安裝器 ──
export {
  isRemoteRepo,
  defaultDownloader,
  defaultExtractor,
  defaultGitCloner,
} from './plugin/default-installers.js';

// ── Host ──
export { createHost } from './host.js';
export type { HostOptions, Host } from './host.js';

// ── CLI ──
export { createCli, main } from './cli.js';
export type { CliDeps, Cli, MainOptions } from './cli.js';
