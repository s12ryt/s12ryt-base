/**
 * 預設安裝器實作 — Release 下載 / tarball 解壓 / git clone + local copy。
 *
 * 三個函數對應 Installer 的依賴注入介面：
 *   - defaultDownloader：從 GitHub Release 下載 tarball（Buffer）
 *   - defaultExtractor：解壓 tarball 到目的目錄（strip 第一層目錄）
 *   - defaultGitCloner：git clone（遠端）或本地複製，取出 entry.path 子目錄
 *
 * defaultGitCloner 同時支援遠端 git URL 與本地路徑：
 *   - 遠端（http(s):// 或 git@）：git clone --depth 1 → 複製 entry.path 子目錄
 *   - 本地：直接 cp -r {repo}/{path} dest（用於開發與測試）
 */

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { extract as tarExtract } from 'tar';
import type { RegistryEntry } from './registry-client.js';

/** 判斷 repo 位址是否為遠端（http/https/git@）。 */
export function isRemoteRepo(repo: string): boolean {
  return /^(https?:\/\/|git@)/i.test(repo);
}

/**
 * 下載 GitHub Release tarball。
 * URL 格式：{repo}/releases/download/{tag}/{name}-{tag}.tar.gz
 */
export async function defaultDownloader(entry: RegistryEntry): Promise<Buffer> {
  const tag = entry.releaseTag ?? '';
  if (!tag) throw new Error('No releaseTag specified for release download');
  const fileName = `${entry.name}-${tag}.tar.gz`;
  const url = `${entry.repo}/releases/download/${tag}/${fileName}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Download failed (${res.status}): ${url}`);
  }
  const arrayBuf = await res.arrayBuffer();
  return Buffer.from(arrayBuf);
}

/**
 * 解壓 tarball buffer 到目的目錄。
 * 使用 strip:1 去除 tarball 中的頂層目錄。
 */
export async function defaultExtractor(tarball: Buffer, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true });
  const tmpFile = path.join(dest, '.download.tmp.tar.gz');
  await writeFile(tmpFile, tarball);
  try {
    await tarExtract({ file: tmpFile, cwd: dest, strip: 1 });
  } finally {
    await rm(tmpFile, { force: true });
  }
}

/**
 * Git clone（遠端）或本地目錄複製，取出 entry.path 子目錄到 dest。
 *
 * 遠端：git clone --depth 1 {repo} → 複製 {tmpClone}/{entry.path} 到 dest
 * 本地：直接複製 {repo}/{entry.path} 到 dest（排除 node_modules）
 */
export async function defaultGitCloner(entry: RegistryEntry, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true });

  if (isRemoteRepo(entry.repo)) {
    const tmpClone = `${dest}.__git_tmp__`;
    try {
      execSync(`git clone --depth 1 "${entry.repo}" "${tmpClone}"`, { stdio: 'pipe' });
      const srcDir = path.join(tmpClone, entry.path);
      if (!existsSync(srcDir)) {
        throw new Error(`Plugin subdirectory not found in repo: ${entry.path}`);
      }
      await cp(srcDir, dest, {
        recursive: true,
        filter: (source) => !source.includes('node_modules'),
      });
    } finally {
      await rm(tmpClone, { recursive: true, force: true });
    }
  } else {
    const srcDir = path.join(entry.repo, entry.path);
    if (!existsSync(srcDir)) {
      throw new Error(`Local plugin source not found: ${srcDir}`);
    }
    await cp(srcDir, dest, {
      recursive: true,
      filter: (source) => !source.includes('node_modules'),
    });
  }
}
