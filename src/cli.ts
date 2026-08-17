/**
 * CLI - 命令列介面，分派七個子指令。
 *
 * 指令：install / uninstall / list / enable / disable / start / info / update
 *
 * 全部依賴注入（registryClient / installer / manager / host / output），
 * 確保單元測試可完全控制行為與輸出。
 * run(argv) 回傳 exit code（0 成功，非零失敗）。
 */

import path from 'node:path';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { readdir as fsReaddir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import readline from 'node:readline';

import semver from 'semver';
import type { Host, PluginManager } from './context/contract.js';
import type { RegistryClient, RegistryEntry } from './plugin/registry-client.js';
import type { Installer } from './plugin/installer.js';
import { createLogger } from './context/logger.js';
import { createConfig } from './context/config.js';
import { createEventBus } from './context/eventbus.js';
import { createServiceRegistry } from './context/service-registry.js';
import { createLifecycle } from './context/lifecycle.js';
import { createPluginLoader } from './plugin/loader.js';
import { createPluginManager } from './plugin/manager.js';
import { createRegistryClient } from './plugin/registry-client.js';
import { createInstaller } from './plugin/installer.js';
import { defaultDownloader, defaultExtractor, defaultGitCloner } from './plugin/default-installers.js';
import { createHost } from './host.js';
import * as utilsModule from './utils/index.js';

export interface CliDeps {
  /** registry.json 來源（URL 或本地路徑）。 */
  registrySource: string;
  /** 插件安裝目錄。 */
  pluginsDir: string;
  registryClient: RegistryClient;
  installer: Installer;
  manager: PluginManager;
  host: Host;
  /** 輸出函數（預設 console.log）。 */
  output?: (msg: string) => void;
}

export interface Cli {
  /** 執行指令；回傳 exit code（0=成功）。 */
  run(argv: string[]): Promise<number>;
}

const COMMANDS = ['install', 'uninstall', 'list', 'enable', 'disable', 'start', 'info', 'update'] as const;

function parseArgs(argv: string[]): { command: string; positional: string[]; yes: boolean } {
  const yes = argv.includes('--yes') || argv.includes('-y');
  const positional = argv.filter((a) => a !== '--yes' && a !== '-y' && !a.startsWith('--'));
  return { command: positional[0] ?? '', positional: positional.slice(1), yes };
}

export function createCli(deps: CliDeps): Cli {
  const output = deps.output ?? ((msg: string) => console.log(msg));
  const { registrySource, registryClient, installer, manager, host } = deps;

  async function cmdInstall(name: string | undefined, yes: boolean): Promise<number> {
    if (!name) {
      output('Usage: install <name>');
      return 1;
    }
    let entry: RegistryEntry | undefined;
    try {
      const registry = await registryClient.fetchRegistry(registrySource);
      entry = registryClient.findPlugin(registry, name);
    } catch (err) {
      output(`Failed to fetch registry: ${(err as Error).message}`);
      return 1;
    }
    if (!entry) {
      output(`Plugin not found in registry: ${name}`);
      return 1;
    }
    try {
      const result = await installer.install(entry, { yes });
      output(`Installed ${result.name}@${result.version} via ${result.strategy} -> ${result.path}`);
      return 0;
    } catch (err) {
      output((err as Error).message);
      return 1;
    }
  }

  async function cmdUninstall(name: string | undefined): Promise<number> {
    if (!name) {
      output('Usage: uninstall <name>');
      return 1;
    }
    try {
      await installer.uninstall(name);
      output(`Uninstalled ${name}`);
      return 0;
    } catch (err) {
      output((err as Error).message);
      return 1;
    }
  }

  async function cmdList(): Promise<number> {
    const handles = manager.list();
    if (handles.length === 0) {
      output('No plugins loaded.');
      return 0;
    }
    for (const h of handles) {
      output(`${h.manifest.name}\t${h.manifest.version}\t[${h.state}]`);
    }
    return 0;
  }

  async function cmdEnable(name: string | undefined): Promise<number> {
    if (!name) {
      output('Usage: enable <name>');
      return 1;
    }
    if (!manager.has(name)) {
      output(`Plugin not found: ${name}`);
      return 1;
    }
    try {
      await manager.activate(name);
      output(`Enabled ${name}`);
      return 0;
    } catch (err) {
      output((err as Error).message);
      return 1;
    }
  }

  async function cmdDisable(name: string | undefined): Promise<number> {
    if (!name) {
      output('Usage: disable <name>');
      return 1;
    }
    if (!manager.has(name)) {
      output(`Plugin not found: ${name}`);
      return 1;
    }
    try {
      await manager.deactivate(name);
      output(`Disabled ${name}`);
      return 0;
    } catch (err) {
      output((err as Error).message);
      return 1;
    }
  }

  async function cmdStart(): Promise<number> {
    try {
      await host.start();
      output('Host started.');
      return 0;
    } catch (err) {
      output(`Failed to start host: ${(err as Error).message}`);
      return 1;
    }
  }

  async function cmdInfo(name: string | undefined): Promise<number> {
    if (!name) {
      output('Usage: info <name>');
      return 1;
    }
    const handle = manager.get(name);
    if (!handle) {
      output(`Plugin not found: ${name}`);
      return 1;
    }
    const m = handle.manifest;
    output(`name: ${m.name}`);
    output(`version: ${m.version}`);
    output(`description: ${m.description}`);
    output(`author: ${m.author}`);
    output(`hostCompatibility: ${m.hostCompatibility}`);
    output(`state: ${handle.state}`);
    output(`path: ${handle.path}`);
    if (handle.error) output(`error: ${handle.error}`);
    return 0;
  }

  async function cmdUpdate(name: string | undefined, yes: boolean): Promise<number> {
    if (!name) {
      output('Usage: update <name>');
      return 1;
    }
    let entry: RegistryEntry | undefined;
    try {
      const registry = await registryClient.fetchRegistry(registrySource);
      entry = registryClient.findPlugin(registry, name);
    } catch (err) {
      output(`Failed to fetch registry: ${(err as Error).message}`);
      return 1;
    }
    if (!entry) {
      output(`Plugin not found in registry: ${name}`);
      return 1;
    }
    const handle = manager.get(name);
    if (handle && !semver.gt(entry.version, handle.manifest.version)) {
      output(`${name} is already up to date (${handle.manifest.version}).`);
      return 0;
    }
    try {
      if (handle) {
        await installer.uninstall(name);
      }
      const result = await installer.install(entry, { yes });
      output(`Updated ${result.name} to ${result.version} via ${result.strategy}.`);
      return 0;
    } catch (err) {
      output((err as Error).message);
      return 1;
    }
  }

  async function run(argv: string[]): Promise<number> {
    const { command, positional, yes } = parseArgs(argv);
    switch (command) {
      case 'install':
        return cmdInstall(positional[0], yes);
      case 'uninstall':
        return cmdUninstall(positional[0]);
      case 'list':
        return cmdList();
      case 'enable':
        return cmdEnable(positional[0]);
      case 'disable':
        return cmdDisable(positional[0]);
      case 'start':
        return cmdStart();
      case 'info':
        return cmdInfo(positional[0]);
      case 'update':
        return cmdUpdate(positional[0], yes);
      default:
        if (command) {
          output(`Unknown command: ${command}`);
        }
        output(`Available commands: ${COMMANDS.join(', ')}`);
        return 1;
    }
  }

  return { run };
}

// ─────────────────────────────────────────────────────────
// 組合根（Composition Root）— bin 入口
// ─────────────────────────────────────────────────────────

const HOST_VERSION = '0.1.0';
const DEFAULT_REGISTRY_URL =
  'https://raw.githubusercontent.com/s12ryt/s12ryt-base-plugins/main/registry.json';

export interface MainOptions {
  /** CLI 參數（預設 process.argv.slice(2)）。 */
  argv?: string[];
  /** 工作目錄（預設 process.cwd()）。 */
  cwd?: string;
  /** registry 來源（預設環境變數 S12RYT_REGISTRY_URL 或 DEFAULT_REGISTRY_URL）。 */
  registrySource?: string;
  /** 輸出函數（預設 console.log）。 */
  output?: (msg: string) => void;
}

/**
 * 組合根：組裝所有具體子系統依賴，建立 CLI 並執行指令。
 *
 * manager ↔ host 迴圈依賴解法：
 * manager 僅在 activate() 的 buildContext 中存取 options.host，
 * 此時 host 已建構完成。使用 Object.assign(hostRef, host) 延遲綁定。
 */
export async function main(options: MainOptions = {}): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  const argv = options.argv ?? process.argv.slice(2);
  const registrySource =
    options.registrySource ?? process.env.S12RYT_REGISTRY_URL ?? DEFAULT_REGISTRY_URL;
  const pluginsDir = path.join(cwd, 'plugins');
  const configPath = path.join(cwd, 'config', 'config.yaml');
  const statePath = path.join(cwd, 'data', 'plugin-state.json');

  // ── 具體子系統 ──
  const logger = createLogger({ name: 's12ryt-base' });
  const config = await createConfig({ path: configPath });
  const eventBus = createEventBus();
  const services = createServiceRegistry();
  const lifecycle = createLifecycle();
  const loader = createPluginLoader({ hostVersion: HOST_VERSION });

  // ── 狀態持久化 ──
  function readState(): Record<string, boolean> {
    try {
      return JSON.parse(readFileSync(statePath, 'utf-8'));
    } catch {
      return {};
    }
  }
  function writeState(state: Record<string, boolean>): void {
    try {
      mkdirSync(path.dirname(statePath), { recursive: true });
      writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');
    } catch (err) {
      logger.warn(`Failed to persist plugin state: ${(err as Error).message}`);
    }
  }

  // ── manager ↔ host 迴圈依賴：延遲綁定 ──
  const hostRef = {} as Host;
  const manager = createPluginManager({
    loader,
    logger,
    config,
    eventBus,
    services,
    lifecycle,
    utils: utilsModule,
    host: hostRef,
    readState,
    writeState,
  });
  const host = createHost({
    name: 's12ryt-base',
    version: HOST_VERSION,
    pluginsDir,
    logger,
    config,
    eventBus,
    services,
    lifecycle,
    utils: utilsModule,
    manager,
  });
  Object.assign(hostRef, host);

  // ── 預載已安裝插件 ──
  // 每個 CLI 指令都是獨立進程：掃描 pluginsDir 讓 list/info/enable/disable/update
  // 能看見先前進程安裝的插件。此處僅 load（不 activate）——
  // 是否啟用由個別指令或 host.start() 的 applyPersistedState 決定。
  try {
    const entries = await fsReaddir(pluginsDir);
    for (const sub of entries) {
      try {
        await manager.load(path.join(pluginsDir, sub));
      } catch {
        // 個別插件載入失敗（非插件目錄/manifest 無效）不中斷指令執行
      }
    }
  } catch {
    // pluginsDir 不存在（尚未安裝任何插件），跳過
  }

  // ── Installer（含互動確認）──
  async function confirm(message: string): Promise<boolean> {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
      rl.question(`${message} (y/N) `, (answer) => {
        rl.close();
        resolve(answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes');
      });
    });
  }
  const installer = createInstaller({
    pluginsDir,
    confirm,
    downloader: defaultDownloader,
    extractor: defaultExtractor,
    gitCloner: defaultGitCloner,
  });

  // ── RegistryClient ──
  const registryClient = createRegistryClient();

  // ── 執行 CLI ──
  const cli = createCli({
    registrySource,
    pluginsDir,
    registryClient,
    installer,
    manager,
    host,
    output: options.output,
  });
  return cli.run(argv);
}

// ── 自動執行（bin 入口）──
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().then((code) => {
    process.exitCode = code;
  }).catch((err) => {
    console.error(err instanceof Error ? err.stack ?? err.message : String(err));
    process.exitCode = 1;
  });
}
