import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

// Helper to detect if the app is currently running inside the Tauri process host
export const isTauriEnvironment = (): boolean => {
  return typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__ !== undefined;
};

// Safe Tauri RPC Invocation wrapper with graceful mockup fallback
export const safeInvoke = async <T>(commandName: string, args: Record<string, any> = {}): Promise<T | null> => {
  if (isTauriEnvironment()) {
    try {
      return await invoke<T>(commandName, args);
    } catch (error) {
      console.error(`[Tauri IPC Error] Command "${commandName}" failed:`, error);
      return null;
    }
  } else {
    // Log DTO to console for static web mockup testing
    console.warn(`[Tauri Mockup IPC] invoke("${commandName}", ${JSON.stringify(args)})`);
    return null;
  }
};

// Strict variant that throws errors instead of swallowing them.
// Use for critical commands (e.g. export) where the caller needs to know about failures.
export const safeInvokeStrict = async <T>(commandName: string, args: Record<string, any> = {}): Promise<T> => {
  if (isTauriEnvironment()) {
    return await invoke<T>(commandName, args);
  } else {
    throw new Error(`[Tauri Mockup] Command "${commandName}" is not available outside the Tauri environment.`);
  }
};

// Safe event listener registration
export const safeListen = async <T>(eventName: string, handler: (event: { payload: T }) => void): Promise<(() => void) | null> => {
  if (isTauriEnvironment()) {
    try {
      const unlisten = await listen<T>(eventName, handler);
      return unlisten;
    } catch (error) {
      console.error(`[Tauri Event Error] Failed to listen to "${eventName}":`, error);
      return null;
    }
  } else {
    console.warn(`[Tauri Mockup Event] registered listener for "${eventName}"`);
    return () => {};
  }
};
