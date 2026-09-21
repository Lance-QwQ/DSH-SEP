/** JSON-only private protocol; project IDs come from the configured Host registry. */
export interface MemoryControls {
    readonly capture: boolean;
    readonly recall: boolean;
}
/** Configured project identity returned by the Host. */
export interface MemoryProject {
    readonly id: string;
    readonly label: string;
    readonly root: string;
}
/** List response for this protocol version. */
export interface MemoryProjectList {
    readonly version: 1;
    readonly available: boolean;
    readonly reason: string | null;
    readonly projects: readonly MemoryProject[];
}
/** Persisted controls and independently evaluated runtime availability. */
export interface MemorySnapshot {
    readonly version: 1;
    readonly projectId: string;
    readonly controls: MemoryControls;
    readonly configured: MemoryControls;
    readonly effective: MemoryControls;
    readonly runtime: {
        readonly state: 'ready' | 'degraded' | 'disabled' | 'unavailable';
        readonly lastError: string | null;
    };
    readonly scope: 'project';
    readonly transition: 'next-operation';
}
/** UI callbacks own transport; the component receives no Host service. */
export interface MemorySettingsApi {
    readonly list: (signal?: AbortSignal) => Promise<MemoryProjectList>;
    readonly get: (projectId: string, signal?: AbortSignal) => Promise<MemorySnapshot>;
    readonly update: (projectId: string, expected: MemoryControls, controls: MemoryControls, signal?: AbortSignal) => Promise<MemorySnapshot>;
}
