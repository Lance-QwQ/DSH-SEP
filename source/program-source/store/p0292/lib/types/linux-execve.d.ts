/** Lazy libc execve and descriptor bindings used by the one-shot Linux bootstrap. */
/** Replace the current process image while preserving the supplied argv and environment. */
export type LinuxExecve = (file: string, argv: string[], env: Record<string, string>, control?: 'pipe') => never;
/**
 * Load libc's execve and fcntl symbols on first use and retain the native bindings.
 * @returns a process-replacing execve operation that throws Node-style errors on failure.
 */
export declare function loadLinuxExecve(): LinuxExecve;
