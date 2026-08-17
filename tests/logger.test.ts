import { describe, it, expect, vi } from 'vitest';
import { createLogger, LOG_LEVEL_ORDER, type LogEntry } from '../src/context/logger.js';

function capture() {
  const entries: LogEntry[] = [];
  const transport = (e: LogEntry) => entries.push(e);
  return { entries, transport };
}

describe('logger / 基本輸出', () => {
  it('info 輸出結構化 LogEntry', () => {
    const { entries, transport } = capture();
    const log = createLogger({ name: 'host', level: 'debug', transport });
    log.info('hello', { foo: 1 });
    expect(entries).toHaveLength(1);
    expect(entries[0].level).toBe('info');
    expect(entries[0].name).toBe('host');
    expect(entries[0].message).toBe('hello');
    expect(entries[0].meta).toEqual({ foo: 1 });
    expect(typeof entries[0].timestamp).toBe('string');
    expect(new Date(entries[0].timestamp).getTime()).not.toBeNaN();
  });

  it('四個分級方法各自帶正確 level', () => {
    const { entries, transport } = capture();
    const log = createLogger({ name: 'h', level: 'debug', transport });
    log.debug('d');
    log.info('i');
    log.warn('w');
    log.error('e');
    expect(entries.map((e) => e.level)).toEqual(['debug', 'info', 'warn', 'error']);
  });

  it('meta 為選填，未給時不存在或為 undefined', () => {
    const { entries, transport } = capture();
    const log = createLogger({ name: 'h', level: 'debug', transport });
    log.info('no-meta');
    expect(entries[0].message).toBe('no-meta');
    expect(entries[0].meta).toBeUndefined();
  });
});

describe('logger / 等級過濾', () => {
  it('level=warn 時 debug/info 不輸出，warn/error 輸出', () => {
    const { entries, transport } = capture();
    const log = createLogger({ name: 'h', level: 'warn', transport });
    log.debug('d');
    log.info('i');
    log.warn('w');
    log.error('e');
    expect(entries.map((e) => e.level)).toEqual(['warn', 'error']);
  });

  it('LOG_LEVEL_ORDER 順序為 debug<info<warn<error', () => {
    expect(LOG_LEVEL_ORDER.debug).toBeLessThan(LOG_LEVEL_ORDER.info);
    expect(LOG_LEVEL_ORDER.info).toBeLessThan(LOG_LEVEL_ORDER.warn);
    expect(LOG_LEVEL_ORDER.warn).toBeLessThan(LOG_LEVEL_ORDER.error);
  });

  it('child logger 繼承父 logger 的 level', () => {
    const { entries, transport } = capture();
    const log = createLogger({ name: 'host', level: 'error', transport });
    const child = log.child('plugin-a');
    child.warn('should-be-filtered');
    child.error('should-pass');
    expect(entries.map((e) => e.message)).toEqual(['should-pass']);
  });
});

describe('logger / child 前綴', () => {
  it('child logger 的 name 帶插件名前綴（parent:child）', () => {
    const { entries, transport } = capture();
    const log = createLogger({ name: 'host', level: 'debug', transport });
    const child = log.child('plugin-a');
    child.info('hi');
    expect(entries[0].name).toBe('host:plugin-a');
  });

  it('預設 level 為 info', () => {
    const { entries, transport } = capture();
    const log = createLogger({ transport });
    log.debug('hidden');
    log.info('shown');
    expect(entries.map((e) => e.message)).toEqual(['shown']);
  });
});

describe('logger / 預設 transport', () => {
  it('未提供 transport 時預設寫入 console，不拋錯', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const log = createLogger({ name: 'h', level: 'error' });
    expect(() => log.error('boom')).not.toThrow();
    errSpy.mockRestore();
  });
});
