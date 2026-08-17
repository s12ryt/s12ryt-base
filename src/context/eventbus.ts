/**
 * EventBus - 輕量級發布訂閱。
 *
 * handler 拋錯時不中斷後續 handler；所有 handler 執行完後，
 * 若有收集到錯誤，emit 會重新拋出（單一錯誤直接 throw，多個包成 AggregateError）。
 */

export type EventHandler = (...args: unknown[]) => void;

export interface EventBus {
  /** 註冊事件 handler，回傳可取消訂閱的函式。 */
  on(event: string, handler: EventHandler): () => void;
  /** 註冊一次性 handler，觸發一次後自動移除；回傳取消函式。 */
  once(event: string, handler: EventHandler): () => void;
  /** 移除指定事件的指定 handler。 */
  off(event: string, handler: EventHandler): void;
  /** 同步觸發事件，依註冊順序呼叫 handler。 */
  emit(event: string, ...args: unknown[]): void;
  /** 清除指定事件或全部事件的所有 handler。 */
  removeAllListeners(event?: string): void;
  /** 回傳指定事件的 handler 數量。 */
  listenerCount(event: string): number;
}

export function createEventBus(): EventBus {
  const listeners = new Map<string, EventHandler[]>();

  function on(event: string, handler: EventHandler): () => void {
    const list = listeners.get(event);
    if (list) list.push(handler);
    else listeners.set(event, [handler]);
    return () => off(event, handler);
  }

  function once(event: string, handler: EventHandler): () => void {
    const wrapper: EventHandler = (...args) => {
      off(event, wrapper);
      handler(...args);
    };
    return on(event, wrapper);
  }

  function off(event: string, handler: EventHandler): void {
    const list = listeners.get(event);
    if (!list) return;
    const idx = list.indexOf(handler);
    if (idx !== -1) list.splice(idx, 1);
    if (list.length === 0) listeners.delete(event);
  }

  function emit(event: string, ...args: unknown[]): void {
    const list = listeners.get(event);
    if (!list || list.length === 0) return;
    // 複製一份，避免 handler 內 on/off 改動原陣列造成跳號
    const snapshot = list.slice();
    const errors: unknown[] = [];
    for (const h of snapshot) {
      try {
        h(...args);
      } catch (err) {
        errors.push(err);
      }
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors as Error[]);
  }

  function removeAllListeners(event?: string): void {
    if (event === undefined) listeners.clear();
    else listeners.delete(event);
  }

  function listenerCount(event: string): number {
    return listeners.get(event)?.length ?? 0;
  }

  return { on, once, off, emit, removeAllListeners, listenerCount };
}
