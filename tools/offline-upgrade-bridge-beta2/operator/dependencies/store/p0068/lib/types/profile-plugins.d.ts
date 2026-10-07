/** Installed profile dependencies and their bundle activation after package-manager operations. */
import { type ProfileManifest } from './profile.ts';
/** Profile directory and installation used by the shared bundle resolver. */
export interface ProfilePluginLocation {
    /** Diagnostic prefix for profile manifest failures. */
    readonly binName: string;
    /** Profile package directory managed by pnpm. */
    readonly profileDir: string;
    /** Absolute package.json path of the owning dsh installation. */
    readonly installAnchor: string;
}
/** One dependency under its package-manager key, including npm aliases. */
export interface ProfilePluginDependency {
    /** Dependency key used in package.json and the bundle list. */
    readonly name: string;
    /** Installed version, or the dependency spec when installed metadata is unavailable. */
    readonly version: string;
    /** Whether the package selected by the bundle resolver declares a patch. */
    readonly bundle: boolean;
    /** Whether the dependency appears in the profile's active bundle list. */
    readonly enabled: boolean;
}
/** Profile manifest and dependencies in manifest order. */
export interface ProfilePluginInventory {
    readonly manifest: ProfileManifest;
    readonly dependencies: readonly ProfilePluginDependency[];
}
/** Result of reconciling bundle activation after a successful package operation. */
export interface ProfilePluginReconciliation {
    readonly plugins: ProfilePluginInventory;
    /** Newly added ordinary dependencies, for optional caller-owned diagnostics. */
    readonly addedPlainDependencies: readonly string[];
}
/**
 * Read installed versions and bundle declarations without requiring loadable plugin code.
 * Missing or unreadable installed metadata leaves the dependency visible for repair or removal.
 * @param location - profile and installation resolution inputs.
 * @returns dependency records in package.json order and the profile manifest.
 */
export declare function readProfilePlugins(location: ProfilePluginLocation): ProfilePluginInventory;
/**
 * Write a bundle list while preserving the supplied profile's other metadata.
 * @param profileDir - directory whose package.json is updated.
 * @param manifest - current profile manifest, read after the package operation when applicable.
 * @param bundles - ordered active bundle names, including any template entries.
 * @returns the written manifest.
 */
export declare function writeProfileBundles(profileDir: string, manifest: ProfileManifest, bundles: readonly string[]): ProfileManifest;
/**
 * Reconcile installed bundle declarations after a successful package-manager operation.
 * Dependency-managed entries disappear when removed or when their package loses its declaration;
 * template entries retain their order and duplicates. New bundle dependencies activate automatically.
 * @param options - location, inventory captured before pnpm, and whether explicitly disabled bundles remain disabled.
 * @returns updated inventory and newly added ordinary dependencies for caller-owned warnings.
 */
export declare function reconcileProfilePlugins(options: ProfilePluginLocation & {
    readonly before: ProfilePluginInventory;
    readonly preserveDisabled: boolean;
}): ProfilePluginReconciliation;
//# sourceMappingURL=profile-plugins.d.ts.map