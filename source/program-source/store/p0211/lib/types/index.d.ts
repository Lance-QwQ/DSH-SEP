import { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { BundleInfo, ChangeResult, InstallBundleOptions, PluginEntryId, PluginInfo, PluginInstallCancellation, PluginInstallRequestId, PluginSpecInspection } from './types.ts';
export type * from './types.ts';
export { classifyInstallFailure, type InstallFailureFacts } from './install-failure.ts';
export { InvalidInstallSpecError, parseInstallSpec, type ParsedInstallSpec } from './install-spec.ts';
/** The pnpm executable and the limits for package diagnostics and registry lookups. */
export interface Config {
    /** The pnpm executable name or path; resolved through `PATH` like the `dsh plugin` command. */
    pnpmCommand?: string;
    /** Maximum retained pnpm diagnostic bytes per operation. */
    outputBytes?: number;
    /** Maximum time to wait for another process's profile package operation. */
    lockWaitMs?: number;
    /** Bound on one registry lookup an inspection runs, in milliseconds. */
    inspectTimeoutMs?: number;
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        /** Persistent management of the current profile's composition and packages. */
        pluginManager: PluginManager;
        /** Optional owning application's admission and protected-plugin policy. */
        pluginManagementPolicy: {
            enter(): () => void;
            isProtected(moduleName: string, entryId?: string): boolean;
        };
    }
}
/** Manage profile files and apply their declared reload lifecycle. */
export declare class PluginManager extends TypertRemoteService {
    static inject: string[];
    static Config: z<Config>;
    private readonly ownerEntryId;
    private readonly packageOperations;
    private readonly profile;
    private readonly outputBytes;
    private readonly lockWaitMs;
    private readonly inspectTimeoutMs;
    private readonly pnpmCommand;
    private readonly ownerContext;
    private readonly abort;
    /** Installations by request id, from their call until it settles. */
    private readonly installs;
    constructor(ctx: Context, config: Config);
    /** Read current plugins, including why a row cannot be changed through the profile patch.
     * @returns Current runtime entries with persistent patch targets.
     */
    listPlugins(): Promise<PluginInfo[]>;
    /** Read the profile's installed bundles, the bundles this dsh installation supplies, and the selected names that are not bundles.
     * A dependency without a bundle patch is listed, as a `not-bundle` problem, only while it is selected.
     * @returns Package versions, one-liners, rows, activation selections, whether the installation offers the
     * bundle, and removal availability.
     */
    listBundles(): Promise<BundleInfo[]>;
    /** Read what a spec names before installing it.
     * @param spec One package spec: a registry name, an absolute path, a git address, or a tarball.
     * @param signal Ends a registry lookup early.
     * @returns The package the spec names, or why it is refused.
     */
    inspect(spec: string, signal?: AbortSignal): Promise<PluginSpecInspection>;
    /** Persist a plugin entry's desired enablement and apply it on live profiles.
     * @param id Loader entry identity returned by listPlugins.
     * @param enabled Whether the plugin should run.
     * @returns Saved and runtime outcomes, including higher-priority overrides.
     */
    setPluginEnabled(id: PluginEntryId, enabled: boolean): Promise<ChangeResult>;
    /** Select or remove a bundle layer while retaining installed dependencies.
     * @param name Bundle package name.
     * @param enabled Whether the bundle contributes its patch layer.
     * @returns Persisted and runtime outcomes.
     */
    setBundleEnabled(name: string, enabled: boolean): Promise<ChangeResult>;
    /**
     * Install a package using the same pnpm implementation as dsh plugin. A run
     * that fails, is cancelled, or adds a package without a bundle patch restores
     * `package.json` and `pnpm-lock.yaml` as they were; downloaded files can stay.
     * @param spec One package spec, including local paths relative to the invocation directory.
     * @param options Whether to activate the installed bundle (defaults to true), the request id a cancellation names, and
     * the pending build scripts to allow for this profile before pnpm runs.
     * @returns Package-manager diagnostics and observed activation outcome.
     */
    installBundle(spec: string, options?: InstallBundleOptions): Promise<ChangeResult>;
    /** Stop an installation this manager owns and wait until its files are back.
     * @param requestId The id the installation was started with.
     * @returns `cancelled` once pnpm exited and the files are restored, `too-late` once the bundle is being
     * applied, `not-running` for any other id.
     */
    cancelInstall(requestId: PluginInstallRequestId): Promise<PluginInstallCancellation>;
    /** Unload and remove a profile-owned bundle dependency through dsh plugin's pnpm path.
     * @param name Installed dependency name.
     * @returns Removal diagnostics and the remaining profile state.
     */
    removeBundle(name: string): Promise<ChangeResult>;
    /** The rows a bundle's patch inserts and the existing rows it changes; an unreadable patch throws. */
    private declaredRows;
    /** Run one pnpm command in the profile, streaming its output as install-log chunks. */
    private runPnpm;
    /** The profile files an installation may rewrite, as they are now; absent files read as undefined. */
    private readRestoredFiles;
    /** Put the profile files back; pnpm has exited by the time this runs. */
    private restoreFiles;
    private selectBundle;
    private bundleRows;
    private protectsManager;
    private isProtected;
    private configure;
    private reload;
    private change;
    private diskState;
}
export default PluginManager;
