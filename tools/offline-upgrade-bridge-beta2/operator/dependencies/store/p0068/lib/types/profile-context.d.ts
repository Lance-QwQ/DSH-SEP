import { type Profile } from './profile.ts';
import type { PatchOptions } from '@deepseek-ai/cordis-plugin-include';
/** Application-owned package manager executable; environment applies only to package operations. */
export interface ProfilePnpmInvocation {
    readonly command: string;
    readonly args: readonly string[];
    readonly env: Readonly<Record<string, string>>;
}
/** Current profile facts; scheduling and mutation belong to their callers. */
export interface ProfileContext {
    readonly name: string;
    /** Packaged applications supply their bundled runtime instead of a PATH executable. */
    readonly packageManager?: ProfilePnpmInvocation;
    readonly dir: string;
    readonly patchPath: string;
    readonly installAnchor: string;
    readonly cwd: string;
    readonly home: string;
    /** Bundle packages used to start this process, before any persisted edits. */
    readonly startedBundles: readonly string[];
    /** Parsed command-line overlays, applied above profile and home patches. */
    readonly overlays: readonly PatchOptions[];
    /** Launch-time DSH_TELEMETRY_DISABLED value; any non-empty value opts out. */
    readonly telemetryDisabledEnv: string | undefined;
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        /** Present only in a profile launched by dsh. */
        profileContext: ProfileContext;
    }
}
/**
 * Resolve the telemetry opt-out switch into its boot patch. ANY non-empty
 * value (including `'0'`/`'false'`) disables: a privacy switch prefers
 * off-by-mistake over on-by-mistake. A composition without the telemetry row
 * exports nothing, so the switch is then trivially satisfied and no patch is
 * generated — custom profiles need not mount telemetry to run with the
 * switch set.
 * @param disabledEnv - the raw `DSH_TELEMETRY_DISABLED` value (`undefined` when unset).
 * @param hasRow - whether the composition carries the telemetry row.
 * @returns the disable patch, or `undefined` when no hard-disable patch is required.
 */
export declare function resolveTelemetryPatch(disabledEnv: string | undefined, hasRow: boolean): PatchOptions | undefined;
/** Read current bundle and user layers with the launch-time overlays.
 * @param binName Diagnostic prefix for malformed or missing configuration.
 * @param context Data supplied by the profile launcher.
 * @param initialProfile Already loaded startup profile; omitted reads the current files.
 * @returns Detached ordered patches; this function does not update the Loader.
 */
export declare function readProfilePatches(binName: string, context: ProfileContext, initialProfile?: Profile): PatchOptions[];
//# sourceMappingURL=profile-context.d.ts.map