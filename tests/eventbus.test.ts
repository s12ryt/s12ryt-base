import { describe, it, expect, vi } from 'vitest';
import { createEventBus, type EventBus } from '../src/context/eventbus.js';

describe('EventBus', () => {
  it('emit 同步觸發已註冊的 handler', () => {
    const bus = createEventBus();
    const fn = vi.fn();
    bus.on('foo', fn);
    bus.emit('foo', 1, 'a');
    expect(fn).toHaveBeenCalledWith(1, 'a');
  });

  it('同一事件可註冊多個 handler，依序觸發', () => {
    const bus = createEventBus();
    const order: string[] = [];
    bus.on('e', () => order.push('1'));
    bus.on('e', () => order.push('2'));
    bus.emit('e');
    expect(order).toEqual(['1', '2']);
  });

  it('on 回傳 unsubscribe，呼叫後不再觸發', () => {
    const bus = createEventBus();
    const fn = vi.fn();
    const off = bus.on('e', fn);
    off();
    bus.emit('e');
    expect(fn).not.toHaveBeenCalled();
  });

  it('off 移除指定 handler', () => {
    const bus = createEventBus();
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    bus.on('e', fn1);
    bus.on('e', fn2);
    bus.off('e', fn1);
    bus.emit('e');
    expect(fn1).not.toHaveBeenCalled();
    expect(fn2).toHaveBeenCalledOnce();
  });

  it('once 只觸發一次', () => {
    const bus = createEventBus();
    const fn = vi.fn();
    bus.once('e', fn);
    bus.emit('e', 1);
    bus.emit('e', 2);
    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith(1);
  });

  it('once 回傳的 unsubscribe 在觸發前呼叫可取消', () => {
    const bus = createEventBus();
    const fn = vi.fn();
    const off = bus.once('e', fn);
    off();
    bus.emit('e');
    expect(fn).not.toHaveBeenCalled();
  });

  it('removeAllListeners(event) 清除單一事件所有 handler', () => {
    const bus = createEventBus();
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    bus.on('a', fn1);
    bus.on('a', fn2);
    bus.on('b', fn1);
    bus.removeAllListeners('a');
    bus.emit('a');
    bus.emit('b');
    expect(fn1).toHaveBeenCalledOnce(); // 只剩 b 觸發
    expect(fn2).not.toHaveBeenCalled();
  });

  it('removeAllListeners() 無參數清除全部', () => {
    const bus = createEventBus();
    const fn = vi.fn();
    bus.on('a', fn);
    bus.on('b', fn);
    bus.removeAllListeners();
    bus.emit('a');
    bus.emit('b');
    expect(fn).not.toHaveBeenCalled();
  });

  it('listenerCount 回傳各事件 handler 數量', () => {
    const bus = createEventBus();
    bus.on('e', () => {});
    bus.on('e', () => {});
    bus.on('x', () => {});
    expect(bus.listenerCount('e')).toBe(2);
    expect(bus.listenerCount('x')).toBe(1);
    expect(bus.listenerCount('none')).toBe(0);
  });

  it('emit 未註冊的事件不拋錯（no-op）', () => {
    const bus = createEventBus();
    expect(() => bus.emit('nope', 1, 2)).not.toThrow();
  });

  it('handler 拋錯時不中斷後續 handler，並由 bus 捕捉 rethrow（emit 後拋出）', () => {
    const bus = createEventBus();
    const fn2 = vi.fn();
    bus.on('e', () => { throw new Error('boom'); });
    bus.on('e', fn2);
    expect(() => bus.emit('e')).toThrow('boom');
    // 後續 handler 仍執行
    expect(fn2).toHaveBeenCalledOnce();
  });
});
