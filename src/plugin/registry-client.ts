/**
 * RegistryClient - 從 remote（http(s)）或 local 路徑拉取 registry.json。
 *
 * registry.json 結構：{ plugins: RegistryEntry[] }
 * 來源以是否為 http(s):// 開頭判斷 remote/local。
 */

import { readFile as fsReadFile } from 'node:fs/promises';

export interface RegistryEntry {
  name: string;
  version: string;
  /** 插件來源 repo 位址（git URL 或 GitHub owner/repo）。 */
  repo: string;
  /** repo 內插件子目錄路徑。 */
  path: string;
  /** Release tag（Release 優先安裝時使用）。 */
  releaseTag?: string;
}

export interface Registry {
  plugins: RegistryEntry[];
}

export interface RegistryClientOptions {
  /** 遠端拉取實作（預設使用全域 fetch）。 */
  fetchImpl?: (url: string) => Promise<string>;
  /** 本地檔案讀取（預設 node:fs/promises）。 */
  readFile?: (p: string) => Promise<string>;
}

export interface RegistryClient {
  fetchRegistry(source: string): Promise<Registry>;
  findPlugin(registry: Registry, name: string): RegistryEntry | undefined;
}

const REQUIRED_FIELDS: (keyof RegistryEntry)[] = ['name', 'version', 'repo', 'path'];

function isHttpSource(source: string): boolean {
  return /^https?:\/\//i.test(source);
}

export function createRegistryClient(options: RegistryClientOptions = {}): RegistryClient {
  const fetchImpl =
    options.fetchImpl ??
    (async (url: string) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch registry (${res.status}): ${url}`);
      return res.text();
    });
  const readFile = options.readFile ?? ((p) => fsReadFile(p, 'utf8'));

  async function fetchRegistry(source: string): Promise<Registry> {
    const content = isHttpSource(source) ? await fetchImpl(source) : await readFile(source);
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error(`Registry source is not valid JSON: ${source}`);
    }
    const obj = parsed as Partial<Registry>;
    if (!obj || !Array.isArray(obj.plugins)) {
      throw new Error(`Registry must contain a "plugins" array: ${source}`);
    }
    for (const entry of obj.plugins) {
      for (const field of REQUIRED_FIELDS) {
        const val = entry?.[field];
        if (val === undefined || val === null || val === '') {
          throw new Error(`Registry entry missing required field "${field}": ${JSON.stringify(entry)}`);
        }
      }
    }
    return { plugins: obj.plugins };
  }

  function findPlugin(registry: Registry, name: string): RegistryEntry | undefined {
    return registry.plugins.find((p) => p.name === name);
  }

  return { fetchRegistry, findPlugin };
}
