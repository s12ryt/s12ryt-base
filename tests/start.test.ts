import { describe, it, expect, vi } from 'vitest';
import path from 'node:path';
import { ensureSetup } from '../start.js';

type MockFn = ReturnType<typeof vi.fn>;

function makeFs(over: { existing?: Set<string>; fileContents?: Record<string, string> } = {}) {
  const existing = over.existing ?? new Set<string>();
  const fileContents = over.fileContents ?? {};
  const exists = vi.fn((p: string) => existing.has(p));
  const mkdir = vi.fn(async (p: string) => { existing.add(p); });
  const writeFile = vi.fn(async (p: string, content: string) => { fileContents[p] = content; });
  const readFile = vi.fn(async (p: string) => fileContents[p] ?? '');
  return { exists, mkdir, writeFile, readFile, existing, fileContents };
}

describe('start.js ensureSetup', () => {
  it('建立所有缺失目錄（plugins/config/logs/data）', async () => {
    const fs = makeFs();
    const report = await ensureSetup({
      rootDir: '.',
      exists: fs.exists,
      mkdir: fs.mkdir,
      writeFile: fs.writeFile,
      readFile: fs.readFile,
      nodeVersion: '20.0.0',
      execSync: vi.fn(),
      fetchImpl: vi.fn().mockResolvedValue('{"plugins":[]}'),
    });
    const expected = ['plugins', 'config', 'logs', 'data'].map((d) => path.join('.', d));
    for (const d of expected) {
      expect(fs.mkdir).toHaveBeenCalledWith(d);
    }
    expect(report.createdDirs).toEqual(expect.arrayContaining(expected));
  });

  it('已存在的目錄跳過不重複建立', async () => {
    const fs = makeFs({ existing: new Set([path.join('.', 'plugins'), path.join('.', 'config')]) });
    const report = await ensureSetup({
      rootDir: '.',
      exists: fs.exists,
      mkdir: fs.mkdir,
      writeFile: fs.writeFile,
      readFile: fs.readFile,
      nodeVersion: '20.0.0',
      execSync: vi.fn(),
      fetchImpl: vi.fn().mockResolvedValue('{"plugins":[]}'),
    });
    expect(report.skipped).toEqual(expect.arrayContaining([path.join('.', 'plugins'), path.join('.', 'config')]));
    // logs/data 仍要建立
    expect(fs.mkdir).toHaveBeenCalledWith(path.join('.', 'logs'));
    expect(fs.mkdir).toHaveBeenCalledWith(path.join('.', 'data'));
  });

  it('config.yaml 不存在時從範本產生', async () => {
    const fs = makeFs();
    await ensureSetup({
      rootDir: '.',
      exists: fs.exists,
      mkdir: fs.mkdir,
      writeFile: fs.writeFile,
      readFile: fs.readFile,
      nodeVersion: '20.0.0',
      execSync: vi.fn(),
      fetchImpl: vi.fn().mockResolvedValue('{"plugins":[]}'),
    });
    const cfgPath = path.join('.', 'config', 'config.yaml');
    expect(fs.writeFile).toHaveBeenCalledWith(cfgPath, expect.any(String));
    const content = fs.writeFile.mock.calls.find((c) => c[0] === cfgPath)?.[1] as string;
    expect(content.length).toBeGreaterThan(0);
  });

  it('config.yaml 已存在時跳過', async () => {
    const cfgPath = path.join('.', 'config', 'config.yaml');
    const fs = makeFs({ existing: new Set([cfgPath]) });
    const report = await ensureSetup({
      rootDir: '.',
      exists: fs.exists,
      mkdir: fs.mkdir,
      writeFile: fs.writeFile,
      readFile: fs.readFile,
      nodeVersion: '20.0.0',
      execSync: vi.fn(),
      fetchImpl: vi.fn().mockResolvedValue('{"plugins":[]}'),
    });
    expect(report.skipped).toContain(cfgPath);
    expect(fs.writeFile).not.toHaveBeenCalledWith(cfgPath, expect.anything());
  });

  it('產生 .env.example', async () => {
    const fs = makeFs();
    await ensureSetup({
      rootDir: '.',
      exists: fs.exists,
      mkdir: fs.mkdir,
      writeFile: fs.writeFile,
      readFile: fs.readFile,
      nodeVersion: '20.0.0',
      execSync: vi.fn(),
      fetchImpl: vi.fn().mockResolvedValue('{"plugins":[]}'),
    });
    expect(fs.writeFile).toHaveBeenCalledWith(path.join('.', '.env.example'), expect.any(String));
  });

  it('快取官方 registry.json 到本地', async () => {
    const fs = makeFs();
    const fetchImpl = vi.fn().mockResolvedValue('{"plugins":[{"name":"x"}]}');
    await ensureSetup({
      rootDir: '.',
      exists: fs.exists,
      mkdir: fs.mkdir,
      writeFile: fs.writeFile,
      readFile: fs.readFile,
      nodeVersion: '20.0.0',
      execSync: vi.fn(),
      fetchImpl,
    });
    const cachePath = path.join('.', 'data', 'registry.json');
    expect(fetchImpl).toHaveBeenCalled();
    expect(fs.writeFile).toHaveBeenCalledWith(cachePath, '{"plugins":[{"name":"x"}]}');
  });

  it('Node 版本低於 20 時加入 warning', async () => {
    const fs = makeFs();
    const report = await ensureSetup({
      rootDir: '.',
      exists: fs.exists,
      mkdir: fs.mkdir,
      writeFile: fs.writeFile,
      readFile: fs.readFile,
      nodeVersion: '18.0.0',
      execSync: vi.fn(),
      fetchImpl: vi.fn().mockResolvedValue('{"plugins":[]}'),
    });
    expect(report.warnings.length).toBeGreaterThan(0);
    expect(report.warnings.join(' ').toLowerCase()).toContain('node');
  });

  it('執行 pnpm install（透過 execSync 注入）', async () => {
    const fs = makeFs();
    const execSync = vi.fn();
    await ensureSetup({
      rootDir: '.',
      exists: fs.exists,
      mkdir: fs.mkdir,
      writeFile: fs.writeFile,
      readFile: fs.readFile,
      nodeVersion: '20.0.0',
      execSync,
      fetchImpl: vi.fn().mockResolvedValue('{"plugins":[]}'),
    });
    expect(execSync).toHaveBeenCalledWith('pnpm install', expect.anything());
  });

  it('registry 拉取失敗時加入 warning 但不中斷', async () => {
    const fs = makeFs();
    const report = await ensureSetup({
      rootDir: '.',
      exists: fs.exists,
      mkdir: fs.mkdir,
      writeFile: fs.writeFile,
      readFile: fs.readFile,
      nodeVersion: '20.0.0',
      execSync: vi.fn(),
      fetchImpl: vi.fn().mockRejectedValue(new Error('net')),
    });
    expect(report.warnings.join(' ').toLowerCase()).toContain('registry');
  });
});
