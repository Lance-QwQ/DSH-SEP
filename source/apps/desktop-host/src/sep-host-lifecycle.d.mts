export interface HostLifecycle {
  assertActive(): void;
  send(message: object): Promise<void>;
  stop(reason?: string): Promise<HostStopResult>;
  readonly stopping: boolean;
  status(): { phase: string; forced: boolean; failure: string | null };
  startApplication<T>(factory: () => T | Promise<T>): Promise<T>;
  publishReady(message: object): Promise<void>;
  startupFailed(error: unknown): Promise<HostStopResult>;
}
export interface HostStopResult {
  status: 'pass' | 'blocked';
  code: string | null;
  drained: boolean;
  outcome: 'unknown' | 'interrupted' | 'closed';
}
export function createHostLifecycle(options: {
  managed: boolean;
  owner?: NodeJS.Process;
  shutdownTimeoutMs?: number;
  report?: (code: string) => void;
  exit?: (code: number) => void;
}): HostLifecycle;
