import { describe, it, expect, vi } from 'vitest';
import { createServiceRegistry, type ServiceRegistry } from '../src/context/service-registry.js';

describe('ServiceRegistry', () => {
  it('register + get 可取回已註冊服務', () => {
    const reg = createServiceRegistry();
    const svc = { hello: () => 'hi' };
    reg.register('greet', svc);
    expect(reg.get('greet')).toBe(svc);
  });

  it('has 回傳是否已註冊', () => {
    const reg = createServiceRegistry();
    expect(reg.has('x')).toBe(false);
    reg.register('x', 123);
    expect(reg.has('x')).toBe(true);
  });

  it('get 未註冊服務時拋錯', () => {
    const reg = createServiceRegistry();
    expect(() => reg.get('missing')).toThrow(/missing/);
  });

  it('register 重複同名拋錯', () => {
    const reg = createServiceRegistry();
    reg.register('a', 1);
    expect(() => reg.register('a', 2)).toThrow(/a/);
  });

  it('unregister 移除後 has 為 false 且 get 拋錯', () => {
    const reg = createServiceRegistry();
    reg.register('a', 1);
    reg.unregister('a');
    expect(reg.has('a')).toBe(false);
    expect(() => reg.get('a')).toThrow();
  });

  it('unregister 未註冊服務不拋錯', () => {
    const reg = createServiceRegistry();
    expect(() => reg.unregister('none')).not.toThrow();
  });

  it('names 回傳所有已註冊服務名稱', () => {
    const reg = createServiceRegistry();
    reg.register('a', 1);
    reg.register('b', 2);
    expect(reg.names().sort()).toEqual(['a', 'b']);
  });

  it('register 觸發 onRegister 監聽器', () => {
    const onRegister = vi.fn();
    const reg = createServiceRegistry({ onRegister });
    const svc = { x: 1 };
    reg.register('a', svc);
    expect(onRegister).toHaveBeenCalledWith('a', svc);
  });
});
