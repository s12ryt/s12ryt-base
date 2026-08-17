import { describe, it, expect, vi } from 'vitest';
import { createLifecycle, type Lifecycle } from '../src/context/lifecycle.js';

describe('Lifecycle', () => {
  it('startup 按註冊順序執行 startup 鉤子', async () => {
    const lc = createLifecycle();
    const order: string[] = [];
    lc.onStartup(() => { order.push('a'); });
    lc.onStartup(() => { order.push('b'); });
    await lc.startup();
    expect(order).toEqual(['a', 'b']);
  });

  it('shutdown 按註冊反序執行 shutdown 鉤子', async () => {
    const lc = createLifecycle();
    const order: string[] = [];
    lc.onShutdown(() => { order.push('a'); });
    lc.onShutdown(() => { order.push('b'); });
    await lc.startup();
    await lc.shutdown();
    expect(order).toEqual(['b', 'a']);
  });

  it('startup 鉤子支援 async，依序 await', async () => {
    const lc = createLifecycle();
    const order: string[] = [];
    lc.onStartup(async () => {
      await new Promise((r) => setTimeout(r, 10));
      order.push('slow');
    });
    lc.onStartup(() => { order.push('fast'); });
    await lc.startup();
    expect(order).toEqual(['slow', 'fast']);
  });

  it('onStartup 回傳 unsubscribe，取消後不執行', async () => {
    const lc = createLifecycle();
    const fn = vi.fn();
    const off = lc.onStartup(fn);
    off();
    await lc.startup();
    expect(fn).not.toHaveBeenCalled();
  });

  it('startup 後 phase 為 running', async () => {
    const lc = createLifecycle();
    expect(lc.phase).toBe('idle');
    await lc.startup();
    expect(lc.phase).toBe('running');
  });

  it('shutdown 後 phase 為 stopped', async () => {
    const lc = createLifecycle();
    await lc.startup();
    await lc.shutdown();
    expect(lc.phase).toBe('stopped');
  });

  it('startup 鉤子拋錯時 startup 拒絕，phase 回 idle', async () => {
    const lc = createLifecycle();
    lc.onStartup(() => { throw new Error('boom'); });
    await expect(lc.startup()).rejects.toThrow('boom');
    expect(lc.phase).toBe('idle');
  });

  it('shutdown 鉤子拋錯時 shutdown 拒絕', async () => {
    const lc = createLifecycle();
    await lc.startup();
    lc.onShutdown(() => { throw new Error('bye'); });
    await expect(lc.shutdown()).rejects.toThrow('bye');
  });

  it('重複 startup 拋錯（已在 running）', async () => {
    const lc = createLifecycle();
    await lc.startup();
    await expect(lc.startup()).rejects.toThrow();
  });

  it('未啟動就 shutdown 拋錯', async () => {
    const lc = createLifecycle();
    await expect(lc.shutdown()).rejects.toThrow();
  });
});
