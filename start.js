/**
 * start.js - 簡易純 JS 首次設定腳手架。
 *
 * 直接執行 `node start.js` 即可補全執行環境：
 *   1. 建立目錄結構（plugins/、config/、logs/、data/）
 *   2. 從範本產生 config/config.yaml（保留需填寫佔位符）
 *   3. 建立 .env.example
 *   4. 檢查 Node >=20，執行 pnpm install
 *   5. 快取官方 registry.json 到 data/registry.json
 *
 * 核心邏輯 ensureSetup() 全依賴注入，確保可單元測試；
 * 直接執行時以真實 fs / fetch / execSync 呼叫。
 *
 * 本檔為純 JavaScript（ESM），不需 build 即可執行。
 */

import { mkdir, writeFile, access } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

/** 預設建立的目錄。 */
export const DEFAULT_DIRS = ['plugins', 'config', 'logs', 'data'];

/** 預設官方 registry URL（發布後替換為實際位址）。 */
export const DEFAULT_REGISTRY_URL =
  'https://raw.githubusercontent.com/s12ryt/s12ryt-base-plugins/main/registry.json';

/** config.yaml 範本內容。 */
export const CONFIG_TEMPLATE = `# s12ryt-base 設定檔
# 請檢查並填寫下方需要調整的項目。

host:
  name: s12ryt-base
  version: 1.0.0

# 插件 registry 來源（可改為本地路徑或自訂 URL）
registry:
  source: ${DEFAULT_REGISTRY_URL}

# 以下為各插件共用設定區，依需求填寫
# plugins:
#   template:
#     enabled: true
`;

/** .env.example 內容。 */
export const ENV_TEMPLATE = `# 環境變數範本
# 請複製為 .env 並填寫需要的值。

# LOG_LEVEL=info
`;

/**
 * ensureSetup - 補全首次設定所需的所有檔案與目錄。
 *
 * 所有副作用皆透過 options 注入，確保測試決定性。
 *
 * @param {object} options
 * @returns {Promise<{createdDirs:string[], createdFiles:string[], skipped:string[], warnings:string[]}>}
 */
export async function ensureSetup(options = {}) {
  const rootDir = options.rootDir ?? '.';
  const dirs = options.dirs ?? DEFAULT_DIRS;
  const exists = options.exists ?? ((p) => access(p).then(() => true).catch(() => false));
  const mkdirFn = options.mkdir ?? ((p) => mkdir(p, { recursive: true }));
  const writeFileFn = options.writeFile ?? ((p, content) => writeFile(p, content, 'utf8'));
  const nodeVersion = options.nodeVersion ?? process.versions.node;
  const execSyncFn = options.execSync ?? ((cmd, opts) => { execSync(cmd, opts); });
  const registryUrl = options.registryUrl ?? DEFAULT_REGISTRY_URL;
  const fetchImpl = options.fetchImpl ?? (async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  });

  const createdDirs = [];
  const createdFiles = [];
  const skipped = [];
  const warnings = [];

  const join = (rel) => path.join(rootDir, rel);

  // 1. 建立目錄
  for (const d of dirs) {
    const full = join(d);
    if (await exists(full)) {
      skipped.push(full);
    } else {
      await mkdirFn(full);
      createdDirs.push(full);
    }
  }

  // 2. config/config.yaml
  const cfgPath = join(path.join('config', 'config.yaml'));
  if (await exists(cfgPath)) {
    skipped.push(cfgPath);
  } else {
    await writeFileFn(cfgPath, CONFIG_TEMPLATE);
    createdFiles.push(cfgPath);
  }

  // 3. .env.example
  const envPath = join('.env.example');
  if (await exists(envPath)) {
    skipped.push(envPath);
  } else {
    await writeFileFn(envPath, ENV_TEMPLATE);
    createdFiles.push(envPath);
  }

  // 4. Node 版本檢查
  const major = parseInt(String(nodeVersion).split('.')[0], 10);
  if (Number.isNaN(major) || major < 20) {
    warnings.push(`Node version ${nodeVersion} is below required v20. Please upgrade Node.js.`);
  }

  // 執行 pnpm install
  try {
    execSyncFn('pnpm install', { stdio: 'inherit', cwd: rootDir });
  } catch {
    warnings.push('Failed to run "pnpm install". Please run it manually.');
  }

  // 5. 快取 registry.json
  try {
    const content = await fetchImpl(registryUrl);
    const cachePath = join(path.join('data', 'registry.json'));
    await writeFileFn(cachePath, content);
    createdFiles.push(cachePath);
  } catch (err) {
    warnings.push(`Failed to cache registry.json: ${err.message ?? err}. You can fetch it manually later.`);
  }

  return { createdDirs, createdFiles, skipped, warnings };
}

/**
 * 直接執行入口：補全後印出報告並提示，然後關閉程式。
 */
async function main() {
  const report = await ensureSetup({ rootDir: process.cwd() });

  if (report.createdDirs.length) {
    console.log(`Created directories: ${report.createdDirs.join(', ')}`);
  }
  if (report.createdFiles.length) {
    console.log(`Created files: ${report.createdFiles.join(', ')}`);
  }
  if (report.skipped.length) {
    console.log(`Skipped (already exist): ${report.skipped.join(', ')}`);
  }
  for (const w of report.warnings) {
    console.warn(`Warning: ${w}`);
  }

  console.log('\n已經補全完成! 請去檢查有無需要填寫的東西');
  // 使用 exitCode 而非 process.exit()，讓事件循環自然 drain，
  // 避免在仍有 pending 連線（如 fetch）時強制退出導致 libuv crash。
  process.exitCode = 0;
}

// 僅在直接執行（非被 import）時執行 main
const isMain = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main();
}
