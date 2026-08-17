import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  deepMerge,
  isObject,
  isPlainObject,
  isFunction,
  isString,
  isNumber,
  isBoolean,
  isArray,
  debounce,
  throttle,
} from '../src/utils/index.js';

describe('utils / deepMerge', () => {
  it('深合併巢狀物件', () => {
    const result = deepMerge({ a: 1, b: { x: 1 } }, { b: { y: 2 }, c: 3 });
    expect(result).toEqual({ a: 1, b: { x: 1, y: 2 }, c: 3 });
  });

  it('後者純值覆蓋前者', () => {
    expect(deepMerge({ a: 1 }, { a: 2 })).toEqual({ a: 2 });
  });

  it('陣列以覆蓋方式處理（不合併元素）', () => {
    expect(deepMerge({ a: [1, 2, 3] }, { a: [4] })).toEqual({ a: [4] });
  });

  it('忽略 null/undefined 來源但不報錯', () => {
    expect(deepMerge({ a: 1 }, null as never, undefined as never, { b: 2 })).toEqual({ a: 1, b: 2 });
  });

  it('不會修改輸入物件（不可變）', () => {
    const a = { b: { x: 1 } };
    const b = { b: { y: 2 } };
    deepMerge(a, b);
    expect(a).toEqual({ b: { x: 1 } });
    expect(b).toEqual({ b: { y: 2 } });
  });

  it('支援多個來源依序合併', () => {
    expect(deepMerge({ a: 1 }, { a: 2 }, { a: 3, b: 1 })).toEqual({ a: 3, b: 1 });
  });
});

describe('utils / 型別檢查', () => {
  it('isObject 對非 null 物件為 true', () => {
    expect(isObject({})).toBe(true);
    expect(isObject([])).toBe(true);
    expect(isObject(null)).toBe(false);
    expect(isObject(undefined)).toBe(false);
    expect(isObject('s')).toBe(false);
  });

  it('isPlainObject 僅對普通物件為 true（陣列/函式為 false）', () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject(() => undefined)).toBe(false);
    expect(isPlainObject(null)).toBe(false);
  });

  it('isFunction', () => {
    expect(isFunction(() => undefined)).toBe(true);
    expect(isFunction(function () {})).toBe(true);
    expect(isFunction(1)).toBe(false);
  });

  it('isString / isNumber / isBoolean / isArray', () => {
    expect(isString('a')).toBe(true);
    expect(isString(1)).toBe(false);
    expect(isNumber(1)).toBe(true);
    expect(isNumber(NaN)).toBe(false);
    expect(isBoolean(true)).toBe(true);
    expect(isBoolean(0)).toBe(false);
    expect(isArray([])).toBe(true);
    expect(isArray({})).toBe(false);
  });
});

describe('utils / debounce', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('在延遲內多次呼叫只執行最後一次', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced('a');
    debounced('b');
    debounced('c');
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('c');
  });

  it('可取消', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced();
    debounced.cancel();
    vi.advanceTimersByTime(200);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('utils / throttle', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('節流：區間內只執行首次', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);
    throttled(1);
    throttled(2);
    throttled(3);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(1);
  });

  it('區間結束後可再次執行', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);
    throttled(1);
    vi.advanceTimersByTime(100);
    throttled(2);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
