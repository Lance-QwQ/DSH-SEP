/** Read package names left undecided by pnpm 11, including after installation cleanup.
 * @param dir Current profile directory.
 * @returns Exact package names awaiting a build decision; wildcard rules are excluded.
 */
export declare function readPendingBuilds(dir: string): Promise<string[]>;
/** Persist approval without running scripts; the caller holds the profile manifest lock.
 * @param dir Current profile directory.
 * @param names Explicit package names from the pending build list.
 * @throws If a name is no longer pending or allowBuilds contains YAML anchors or aliases; no approvals are written.
 */
export declare function approveBuilds(dir: string, names: readonly string[]): Promise<void>;
