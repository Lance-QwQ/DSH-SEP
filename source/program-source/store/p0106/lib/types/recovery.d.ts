import type { FsTarget } from '@deepseek-ai/dsh-fs';
import type { FsMutationSummary, FsRecoveryReport } from '@deepseek-ai/dsh-fs';
/** Explicit deployment storage and bounds for recoverable file operations. */
export interface RecoveryConfig {
    /** Existing dedicated absolute recovery directory, disjoint from the workspace on the same NTFS volume. */
    root: string;
    /** Inclusive byte limit for each original file and replacement candidate. */
    maxFileBytes: number;
    /** Recovery storage budget in bytes, including retained files, temporary leftovers and staging reservations. */
    maxTotalBytes: number;
    /** Maximum durable operation count; committed and unresolved operations remain until reconciled offline. */
    maxEntries: number;
    /** Minimum age in milliseconds before an eligible restored, nonlatest operation may be reclaimed. */
    retentionMs: number;
    /** Additional EPERM/EBUSY journal replacement attempts, from 0 to 3; defaults to 3. */
    recordPublishMaxRetries?: number;
    /** Base delay for linear journal retry backoff, from 1 to 1000 milliseconds; defaults to 25. */
    recordPublishRetryDelayMs?: number;
}
type ResolvedRecoveryConfig = RecoveryConfig & Required<Pick<RecoveryConfig, 'recordPublishMaxRetries' | 'recordPublishRetryDelayMs'>>;
/** Metadata-only operation record. Raw preimages remain in private before.bin files. */
export interface MutationRecord {
    schema: 1;
    id: string;
    action: 'write' | 'move' | 'delete';
    source: string;
    destination?: string;
    workspaceRoot: string;
    state: 'prepared' | 'committed' | 'conflict' | 'restored';
    createdAt: number;
    beforeExists: boolean;
    beforeHash?: string;
    beforeSize: number;
    afterHash?: string | undefined;
    afterVersion?: string | undefined;
    beforeMtimeMs?: number;
    beforeAtimeMs?: number;
    /** Conservative workspace staging reservation; retained after an interrupted cleanup. */
    stagingBytes?: number;
    expectedAfterHash?: string;
    error?: string;
}
/** Digest used to verify persistent preimages without logging content.
 * @param bytes - complete raw bytes or UTF-8 text.
 * @returns lowercase SHA-256 digest.
 */
export declare function contentHash(bytes: string | Uint8Array): string;
/** Validate explicit configuration before any filesystem write occurs.
 * @param config - optional deployment recovery storage configuration.
 */
export declare function validateRecoveryConfig(config: RecoveryConfig | undefined): void;
/** Validate deployment policy and fill the journal publication defaults before execution.
 * @param config - optional recovery configuration.
 * @returns explicit publication policy, or undefined when recovery is unconfigured.
 */
export declare function resolveRecoveryConfig(config: RecoveryConfig | undefined): ResolvedRecoveryConfig | undefined;
/** Public metadata projection without backup contents.
 * @param record - validated durable operation record.
 * @returns metadata suitable for the tool consumer.
 */
export declare function mutationSummary(record: MutationRecord): FsMutationSummary;
/** Inspect every journal entry; valid records remain visible alongside explicit damage reports.
 * @param config - configured recovery directory and bounds.
 * @returns verified records and entry-specific issues.
 */
export declare function inspectRecoveryRecords(config: RecoveryConfig): Promise<{
    records: MutationRecord[];
    issues: FsRecoveryReport['issues'];
}>;
/** Strict mutation reads fail closed; diagnostics retain visibility through inspection.
 * @param config - configured recovery directory and bounds.
 * @returns validated operation records, or throws on damaged history.
 */
export declare function readMutationRecords(config: RecoveryConfig): Promise<MutationRecord[]>;
/** Restore one committed operation while retaining the current state as a new recoverable operation.
 * @param config - configured recovery storage; absence denies restoration.
 * @param id - durable operation identifier.
 * @param workspaceRoot - current trusted workspace.
 * @param signal - aborts before publication.
 * @param allowOutside - explicit current full-access authorization.
 * @returns the restored operation's metadata.
 */
export declare function restoreOperation(config: RecoveryConfig | undefined, id: string, workspaceRoot: string, signal?: AbortSignal, allowOutside?: boolean): Promise<FsMutationSummary>;
/** One transaction owns its handles, durable preimage and publication decision until disposal. */
export declare class RecoveryTransaction {
    private readonly config;
    readonly record: MutationRecord;
    readonly directory: string;
    private readonly original;
    private readonly release;
    private published;
    private persistedRecord;
    private constructor();
    /** Acquire handles and persist a preimage before allowing mutation of the actual file.
     * @param config - explicitly configured recovery storage.
     * @param target - resolved original file or absent creation target.
     * @param workspaceRoot - trusted current workspace.
     * @param signal - aborts before preparing.
     * @param destination - absent managed-move destination.
     * @param allowOutside - explicit current full-access authorization.
     * @returns owned transaction requiring close in a finally block.
     */
    static prepare(config: RecoveryConfig | undefined, target: FsTarget, workspaceRoot: string, signal?: AbortSignal, destination?: FsTarget, allowOutside?: boolean): Promise<RecoveryTransaction>;
    /** Reserve candidate bytes before staging, so newly created files remain recoverable too.
     * @param bytes - full candidate byte count.
     * @param expectedHash - digest of the requested candidate contents.
     */
    reserveCandidate(bytes: number, expectedHash: string): Promise<void>;
    /** Clear the conservative reservation only after the known staging directory was removed. */
    stagingCleaned(): Promise<void>;
    /** Persist changed metadata through a synced sibling; reuse only this transaction's verified durable version. */
    save(): Promise<void>;
    /** Publish the prepared file without overwriting any intervening creator.
     * @param temporary - synced candidate whose expected digest was reserved.
     * @param accessMs - optional captured access time for restoration.
     * @param writeMs - optional captured write time for restoration.
     */
    publish(temporary: string, accessMs?: number, writeMs?: number): Promise<void>;
    /** Relocate the held original into quarantine or to a checked absent destination.
     * @param destination - absent target path, or omit to remove into recovery.
     * @param accessMs - optional captured access time when restoring a move.
     * @param writeMs - optional captured write time when restoring a move.
     */
    relocate(destination?: string, accessMs?: number, writeMs?: number): Promise<void>;
    /** Release all live handles; backups and journals survive provider disposal and restart. */
    close(): void;
}
export {};
