/**
 * PluginLoader - 動態載入插件模組並解析/驗證 manifest。
 *
 * 流程：
 *  1. 讀取 <pluginPath>/manifest.yaml
 *  2. 解析為 PluginManifest
 *  3. 驗證必填欄位
 *  4. 驗證 hostCompatibility（semver.satisfies）
 *  5. 載入 <pluginPath>/<main ?? dist/index.js>
 *  6. 從模組匯出取得 Plugin（default > plugin > 模組本身）
 *
 * 透過依賴注入 readFile / loadModule / parseManifest 確保測試決定性。
 */

import path from 'node:path';
import { readFile as fsReadFile } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import semver from 'semver';
import type { Plugin, PluginManifest } from '../context/contract.js';

export interface LoadedPlugin {
  plugin: Plugin;
  manifest: PluginManifest;
}

export interface PluginLoaderOptions {
  /** 主機版本，用於 hostCompatibility 檢查。 */
  hostVersion: string;
  /** 讀取檔案內容（預設 node:fs/promises）。 */
  readFile?: (p: string) => Promise<string>;
  /** 解析 manifest 內容（預設 YAML parse）。 */
  parseManifest?: (content: string) => unknown;
  /** 動態載入模組（預設 dynamic import）。 */
  loadModule?: (p: string) => Promise<unknown>;
}

export interface PluginLoader {
  load(pluginPath: string): Promise<LoadedPlugin>;
}

const DEFAULT_MAIN = 'dist/index.js';
const REQUIRED_FIELDS: (keyof PluginManifest)[] = [
  'name',
  'version',
  'description',
  'author',
  'hostCompatibility',
];

export function createPluginLoader(options: PluginLoaderOptions): PluginLoader {
  const readFile = options.readFile ?? ((p) => fsReadFile(p, 'utf8'));
  const parseManifest = options.parseManifest ?? ((c) => parseYaml(c));
  const loadModule =
    options.loadModule ??
    ((p) => import(pathToFileUrl(p)));

  async function load(pluginPath: string): Promise<LoadedPlugin> {
    const manifestPath = path.join(pluginPath, 'manifest.yaml');
    const content = await readFile(manifestPath);
    const manifest = parseManifest(content) as PluginManifest;

    validateManifest(manifest);

    if (!semver.satisfies(options.hostVersion, manifest.hostCompatibility)) {
      throw new Error(
        `Plugin "${manifest.name}" is incompatible: requires host ${manifest.hostCompatibility}, but host is ${options.hostVersion}`,
      );
    }

    const mainRel = manifest.main ?? DEFAULT_MAIN;
    const mainPath = path.join(pluginPath, mainRel);
    const mod = (await loadModule(mainPath)) as Record<string, unknown>;
    const plugin = extractPlugin(mod);

    return { plugin, manifest };
  }

  return { load };
}

function validateManifest(m: PluginManifest): void {
  for (const field of REQUIRED_FIELDS) {
    const val = m[field];
    if (val === undefined || val === null || val === '') {
      throw new Error(`Plugin manifest missing required field: ${field}`);
    }
  }
}

function extractPlugin(mod: Record<string, unknown>): Plugin {
  const candidate = (mod.default ?? mod.plugin ?? mod) as Partial<Plugin> | undefined;
  if (
    candidate &&
    typeof candidate === 'object' &&
    typeof candidate.activate === 'function' &&
    candidate.manifest !== undefined
  ) {
    return candidate as Plugin;
  }
  throw new Error(
    'Plugin module does not export a valid Plugin (expected default export or named "plugin" with activate() and manifest)',
  );
}

function pathToFileUrl(p: string): string {
  // 在 Windows 與 POSIX 通用：使用 path.resolve 後轉 file:// URL
  const resolved = path.resolve(p);
  const posix = resolved.replace(/\\/g, '/');
  return `file://${posix}`;
}
