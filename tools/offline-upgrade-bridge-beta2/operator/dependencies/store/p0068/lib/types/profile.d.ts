/**
 * Profile discovery, initialization, and patch-layer composition for the
 * `dsh --profile` launcher family.
 *
 * A profile is a directory under `$DSH_HOME/profiles/<name>` holding a
 * `package.json` (out-of-tree plugin dependencies plus the profile manifest
 * `dsh.profile` with its ordered `bundles` list) and a `cordis.patch.yml`
 * (the user's own patch layer, applied after every bundle layer). Bundles are
 * npm packages whose manifest declares
 * `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }` (one file, or an
 * ordered list of files); the tree is composed by applying each bundle's patch
 * lists in `dsh.profile.bundles` order over an empty entry list, then the
 * profile's own patches, then any launcher layers (`--patch` files and
 * flag-derived patches).
 *
 * Module resolution is two-anchor by construction: a bundle name resolves
 * first from the dsh installation (the launcher's own package), then from the
 * profile directory. Pnpm-managed entries in the profile's `node_modules`
 * resolve first. The runtime resolution supplies packages carried by the
 * installation and selected bundles to Node's ESM and CommonJS resolvers.
 * @module @deepseek-ai/dsh-app-boot/profile
 */
import type { EntryOptions } from '@deepseek-ai/cordis-plugin-loader';
import { type PatchOptions } from '@deepseek-ai/cordis-plugin-include';
import type { DshBundleManifest, DshPackageManifest } from '@deepseek-ai/dsh-package-manifest';
/** Directory under the Harness home holding every profile. */
export declare const PROFILES_DIR = "profiles";
/** The user patch layer inside a profile directory (hot-reloaded on long-lived surfaces). */
export declare const PROFILE_PATCH_FILENAME = "cordis.patch.yml";
/** Installation-owned defaults used when a shipped profile is first opened. */
export interface ProfileTemplate {
    /** Ordered bundle layer list. */
    bundles: readonly string[];
}
/** Package metadata accepted by the profile reader; local profiles need no published identity. */
export type ProfileManifest = Partial<DshPackageManifest>;
/**
 * The patch files a bundle declares, as written: one file for a string
 * `patch`, the listed files in order for an array.
 * @param bundle - the bundle's `dsh.bundle` declaration, as read from package.json.
 * @returns the package-relative patch file paths in application order.
 * @throws {Error} when `patch` is neither a string nor a list of strings.
 */
export declare function bundlePatchFiles(bundle: DshBundleManifest): string[];
/**
 * Resolve a bundle declaration to its ordered absolute patch files.
 * @param packageDir - absolute directory of the bundle package.
 * @param bundle - the bundle's `dsh.bundle` declaration, as read from package.json.
 * @returns the absolute patch file paths in application order.
 * @throws {Error} when `patch` is neither a string nor a list of strings.
 */
export declare function bundlePatchPaths(packageDir: string, bundle: DshBundleManifest): string[];
/** One resolved bundle layer of a profile. */
export interface ProfileLayer {
    /** The bundle's package name, as listed in `dsh.profile.bundles`. */
    packageName: string;
    /** Absolute directory of the resolved bundle package. */
    packageDir: string;
    /** Absolute paths of the bundle's patch files, in application order. */
    patchPaths: readonly string[];
    /** The parsed patch lists of every file, concatenated in application order. */
    patches: PatchOptions[];
}
/** A loaded profile: resolved bundle layers plus the user's own patch layer. */
export interface Profile {
    /** The profile name (its directory basename). */
    name: string;
    /** Absolute profile directory. */
    dir: string;
    /** Bundle layers in `dsh.profile.bundles` order. */
    layers: ProfileLayer[];
    /** Absolute path of the profile's own patch file. */
    patchPath: string;
    /** The profile's own patches; empty when the file is absent. */
    patches: PatchOptions[];
    /** Selected bundles that contributed no layer, in `dsh.profile.bundles` order, with why. */
    skippedBundles: SkippedBundle[];
}
/** A selected bundle the profile could not load, or whose own DSH peers the profile does not exempt. */
export interface SkippedBundle {
    /** The bundle's package name from `dsh.profile.bundles`. */
    packageName: string;
    /** The resolution, manifest, compatibility, or patch-loading failure. */
    reason: string;
}
/**
 * Print each skipped bundle once; loading never prints, so launchers call this once per start.
 * @param binName - the diagnostic prefix.
 * @param profile - the loaded profile.
 */
