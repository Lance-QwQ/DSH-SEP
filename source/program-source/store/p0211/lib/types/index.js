var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
/** Current-profile plugin and bundle management over shared dsh plugin operations. */
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write';
import z from '@deepseek-ai/schemastery';
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol';
import { pluginEntryId, readPluginInventory } from '@deepseek-ai/dsh-host-plugin-inventory';
import { readProfileManifest, resolveBundleDir, loadOverlayPatches, composeEntries, reconcileProfilePatches, readProfilePatches, OPTIONAL_BUNDLES, } from '@deepseek-ai/dsh-app-boot';
import { bundleManifest, runProfilePnpm, saveManifest, viewProfilePackage } from "./operations.js";
import { classifyInstallFailure } from "./install-failure.js";
import { InvalidInstallSpecError, parseInstallSpec } from "./install-spec.js";
import { writePluginEnabled } from "./patch.js";
import { ManagementFailure } from "./failure.js";
import { approveBuilds, readPendingBuilds } from "./build-approval.js";
export { classifyInstallFailure } from "./install-failure.js";
export { InvalidInstallSpecError, parseInstallSpec } from "./install-spec.js";
const protectedModules = new Set([
    '@deepseek-ai/dsh-plugin-manager', '@deepseek-ai/cordis-plugin-loader',
    '@deepseek-ai/cordis-plugin-include', '@deepseek-ai/dsh-api-gateway',
    '@deepseek-ai/dsh-host-webserver', '@deepseek-ai/dsh-client-modules',
    '@deepseek-ai/dsh-client-ui-settings-plugin-inventory', '@deepseek-ai/dsh-client-ui-plugin-manager',
    '@deepseek-ai/dsh-host-plugin-inventory', '@deepseek-ai/dsh-typert-registry',
    '@deepseek-ai/dsh-api-remotes',
    '@deepseek-ai/cordis-plugin-timer', '@deepseek-ai/dsh-client-connection',
    '@deepseek-ai/dsh-host-frontend-static', '@deepseek-ai/dsh-tools',
    '@deepseek-ai/dsh-hmr',
]);
/** The profile files an installation writes and a failed or cancelled one restores. */
const RESTORED_FILES = ['package.json', 'pnpm-lock.yaml'];
/** pnpm's colour escapes, which a JSON answer may be wrapped in. */
const ANSI_SEQUENCE = /\x1b\[[0-9;]*m/g;
/** Flatten only the groups addressable by the profile's patch composer. */
function flatten(rows) {
    return rows.flatMap(row => [row, ...(row.group && Array.isArray(row.config) ? flatten(row.config) : [])]);
}
/** Preserve the exact observed diagnostic, including non-Error failures. */
function messageOf(error) { return error instanceof Error ? error.message : String(error); }
/** An expected refusal keeps its code; anything else becomes an operation error carrying its exact diagnostic. */
function managementError(error) {
    return error instanceof ManagementFailure ? { code: error.code } : { code: 'operation-error', diagnostic: messageOf(error) };
}
/** The caller stopped an installation; its files are restored before this is thrown. */
class InstallCancelledError extends Error {
    constructor() {
        super('Installation cancelled');
        this.name = 'InstallCancelledError';
    }
}
/** A manifest field that is a string, when the manifest carries one. */
function stringField(manifest, field) {
    const value = manifest[field];
    return typeof value === 'string' ? value : undefined;
}
/** What a package manifest says about the package: identity, one-liner, and whether it is a bundle. */
function inspectionOf(kind, manifest) {
    const dsh = manifest.dsh;
    const declared = typeof dsh === 'object' && dsh !== null ? dsh : undefined;
    const bundle = declared !== undefined && typeof declared.bundle === 'object' && declared.bundle !== null;
    const name = stringField(manifest, 'name');
    const version = stringField(manifest, 'version');
    const description = stringField(manifest, 'description');
    return {
        status: 'accepted', kind, bundle,
        ...name === undefined ? {} : { name },
        ...version === undefined ? {} : { version },
        ...description === undefined || description === '' ? {} : { description },
    };
}
function refused(problem, reason) {
    return { status: 'refused', problem, reason };
}
/** Manage profile files and apply their declared reload lifecycle. */
let PluginManager = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _listPlugins_decorators;
    let _listBundles_decorators;
    let _inspect_decorators;
    let _setPluginEnabled_decorators;
    let _setBundleEnabled_decorators;
    let _installBundle_decorators;
    let _cancelInstall_decorators;
    let _removeBundle_decorators;
    return class PluginManager extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _listPlugins_decorators = [Remote];
            _listBundles_decorators = [Remote];
            _inspect_decorators = [Remote];
            _setPluginEnabled_decorators = [Remote];
            _setBundleEnabled_decorators = [Remote];
            _installBundle_decorators = [Remote];
            _cancelInstall_decorators = [Remote];
            _removeBundle_decorators = [Remote];
            __esDecorate(this, null, _listPlugins_decorators, { kind: "method", name: "listPlugins", static: false, private: false, access: { has: obj => "listPlugins" in obj, get: obj => obj.listPlugins }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _listBundles_decorators, { kind: "method", name: "listBundles", static: false, private: false, access: { has: obj => "listBundles" in obj, get: obj => obj.listBundles }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _inspect_decorators, { kind: "method", name: "inspect", static: false, private: false, access: { has: obj => "inspect" in obj, get: obj => obj.inspect }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _setPluginEnabled_decorators, { kind: "method", name: "setPluginEnabled", static: false, private: false, access: { has: obj => "setPluginEnabled" in obj, get: obj => obj.setPluginEnabled }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _setBundleEnabled_decorators, { kind: "method", name: "setBundleEnabled", static: false, private: false, access: { has: obj => "setBundleEnabled" in obj, get: obj => obj.setBundleEnabled }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _installBundle_decorators, { kind: "method", name: "installBundle", static: false, private: false, access: { has: obj => "installBundle" in obj, get: obj => obj.installBundle }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _cancelInstall_decorators, { kind: "method", name: "cancelInstall", static: false, private: false, access: { has: obj => "cancelInstall" in obj, get: obj => obj.cancelInstall }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _removeBundle_decorators, { kind: "method", name: "removeBundle", static: false, private: false, access: { has: obj => "removeBundle" in obj, get: obj => obj.removeBundle }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        static inject = ['loader', 'profileContext'];
        static Config = z.object({
            pnpmCommand: z.string().default('pnpm'),
            outputBytes: z.number().step(1).min(1).default(16384),
            lockWaitMs: z.number().step(1).min(0).default(120000),
            inspectTimeoutMs: z.number().step(1).min(1000).default(20000),
        });
        ownerEntryId = __runInitializers(this, _instanceExtraInitializers);
        packageOperations = new Set();
        profile;
        outputBytes;
        lockWaitMs;
        inspectTimeoutMs;
        pnpmCommand;
        ownerContext;
        abort = new AbortController();
        /** Installations by request id, from their call until it settles. */
        installs = new Map();
        constructor(ctx, config) {
            super(ctx, 'pluginManager');
            this.ownerEntryId = ctx.fiber.entry?.id;
            this.ownerContext = ctx;
            this.profile = ctx.profileContext;
            this.outputBytes = config.outputBytes;
            this.lockWaitMs = config.lockWaitMs;
            this.inspectTimeoutMs = config.inspectTimeoutMs;
            this.pnpmCommand = config.pnpmCommand;
            ctx.effect(() => async () => {
                this.abort.abort();
                await Promise.allSettled([...this.packageOperations]);
            }, 'plugin-manager: package cancellation');
        }
        /** Read current plugins, including why a row cannot be changed through the profile patch.
         * @returns Current runtime entries with persistent patch targets.
         */
        async listPlugins() {
            const rows = flatten(composeEntries([readProfilePatches('dsh', this.profile)]));
            const snapshot = await readPluginInventory(this.ctx);
            return snapshot.entries.map((entry) => {
                const actual = [...this.ctx.loader.entries()].find(row => row.id === entry.entryId);
                const candidates = rows.filter(row => row.id === actual?.options.id);
                const candidate = candidates[0];
                if (protectedModules.has(entry.moduleName) || entry.entryId === this.ownerEntryId) {
                    return { ...entry, readOnlyReason: 'management-required' };
                }
                if (candidate === undefined || candidates.length > 1 || candidate.name !== entry.moduleName
                    || actual?.parent.tree.ctx.fiber.entry?.id !== 'include') {
                    return { ...entry, readOnlyReason: 'unaddressable' };
                }
                return { ...entry, patchId: candidate.id };
            });
        }
        /** Read the profile's installed bundles, the bundles this dsh installation supplies, and the selected names that are not bundles.
         * A dependency without a bundle patch is listed, as a `not-bundle` problem, only while it is selected.
         * @returns Package versions, one-liners, rows, activation selections, whether the installation offers the
         * bundle, and removal availability.
         */
        listBundles() {
            const manifest = readProfileManifest('dsh', this.profile.dir);
            const selected = manifest.dsh?.profile?.bundles ?? [];
            const dependencies = Object.keys(manifest.dependencies ?? {});
            const installation = JSON.parse(readFileSync(this.profile.installAnchor, 'utf8'));
            const names = [...new Set([...selected, ...dependencies, ...Object.keys(installation.dependencies ?? {})])];
            const bundles = [];
            for (const name of names) {
                const installed = dependencies.includes(name);
                const optional = OPTIONAL_BUNDLES.includes(name);
                const removable = installed && !Object.hasOwn(installation.dependencies ?? {}, name);
                const enabled = selected.includes(name);
                try {
                    const info = bundleManifest(name, this.profile.dir, this.profile.installAnchor);
                    if (info === undefined) {
                        if (enabled)
                            bundles.push({ name, enabled, installed, optional, removable, error: { code: 'not-bundle' }, rows: [], overrides: [] });
                        continue;
                    }
                    const readOnlyReason = this.protectsManager(name) ? 'management-required' : undefined;
                    bundles.push({ name, ...(info.version === undefined ? {} : { version: info.version }),
                        ...(info.description === undefined || info.description === '' ? {} : { description: info.description }),
                        enabled, installed, optional, removable: removable && readOnlyReason === undefined,
                        ...(readOnlyReason === undefined ? {} : { readOnlyReason }),
                        ...this.declaredRows(name, info) });
                }
                catch (error) {
                    if (enabled || installed) {
                        bundles.push({ name, enabled, installed, optional, removable, error: managementError(error), rows: [], overrides: [] });
                    }
                }
            }
            return Promise.resolve(bundles);
        }
        /** Read what a spec names before installing it.
         * @param spec One package spec: a registry name, an absolute path, a git address, or a tarball.
         * @param signal Ends a registry lookup early.
         * @returns The package the spec names, or why it is refused.
         */
        async inspect(spec, signal) {
            let parsed;
            try {
                parsed = parseInstallSpec(spec);
            }
            catch (error) {
                /* v8 ignore next 2 -- parseInstallSpec throws nothing but its own refusal */
                if (!(error instanceof InvalidInstallSpecError))
                    throw error;
                return refused('invalid-spec', error.reason);
            }
            const manifest = readProfileManifest('dsh', this.profile.dir);
            const installation = JSON.parse(readFileSync(this.profile.installAnchor, 'utf8'));
            const known = new Set([
                ...manifest.dsh?.profile?.bundles ?? [], ...Object.keys(manifest.dependencies ?? {}), ...Object.keys(installation.dependencies ?? {}),
            ]);
            switch (parsed.kind) {
                case 'git': return { status: 'accepted', kind: 'git', bundle: null };
                case 'tarball':
                    if (parsed.path !== undefined && !existsSync(parsed.path))
                        return refused('not-a-package', 'the tarball does not exist');
                    return { status: 'accepted', kind: 'tarball', bundle: null };
                case 'path': {
                    if (!existsSync(parsed.path))
                        return refused('not-a-package', 'the path does not exist');
                    let read;
                    try {
                        read = JSON.parse(await readFile(join(parsed.path, 'package.json'), 'utf8'));
                    }
                    catch (error) {
                        return refused('not-a-package', `no readable package.json at the path: ${messageOf(error)}`);
                    }
                    const inspection = inspectionOf('path', read);
                    if (inspection.name === undefined)
                        return refused('not-a-package', 'the package.json names no package');
                    if (known.has(inspection.name))
                        return refused('already-installed', `${inspection.name} is already installed`);
                    if (!inspection.bundle)
                        return refused('not-a-bundle', `${inspection.name} declares no dsh.bundle`);
                    return inspection;
                }
                case 'registry': {
                    if (known.has(parsed.name))
                        return refused('already-installed', `${parsed.name} is already installed`);
                    const view = await viewProfilePackage(this.profile.dir, spec.trim(), {
                        ...this.profile.packageManager ?? { command: this.pnpmCommand },
                        timeoutMs: this.inspectTimeoutMs, ...signal === undefined ? {} : { signal },
                    });
                    const log = `${view.stderr}${view.cause === undefined ? '' : `${messageOf(view.cause)}\n`}`.trim();
                    if (view.exitCode !== 0 || view.cause !== undefined || view.timedOut) {
                        const kind = classifyInstallFailure({ log, timedOut: view.timedOut, ...view.cause === undefined ? {} : { cause: view.cause } });
                        const reason = log || view.stdout.trim() || `pnpm view exited with ${String(view.exitCode)}`;
                        if (kind === 'not-found' || kind === 'no-matching-version')
                            return refused('not-found', reason);
                        if (kind === 'network')
                            return refused('network', reason);
                        return refused('unknown', view.timedOut ? `pnpm view timed out after ${String(this.inspectTimeoutMs)}ms` : reason);
                    }
                    let answer;
                    try {
                        answer = JSON.parse(view.stdout.replace(ANSI_SEQUENCE, '').trim() || 'null');
                    }
                    catch (error) {
                        return refused('unknown', `unreadable pnpm view output: ${messageOf(error)}`);
                    }
                    // A range answers one object per matching version, oldest first.
                    const latest = Array.isArray(answer) ? answer.at(-1) : answer;
                    if (typeof latest !== 'object' || latest === null)
                        return refused('unknown', 'pnpm view answered no package');
                    const inspection = inspectionOf('registry', latest);
                    const named = inspection.name === undefined ? { ...inspection, name: parsed.name } : inspection;
                    if (!named.bundle)
                        return refused('not-a-bundle', `${named.name} declares no dsh.bundle`);
                    return named;
                }
            }
        }
        /** Persist a plugin entry's desired enablement and apply it on live profiles.
         * @param id Loader entry identity returned by listPlugins.
         * @param enabled Whether the plugin should run.
         * @returns Saved and runtime outcomes, including higher-priority overrides.
         */
        setPluginEnabled(id, enabled) {
            return this.change(result => this.configure(async () => {
                const row = (await this.listPlugins()).find(item => item.entryId === id);
                if (row === undefined)
                    throw new ManagementFailure('unknown-plugin');
                if (row.readOnlyReason !== undefined)
                    throw new ManagementFailure(row.readOnlyReason);
                await writePluginEnabled(this.profile.patchPath, row.patchId, row.moduleName, enabled);
                result.warnings = await this.reload(enabled ? [row.patchId] : []);
                const current = (await this.listPlugins()).find(item => item.entryId === id);
                return current?.enabled !== enabled && this.ownerContext.get('hmr') !== undefined ? 'overridden' : undefined;
            }), { stage: 'enable', target: id, enabled }, 'plugin');
        }
        /** Select or remove a bundle layer while retaining installed dependencies.
         * @param name Bundle package name.
         * @param enabled Whether the bundle contributes its patch layer.
         * @returns Persisted and runtime outcomes.
         */
        setBundleEnabled(name, enabled) {
            return this.change(result => this.configure(async () => {
                await this.selectBundle(name, enabled);
                result.warnings = await this.reload(enabled ? this.bundleRows(name).map(row => row.id) : []);
            }), { stage: 'enable', target: name, enabled }, 'bundle');
        }
        /**
         * Install a package using the same pnpm implementation as dsh plugin. A run
         * that fails, is cancelled, or adds a package without a bundle patch restores
         * `package.json` and `pnpm-lock.yaml` as they were; downloaded files can stay.
         * @param spec One package spec, including local paths relative to the invocation directory.
         * @param options Whether to activate the installed bundle (defaults to true), the request id a cancellation names, and
         * the pending build scripts to allow for this profile before pnpm runs.
         * @returns Package-manager diagnostics and observed activation outcome.
         */
        installBundle(spec, options) {
            const requestId = options?.requestId;
            const control = { abort: new AbortController(), phase: 'installing', settled: Promise.resolve() };
            const stopped = () => control.abort.signal.aborted;
            if (requestId !== undefined)
                this.installs.set(requestId, control);
            const announce = (phase) => {
                if (requestId !== undefined)
                    this.ownerContext.emit('plugin-manager/install-state', { requestId, phase });
            };
            const result = this.change(async (result) => {
                if (spec.trim() === '' || spec.startsWith('-'))
                    throw new ManagementFailure('invalid-spec');
                if (stopped())
                    throw new InstallCancelledError();
                if (options?.approvedBuilds !== undefined) {
                    await approveBuilds(this.profile.dir, options.approvedBuilds);
                    result.approvedBuilds = options.approvedBuilds;
                }
                const files = await this.readRestoredFiles();
                const before = readProfileManifest('dsh', this.profile.dir).dependencies ?? {};
                announce('installing');
                let name;
                try {
                    result.packageResult = await this.runPnpm(['add', spec], control.abort.signal, requestId);
                    if (stopped())
                        throw new InstallCancelledError();
                    if (result.packageResult.exitCode !== 0) {
                        // pnpm-workspace.yaml is not restored, so the names pnpm left undecided there can be offered for approval.
                        try {
                            result.pendingBuilds = await readPendingBuilds(this.profile.dir);
                        }
                        catch (error) {
                            this.ownerContext.logger.warn('Could not read pending build approvals after pnpm failed', error);
                        }
                        throw new Error(result.packageResult.output);
                    }
                    const after = readProfileManifest('dsh', this.profile.dir).dependencies ?? {};
                    const installed = Object.keys(after).filter(name => before[name] !== after[name]);
                    // Registry retries can retain the saved range after a partial installation.
                    if (installed.length === 0)
                        installed.push(...Object.keys(after).filter(name => spec === name || spec.startsWith(`${name}@`)));
                    const target = installed[0];
                    if (installed.length !== 1 || target === undefined)
                        throw new ManagementFailure('ambiguous-install');
                    name = target;
                    const dir = resolveBundleDir('dsh', name, this.profile.installAnchor, this.profile.dir);
                    const manifest = bundleManifest(name, this.profile.dir, this.profile.installAnchor);
                    if (manifest?.dsh?.bundle?.patch === undefined)
                        throw new ManagementFailure('not-bundle');
                    loadOverlayPatches('dsh', join(dir, manifest.dsh.bundle.patch));
                }
                catch (error) {
                    // pnpm has exited by now, so the files it rewrote go back as they were.
                    await this.restoreFiles(files);
                    throw error;
                }
                control.phase = 'applying';
                announce('applying');
                result.bundle = name;
                result.target = name;
                result.stage = 'enable';
                return this.configure(async () => {
                    if (options?.enabled !== false)
                        await this.selectBundle(name, true);
                    if (Object.hasOwn(before, name))
                        return 'restart-required';
                    if (options?.enabled !== false)
                        result.warnings = await this.reload();
                });
            }, { stage: 'install', target: spec, enabled: options?.enabled !== false }, 'install');
            /* v8 ignore next -- change() folds every failure into its result; only a lock or disposal error rejects */
            control.settled = result.then(() => undefined, () => undefined);
            return result.finally(() => { if (requestId !== undefined)
                this.installs.delete(requestId); });
        }
        /** Stop an installation this manager owns and wait until its files are back.
         * @param requestId The id the installation was started with.
         * @returns `cancelled` once pnpm exited and the files are restored, `too-late` once the bundle is being
         * applied, `not-running` for any other id.
         */
        async cancelInstall(requestId) {
            const control = this.installs.get(requestId);
            if (control === undefined)
                return { status: 'not-running' };
            if (control.phase === 'applying')
                return { status: 'too-late' };
            this.ownerContext.emit('plugin-manager/install-state', { requestId, phase: 'cancelling' });
            control.abort.abort();
            await control.settled;
            return { status: 'cancelled' };
        }
        /** Unload and remove a profile-owned bundle dependency through dsh plugin's pnpm path.
         * @param name Installed dependency name.
         * @returns Removal diagnostics and the remaining profile state.
         */
        removeBundle(name) {
            return this.change(async (result) => {
                await this.configure(async () => {
                    const bundle = (await this.listBundles()).find(item => item.name === name);
                    if (bundle === undefined || !bundle.removable)
                        throw new ManagementFailure('not-removable');
                    if (this.ownerContext.get('hmr') === undefined && (this.profile.startedBundles.includes(name)
                        || this.bundleRows(name).some(row => [...this.ctx.loader.entries()]
                            .some(entry => entry.options.id === row.id && entry.fiber !== undefined)))) {
                        throw new ManagementFailure('stop-profile');
                    }
                    const contributions = bundle.error === undefined ? this.bundleRows(name) : [];
                    if (bundle.enabled) {
                        await this.selectBundle(name, false);
                        result.warnings = await this.reload();
                    }
                    if ([...this.ctx.loader.entries()].some(entry => entry.fiber?.uid != null
                        && contributions.some(row => row.id === entry.options.id && row.name === entry.options.name))) {
                        throw new ManagementFailure('bundle-in-use');
                    }
                });
                result.packageResult = await this.runPnpm(['remove', name]);
                if (result.packageResult.exitCode !== 0)
                    throw new Error(result.packageResult.output);
            }, { stage: 'remove', target: name }, 'remove');
        }
        /** The rows a bundle's patch inserts and the existing rows it changes; an unreadable patch throws. */
        declaredRows(name, info) {
            const patch = info.dsh?.bundle?.patch;
            /* v8 ignore next -- bundleManifest answers only manifests that declare a patch */
            if (patch === undefined)
                return { rows: [], overrides: [] };
            const dir = resolveBundleDir('dsh', name, this.profile.installAnchor, this.profile.dir);
            const patches = loadOverlayPatches('dsh', join(dir, patch));
            // One entry per row id: the Loader keeps a single entry for an id, whichever layer declared it last.
            const live = new Map();
            for (const entry of this.ctx.loader.entries()) {
                /* v8 ignore next -- the Loader gives every entry an id before it is listed */
                if (typeof entry.options.id === 'string')
                    live.set(entry.options.id, pluginEntryId(entry.id));
            }
            const rows = [];
            for (const row of flatten(composeEntries([patches.filter(item => item.insert !== undefined)]))) {
                if (typeof row.id !== 'string' || typeof row.name !== 'string')
                    continue;
                const entryId = live.get(row.id);
                rows.push({ rowId: row.id, moduleName: row.name, ...entryId === undefined ? {} : { entryId } });
            }
            const declared = new Set(rows.map(row => row.rowId));
            const overrides = [...new Set(patches.flatMap(item => item.insert === undefined && typeof item.id === 'string' && !declared.has(item.id) ? [item.id] : []))];
            return { rows, overrides };
        }
        /** Run one pnpm command in the profile, streaming its output as install-log chunks. */
        async runPnpm(args, signal, requestId) {
            const jobId = randomUUID();
            const argv = ['pnpm', ...args];
            const cwd = this.profile.dir;
            const identity = requestId === undefined ? {} : { requestId };
            const task = runProfilePnpm({ ...this.profile, profile: this.profile.name }, args, {
                execution: 'service', ...this.profile.packageManager ?? { command: this.pnpmCommand },
                signal: signal === undefined ? this.abort.signal : AbortSignal.any([this.abort.signal, signal]),
                outputBytes: this.outputBytes, activateNewBundles: false,
                onOutput: (text, stream) => {
                    this.ownerContext.emit('plugin-manager/install-log', { ...identity, jobId, argv, cwd, stream, text });
                },
            });
            this.packageOperations.add(task);
            try {
                const result = await task;
                this.ownerContext.emit('plugin-manager/install-log', {
                    ...identity, jobId, argv, cwd, stream: 'stdout', text: '', exitCode: signal?.aborted === true ? null : result.exitCode,
                });
                return result.exitCode === 0 ? result : { ...result, kind: classifyInstallFailure({ log: result.output }) };
            }
            catch (error) {
                this.ownerContext.emit('plugin-manager/install-log', { ...identity, jobId, argv, cwd, stream: 'stderr', text: messageOf(error), exitCode: null });
                throw error;
            }
            finally {
                this.packageOperations.delete(task);
            }
        }
        /** The profile files an installation may rewrite, as they are now; absent files read as undefined. */
        async readRestoredFiles() {
            const files = new Map();
            for (const name of RESTORED_FILES) {
                const path = join(this.profile.dir, name);
                files.set(path, existsSync(path) ? await readFile(path, 'utf8') : undefined);
            }
            return files;
        }
        /** Put the profile files back; pnpm has exited by the time this runs. */
        async restoreFiles(files) {
            for (const [path, content] of files) {
                if (content === undefined)
                    await rm(path, { force: true });
                else
                    await writeFileAtomic(path, content, { mode: 0o600 });
            }
        }
        async selectBundle(name, enabled) {
            const manifest = readProfileManifest('dsh', this.profile.dir);
            const previous = manifest.dsh?.profile?.bundles ?? [];
            if ((enabled || !previous.includes(name)) && bundleManifest(name, this.profile.dir, this.profile.installAnchor) === undefined) {
                throw new ManagementFailure('not-bundle');
            }
            if (!enabled && previous.includes(name)) {
                if (this.protectsManager(name))
                    throw new ManagementFailure('management-required');
            }
            const bundles = enabled ? [...previous, ...previous.includes(name) ? [] : [name]] : previous.filter(item => item !== name);
            if (JSON.stringify(previous) === JSON.stringify(bundles))
                return;
            manifest.dsh = { ...manifest.dsh, profile: { ...manifest.dsh?.profile, bundles } };
            await saveManifest(this.profile.dir, manifest);
        }
        bundleRows(name) {
            const info = bundleManifest(name, this.profile.dir, this.profile.installAnchor);
            if (info?.dsh?.bundle === undefined)
                return [];
            const dir = resolveBundleDir('dsh', name, this.profile.installAnchor, this.profile.dir);
            return flatten(composeEntries([loadOverlayPatches('dsh', join(dir, info.dsh.bundle.patch))]));
        }
        protectsManager(name) {
            return this.bundleRows(name).some(row => protectedModules.has(row.name) || `include:${row.id}` === this.ownerEntryId);
        }
        configure(operation) {
            const hmr = this.ownerContext.get('hmr');
            const apply = () => { this.abort.signal.throwIfAborted(); return operation(); };
            return hmr === undefined ? apply() : hmr.runExclusive(apply);
        }
        async reload(requiredIds = []) {
            if (this.ownerContext.get('hmr') === undefined)
                return [];
            return reconcileProfilePatches(this.ownerContext.root, readProfilePatches('dsh', this.profile), 'dsh', requiredIds);
        }
        async change(operation, request, reason) {
            return withFileLock(join(this.profile.dir, 'package.json'), async () => {
                this.abort.signal.throwIfAborted();
                const before = this.diskState();
                const result = { ...request, changed: false,
                    application: this.ownerContext.get('hmr') !== undefined ? 'applied' : 'restart-required' };
                try {
                    result.application = await operation(result) ?? result.application;
                }
                catch (error) {
                    if (error instanceof InstallCancelledError) {
                        result.application = 'cancelled';
                    }
                    else {
                        result.application = 'failed';
                        result.error = managementError(error);
                    }
                }
                result.changed = before !== this.diskState();
                this.ownerContext.emit('plugin-manager/changed', { reason });
                return result;
            }, { waitMs: this.lockWaitMs });
        }
        diskState() {
            return ['package.json', 'cordis.patch.yml', 'pnpm-workspace.yaml'].map((file) => {
                try {
                    return readFileSync(join(this.profile.dir, file), 'utf8');
                }
                catch (error) {
                    if (error.code === 'ENOENT')
                        return '';
                    throw error;
                }
            }).join('\0');
        }
    };
})();
export { PluginManager };
export default PluginManager;
//# sourceMappingURL=index.js.map