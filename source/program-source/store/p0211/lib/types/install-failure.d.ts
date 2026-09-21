/**
 * What a failed pnpm run was, read off how it ended and what it printed:
 * pnpm names its failures with stable `ERR_PNPM_*` codes and Node's errno
 * names, which the run's captured tail carries whatever the locale.
 * @module @deepseek-ai/dsh-plugin-manager/install-failure
 */
import type { PluginInstallFailureKind } from './types.ts';
/** How a run ended, beyond its exit code. */
export interface InstallFailureFacts {
    /** The output tail the failure reports. */
    readonly log: string;
    /** The spawn error, when the child never ran. */
    readonly cause?: unknown;
    /** Whether the run outlived its bound. */
    readonly timedOut?: boolean;
}
/**
 * Classify a failed run.
 * @param facts - how the run ended and what it printed.
 * @returns the kind, `unknown` when nothing in the facts names one.
 */
export declare function classifyInstallFailure(facts: InstallFailureFacts): PluginInstallFailureKind;
