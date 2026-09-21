import { type ProfileManifest } from '@deepseek-ai/dsh-app-boot';
import type { PackageResult } from './types.ts';
/** Profile and invocation locations supplied by the launcher. */
export interface PackageOperationContext {
    profile: string;
    /** Explicit directory for an application-owned profile; named CLI profiles resolve under home. */
    dir?: string;
    installAnchor: string;
    cwd: string;
    home?: string;
}
/** Output and cancellation policy for one pnpm operation. */
export interface PackageOperationOptions {
    /** The pnpm executable name or path; resolved through `PATH` like the `dsh plugin` command. Defaults to `pnpm`. */
    command?: string;
    /** Prefix arguments for an application-owned executable. */
    args?: readonly string[];
    /** Application runtime environment, applied only to this package operation. */
    env?: Readonly<Record<string, string>>;
    /** CLI inherits authentication and terminal descriptors; service scrubs secrets and captures output. */
    execution: 'cli' | 'service';
    signal?: AbortSignal;
    outputBytes: number;
    onOutput?: (text: string, stream: 'stdout' | 'stderr') => void;
    activateNewBundles?: boolean;
    lockWaitMs?: number;
}
/** Resolve relative package specs against the caller's directory.
 * @param argument One pnpm argument.
 * @param cwd Invocation directory, never the profile directory.
 * @returns Anchored argument.
 */
export declare function anchorPathSpec(argument: string, cwd: string): string;
/** Read bundle metadata without loading its JavaScript.
 * @param name Installed dependency or installation-owned package name.
 * @param dir Profile directory.
 * @param anchor Installation manifest.
 * @returns Resolved metadata, or undefined for packages without bundle metadata.
 */
export declare function bundleManifest(name: string, dir: string, anchor: string): ProfileManifest | undefined;
/** Atomically save a profile manifest while retaining unrelated fields.
 * @param dir Profile directory.
 * @param manifest Updated document.
 */
export declare function saveManifest(dir: string, manifest: ProfileManifest): Promise<void>;
/** Execute pnpm inside a profile whose caller already holds the profile write lock.
 * @param context Launcher-owned profile and resolution locations.
 * @param args Pnpm arguments, before relative path anchoring.
 * @param options Output, activation and cancellation policy.
 * @returns Exit status and diagnostic path; service output is bounded, CLI output uses inherited descriptors.
 */
export declare function runProfilePnpm(context: PackageOperationContext, args: readonly string[], options: PackageOperationOptions): Promise<PackageResult>;
/** Initialize and run the dsh plugin command with the same write lock as the service.
 * @param context Launcher-owned locations.
 * @param args Pnpm arguments.
 * @param options Output and cancellation policy.
 * @returns Completed package-manager result.
 */
export declare function runPluginCommand(context: PackageOperationContext, args: readonly string[], options: PackageOperationOptions): Promise<PackageResult>;
/** What one registry lookup answered. */
export interface PackageViewResult {
    /** pnpm's exit code, null when it ended without one or never started. */
    exitCode: number | null;
    stdout: string;
    stderr: string;
    /** The lookup ran past its bound and was killed. */
    timedOut: boolean;
    /** The failure of starting pnpm at all, when that is what happened. */
    cause?: unknown;
}
/** Bounds of one registry lookup. */
export interface PackageViewOptions {
    /** The pnpm executable name or path. Defaults to `pnpm`. */
    command?: string;
    /** Prefix arguments for an application-owned executable. */
    args?: readonly string[];
    /** Application runtime environment, applied only to this package operation. */
    env?: Readonly<Record<string, string>>;
    /** Ends the lookup early; the caller's signal, when it has one. */
    signal?: AbortSignal;
    /** Bound on the lookup, in milliseconds. */
    timeoutMs: number;
}
/**
 * Ask the registry what a spec names through `pnpm view`, run in the profile
 * directory so the registry, proxy, and authentication settings of an install apply.
 * @param dir Profile directory.
 * @param spec One registry spec: a package name with an optional range.
 * @param options Cancellation and the time bound.
 * @returns pnpm's exit, output, and how the lookup ended.
 */
export declare function viewProfilePackage(dir: string, spec: string, options: PackageViewOptions): Promise<PackageViewResult>;
