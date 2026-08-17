import { describe, it, expect } from 'vitest';

import * as api from '../src/index.js';

describe('public API surface (src/index.ts)', () => {
  it('re-exports all Context API factories', () => {
    expect(api.createLogger).toBeTypeOf('function');
    expect(api.createConfig).toBeTypeOf('function');
    expect(api.createEventBus).toBeTypeOf('function');
    expect(api.createServiceRegistry).toBeTypeOf('function');
    expect(api.createLifecycle).toBeTypeOf('function');
  });

  it('re-exports host factory', () => {
    expect(api.createHost).toBeTypeOf('function');
  });

  it('re-exports plugin subsystem factories', () => {
    expect(api.createPluginLoader).toBeTypeOf('function');
    expect(api.createPluginManager).toBeTypeOf('function');
    expect(api.createRegistryClient).toBeTypeOf('function');
    expect(api.createInstaller).toBeTypeOf('function');
  });

  it('re-exports CLI factory', () => {
    expect(api.createCli).toBeTypeOf('function');
  });

  it('re-exports utils helpers', () => {
    expect(api.deepMerge).toBeTypeOf('function');
    expect(api.debounce).toBeTypeOf('function');
    expect(api.throttle).toBeTypeOf('function');
    expect(api.isObject).toBeTypeOf('function');
  });
});
