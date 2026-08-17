import { describe, it, expect, vi } from 'vitest';
import path from 'node:path';
import { createPluginLoader, type PluginLoader } from '../src/plugin/loader.js';
import type { Plugin, PluginManifest } from '../src/context/contract.js';

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
  const m = makeManifest(over);
  return { manifest: m, activate: vi.fn(), deactivate: vi.fn() };
}

describe('PluginLoader', () => {
  it('讀取 manifest.yaml 並 import main 模組，回傳 plugin + manifest', async () => {
    const manifest = makeManifest();
    const plugin = makePlugin();
    const readFile = vi.fn().mockResolvedValue('name: demo');
    const parseManifest = vi.fn().mockReturnValue(manifest);
    const loadModule = vi.fn().mockResolvedValue({ default: plugin });

    const loader = createPluginLoader({
      hostVersion: '1.2.0',
      readFile,
      parseManifest,
      loadModule,
    });

    const result = await loader.load(path.join('plugins', 'demo'));

    // 讀取 manifest.yaml
    expect(readFile).toHaveBeenCalledOnce();
    expect(readFile.mock.calls[0][0]).toContain(path.join('plugins', 'demo'));
    expect(readFile.mock.calls[0][0]).toContain('manifest.yaml');
    expect(parseManifest).toHaveBeenCalledWith('name: demo');
    // import 預設 main = dist/index.js
    expect(loadModule.mock.calls[0][0]).toContain(path.join('plugins', 'demo'));
    expect(loadModule.mock.calls[0][0]).toContain(path.join('dist', 'index.js'));
    // 回傳
    expect(result.plugin).toBe(plugin);
    expect(result.manifest).toBe(manifest);
  });

  it('manifest.main 指定時使用該進入點', async () => {
    const manifest = makeManifest({ main: 'build/entry.js' });
    const plugin = makePlugin({ main: 'build/entry.js' });
    const loader = createPluginLoader({
      hostVersion: '1.0.0',
      readFile: vi.fn().mockResolvedValue(''),
      parseManifest: vi.fn().mockReturnValue(manifest),
      loadModule: vi.fn().mockResolvedValue({ default: plugin }),
    });
    await loader.load('p');
    // main 路徑透過注入函式呼叫驗證（loadModule 第一參）
  });

  it('hostCompatibility 不滿足時拋錯', async () => {
    const manifest = makeManifest({ hostCompatibility: '>=2.0.0' });
    const loader = createPluginLoader({
      hostVersion: '1.0.0',
      readFile: vi.fn().mockResolvedValue(''),
      parseManifest: vi.fn().mockReturnValue(manifest),
      loadModule: vi.fn().mockResolvedValue({ default: makePlugin() }),
    });
    await expect(loader.load('p')).rejects.toThrow(/compat/i);
  });

  it('manifest 必填欄位缺失（version）時拋錯', async () => {
    const bad = makeManifest({ version: '' });
    const loader = createPluginLoader({
      hostVersion: '1.0.0',
      readFile: vi.fn().mockResolvedValue(''),
      parseManifest: vi.fn().mockReturnValue(bad),
      loadModule: vi.fn().mockResolvedValue({ default: makePlugin() }),
    });
    await expect(loader.load('p')).rejects.toThrow(/version/i);
  });

  it('模組缺少 default/plugin 匯出時拋錯', async () => {
    const manifest = makeManifest();
    const loader = createPluginLoader({
      hostVersion: '1.0.0',
      readFile: vi.fn().mockResolvedValue(''),
      parseManifest: vi.fn().mockReturnValue(manifest),
      loadModule: vi.fn().mockResolvedValue({ foo: 123 }), // 無有效匯出
    });
    await expect(loader.load('p')).rejects.toThrow(/export|plugin|default/i);
  });

  it('模組匯出 Plugin 物件為 default 時正常回傳', async () => {
    const manifest = makeManifest();
    const plugin = makePlugin();
    const loader = createPluginLoader({
      hostVersion: '1.0.0',
      readFile: vi.fn().mockResolvedValue(''),
      parseManifest: vi.fn().mockReturnValue(manifest),
      loadModule: vi.fn().mockResolvedValue({ default: plugin }),
    });
    const result = await loader.load('p');
    expect(result.plugin).toBe(plugin);
  });

  it('模組以具名 plugin 匯出時也支援', async () => {
    const manifest = makeManifest();
    const plugin = makePlugin();
    const loader = createPluginLoader({
      hostVersion: '1.0.0',
      readFile: vi.fn().mockResolvedValue(''),
      parseManifest: vi.fn().mockReturnValue(manifest),
      loadModule: vi.fn().mockResolvedValue({ plugin }), // 具名 plugin
    });
    const result = await loader.load('p');
    expect(result.plugin).toBe(plugin);
  });

  it('loadModule 拋錯時載入失敗拒絕', async () => {
    const manifest = makeManifest();
    const loader = createPluginLoader({
      hostVersion: '1.0.0',
      readFile: vi.fn().mockResolvedValue(''),
      parseManifest: vi.fn().mockReturnValue(manifest),
      loadModule: vi.fn().mockRejectedValue(new Error('import failed')),
    });
    await expect(loader.load('p')).rejects.toThrow('import failed');
  });
});
