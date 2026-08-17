/**
 * 結構化分級日誌（Context API 的一部分）。
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface LogEntry {
  level: LogLevel;
  timestamp: string;
  name: string;
  message: string;
  meta?: Record<string, unknown>;
}

export type LogTransport = (entry: LogEntry) => void;

export interface Logger {
  readonly name: string;
  readonly level: LogLevel;
  child(name: string): Logger;
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  log(level: LogLevel, message: string, meta?: Record<string, unknown>): void;
}

export interface LoggerOptions {
  name?: string;
  level?: LogLevel;
  transport?: LogTransport;
  /** 提供自訂時間戳產生器（測試用）。 */
  now?: () => Date;
}

const DEFAULT_TRANSPORT: LogTransport = (entry) => {
  const text = `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.name}] ${entry.message}`;
  const meta = entry.meta ? ' ' + JSON.stringify(entry.meta) : '';
  const line = text + meta;
  if (entry.level === 'error') console.error(line);
  else if (entry.level === 'warn') console.warn(line);
  else console.log(line);
};

export function createLogger(options: LoggerOptions = {}): Logger {
  const name = options.name ?? 'app';
  const level: LogLevel = options.level ?? 'info';
  const transport: LogTransport = options.transport ?? DEFAULT_TRANSPORT;
  const now = options.now ?? (() => new Date());

  function log(
    lvl: LogLevel,
    message: string,
    meta?: Record<string, unknown>,
  ): void {
    if (LOG_LEVEL_ORDER[lvl] < LOG_LEVEL_ORDER[level]) return;
    const entry: LogEntry = {
      level: lvl,
      timestamp: now().toISOString(),
      name,
      message,
    };
    if (meta !== undefined) entry.meta = meta;
    transport(entry);
  }

  return {
    name,
    level,
    child(childName: string): Logger {
      return createLogger({
        name: `${name}:${childName}`,
        level,
        transport,
        now,
      });
    },
    debug: (m, meta) => log('debug', m, meta),
    info: (m, meta) => log('info', m, meta),
    warn: (m, meta) => log('warn', m, meta),
    error: (m, meta) => log('error', m, meta),
    log,
  };
}
