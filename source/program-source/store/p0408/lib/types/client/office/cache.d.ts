/** Session-authorized, version-checked Office bytes shared by concurrent preview reads. */
import type { OfficeToPdfPriority, OfficeToPdfGeneration } from '@deepseek-ai/dsh-office-to-pdf/types';
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client';
import type { WorkspaceFileStat } from '@deepseek-ai/dsh-api-workspace-files/types';
import type { DocumentFileBytes, SessionFile } from '../rpc.ts';
/** PDF bytes and conversion metadata owned by Office preview. */
export type OfficeFileBytes = DocumentFileBytes & {
    readonly missingFonts: readonly string[];
    readonly fontDiagnostics?: 'unavailable';
    readonly generation: OfficeToPdfGeneration;
};
/**
 * Load authorized PDF contents for one Office source.
 * @param file - Session and source path.
 * @param signal - this reader's lifetime.
 * @returns converted PDF bytes or a declared source-access failure.
 */
export type ReadOfficeDocument = (file: SessionFile, signal: AbortSignal) => Promise<RemoteResult<OfficeFileBytes>>;
/** Authorized cached reads carry explicit scheduling intent to the Host. */
export type ReadOfficeBytes = (file: SessionFile, signal: AbortSignal, priority: OfficeToPdfPriority) => ReturnType<ReadOfficeDocument>;
type Result = Awaited<ReturnType<ReadOfficeDocument>>;
type Stat = (file: SessionFile, signal: AbortSignal) => Promise<RemoteResult<WorkspaceFileStat>>;
/** Bounded successful results; each caller reauthorizes and checks source freshness before reuse. */
export declare class OfficePreviewCache {
    private readonly stat;
    private readonly convert;
    private readonly maxEntries;
    private readonly maxBytes;
    private readonly maxPending;
    private readonly maxReaders;
    private readonly currentGeneration;
    private readonly busy;
    private readonly ready;
    private readonly pending;
    private bytes;
    private readers;
    private generation;
    private generationQuery;
    private acceptedQuery;
    private readonly superseded;
    private readonly lifetime;
    private readonly tasks;
    private readonly reads;
    /**
     * @param stat - authorized source metadata lookup.
     * @param convert - Host render Remote returning binary PDF bytes borrowed read-only by callers.
     * @param maxEntries - maximum completed results retained.
     * @param maxBytes - maximum retained PDF byteLength.
     * @param maxPending - maximum unsettled Host conversion requests, including cancellation teardown.
     * @param maxReaders - maximum readers, including metadata lookups.
     * @param generation - current Host renderer generation, checked before cached reuse.
     * @param busy - localized capacity failure.
     */
    constructor(stat: Stat, convert: ReadOfficeBytes, maxEntries: number, maxBytes: number, maxPending: number, maxReaders: number, currentGeneration: (signal: AbortSignal) => Promise<RemoteResult<OfficeToPdfGeneration>>, busy: () => Error);
    /**
     * Share a conversion without letting one caller cancel another caller's work.
     * Renderer replacement retries authorization once; repeated replacement reports localized capacity failure.
     * @param file - Session authorization scope and source path.
     * @param signal - this caller's lifetime.
     * @param priority - foreground preview or speculative read.
     * @returns current PDF bytes borrowed read-only, or a declared source-read failure; cancellation rejects.
     */
    read(file: SessionFile, signal: AbortSignal, priority?: OfficeToPdfPriority): Promise<Result>;
    private lookup;
    private lookupGeneration;
    /** Clear retained bytes, cancel outstanding conversions, and await their completion. */
    dispose(): Promise<void>;
    private retain;
}
export {};
//# sourceMappingURL=cache.d.ts.map