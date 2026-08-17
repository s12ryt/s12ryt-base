import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { main } from '../src/cli.js';

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
});
