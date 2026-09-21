/** Held file ownership: foreign write/delete opens cannot coexist with this handle. */
export declare class ProtectedFileHandle {
    private readonly native;
    private handle;
    private constructor();
    /** Open an existing ordinary single-link NTFS file.
     * @param path - absolute local path with held ancestors.
     * @returns owned file handle, or undefined for absence.
     */
    static open(path: string): Promise<ProtectedFileHandle | undefined>;
    /** Move the held object to a non-existing name; never resolves the old path again.
     * @param destination - absent same-volume destination with held ancestors.
     */
    rename(destination: string): void;
    /** Restore captured times through the owned handle without reopening a raced path.
     * @param accessMs - captured last-access milliseconds since Unix epoch.
     * @param writeMs - captured last-write milliseconds since Unix epoch.
     */
    setTimes(accessMs: number, writeMs: number): void;
    /** Release exactly this owned handle. */
    close(): void;
}
/** Hold ancestors against deletion/rename; create missing directories one level at a time.
 * @param paths - absolute local file paths whose ancestors must remain stable.
 * @param createParents - whether missing ancestors may be created.
 * @returns release function that reports native close failures.
 */
export declare function lockDirectories(paths: readonly string[], createParents: boolean): Promise<() => void>;
/** Identify the reserved zero-byte directory-guard names; callers still verify their metadata.
 * @param name - one directory entry basename.
 * @returns whether the basename belongs to the native directory-guard namespace.
 */
export declare function isDirectoryGuard(name: string): boolean;
/** Exclusive live-process ownership of a recovery directory; a crash releases the OS lock.
 * @param path - lock file inside an already held recovery directory.
 * @returns release function for the owned OS handle.
 */
export declare function lockRecoveryFile(path: string): Promise<() => void>;
/** Hold an exclusive native lease on one preexisting dedicated local NTFS directory.
 * The reserved `.dsh-directory.lock` file remains as an empty marker after release;
 * ownership is the live OS handle, never its existence, a PID or an expiry time.
 * This lease grants no filesystem authority or recovery policy to the callback.
 * @param root - preexisting dedicated directory; volume/home roots and aliases are refused.
 * @param operation - work that independently uses its current permissions while the lease is held.
 * @returns the callback result after all owned handles have been released.
 */
export declare function withProtectedDirectory<T>(root: string, operation: () => Promise<T>): Promise<T>;
