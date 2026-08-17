/**
 * I1 — Local registry 端到端整合測試。
 *
 * 驗證完整流程：
 *   1. Installer 從本地路徑複製真實 build 產物到 host pluginsDir
 *   2. Host.start() 掃描目錄 → PluginLoader 讀 manifest.yaml + import dist/index.js
 *   3. PluginManager.activate() 組裝 PluginContext → plugin.activate(ctx) 執行
 *   4. EventBus emit → 插件註冊的 handler 觸發
 *   5. PluginManager.deactivate() → plugin.deactivate(ctx) 執行
 *
 * 全程使用真實檔案系統操作與真實動態 import，不注入任何 mock。
 * 前置條件：s12ryt-base-plugins 已 build（dist/ 存在）。
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createInstaller } from '../src/plugin/installer.js';
import { createRegistryClient } from '../src/plugin/registry-client.js';
import { defaultGitCloner } from '../src/plugin/default-installers.js';
import { createHost } from '../src/host.js';
import { createPluginManager } from '../src/plugin/manager.js';
import { createPluginLoader } from '../src/plugin/loader.js';
import { createLogger, type LogEntry } from '../src/context/logger.js';
import { createConfig } from '../src/context/config.js';
import { createEventBus } from '../src/context/eventbus.js';
import { createServiceRegistry } from '../src/context/service-registry.js';
import type { Host, PluginManager } from '../src/context/contract.js';
import { createLifecycle } from '../src/context/lifecycle.js';
import * as utilsModule from '../src/utils/index.js';

const PLUGINS_REPO = path.resolve(__dirname, '../../s12ryt-base-plugins');
const HOST_VERSION = '0.1.0';

describe('I1: Local registry end-to-end install → load → activate', () => {
  let tmpDir: string;
  let pluginsDir: string;
  let logs: LogEntry[];

  beforeAll(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 's12ryt-i1-'));
    pluginsDir = path.join(tmpDir, 'plugins');
    mkdirSync(path.join(tmpDir, 'config'), { recursive: true });
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── Step 1: Install ──────────────────────────────
  it('installs template plugin from local path (git strategy)', async () => {
    const registryPath = path.join(tmpDir, 'registry.json');
    writeFileSync(
      registryPath,
      JSON.stringify({
        plugins: [
          {
            name: 'template',
            version: '1.0.0',
            repo: PLUGINS_REPO,
            path: 'plugins/template',
          },
        ],
      }),
    );

    const client = createRegistryClient();
    const registry = await client.fetchRegistry(registryPath);
    const entry = client.findPlugin(registry, 'template');
    expect(entry).toBeDefined();
    expect(entry!.name).toBe('template');

    const installer = createInstaller({
      pluginsDir,
      gitCloner: defaultGitCloner,
    });
    const result = await installer.install(entry!, { yes: true });

    expect(result.name).toBe('template');
    expect(result.version).toBe('1.0.0');
    expect(result.strategy).toBe('git');
    expect(result.path).toBe(path.join(pluginsDir, 'template'));

    // 驗證真實檔案已複製
    expect(existsSync(path.join(result.path, 'manifest.yaml'))).toBe(true);
    expect(existsSync(path.join(result.path, 'dist', 'index.js'))).toBe(true);
  });

  // ── Step 2-3: Load + Activate via Host ──────────
  it('loads and activates the installed plugin via host.start() + manager.activate()', async () => {
    logs = [];
    const transport = (entry: LogEntry) => logs.push(entry);
    const logger = createLogger({ name: 'test-host', transport });
    const config = await createConfig({ path: path.join(tmpDir, 'config', 'config.yaml') });
    const eventBus = createEventBus();
    const services = createServiceRegistry();
    const lifecycle = createLifecycle();
    const loader = createPluginLoader({ hostVersion: HOST_VERSION });

    const hostRef = {} as Host;
    const manager: PluginManager = createPluginManager({
      loader,
      logger,
      config,
      eventBus,
      services,
      lifecycle,
      utils: utilsModule,
      host: hostRef,
    });
    const host = createHost({
      name: 'test-host',
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

    // Host.start() 掃描目錄並載入
    await host.start();

    // 確認載入成功
    expect(manager.has('template')).toBe(true);
    const loaded = manager.get('template');
    expect(loaded?.state).toBe('loaded');
    expect(loaded?.manifest.name).toBe('template');
    expect(loaded?.manifest.version).toBe('1.0.0');

    // 手動啟用
    await manager.activate('template');
    expect(manager.get('template')?.state).toBe('enabled');

    // 確認 activate 日誌
    const activateLog = logs.find(
      (l) => l.name === 'test-host:template' && l.message.includes('插件已啟動'),
    );
    expect(activateLog).toBeDefined();

    // ── Step 4: EventBus 事件觸發 ──
    eventBus.emit('template:greet', 'Integration');
    const greetLog = logs.find(
      (l) => l.name === 'test-host:template' && l.message.includes('Hello, Integration!'),
    );
    expect(greetLog).toBeDefined();

    // ── Step 5: Deactivate ──
    await manager.deactivate('template');
    expect(manager.get('template')?.state).toBe('disabled');

    const deactivateLog = logs.find(
      (l) => l.name === 'test-host:template' && l.message.includes('插件已停用'),
    );
    expect(deactivateLog).toBeDefined();

    // 停用後 event handler 不應再觸發（unsubscribe 由插件自行管理）
    // （template 插件未在 deactivate 中 off handler，這裡僅驗證狀態變化）

    // 清理
    await host.stop();
  });
});