export declare function reportSkippedBundles(binName: string, profile: Pick<Profile, 'skippedBundles'>): void;
/** One package the runtime resolution supplies at the interception layer. */
export interface RuntimeResolutionEntry {
    /** Bare package name. */
    readonly name: string;
    /** Package directory selected by the existing dependency traversal. */
    readonly packageDir: string;
    /** Selected package version when its manifest declares one. */
    readonly version: string | undefined;
    /** Manifest whose dependency edge selected this package. */
    readonly declarer: string;
    /** Whether every profile or only the active profile receives this entry. */
    readonly scope: 'installation' | 'profile';
}
/**
 * A profile node_modules entry linked to a directory outside the shared profiles tree and the active profile.
 * Importers below `realPath` use Node's real ancestor chain, with peer mappings read at each node_modules position.
 */
export interface LinkedRoot {
    /** Package name of the profile `node_modules` entry, including its scope. */
    readonly name: string;
    /** Real directory outside the shared profiles tree and active profile; a package.json is optional. */
    readonly realPath: string;
}
/** Complete immutable package table for one profile launch. */
export interface RuntimeResolution {
    /** Directory containing every profile; its node_modules is the interception layer. */
    readonly profilesDir: string;
    /** Active profile directory, when profile-scope entries were included. */
    readonly profileDir: string | undefined;
    /** Profile-declared packages installed in the profile's own node_modules. */
    readonly localPackageNames: readonly string[];
    /** Installation-scope entries followed by profile-scope entries in precedence order. */
    readonly entries: readonly RuntimeResolutionEntry[];
    /** Active profile links to external directories, sorted by name. */
    readonly linkedRoots: readonly LinkedRoot[];
}
/**
 * Resolve a profile's directory under the Harness home.
 * @param name - the profile name (`dsh --profile <name>`).
 * @param home - the Harness home; defaults to {@link resolveDshHome}.
 * @returns the absolute profile directory (which may not exist yet).
 */
export declare function resolveProfileDir(name: string, home?: string): string;
/** The shipped profile templates auto-initialized on first use, by name. */
export declare const PROFILE_TEMPLATES: Record<string, ProfileTemplate>;
/** The bundle list a `dsh plugin` init uses for a name with no shipped template. */
export declare const DEFAULT_PROFILE_BUNDLES: readonly string[];
/**
 * The bundles the dsh installation ships for a person to switch on: each a
 * runtime dependency of the installation that declares `dsh.bundle.patch`,
 * an `icon`, and `./locale/*.json` display metadata, selected by no shipped
 * template, and offered switched off by the plugin manager
 * ([rationale](../../../../.agents/notes/implemented/process/2026-09-15-shipped-optional-bundles.md),
 * [admission](../../../../.agents/notes/implemented/architecture/2026-09-21-experimental-capabilities-as-optional-bundles.md)).
 */
export declare const OPTIONAL_BUNDLES: readonly string[];
/**
 * Initialize a profile directory: manifest, empty user patch layer, and the
 * pnpm settings out-of-tree plugins need. Existing files are never touched,
 * so re-running is a no-op on an initialized profile.
 * @param dir - the profile directory from {@link resolveProfileDir}.
 * @param bundles - the initial `dsh.profile.bundles` layer list.
 */
export declare function initProfile(dir: string, bundles: readonly string[]): void;
/**
 * Remove the package projections a link-backend launch left in a profile.
 * Only symlinks under the profile's `node_modules` whose target lies inside
 * `<profile>/.dsh-module-fallback/node_modules` are unlinked, then that directory is removed;
 * pnpm-installed packages and every other symlink stay. A profile without the directory is untouched.
 * @param dir - the profile directory.
 */
