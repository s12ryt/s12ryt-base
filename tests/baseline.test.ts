import { describe, it, expect } from 'vitest';

describe('baseline', () => {
  it('vitest 環境可運行', () => {
    expect(1 + 1).toBe(2);
  });

  it('ESM 動態 import 可用', async () => {
    const mod = await import('node:path');
    expect(typeof mod.join).toBe('function');
  });
});
