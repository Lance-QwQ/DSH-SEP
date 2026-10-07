/** Filesystem recovery for callers that own profile shutdown and write exclusion. */
/**
 * Back up the profile patch and retain only the caller's recovery bundles.
 * The caller must stop the profile and exclude concurrent profile writes.
 * Installed packages and other manifest fields are preserved; patches are never parsed.
 * Failures propagate and may leave completed changes in place for a retry.
 * @param binName - Diagnostic prefix for invalid profile manifests.
 * @param profileDir - Profile directory to recover without loading its plugins.
 * @param bundles - Ordered bundles to enable after recovery.
 * @returns Backup path with a Unix millisecond timestamp and optional collision ordinal, or undefined if absent.
 */
export declare function sanitizeProfile(binName: string, profileDir: string, bundles: readonly string[]): string | undefined;
//# sourceMappingURL=profile-sanitize.d.ts.map