/**
 * YAML 設定存取 + 熱重載（Context API 的一部分）。
 */
import { readFile as fsReadFile } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import { isPlainObject } from '../utils/index.js';

export interface Config {
  get<T = unknown>(key: string, defaultValue?: T): T | undefined;
  set(key: string, value: unknown): void;
  has(key: string): boolean;
  getAll(): Record<string, unknown>;
  reload(): Promise<void>;
  onChanged(listener: (config: Record<string, unknown>) => void): () => void;
  stop(): void;
}

export type ReadFileFn = (path: string) => Promise<string>;
export type WatchFileFn = (path: string, onChange: () => void) => () => void;

export interface ConfigOptions {
  path: string;
  readFile?: ReadFileFn;
  /** 提供檔案監聽器以啟用熱重載；回傳 unsubscribe。 */
  watchFile?: WatchFileFn;
}

async function defaultReadFile(path: string): Promise<string> {
  try {
    return await fsReadFile(path, 'utf8');
  } catch {
    return '';
  }
}

export async function createConfig(options: ConfigOptions): Promise<Config> {
  const readFile = options.readFile ?? defaultReadFile;
  let data: Record<string, unknown> = {};
  const listeners = new Set<(config: Record<string, unknown>) => void>();

  async function load(): Promise<void> {
    const raw = await readFile(options.path);
    const trimmed = raw.trim();
    const parsed = trimmed ? parseYaml(raw) : {};
    data = isPlainObject(parsed) ? parsed : {};
  }

  async function reload(): Promise<void> {
    await load();
    for (const listener of listeners) listener(data);
  }

  await load();

  let stopWatch: (() => void) | undefined;
  if (options.watchFile) {
    stopWatch = options.watchFile(options.path, () => {
      void reload();
    });
  }

  function get<T = unknown>(key: string, defaultValue?: T): T | undefined {
    const parts = key.split('.');
    let cur: unknown = data;
    for (const part of parts) {
      if (isPlainObject(cur) && Object.prototype.hasOwnProperty.call(cur, part)) {
        cur = cur[part];
      } else {
        return defaultValue;
      }
    }
    return cur as T | undefined;
  }

  function set(key: string, value: unknown): void {
    const parts = key.split('.');
    let cur: Record<string, unknown> = data;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!isPlainObject(cur[part])) cur[part] = {};
      cur = cur[part] as Record<string, unknown>;
    }
    cur[parts[parts.length - 1]] = value;
  }

  function has(key: string): boolean {
    const parts = key.split('.');
    let cur: unknown = data;
    for (const part of parts) {
      if (isPlainObject(cur) && Object.prototype.hasOwnProperty.call(cur, part)) {
        cur = cur[part];
      } else {
        return false;
      }
    }
    return true;
  }

  function getAll(): Record<string, unknown> {
    return data;
  }

  function onChanged(listener: (config: Record<string, unknown>) => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function stop(): void {
    stopWatch?.();
    listeners.clear();
  }

  return { get, set, has, getAll, reload, onChanged, stop };
}
