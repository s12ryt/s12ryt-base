/**
 * 共用工具函數（Context API 的一部分）。
 * 提供：深合併、型別檢查、防抖/節流。
 */

// ---------- 型別檢查 ----------

export function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function isFunction(value: unknown): value is (...args: unknown[]) => unknown {
  return typeof value === 'function';
}

export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !Number.isNaN(value);
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

// ---------- 深合併 ----------

/**
 * 深合併多個普通物件。後者覆蓋前者；巢狀普通物件遞迴合併；
 * 陣列與純值以覆蓋處理。不會修改輸入物件。
 */
export function deepMerge<T = Record<string, unknown>>(...sources: unknown[]): T {
  const result: Record<string, unknown> = {};
  for (const source of sources) {
    if (!isPlainObject(source)) continue;
    for (const key of Object.keys(source)) {
      const val = source[key];
      if (isPlainObject(val)) {
        const existing = isPlainObject(result[key]) ? (result[key] as Record<string, unknown>) : {};
        result[key] = deepMerge(existing, val);
      } else if (isArray(val)) {
        result[key] = [...val];
      } else {
        result[key] = val;
      }
    }
  }
  return result as T;
}

// ---------- 防抖 ----------

export interface Debounced<A extends unknown[]> {
  (...args: A): void;
  cancel(): void;
}

/** 防抖：延遲內多次呼叫只執行最後一次。 */
export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  delay: number,
): Debounced<A> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const debounced = (...args: A): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, delay);
  };
  debounced.cancel = (): void => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
  return debounced;
}

// ---------- 節流 ----------

/** 節流（leading edge）：區間內首次立即執行，之後靜默到區間結束。 */
export function throttle<A extends unknown[]>(fn: (...args: A) => void, delay: number): (...args: A) => void {
  let last: number | null = null;
  return (...args: A): void => {
    const now = Date.now();
    if (last === null || now - last >= delay) {
      last = now;
      fn(...args);
    }
  };
}
