import { describe, it, expect, vi } from 'vitest';
import { createConfig } from '../src/context/config.js';

async function makeConfig(initial: string, opts: { watch?: ReturnType<() => () => void> } = {}) {
  let content = initial;
  const readFile = async () => content;
  const watchFile = opts.watch
    ? () => opts.watch as () => void
    : undefined;
  const cfg = await createConfig({
    path: 'memory://config.yaml',
    readFile,
    watchFile,
  });
  return {
    cfg,
    setContent: (c: string) => {
      content = c;
    },
  };
}

describe('config / 載入與讀取', () => {
  it('載入 YAML 並以點路徑 get', async () => {
    const { cfg } = await makeConfig('host:\n  name: s12ryt\n  port: 8080\n');
    expect(cfg.get('host.name')).toBe('s12ryt');
    expect(cfg.get('host.port')).toBe(8080);
  });

  it('get 不存在的 key 回傳 defaultValue', async () => {
    const { cfg } = await makeConfig('a: 1\n');
    expect(cfg.get('not.exist', 'fallback')).toBe('fallback');
    expect(cfg.get('not.exist')).toBeUndefined();
  });

  it('has 正確回報鍵是否存在', async () => {
    const { cfg } = await makeConfig('a:\n  b: 1\n');
    expect(cfg.has('a')).toBe(true);
    expect(cfg.has('a.b')).toBe(true);
    expect(cfg.has('a.c')).toBe(false);
  });

  it('getAll 回傳完整設定物件', async () => {
    const { cfg } = await makeConfig('a: 1\nb:\n  c: 2\n');
    expect(cfg.getAll()).toEqual({ a: 1, b: { c: 2 } });
  });
});

describe('config / 設定', () => {
  it('set 修改既有值', async () => {
    const { cfg } = await makeConfig('a: 1\n');
    cfg.set('a', 2);
    expect(cfg.get('a')).toBe(2);
  });

  it('set 巢狀建立不存在的路徑', async () => {
    const { cfg } = await makeConfig('a: 1\n');
    cfg.set('x.y.z', 5);
    expect(cfg.get('x.y.z')).toBe(5);
  });
});

describe('config / 重新載入', () => {
  it('reload 重新讀取來源', async () => {
    const { cfg, setContent } = await makeConfig('a: 1\n');
    setContent('a: 99\n');
    await cfg.reload();
    expect(cfg.get('a')).toBe(99);
  });

  it('空檔案載入為空物件', async () => {
    const { cfg } = await makeConfig('');
    expect(cfg.getAll()).toEqual({});
  });

  it('reload 後通知 onChanged listener，回傳可取消', async () => {
    const { cfg, setContent } = await makeConfig('a: 1\n');
    const listener = vi.fn();
    const off = cfg.onChanged(listener);
    setContent('a: 2\n');
    await cfg.reload();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0]).toEqual({ a: 2 });
    off();
    setContent('a: 3\n');
    await cfg.reload();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
