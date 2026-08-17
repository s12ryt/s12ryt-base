/**
 * start.js 的型別宣告（純 JS 實作的型別補充）。
 * start.js 本身為純 JavaScript，此檔提供 TypeScript 型別資訊。
 */

export interface SetupReport {
  createdDirs: string[];
  createdFiles: string[];
  skipped: string[];
  warnings: string[];
}

export interface SetupOptions {
  rootDir?: string;
  dirs?: string[];
  exists?: (p: string) => boolean | Promise<boolean>;
  mkdir?: (p: string) => void | Promise<void>;
  writeFile?: (p: string, content: string) => void | Promise<void>;
  readFile?: (p: string) => string | Promise<string>;
  nodeVersion?: string;
  execSync?: (cmd: string, opts?: unknown) => void;
  registryUrl?: string;
  fetchImpl?: (url: string) => string | Promise<string>;
}

export declare const DEFAULT_DIRS: string[];
export declare const DEFAULT_REGISTRY_URL: string;
export declare const CONFIG_TEMPLATE: string;
export declare const ENV_TEMPLATE: string;
export declare function ensureSetup(options?: SetupOptions): Promise<SetupReport>;
