/**
 * Lifecycle - 主機啟動/關閉生命週期管理。
 *
 * startup 鉤子依註冊順序執行；shutdown 鉤子依反序執行。
 * 鉤子可為 async；任一鉤子拋錯則中斷並拒絕。
 */

export type LifecyclePhase = 'idle' | 'starting' | 'running' | 'stopping' | 'stopped';
export type LifecycleHook = () => void | Promise<void>;

export interface Lifecycle {
  readonly phase: LifecyclePhase;
  /** 註冊啟動鉤子（依序執行），回傳取消函式。 */
  onStartup(fn: LifecycleHook): () => void;
  /** 註冊關閉鉤子（反序執行），回傳取消函式。 */
  onShutdown(fn: LifecycleHook): () => void;
  /** 執行所有啟動鉤子；完成後 phase=running。 */
  startup(): Promise<void>;
  /** 執行所有關閉鉤子（反序）；完成後 phase=stopped。 */
  shutdown(): Promise<void>;
}

export function createLifecycle(): Lifecycle {
  let phase: LifecyclePhase = 'idle';
  const startupHooks: LifecycleHook[] = [];
  const shutdownHooks: LifecycleHook[] = [];

  function onStartup(fn: LifecycleHook): () => void {
    startupHooks.push(fn);
    return () => {
      const i = startupHooks.indexOf(fn);
      if (i !== -1) startupHooks.splice(i, 1);
    };
  }

  function onShutdown(fn: LifecycleHook): () => void {
    shutdownHooks.push(fn);
    return () => {
      const i = shutdownHooks.indexOf(fn);
      if (i !== -1) shutdownHooks.splice(i, 1);
    };
  }

  async function startup(): Promise<void> {
    if (phase !== 'idle') {
      throw new Error(`Cannot start: current phase is ${phase}`);
    }
    phase = 'starting';
    try {
      for (const fn of startupHooks.slice()) {
        await fn();
      }
      phase = 'running';
    } catch (err) {
      phase = 'idle';
      throw err;
    }
  }

  async function shutdown(): Promise<void> {
    if (phase !== 'running') {
      throw new Error(`Cannot shutdown: current phase is ${phase}`);
    }
    phase = 'stopping';
    try {
      const reversed = shutdownHooks.slice().reverse();
      for (const fn of reversed) {
        await fn();
      }
      phase = 'stopped';
    } catch (err) {
      phase = 'stopped';
      throw err;
    }
  }

  return {
    get phase() {
      return phase;
    },
    onStartup,
    onShutdown,
    startup,
    shutdown,
  };
}
