import { describe, it, expect, vi } from 'vitest';
import path from 'node:path';
import { createInstaller, type Installer } from '../src/plugin/installer.js';
import type { RegistryEntry } from '../src/plugin/registry-client.js';

function makeEntry(over: Partial<RegistryEntry> = {}): RegistryEntry {
  return { name: 'demo', version: '1.0.0', repo: 'owner/repo', path: 'plugins/demo', ...over };
}

type MockFn = ReturnType<typeof vi.fn>;

function makeInstaller(over: {
  confirm?: MockFn;
  download?: MockFn;
  extract?: MockFn;
  gitClone?: MockFn;
  exists?: MockFn;
  remove?: MockFn;
} = {}): {
  installer: Installer;
  fns: {
    confirm: MockFn;
    download: MockFn;
    extract: MockFn;
    gitClone: MockFn;
    exists: MockFn;
    remove: MockFn;
  };
} {
  const confirm = over.confirm ?? vi.fn().mockResolvedValue(true);
  const download = over.download ?? vi.fn().mockResolvedValue(Buffer.from('tar'));
  const extract = over.extract ?? vi.fn().mockResolvedValue(undefined);
  const gitClone = over.gitClone ?? vi.fn().mockResolvedValue(undefined);
  const exists = over.exists ?? vi.fn().mockResolvedValue(false);
  const remove = over.remove ?? vi.fn().mockResolvedValue(undefined);
  const installer = createInstaller({
    pluginsDir: 'plugins',
    confirm,
    downloader: download,
    extractor: extract,
    gitCloner: gitClone,
    existsDir: exists,
    removeDir: remove,
  });
  return { installer, fns: { confirm, download, extract, gitClone, exists, remove } };
}

describe('Installer', () => {
  it('有 releaseTag 時優先使用 release 策略（download + extract）', async () => {
    const { installer, fns } = makeInstaller();
    const res = await installer.install(makeEntry({ releaseTag: 'v1.0.0' }));
    expect(res.strategy).toBe('release');
    expect(fns.download).toHaveBeenCalledOnce();
    expect(fns.extract).toHaveBeenCalledOnce();
    expect(fns.gitClone).not.toHaveBeenCalled();
    expect(res.path).toBe(path.join('plugins', 'demo'));
  });

  it('無 releaseTag 時使用 git 策略', async () => {
    const { installer, fns } = makeInstaller();
    const res = await installer.install(makeEntry());
    expect(res.strategy).toBe('git');
    expect(fns.gitClone).toHaveBeenCalledOnce();
    expect(fns.download).not.toHaveBeenCalled();
  });

  it('release 下載失敗時 fallback 到 git', async () => {
    const download = vi.fn().mockRejectedValue(new Error('net'));
    const { installer, fns } = makeInstaller({ download });
    const res = await installer.install(makeEntry({ releaseTag: 'v1' }));
    expect(res.strategy).toBe('git');
    expect(fns.gitClone).toHaveBeenCalledOnce();
  });

  it('release 與 git 都失敗時拋錯', async () => {
    const download = vi.fn().mockRejectedValue(new Error('net'));
    const gitClone = vi.fn().mockRejectedValue(new Error('git'));
    const { installer } = makeInstaller({ download, gitClone });
    await expect(installer.install(makeEntry({ releaseTag: 'v1' }))).rejects.toThrow();
  });

  it('安裝前呼叫 confirm，回傳 false 時取消安裝', async () => {
    const confirm = vi.fn().mockResolvedValue(false);
    const { installer, fns } = makeInstaller({ confirm });
    await expect(installer.install(makeEntry())).rejects.toThrow(/cancel/i);
    expect(fns.download).not.toHaveBeenCalled();
    expect(fns.gitClone).not.toHaveBeenCalled();
  });

  it('opts.yes=true 時跳過 confirm', async () => {
    const confirm = vi.fn();
    const { installer } = makeInstaller({ confirm });
    await installer.install(makeEntry(), { yes: true });
    expect(confirm).not.toHaveBeenCalled();
  });

  it('已安裝同名插件（existsDir=true）時拋錯，除非先 uninstall', async () => {
    const exists = vi.fn().mockResolvedValue(true);
    const { installer } = makeInstaller({ exists });
    await expect(installer.install(makeEntry())).rejects.toThrow(/exist|installed/i);
  });

  it('uninstall 移除插件目錄', async () => {
    const { installer, fns } = makeInstaller();
    await installer.uninstall('demo');
    expect(fns.remove).toHaveBeenCalledWith(path.join('plugins', 'demo'));
  });

  it('isInstalled 依 existsDir 判斷', async () => {
    const exists = vi.fn().mockResolvedValue(true);
    const { installer } = makeInstaller({ exists });
    expect(await installer.isInstalled('demo')).toBe(true);
    expect(exists).toHaveBeenCalledWith(path.join('plugins', 'demo'));
  });

  it('confirm 訊息包含插件名稱與版本', async () => {
    const confirm = vi.fn().mockResolvedValue(true);
    const { installer } = makeInstaller({ confirm });
    await installer.install(makeEntry({ name: 'foo', version: '3.1.0' }));
    const msg = confirm.mock.calls[0][0] as string;
    expect(msg).toContain('foo');
    expect(msg).toContain('3.1.0');
  });
});
