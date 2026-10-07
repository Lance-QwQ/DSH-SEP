/** Package metadata resolved through one runtime interception. */
import { Service, type Context } from '@deepseek-ai/cordis';
import type { PluginLocalizedMeta } from '@deepseek-ai/dsh-package-manifest';
import type { RuntimeResolution } from '../profile.ts';
declare module '@deepseek-ai/cordis' {
    interface Context {
        /** Deterministic package lookup for configured plugin specifiers. */
        pluginPackages: PluginPackages;
    }
}
/** The package that owns a resolved module. */
export interface PluginPackage {
    /** Manifest package name. */
    name: string;
    /** Manifest version when declared. */
    version: string | undefined;
    /** Absolute package directory. */
    dir: string;
    /** Absolute package.json path. */
    manifestPath: string;
    /** Parsed manifest shared by metadata readers. */
    manifest: Record<string, unknown>;
}
/** Optional runtime interception installed and owned by {@link PluginPackages}. */
export interface PluginPackagesConfig {
    /** Complete package table; omit it to expose native package lookup only. */
    resolution?: RuntimeResolution;
}
/** Package lookup shared by metadata consumers in one profile process. */
export declare class PluginPackages extends Service {
    private packages;
    private readonly interception;
    private disposeWorkerResolution;
    constructor(ctx: Context, config?: PluginPackagesConfig);
    /**
     * Publish a complete successor generation for this process and subsequently created Workers.
     * Linked roots may be removed without unloading modules or clearing Node caches.
     * @param successor - fully constructed generation accepted by {@link RuntimeInterception.replace}.
     */
    replace(successor: RuntimeResolution): void;
    /**
     * Locate the package named by a specifier without requiring a package export.
     * @param specifier - module specifier whose package owns the requested module.
     * @param parentURL - URL whose Node lookup order applies.
     * @returns the parsed package, or undefined when no package owns the request.
     */
    packageOf(specifier: string, parentURL: string): PluginPackage | undefined;
    /**
     * Read display metadata without loading or activating the target plugin.
     * @param specifier - configured package module, including package subpaths.
     * @param parentURL - owning Loader tree's resolution base.
     * @returns local display metadata or its diagnostic; undefined for non-package requests or absent metadata.
     */
    metaOf(specifier: string, parentURL: string): PluginLocalizedMeta | undefined;
}
//# sourceMappingURL=service.d.ts.map