import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type DynamicCordisRunnerService from './index.ts';
import type { CordisDynamicPluginId } from './types.ts';
import type { LoadSavedRequest, LoadedPackageReceipt, PersistenceConfig, SavePackageRequest, SavedPackageReceipt, SavedPackageListing } from './persistence-types.ts';
/** Private storage owner; all runtime work delegates to the existing Runner. */
export declare class PackagePersistence {
    private readonly ctx;
    private readonly runner;
    private readonly config;
    private readonly assertIdle;
    private readonly bindings;
    private readonly busy;
    private readonly active;
    private closed;
    constructor(ctx: Context, runner: DynamicCordisRunnerService, config: PersistenceConfig, assertIdle: (pluginId: CordisDynamicPluginId) => void);
    /** Whether a source operation presently owns this live Plugin.
     * @param pluginId - exact current registry identity.
     * @returns whether lifecycle transitions and new calls must wait.
     */
    isBusy(pluginId: CordisDynamicPluginId): boolean;
    private operate;
    /** Recheck authority at every native activation entry, including the Client panel.
     * @param agent - current bound Session owner.
     * @param pluginId - exact current registry identity.
     */
    assertActivation(agent: Agent, pluginId: CordisDynamicPluginId): void;
    /** Recheck the bound current owner after an asynchronous activation boundary.
     * @param pluginId - exact current registry identity.
     */
    assertActivationCurrent(pluginId: CordisDynamicPluginId): void;
    private scope;
    private entries;
    private assertLinks;
    private read;
    private scan;
    /** Publish a bounded immutable source file, retaining incomplete staging on failure.
     * @param agent - current owner and authority scope.
     * @param request - exact runtime source and optional expected durable version.
     * @returns a committed receipt; no activation is requested.
     */
    save(agent: Agent, request: SavePackageRequest): Promise<SavedPackageReceipt>;
    /** Read source-free descriptors under the configured native directory lease.
     * @param agent - current Session and project selection.
     * @returns bounded descriptors, including individually damaged entries.
     */
    list(agent: Agent): Promise<SavedPackageListing[]>;
    /** Validate one selected version and bind fresh runtime identities without running.
     * @param agent - exact current owner; another live Agent cannot reuse the binding.
     * @param request - durable identity, immutable version and expected digest.
     * @returns the deduplicated current registry binding.
     */
    load(agent: Agent, request: LoadSavedRequest): Promise<LoadedPackageReceipt>;
}
