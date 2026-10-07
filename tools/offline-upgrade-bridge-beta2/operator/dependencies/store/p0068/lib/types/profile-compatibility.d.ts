/** Independent profile metadata; neither package manifests nor Cordis patches carry grants. */
export declare const PROFILE_COMPATIBILITY_FILENAME = "compatibility.json";
/** Test whether an exemption names a canonical exact SemVer, including build metadata.
 * @param value Version supplied by a manifest or user.
 * @returns False for ranges, prefixes, whitespace, and malformed versions.
 */
export declare function isExactPluginVersion(value: string): boolean;
/** Validate one explicit exemption without granting it.
 * @param packageVersion Exact npm package-name@version, never an installation spec or range.
 * @param runtimeVersion Exact DSH version, including prerelease and build metadata.
 * @throws When either identity is not canonical.
 */
export declare function validatePluginVersionExemption(packageVersion: string, runtimeVersion: string): void;
/** What one profile's compatibility file currently authorizes, and what is wrong with it. */
export interface ProfileCompatibility {
    /** Accepted exact package-name@version keys mapped to their allowed DSH versions. */
    readonly exemptions: Record<string, string[]>;
    /** Human-readable problems; empty when every record was accepted. */
    readonly warnings: string[];
    /**
     * Whether the file holds nothing this reader rejected, so a grant or revocation may rewrite it.
     * A false value means writing would discard content the user must repair by hand.
     */
    readonly rewritable: boolean;
}
/** Read the profile's independent compatibility file without loading plugins.
 * A missing file authorizes nothing. An unreadable or unparsable file authorizes nothing and is
 * reported instead of failing, so a bad file can never make the profile unusable; rejected records
 * are skipped while the remaining valid ones still apply.
 * @param profileDir Absolute profile directory.
 * @returns Accepted exemptions plus every problem found; no manifest fallback is used.
 */
export declare function readProfileCompatibility(profileDir: string): ProfileCompatibility;
/** Read only the accepted exemptions of a profile.
 * @param profileDir Absolute profile directory.
 * @returns Exact package-name@version keys mapped to their allowed DSH versions.
 */
export declare function readProfileVersionExemptions(profileDir: string): Record<string, string[]>;
/** Persist one informed grant or revocation under the compatibility file's own lock.
 * @param profileDir Profile directory; no package manifest is created or modified.
 * @param packageVersion Exact manifest package-name@version.
 * @param runtimeVersion Exact DSH version; grants must name the current runtime, revocations may name historical ones.
 * @param enabled Whether to grant rather than revoke.
 * @param acceptRisk Required true for grants after explicit acknowledgement of possible crashes or data loss.
 * @returns After the atomic write. Existing plugin instances are not reloaded by this operation.
 * @throws For invalid identities, missing consent, a stale runtime, or a file the reader rejected,
 * which the user must repair by hand because rewriting it would discard their content.
 */
export declare function setProfileVersionExemption(profileDir: string, packageVersion: string, runtimeVersion: string, enabled: boolean, acceptRisk: boolean): Promise<void>;
//# sourceMappingURL=profile-compatibility.d.ts.map