export declare function removeLinkProjections(dir: string): void;
/** Inputs for {@link createRuntimeResolution}. */
export interface RuntimeResolutionOptions {
    /** Absolute package.json path of the running dsh installation. */
    installAnchor: string;
    /** Loaded profile whose selected bundles may carry profile-local plugins. */
    profile?: Profile;
    /** Harness home; defaults to {@link resolveDshHome}. */
    home?: string;
}
/**
 * Compute the runtime resolution without writing module-resolution files.
 * @param options - installation anchor, optional loaded profile, and Harness home.
 * @returns the complete immutable runtime resolution.
 */
export declare function createRuntimeResolution(options: RuntimeResolutionOptions): Promise<RuntimeResolution>;
/**
 * Read a profile's manifest.
 * @param binName - the diagnostic prefix on the thrown error.
 * @param dir - the profile directory.
 * @returns the parsed manifest.
 */
export declare function readProfileManifest(binName: string, dir: string): ProfileManifest;
/**
 * Write a profile's manifest back (2-space JSON, trailing newline).
 * @param dir - the profile directory.
 * @param manifest - the manifest value to persist.
 */
export declare function writeProfileManifest(dir: string, manifest: ProfileManifest): void;
/**
 * Resolve one bundle package's directory: installation anchor first, then the
 * profile directory. The installation-first order is the contract that
 * `@deepseek-ai/dsh-base` (and every other in-box bundle) always comes from
 * the same installation as the running dsh, never from a profile-local copy.
 * Resolution does not require the package to export `./package.json`.
 * @param binName - the diagnostic prefix on the thrown error.
 * @param packageName - the bundle's package name from `dsh.profile.bundles`.
 * @param installAnchor - absolute path of a file inside the dsh app package (its package.json).
 * @param profileDir - the profile directory (second anchor).
 * @returns the bundle package's absolute directory.
 */
export declare function resolveBundleDir(binName: string, packageName: string, installAnchor: string, profileDir: string): string;
/**
 * Load an already initialized profile directory without resolving it through
 * the shared Harness home. This is used by application-owned profiles whose
 * package project and lifecycle belong to that application.
 * Unreadable bundles, and bundles whose own dsh peers the profile does not exempt, are skipped
 * without changing the manifest and listed in `skippedBundles`; nothing is printed.
 * @param binName - the diagnostic prefix on thrown errors.
 * @param dir - absolute profile package directory.
 * @param installAnchor - absolute path of the owning dsh app's package.json.
 * @param options - `userLayer: false` skips reading `cordis.patch.yml`.
 * @returns the successfully loaded bundle layers and optional user patch layer.
 */
export declare function loadProfileDirectory(binName: string, dir: string, installAnchor: string, options?: {
    userLayer?: boolean;
}): Profile;
/**
 * Load a profile: resolve every `dsh.profile.bundles` entry to its patch
 * layer and parse the profile's own patch file. Unreadable or incompatible bundles
 * are skipped and listed in `skippedBundles`; profile manifest and user patch errors still throw.
 * @param binName - the diagnostic prefix on thrown errors.
 * @param name - the profile name.
 * @param installAnchor - absolute path of the dsh app's package.json (first resolution anchor).
 * @param home - the Harness home; defaults to {@link resolveDshHome}.
 * @param options - `userLayer: false` skips reading `cordis.patch.yml`, so a
 * bundles-only consumer (`--dump-default-config`, a recovery diagnostic)
 * cannot fail on a broken user layer.
 * @returns the loaded profile (empty `patches` when the user layer is skipped).
 */
export declare function loadProfile(binName: string, name: string, installAnchor: string, home?: string, options?: {
    userLayer?: boolean;
}): Profile;
/**
 * Compose patch layers into the effective entry list over an empty root —
 * the same single `applyEntryPatches` call the boot include makes, so flag
 * derivation and config dumps see exactly what mounts.
 * @param layers - patch lists in application order.
 * @param warn - sink for skipped-patch diagnostics; defaults to silent (boot repeats them).
 * @returns the composed entry list.
 */
export declare function composeEntries(layers: readonly PatchOptions[][], warn?: (message: string) => void): EntryOptions[];
//# sourceMappingURL=profile.d.ts.map