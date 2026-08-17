import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, cpSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { main } from '../src/cli.js';

const TEMPLATE_PLUGIN = path.resolve(__dirname, '../../s12ryt-base-plugins/plugins/template');

/**
 * main() 組合根（composition root）整合測試。
 *
 * 在臨時目錄中執行，驗證具體依賴的正確組裝與 CLI 分派。
 * 與 cli.test.ts 不同：cli.test.ts 測試 createCli（注入 fake deps），
 * 本測試驗證 main() 將真實子系統工廠組裝後的端到端行為。
 */
describe('main() composition root', () => {
  let tempDir: string;
  let originalCwd: string;
  let outputs: string[];

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 's12ryt-main-'));
    // 預先建立 config 目錄，讓 createConfig 能正常運作
    mkdirSync(path.join(tempDir, 'config'), { recursive: true });
    originalCwd = process.cwd();
    process.chdir(tempDir);
    outputs = [];
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('list with no plugins prints "No plugins loaded." and returns 0', async () => {
    const code = await main({
      argv: ['list'],
      output: (msg) => outputs.push(msg),
    });
    expect(code).toBe(0);
    expect(outputs).toContain('No plugins loaded.');
  });

  it('unknown command prints available commands and returns 1', async () => {
    const code = await main({
      argv: ['bogus-command'],
      output: (msg) => outputs.push(msg),
    });
    expect(code).toBe(1);
    expect(outputs.some((m) => m.includes('Unknown command: bogus-command'))).toBe(true);
    expect(outputs.some((m) => m.includes('Available commands:'))).toBe(true);
  });

  it('info on non-existent plugin returns 1', async () => {
    const code = await main({
      argv: ['info', 'does-not-exist'],
      output: (msg) => outputs.push(msg),
    });
    expect(code).toBe(1);
    expect(outputs.some((m) => m.includes('Plugin not found: does-not-exist'))).toBe(true);
  });

  it('no command prints available commands and returns 1', async () => {
    const code = await main({
      argv: [],
      output: (msg) => outputs.push(msg),
    });
    expect(code).toBe(1);
    expect(outputs.some((m) => m.includes('Available commands:'))).toBe(true);
  });

  // ── 跨進程指令：已安裝插件須可被 list/info/enable 看見 ──

  it('list shows installed plugin from ./plugins without prior start (cross-process)', async () => {
    // 模擬先前進程已安裝：直接放置插件目錄到 ./plugins
    cpSync(TEMPLATE_PLUGIN, path.join(tempDir, 'plugins', 'template'), { recursive: true });

    const code = await main({
      argv: ['list'],
      output: (msg) => outputs.push(msg),
    });
    expect(code).toBe(0);
    expect(outputs.some((m) => m.includes('template') && m.includes('1.0.0'))).toBe(true);
  });

  it('enable works on installed plugin in fresh process and persists state', async () => {
    cpSync(TEMPLATE_PLUGIN, path.join(tempDir, 'plugins', 'template'), { recursive: true });

    const code = await main({
      argv: ['enable', 'template'],
      output: (msg) => outputs.push(msg),
    });
    expect(code).toBe(0);
    expect(outputs.some((m) => m.includes('Enabled template'))).toBe(true);

    // 持久化狀態應寫入 data/plugin-state.json
    const statePath = path.join(tempDir, 'data', 'plugin-state.json');
    expect(existsSync(statePath)).toBe(true);
    const state = JSON.parse(readFileSync(statePath, 'utf-8')) as Record<string, boolean>;
    expect(state.template).toBe(true);
  });

  it('info shows installed plugin manifest in fresh process', async () => {
    cpSync(TEMPLATE_PLUGIN, path.join(tempDir, 'plugins', 'template'), { recursive: true });

    const code = await main({
      argv: ['info', 'template'],
      output: (msg) => outputs.push(msg),
    });
    expect(code).toBe(0);
    expect(outputs.some((m) => m.includes('name: template'))).toBe(true);
    expect(outputs.some((m) => m.includes('state: loaded'))).toBe(true);
  });
});
