/** Evaluate plugin dsh peer requirements without importing plugin code. */
/** Incompatible dsh peers and the exact plugin/runtime exemption decision. */
export interface PluginCompatibility {
    name: string;
    version: string;
    runtimeVersion: string;
    /** Only peer requirements not satisfied by the running dsh version. */
    peers: Record<string, string>;
    exempted: boolean;
}
/**
 * Read this app-boot package's version in both source and bundled installations.
 * @returns the validated runtime semantic version, preserving its exact spelling.
 * @throws if package.json cannot be read or its version is missing or invalid.
 */
export declare function getDshRuntimeVersion(): string;
/**
 * Check every @deepseek-ai/dsh or @deepseek-ai/dsh-* peer against the runtime.
 * Prereleases participate in ranges. workspace:^, workspace:~, and workspace:*
 * refer to the current runtime; other invalid ranges are incompatible.
 * @param manifest - parsed plugin package.json; inherited fields are ignored.
 * @param exemptions - exact plugin name@version keys mapped to exact runtime versions.
 * @param runtimeVersion - running dsh version, defaulting to this app-boot package.
 * @returns incompatible peers and exemption status, or undefined when none are incompatible.
 * @throws for malformed manifest peer fields, invalid runtime versions, or missing identity on a mismatch.
 */
export declare function evaluatePluginCompatibility(manifest: object, exemptions?: Readonly<Record<string, readonly string[]>>, runtimeVersion?: string): PluginCompatibility | undefined;
/**
 * Describe incompatible peers, their risk, and the exact-version remedy.
 * Surfaces with their own grant mechanism or locale render the structured result themselves.
 * @param issue - incompatible plugin/runtime result, including exempted mismatches.
 * @returns an English diagnostic for logs and stderr.
 */
export declare function pluginCompatibilityWarning(issue: PluginCompatibility): string;
//# sourceMappingURL=plugin-compatibility.d.ts.map