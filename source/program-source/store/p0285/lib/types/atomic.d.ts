/**
 * Atomic whole-file replacement for the JSON backend.
 *
 * Publish protocol: write a same-directory temp file, fsync it, then
 * `rename()` over the target. Rename is an atomic replace on POSIX and on
 * Windows (libuv maps it to `MoveFileExW(..., MOVEFILE_REPLACE_EXISTING)`),
 * and replacement is the intended semantic here — unlike the session-log
 * backend's link()+unlink() no-clobber protocol, a unit file has exactly one
 * writer per process and last-write-wins is correct. After the rename the
 * parent directory is fsynced on POSIX so the new entry is crash-durable.
 * @module @deepseek-ai/dsh-storage-json/src/atomic
 */
/** Bounded Windows rename recovery; retries never repeat serialization or a business callback. */
export interface RenameRetryOptions {
    /** Additional attempts after the first rename. */
    maxRetries: number;
    /** Linear backoff base; retry n waits n times this value. */
    delayMs: number;
}
/** Publication progress attached to the original native error. */
export interface JsonPublishFailure {
    /** Last failed I/O operation. */
    stage: 'open' | 'write' | 'sync' | 'close' | 'rename' | 'directory-sync';
    /** Number of rename calls, excluding preparation I/O. */
    attempts: number;
    /** True once rename has published the target, even if durability confirmation failed. */
    published: boolean;
    /** A failed cleanup can leave a private same-directory temporary file. */
    cleanupError?: {
        stage: 'cleanup';
        code?: string;
        message: string;
    };
    /** A failed close while handling an earlier failure must not replace that error. */
    closeError?: {
        stage: 'close';
        code?: string;
        message: string;
    };
}
/**
 * Durably replace `path` with `data`.
 * @param path - Absolute target file path.
 * @param data - Full new file content.
 * @param retry - Validated Windows rename retry policy.
 * @returns resolution after the replacement is crash-durable.
 */
export declare function writeAtomic(path: string, data: string, retry: RenameRetryOptions): Promise<void>;
