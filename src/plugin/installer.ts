/**
 * Installer - 插件安裝/解除安裝。
 *
 * 安裝策略：Release 優先 / git 備援。
 *   - 若 entry.releaseTag 存在，先嘗試 release（download tarball + extract）；
 *     失敗則 fallback 到 git。
 *   - 無 releaseTag 直接使用 git。
 *
 * 安裝前透過 confirm() 詢問使用者；opts.yes=true 時跳過確認。
 * 透過依賴注入 downloader/extractor/gitCloner/existsDir/removeDir 確保測試決定性。
 */

import path from 'node:path';
import { existsSync } from 'node:fs';
import { rm as fsRm } from 'node:fs/promises';
import type { RegistryEntry } from './registry-client.js';

export type InstallStrategy = 'release' | 'git';

export interface InstallResult {
  name: string;
  version: string;
  strategy: InstallStrategy;
  path: string;
}

export interface InstallOpts {
  /** 跳過互動確認。 */
  yes?: boolean;
}

export interface InstallerOptions {
  pluginsDir: string;
  /** 互動確認；回傳 false 取消安裝。 */
  confirm?: (message: string) => Promise<boolean>;
  /** Release 下載 tarball。 */
  downloader?: (entry: RegistryEntry) => Promise<Buffer>;
  /** 解壓 tarball 到目的目錄。 */
  extractor?: (tarball: Buffer, dest: string) => Promise<void>;
  /** git 備援：clone repo 並取出 entry.path 子目錄到目的目錄。 */
  gitCloner?: (entry: RegistryEntry, dest: string) => Promise<void>;
  /** 判斷目錄是否存在（預設 existsSync）。 */
  existsDir?: (p: string) => Promise<boolean>;
  /** 移除目錄（預設 fs.rm recursive）。 */
  removeDir?: (p: string) => Promise<void>;
}

export interface Installer {
  install(entry: RegistryEntry, opts?: InstallOpts): Promise<InstallResult>;
  uninstall(name: string): Promise<void>;
  isInstalled(name: string): Promise<boolean>;
}

export function createInstaller(options: InstallerOptions): Installer {
  const confirm = options.confirm ?? (async () => true);
  const downloader = options.downloader;
  const extractor = options.extractor;
  const gitCloner = options.gitCloner;
  const existsDir = options.existsDir ?? ((p) => Promise.resolve(existsSync(p)));
  const removeDir = options.removeDir ?? ((p) => fsRm(p, { recursive: true, force: true }));

  async function tryRelease(entry: RegistryEntry, dest: string): Promise<void> {
    if (!downloader || !extractor) {
      throw new Error('Release installer not configured (missing downloader/extractor)');
    }
    const tarball = await downloader(entry);
    await extractor(tarball, dest);
  }

  async function tryGit(entry: RegistryEntry, dest: string): Promise<void> {
    if (!gitCloner) throw new Error('Git installer not configured (missing gitCloner)');
    await gitCloner(entry, dest);
  }

  async function install(entry: RegistryEntry, opts: InstallOpts = {}): Promise<InstallResult> {
    const dest = path.join(options.pluginsDir, entry.name);

    if (await existsDir(dest)) {
      throw new Error(`Plugin already installed: ${entry.name} (at ${dest})`);
    }

    if (!opts.yes) {
      const msg = `Install plugin "${entry.name}" v${entry.version} from ${entry.repo}?`;
      const ok = await confirm(msg);
      if (!ok) throw new Error(`Installation cancelled: ${entry.name}`);
    }

    const useReleaseFirst = Boolean(entry.releaseTag);
    let strategy: InstallStrategy | undefined;
    let lastError: unknown;

    if (useReleaseFirst) {
      try {
        await tryRelease(entry, dest);
        strategy = 'release';
      } catch (err) {
        lastError = err;
        try {
          await tryGit(entry, dest);
          strategy = 'git';
        } catch (err2) {
          throw new Error(
            `Failed to install "${entry.name}" (release & git both failed): ` +
              `${(err as Error).message}; ${(err2 as Error).message}`,
          );
        }
      }
    } else {
      try {
        await tryGit(entry, dest);
        strategy = 'git';
      } catch (err) {
        throw new Error(`Failed to install "${entry.name}" via git: ${(err as Error).message}`);
      }
    }

    return { name: entry.name, version: entry.version, strategy: strategy!, path: dest };
  }

  async function uninstall(name: string): Promise<void> {
    const dest = path.join(options.pluginsDir, name);
    await removeDir(dest);
  }

  async function isInstalled(name: string): Promise<boolean> {
    return existsDir(path.join(options.pluginsDir, name));
  }

  return { install, uninstall, isInstalled };
}
