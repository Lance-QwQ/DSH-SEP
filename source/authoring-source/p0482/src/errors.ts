const PUBLIC_CODES = new Set(['MEMORY_SETTINGS_CONFLICT', 'MEMORY_SETTINGS_PROJECT', 'MEMORY_SETTINGS_UNAVAILABLE', 'MEMORY_SETTINGS_INPUT', 'DISPOSED', 'ABORTED']);
/** Preserve only owned error codes; stacks, paths and memory content never become UI copy. */
export function safeErrorCode(value: unknown): string { return typeof value === 'string' && PUBLIC_CODES.has(value) ? value : 'MEMORY_SETTINGS_UNAVAILABLE'; }
