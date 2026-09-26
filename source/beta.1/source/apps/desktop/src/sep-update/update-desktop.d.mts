import type { App, BrowserWindow, MessageBoxOptions, MessageBoxReturnValue, PowerMonitor } from 'electron'
/** Official release discovery and locally admitted candidate availability are separate facts. */
export interface ManagedUpdateState {
  phase: 'idle' | 'checking' | 'available' | 'candidate-unavailable' | 'error'
  version?: string; message?: string; failedOperation?: 'check'; managed: true; lastCheckedAt?: string | null
}
/** Own the three-hour check clock and signed, explicitly confirmed update queue. */
export function createManagedUpdater(options: {
  app: App; dialog: { showMessageBox(options: MessageBoxOptions): Promise<MessageBoxReturnValue> };
  BrowserWindow: typeof BrowserWindow; powerMonitor: PowerMonitor; projectDir: string;
  nodeExecutable?: string | undefined; home?: string; onState?(state: ManagedUpdateState): void;
}): {
  readonly directory: string; status(): ManagedUpdateState; open(): Promise<unknown>; check(): Promise<unknown>; checkSep(): Promise<unknown>;
  report(): Promise<void>; cancel(): Promise<void>; close(): void;
}
