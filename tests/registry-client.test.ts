import { describe, it, expect, vi } from 'vitest';
import { createRegistryClient, type RegistryClient, type Registry } from '../src/plugin/registry-client.js';

describe('RegistryClient', () => {
  it('http(s) 來源用 fetch 拉取並解析 registry', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      JSON.stringify({ plugins: [{ name: 'a', version: '1.0.0', repo: 'r', path: 'p' }] }),
    );
    const client = createRegistryClient({ fetchImpl });
    const reg = await client.fetchRegistry('https://example.com/registry.json');
    expect(fetchImpl).toHaveBeenCalledWith('https://example.com/registry.json');
    expect(reg.plugins).toHaveLength(1);
    expect(reg.plugins[0].name).toBe('a');
  });

  it('非 http 來源（local 路徑）用 readFile 讀取', async () => {
    const readFile = vi.fn().mockResolvedValue(
      JSON.stringify({ plugins: [{ name: 'b', version: '2.0.0', repo: 'r2', path: 'p2' }] }),
    );
    const client = createRegistryClient({ readFile });
    const reg = await client.fetchRegistry('../s12ryt-base-plugins/registry.json');
    expect(readFile).toHaveBeenCalledOnce();
    expect(reg.plugins[0].name).toBe('b');
  });

  it('findPlugin 依名稱查詢回傳項目', () => {
    const client = createRegistryClient();
    const reg: Registry = {
      plugins: [
        { name: 'a', version: '1.0.0', repo: 'r', path: 'p' },
        { name: 'b', version: '2.0.0', repo: 'r2', path: 'p2', releaseTag: 'v1' },
      ],
    };
    const found = client.findPlugin(reg, 'b');
    expect(found?.version).toBe('2.0.0');
    expect(found?.releaseTag).toBe('v1');
  });

  it('findPlugin 找不到時回傳 undefined', () => {
    const client = createRegistryClient();
    const reg: Registry = { plugins: [] };
    expect(client.findPlugin(reg, 'none')).toBeUndefined();
  });

  it('registry 缺少 plugins 欄位時拋錯', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(JSON.stringify({}));
    const client = createRegistryClient({ fetchImpl });
    await expect(client.fetchRegistry('https://x/y.json')).rejects.toThrow(/plugins/i);
  });

  it('registry 項目缺少必填欄位時拋錯', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      JSON.stringify({ plugins: [{ name: 'a', version: '1.0.0' }] }), // 缺 repo/path
    );
    const client = createRegistryClient({ fetchImpl });
    await expect(client.fetchRegistry('https://x/y.json')).rejects.toThrow(/repo|path|field/i);
  });

  it('遠端回應非有效 JSON 時拋錯', async () => {
    const fetchImpl = vi.fn().mockResolvedValue('not json');
    const client = createRegistryClient({ fetchImpl });
    await expect(client.fetchRegistry('https://x/y.json')).rejects.toThrow();
  });

  it('空 plugins 陣列為合法 registry', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(JSON.stringify({ plugins: [] }));
    const client = createRegistryClient({ fetchImpl });
    const reg = await client.fetchRegistry('https://x/y.json');
    expect(reg.plugins).toEqual([]);
  });
});
