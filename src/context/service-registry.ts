/**
 * ServiceRegistry - 共用服務註冊表，供插件之間共享單例服務。
 */

export type Service = unknown;

export interface ServiceRegistryOptions {
  /** 服務註冊時觸發。 */
  onRegister?: (name: string, service: Service) => void;
}

export interface ServiceRegistry {
  /** 註冊服務；同名重複註冊拋錯。 */
  register(name: string, service: Service): void;
  /** 取得服務；未註冊拋錯。 */
  get<T = Service>(name: string): T;
  /** 是否已註冊。 */
  has(name: string): boolean;
  /** 移除服務；未註冊不拋錯。 */
  unregister(name: string): void;
  /** 所有已註冊服務名稱。 */
  names(): string[];
}

export function createServiceRegistry(options: ServiceRegistryOptions = {}): ServiceRegistry {
  const services = new Map<string, Service>();

  function register(name: string, service: Service): void {
    if (services.has(name)) {
      throw new Error(`Service already registered: ${name}`);
    }
    services.set(name, service);
    options.onRegister?.(name, service);
  }

  function get<T = Service>(name: string): T {
    if (!services.has(name)) {
      throw new Error(`Service not found: ${name}`);
    }
    return services.get(name) as T;
  }

  function has(name: string): boolean {
    return services.has(name);
  }

  function unregister(name: string): void {
    services.delete(name);
  }

  function names(): string[] {
    return Array.from(services.keys());
  }

  return { register, get, has, unregister, names };
}
