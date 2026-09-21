/**
 * Host-filesystem implementation of `ctx.fs`. Reads preserve canonical aliases; protected mutations refuse aliases and own Windows file/directory handles.
 * @module @deepseek-ai/dsh-fs-local
 */
import { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { FileSystem, FsVersion } from '@deepseek-ai/dsh-fs';
import type { FsDirEntry, FsEditOutcome, FsEditRequest, FsInfo, FsPathInfo, FsTarget, FsWriteIntent, FsWriteOutcome, FsMutationSummary, FsRecoveryReport } from '@deepseek-ai/dsh-fs';
import type { FsIoInternals } from './fsio.ts';
import type { RecoveryConfig } from './recovery.ts';
import type { SandboxExecutionPolicy } from '@deepseek-ai/dsh-fs';
export { withProtectedDirectory } from './protected-win32.ts';
/** Configuration for the local filesystem backend. */
export interface Config {
    /** Explicit, bounded, same-volume recovery storage. Missing configuration denies mutations. */
    recovery?: RecoveryConfig | undefined;
    /** Base directory for relative paths. Defaults to `process.cwd()`. */
    cwd?: string;
    /**
     * Exclusive UTF-8 byte limit on each overwrite-diff side, capped by the
     * runtime's safe allocation/decode maximum. Defaults to 10 MiB.
     */
    diffBasisMaxBytes?: number;
}
type ResolvedConfig = Required<Omit<Config, 'recovery'>> & Pick<Config, 'recovery'>;
/**
 * The host-filesystem backend. Reads resolve relative paths from {@link Config.cwd}
 * for resolution. Protected mutations use the trusted per-call workspace, or this
 * default for agentless calls, and require explicitly configured recovery storage.
 */
export declare class LocalFileSystem extends FileSystem {
    static Config: z<Config>;
    /** Validated config (schemastery applied the defaults before construction). */
    readonly config: ResolvedConfig;
    get recoveryStatus(): 'unsupported' | 'unconfigured' | 'ready';
    /** Test hook forwarded to fsio for atomic-publication boundaries. */
    internals: FsIoInternals;
    /** Per-store FIFO serializes this instance's quota, journal and file transitions. */
    private locks;
    private assertWritable;
    constructor(ctx: Context, config: Config);
    /** Serialize this instance's recovery store, falling back to a target key
     * without recovery configuration. Other instances still face native conflicts. */
    private withLock;
    resolve(path: string, opts?: {
        cwd?: string;
        signal?: AbortSignal;
    }): Promise<FsTarget>;
    processPath(target: FsTarget): string;
    processPathFromHostPath(hostPath: string): string | undefined;
    fileUrl(target: FsTarget): string;
    contains(parent: FsTarget, child: FsTarget): boolean;
    stat(target: FsTarget, signal?: AbortSignal): Promise<FsInfo | undefined>;
    lstat(path: string, opts?: {
        cwd?: string;
    }, signal?: AbortSignal): Promise<FsPathInfo | undefined>;
    readText(target: FsTarget, signal?: AbortSignal): Promise<string>;
    streamText(target: FsTarget, signal?: AbortSignal): Promise<AsyncIterable<string>>;
    readBytes(target: FsTarget, signal: AbortSignal | undefined, maxBytes: number): Promise<Uint8Array>;
    readByteRange(target: FsTarget, range: {
        offset: number;
        length: number;
    }, signal?: AbortSignal): Promise<Uint8Array>;
    listDir(target: FsTarget, signal?: AbortSignal): Promise<FsDirEntry[]>;
    writeText(target: FsTarget, content: string, expected?: FsWriteIntent, signal?: AbortSignal, sandboxPolicy?: SandboxExecutionPolicy): Promise<FsWriteOutcome>;
    editText(target: FsTarget, edit: FsEditRequest, expected?: {
        version: FsVersion;
    }, signal?: AbortSignal, sandboxPolicy?: SandboxExecutionPolicy): Promise<FsEditOutcome>;
    moveFile(source: FsTarget, destination: FsTarget, expected?: {
        version: FsVersion;
    }, signal?: AbortSignal, policy?: SandboxExecutionPolicy): Promise<FsMutationSummary>;
    removeFile(target: FsTarget, expected?: {
        version: FsVersion;
    }, signal?: AbortSignal, policy?: SandboxExecutionPolicy): Promise<FsMutationSummary>;
    /** @param id - operation ID to restore. */
    restoreMutation(id: string, signal?: AbortSignal, policy?: SandboxExecutionPolicy): Promise<FsMutationSummary>;
    listMutations(policy?: SandboxExecutionPolicy): Promise<FsMutationSummary[]>;
    inspectRecovery(policy?: SandboxExecutionPolicy): Promise<FsRecoveryReport>;
    private versionAfterWrite;
}
export default LocalFileSystem;
