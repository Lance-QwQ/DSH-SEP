import { createRequire } from "node:module";
import { Context, Inject, Service, composeError, resolveConfig } from "@deepseek-ai/cordis";
import { deepEqual, defineProperty, isNonNullable, isNullable, updateVolatile, valueMap, volatileEntries } from "@deepseek-ai/cosmokit";
//#region lib/types/internal.js
/** Helpers for locating the current Node internal module loader. */
var ModuleLoader;
(function(ModuleLoader) {
	let _cachedLoader;
	function requireInternal(id) {
		const require = createRequire(import.meta.url);
		if (process.execArgv.includes("--expose-internals")) try {
			return require(id);
		} catch {}
		try {
			return require("node-addon-require-builtin").requireBuiltin(id);
		} catch {}
	}
	/**
	* Locate and classify the running Node internal module loader.
	*
	* The shape is decided by which module-job API the loader owns, never by the
	* Node version: v2 landed in 24.12.0, so a major-version test mistags every
	* 24.0–24.11.1 loader as v2 and makes consumers call `resolveSync` with
	* reversed parameters. Arity is not usable either — `resolveSync` reports 2
	* under both shapes. A loader owning neither API is left unclassified rather
	* than guessed, so consumers take their documented no-internals path.
	* @returns the classified loader, or `undefined` when none is reachable or its shape is unknown.
	*/
	function fromInternal() {
		if (_cachedLoader) return _cachedLoader;
		const [major] = process.versions.node.split(".").map(Number);
		if (major < 22) return;
		const raw = requireInternal("internal/modules/esm/loader")?.getOrInitializeCascadedLoader();
		if (!raw) return;
		const version = typeof raw.getOrCreateModuleJob === "function" ? "v2" : typeof raw.getModuleJobForImport === "function" ? "v1" : void 0;
		if (!version) return;
		return _cachedLoader = Object.assign(raw, { version });
	}
	ModuleLoader.fromInternal = fromInternal;
})(ModuleLoader || (ModuleLoader = {}));
//#endregion
//#region lib/types/config/group.js
/** Runtime owner for a list of child loader entries. */
var EntryGroup = class {
	ctx;
	tree;
	static key = Symbol.for("cordis.group");
	data = [];
	constructor(ctx, tree) {
		this.ctx = ctx;
		this.tree = tree;
		const entry = ctx.fiber.entry;
		if (entry) entry.subgroup = this;
	}
	get context() {
		return this.ctx;
	}
	async create(options) {
		const id = this.tree.ensureId(options);
		const entry = this.tree.store[id] ??= new Entry(this.ctx.loader);
		entry.parent = this;
		await entry.update(options, true, true);
		return entry.id;
	}
	unlink(options) {
		const config = this.data;
		const index = config.indexOf(options);
		if (index >= 0) config.splice(index, 1);
	}
	remove(id, isDispose = false) {
		const entry = this.tree.store[id];
		if (!entry) return;
		entry.fiber?.dispose();
		if (!isDispose) this.unlink(entry.options);
		delete this.tree.store[id];
		this.context.emit("loader/partial-dispose", entry, entry.options, false);
	}
	async update(config) {
		const oldConfig = this.data;
		this.data = config;
		const oldMap = Object.fromEntries(oldConfig.map((options) => [options.id, options]));
		const newMap = Object.fromEntries(config.map((options) => [options.id ?? Symbol("anonymous"), options]));
		const ids = Reflect.ownKeys({
			...oldMap,
			...newMap
		});
		await Promise.all(ids.map(async (id) => {
			if (newMap[id]) await this.create(newMap[id]).catch((error) => {
				this.ctx.logger.error(error);
			});
			else this.remove(id);
		}));
	}
	stop() {
		for (const options of this.data) this.remove(options.id, true);
	}
};
/** Plugin that mounts a nested loader entry group. */
var Group = class extends EntryGroup {
	ctx;
	config;
	static initial = [];
	static [EntryGroup.key] = true;
	constructor(ctx, config) {
		super(ctx, ctx.fiber.entry.parent.tree);
		this.ctx = ctx;
		this.config = config;
		ctx.on("internal/update", (config) => {
			this.update(config);
		});
	}
	async *[Service.init]() {
		yield () => this.stop();
		await this.update(this.config);
	}
};
//#endregion
//#region lib/types/config/tree.js
var __rewriteRelativeImportExtension = function(path, preserveJsx) {
	if (typeof path === "string" && /^\.\.?\//.test(path)) return path.replace(/\.(tsx)$|((?:\.d)?)((?:\.[^./]+?)?)\.([cm]?)ts$/i, function(m, tsx, d, ext, cm) {
		return tsx ? preserveJsx ? ".jsx" : ".js" : d && (!ext || !cm) ? m : d + ext + "." + cm.toLowerCase() + "js";
	});
	return path;
};
/** Mutable tree of loader entries. Persistence is supplied by subclasses. */
var EntryTree = class EntryTree {
	static sep = ":";
	ctx;
	enableLogs;
	root;
	store = Object.create(null);
	constructor(ctx) {
		this.ctx = ctx.extend({ baseUrl: ctx.baseUrl });
		this.root = new EntryGroup(this.ctx, this);
		const entry = this.ctx.fiber.entry;
		if (entry) entry.subtree = this;
	}
	get context() {
		return this.ctx;
	}
	/** Iterate entries in this tree and any nested subtrees. */
	*entries() {
		for (const entry of Object.values(this.store)) {
			yield entry;
			if (!entry.subtree) continue;
			yield* entry.subtree.entries();
		}
	}
	/** Return pending import and lifecycle tasks owned by this tree. */
	getTasks() {
		return [...this.entries()].map((entry) => entry._initTask || entry.fiber?.inertia).filter(isNonNullable);
	}
	/** Wait until this tree has no pending import or lifecycle tasks. */
	async await() {
		while (true) {
			const tasks = this.getTasks();
			if (!tasks.length) return;
			await Promise.allSettled(tasks);
		}
	}
	ensureId(options) {
		if (!options.id) do
			options.id = Math.random().toString(16).slice(2, 10);
		while (this.store[options.id]);
		return options.id;
	}
	/** Resolve an entry by id, including nested ids separated by `EntryTree.sep`. */
	resolve(id) {
		const parts = id.split(EntryTree.sep);
		let tree = this;
		const final = parts.pop();
		for (const part of parts) {
			tree = tree.store[part]?.subtree;
			if (!tree) throw new Error(`cannot resolve entry ${id}`);
		}
		const entry = tree.store[final];
		if (!entry) throw new Error(`cannot resolve entry ${id}`);
		return entry;
	}
	resolveGroup(id) {
		if (!id) return this.root;
		const entry = this.resolve(id);
		if (!entry.subgroup) throw new Error(`entry ${id} is not a group`);
		return entry.subgroup;
	}
	/** Create an entry in the root group or a nested group. */
	async create(options, parent = null, position = Infinity) {
		const group = this.resolveGroup(parent);
		group.data.splice(position, 0, options);
		group.tree.write();
		return group.create(options);
	}
	/** Stop and remove an entry from its parent group. */
	remove(id) {
		const entry = this.resolve(id);
		entry.parent.remove(id);
		entry.parent.tree.write();
	}
	/** Update an entry and optionally move it to another group. */
	async update(id, options, parent, position) {
		const entry = this.resolve(id);
		const source = entry.parent;
		if (parent !== void 0) {
			const target = this.resolveGroup(parent);
			source.unlink(entry.options);
			target.data.splice(position ?? Infinity, 0, entry.options);
			target.tree.write();
			entry.parent = target;
		}
		source.tree.write();
		return entry.update(options, false, true);
	}
	/** Import a plugin module from a specifier or `cordis:` builtin. */
	import(name, getOuterStack) {
		if (name.startsWith("cordis:")) return this.ctx.loader.builtins[name.slice(7)];
		return composeError(async (info) => {
			info.offset += 3;
			if (this.ctx.loader.internal) return await this.ctx.loader.internal.import(name, this.ctx.baseUrl, {});
			else if (name.startsWith(".")) return await import(__rewriteRelativeImportExtension(
				/* @vite-ignore */
				new URL(name, this.ctx.baseUrl).href
			));
			else return await import(__rewriteRelativeImportExtension(
				/* @vite-ignore */
				name
			));
		}, getOuterStack);
	}
};
//#endregion
//#region lib/types/config/utils.js
/** Evaluate a JavaScript expression against a loader context scope. */
const evaluate = new Function("ctx", "expr", `
  with (ctx) {
    return eval(expr)
  }
`);
/** Recursively replace YAML `!!js` expression nodes with evaluated values. */
function interpolate(ctx, value) {
	if (isJsExpr(value)) return evaluate(ctx, value.__jsExpr);
	else if (!value || typeof value !== "object") return value;
	else if (Array.isArray(value)) return value.map((item) => interpolate(ctx, item));
	else return valueMap(value, (item) => interpolate(ctx, item));
}
/** Return true when a value is a serialized loader JavaScript expression. */
function isJsExpr(value) {
	return value instanceof Object && "__jsExpr" in value;
}
//#endregion
//#region lib/types/config/diff.js
function isSchemastery(schema) {
	return schema?.["~standard"].vendor === "schemastery";
}
function isRecord(value) {
	if (!value || typeof value !== "object" || isJsExpr(value)) return false;
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}
function equal(a, b, schema, ancestors) {
	if (schema?.meta?.volatile) return true;
	if (schema?.type !== "object" || !schema.dict || ancestors.has(schema)) return deepEqual(a, b, true);
	const left = a ?? schema.meta?.default;
	const right = b ?? schema.meta?.default;
	if (!isRecord(left) || !isRecord(right)) return deepEqual(left, right, true);
	const { dict } = schema;
	ancestors.add(schema);
	try {
		return Object.keys({
			...left,
			...right
		}).every((key) => equal(left[key], right[key], Object.hasOwn(dict, key) ? dict[key] : void 0, ancestors));
	} finally {
		ancestors.delete(schema);
	}
}
/**
* Compare two raw configs, treating schema-declared volatile fields at fixed object paths as equal and absent objects as their schema default.
* Schema backedges, expressions, unknown fields and opaque values keep strict raw equality; an absent or non-Schemastery schema compares everything raw.
* @param previous - previous raw config.
* @param next - next raw config.
* @param schema - the plugin's config schema.
* @returns Whether the configs differ at most in volatile fields, without evaluating expressions, validating config or modifying inputs.
* @internal
*/
function equalExceptVolatile(previous, next, schema) {
	return isSchemastery(schema) ? equal(previous, next, schema, /* @__PURE__ */ new Set()) : deepEqual(previous, next, true);
}
//#endregion
//#region lib/types/config/entry.js
function takeEntries(object, keys) {
	const result = [];
	for (const key of keys) {
		if (!(key in object)) continue;
		result.push([key, object[key]]);
		delete object[key];
	}
	return result;
}
function sortKeys(object, prepend = ["id", "name"], append = ["config"]) {
	const part1 = takeEntries(object, prepend);
	const part2 = takeEntries(object, append);
	const rest = takeEntries(object, Object.keys(object)).sort(([a], [b]) => a.localeCompare(b));
	return Object.assign(object, Object.fromEntries([
		...part1,
		...rest,
		...part2
	]));
}
/** One configured plugin node inside an `EntryTree`. */
var Entry = class Entry {
	loader;
	static key = Symbol.for("cordis.entry");
	ctx;
	fiber;
	parent;
	options = {};
	subgroup;
	subtree;
	_initTask;
	constructor(loader) {
		this.loader = loader;
		this.ctx = loader.ctx.extend({ [Entry.key]: this });
		this.context.emit("loader/entry-init", this);
	}
	get context() {
		return this.ctx;
	}
	get id() {
		let id = this.options.id;
		if (this.parent.tree.ctx.fiber.entry) id = this.parent.tree.ctx.fiber.entry.id + EntryTree.sep + id;
		return id;
	}
	/** True when this entry or any owning parent entry is disabled. */
	get disabled() {
		if (this.options.group) return false;
		let entry = this;
		do {
			if (this.disabledOf(entry.options)) return true;
			entry = entry.parent.ctx.fiber.entry;
		} while (entry);
		return false;
	}
	/**
	* Effective disabled state: a `!!js` expression evaluates against the loader
	* context. The raw node stays in the options, so write-back keeps the form.
	*/
	disabledOf(options) {
		return isJsExpr(options.disabled) ? Boolean(this.evaluate(options.disabled.__jsExpr)) : Boolean(options.disabled);
	}
	evaluate(expr) {
		return evaluate(this.ctx, expr);
	}
	_patchContext(diff) {
		this.context.waterfall("loader/patch-context", this, () => {
			Object.setPrototypeOf(this.ctx, this.parent.ctx);
			if (this.fiber?.uid && (diff.includes("config") || this.options.group)) this.fiber.update(this.options.config, true);
		});
	}
	async refresh() {
		if (this.fiber) return;
		if (this.disabled) return;
		await this.init();
	}
	/** Merge new options, restart as needed, and persist through the parent tree. */
	async update(options, create = false, force = false) {
		const legacy = { ...this.options };
		if (create) this.options = options;
		else for (const [key, value] of Object.entries(options)) if (isNullable(value)) delete this.options[key];
		else this.options[key] = value;
		sortKeys(this.options);
		if (this.disabled) {
			this.fiber?.dispose();
			return;
		}
		if (this.fiber?.uid) {
			const changes = Object.keys({
				...this.options,
				...legacy
			}).filter((key) => !deepEqual(this.options[key], legacy[key], key === "config"));
			const volatileOnly = changes.length === 1 && changes[0] === "config" && this.fiber.state === 2 && Object.getPrototypeOf(this.ctx) === this.parent.ctx && equalExceptVolatile(legacy.config, this.options.config, this.fiber.runtime?.Config);
			if (volatileOnly) this.fiber._config = this.options.config;
			const pending = volatileOnly && this._commitVolatile() ? [] : changes;
			if (!pending.length && !force) return;
			this.context.emit("loader/partial-dispose", this, legacy, true);
			this._patchContext(pending);
		} else await this.init();
	}
	/**
	* Parse a volatile-only raw config change and commit its values into the running fiber's references.
	* An invalid candidate is logged and leaves the running references unchanged; the raw config stays retained for the next activation.
	* @returns `false` when an ordinary effective value changed, so the caller applies the ordinary update lifecycle.
	*/
	_commitVolatile() {
		const fiber = this.fiber;
		const refs = volatileEntries(fiber.config);
		if (!refs.length) return true;
		const raw = this.options.config;
		let candidate;
		try {
			candidate = resolveConfig(fiber.runtime, fiber.ctx.waterfall(fiber, "internal/config", raw, () => raw));
		} catch (error) {
			this.ctx.logger.warn("volatile config update failed for %C", this.options.id);
			this.ctx.logger.warn(error);
			return true;
		}
		if (!deepEqual(fiber.config, candidate, true)) {
			this.ctx.logger.debug("ordinary config values of %C changed with its volatile values; applying the ordinary update", this.options.id);
			return false;
		}
		const paths = refs.flatMap(({ path, ref }) => {
			const source = path.reduce((value, key) => Reflect.get(value, key), candidate);
			if (deepEqual(ref.get(), source.get(), true)) return [];
			updateVolatile(ref, source);
			return [path];
		});
		if (!paths.length) return true;
		const self = Object.create(fiber.ctx);
		self[Context.filter] = (owner) => owner.fiber === fiber;
		try {
			fiber.ctx.emit(self, "loader/volatile-update", paths);
		} catch (error) {
			this.ctx.logger.warn(error);
		}
		return true;
	}
	getOuterStack = () => {
		let entry = this;
		const result = [];
		do {
			result.push(`    at ${entry.parent.tree.ctx.baseUrl}#${entry.options.id}`);
			entry = entry.parent.ctx.fiber.entry;
		} while (entry);
		return result;
	};
	/** Import and start the configured plugin if it is not already running. */
	async init() {
		try {
			await (this._initTask ??= this._init());
		} finally {
			this._initTask = void 0;
		}
		const notify = () => {
			if (this.loader.getTasks().length) return;
			this.ctx.reflect.notify(["loader"]);
		};
		this.fiber?.await().then(notify, notify);
	}
	async _init() {
		let exports;
		try {
			exports = await this.parent.tree.import(this.options.name, this.getOuterStack);
		} catch (error) {
			this.ctx.logger.error(error);
			return;
		} finally {
			this._initTask = void 0;
		}
		const plugin = this.loader.unwrapExports(exports);
		this._patchContext([]);
		this.loader.showLog(this, "apply");
		this.fiber = this.ctx.registry.plugin(plugin, this.options.config, this.getOuterStack).ctx.fiber;
	}
};
//#endregion
//#region lib/types/config/isolate.js
function swap(target, source) {
	for (const key of Reflect.ownKeys(target)) Reflect.deleteProperty(target, key);
	for (const key of Reflect.ownKeys(source || {})) Reflect.defineProperty(target, key, Reflect.getOwnPropertyDescriptor(source, key));
}
/** Symbol realm used to isolate service implementations by entry or label. */
var Realm = class {
	store = Object.create(null);
	access(key, create = false) {
		if (create) return this.store[key] ??= Symbol(`${key}${this.suffix}`);
		else return this.store[key] ?? Symbol(`${key}${this.suffix}`);
	}
	delete(key) {
		delete this.store[key];
	}
	get size() {
		return Object.keys(this.store).length;
	}
};
/** Entry-local isolation realm. */
var LocalRealm = class extends Realm {
	entry;
	constructor(entry) {
		super();
		this.entry = entry;
	}
	get suffix() {
		return "#" + this.entry.options.id;
	}
};
/** Named isolation realm shared by entries that use the same label. */
var GlobalRealm = class extends Realm {
	label;
	constructor(label) {
		super();
		this.label = label;
	}
	get suffix() {
		return "@" + this.label;
	}
};
/** Install loader hooks that apply `intercept` and `isolate` entry options. */
function isolate(ctx) {
	const realms = Object.create(null);
	const delims = Object.create(null);
	function access(entry, name, create = false) {
		let realm;
		const label = entry.options.isolate?.[name];
		if (!label) return;
		if (label === true) realm = entry.realm ??= new LocalRealm(entry);
		else if (create) realm = realms[label] ??= new GlobalRealm(label);
		else realm = realms[label];
		return realm?.access(name, create);
	}
	ctx.on("loader/entry-init", (entry) => {
		entry.ctx[Context.intercept] = Object.create(entry.ctx[Context.intercept]);
		entry.ctx[Context.isolate] = Object.create(entry.ctx[Context.isolate]);
	});
	ctx.on("loader/patch-context", (entry, next) => {
		const newMap = Object.create(entry.parent.ctx[Context.isolate]);
		for (const name of Object.keys(entry.options.isolate ?? {})) newMap[name] = access(entry, name, true);
		const diff = Object.create(null);
		const oldMap = entry.ctx[Context.isolate];
		for (const name in {
			...newMap,
			...delims
		}) {
			if (newMap[name] === oldMap[name]) continue;
			const delim = delims[name] ??= Symbol(`delim:${name}`);
			entry.ctx[delim] = Symbol(`${name}#${entry.id}`);
			for (const symbol of [oldMap[name], newMap[name]]) {
				const impl = symbol && entry.ctx.reflect.store[symbol];
				if (!impl) continue;
				if (!impl.fiber) {
					entry.ctx.logger.warn(/* @__PURE__ */ new Error(`expected service ${name} to be implemented`));
					continue;
				}
				diff[name] = [
					oldMap[name],
					newMap[name],
					entry.ctx[delim],
					impl.fiber.ctx[delim]
				];
				if (entry.ctx[delim] !== impl.fiber.ctx[delim]) break;
			}
		}
		Object.setPrototypeOf(entry.ctx[Context.isolate], entry.parent.ctx[Context.isolate]);
		Object.setPrototypeOf(entry.ctx[Context.intercept], entry.parent.ctx[Context.intercept]);
		swap(entry.ctx[Context.isolate], newMap);
		swap(entry.ctx[Context.intercept], entry.options.intercept);
		next();
		for (const [symbol1, symbol2, flag1, flag2] of Object.values(diff)) if (flag1 === flag2 && entry.ctx.reflect.store[symbol1] && !entry.ctx.reflect.store[symbol2]) {
			entry.ctx.reflect.store[symbol2] = entry.ctx.reflect.store[symbol1];
			delete entry.ctx.reflect.store[symbol1];
		}
		ctx.reflect.notify(Object.keys(diff), (ctx, name) => {
			const [symbol1, symbol2, flag1, flag2] = diff[name];
			const symbol3 = ctx[Context.isolate][name];
			const flag3 = ctx[delims[name]];
			return (symbol1 === symbol3 || symbol2 === symbol3) && flag1 === flag3 !== (flag1 === flag2);
		});
		for (const name in delims) if (!Reflect.ownKeys(newMap).includes(name)) delete entry.ctx[delims[name]];
	});
	ctx.on("loader/partial-dispose", (entry, legacy, active) => {
		for (const [name, label] of Object.entries(legacy.isolate ?? {})) {
			if (label === true) continue;
			if (active && entry.options.isolate?.[name] === label) continue;
			const realm = realms[label];
			if (!realm) continue;
			for (const entry of ctx.loader.entries()) if (entry.options.isolate?.[name] === realm.label) return;
			realm.delete(name);
			if (!realm.size) delete realms[realm.label];
		}
	});
}
//#endregion
//#region lib/types/index.js
/**
* Service that owns a loader entry tree and imports configured plugins.
*
* Subclasses provide persistence by implementing `write()` on `EntryTree`.
*/
var Loader = class extends EntryTree {
	config;
	envData = process.env.CORDIS_SHARED ? JSON.parse(process.env.CORDIS_SHARED) : { startTime: Date.now() };
	name = "loader";
	internal = ModuleLoader.fromInternal();
	builtins = Object.create(null);
	constructor(ctx, config = {}) {
		super(ctx);
		this.config = config;
		if (config.baseUrl) this.ctx.baseUrl = config.baseUrl;
		const self = this;
		defineProperty(this, Service.tracker, {
			associate: "loader",
			property: "ctx",
			noShadow: true
		});
		ctx.reflect.provide("loader", this, this[Service.check]);
		ctx.on("internal/config", function(_config, next) {
			const config = next();
			if (!this.entry || this.parent.fiber?.entry === this.entry) return config;
			if ((this.runtime?.callback)?.[EntryGroup.key]) return config;
			return interpolate(this.ctx, config);
		}, { global: true });
		ctx.on("internal/update", function(config, noSave, next) {
			if (!this.entry || noSave || this.parent.fiber?.entry === this.entry) return next();
			const unparse = this.runtime?.Config?.["simplify"];
			this.entry.options.config = unparse ? unparse.call(this.runtime.Config, config) : config;
			this.entry.parent.tree.write();
			return next();
		}, {
			global: true,
			prepend: true
		});
		ctx.on("internal/update", function(config, _, next) {
			if (!this.entry || this.parent.fiber?.entry === this.entry) return next();
			self.showLog(this.entry, "reload");
			return next();
		}, { global: true });
		ctx.on("internal/plugin", (fiber) => {
			if (fiber.parent[Entry.key] && !fiber.entry) {
				fiber.entry = fiber.parent[Entry.key];
				Inject.resolve(fiber.entry.options.inject, fiber.inject);
			}
			if (fiber.uid) return;
			if (!fiber.entry) return;
			if (fiber.parent.fiber?.entry === fiber.entry) return;
			if (!ctx.registry.has(fiber.runtime.callback)) return;
			const treeOwner = fiber.entry.parent.tree.ctx.fiber;
			if (!treeOwner.uid || treeOwner.state === 5) return;
			this.showLog(fiber.entry, "unload");
			if (fiber.entry.disabled) return;
			fiber.entry.options.disabled = true;
			fiber.entry.parent.tree.write();
		});
		ctx.plugin(isolate);
	}
	write() {}
	[Service.check]() {
		if (Service.prototype[Service.resolveConfig].call(this).await && this.getTasks().length) return false;
		return true;
	}
	showLog(entry, type) {
		if (entry.options.group || !entry.parent.tree.enableLogs) return;
		this.ctx.root.logger?.("loader").info("%s plugin %C", type, entry.options.name);
	}
	/** Return the loader entry id that owns `fiber`, if any. */
	locate(fiber = this.ctx.fiber) {
		while (1) {
			if (fiber.entry) return fiber.entry.id;
			const next = fiber.parent.fiber;
			if (fiber === next) return;
			fiber = next;
		}
	}
	/** Hook for hosts that can restart the process on full-reload requests. */
	exit() {}
	/** Normalize ESM/CJS/default export shapes before applying a plugin. */
	unwrapExports(exports) {
		if (isNullable(exports)) return exports;
		exports = exports.default ?? exports;
		if (!exports.__esModule) return exports;
		return exports.default ?? exports;
	}
};
//#endregion
export { Entry, EntryGroup, EntryTree, GlobalRealm, Group, Loader, Loader as default, LocalRealm, ModuleLoader, Realm, evaluate, interpolate, isJsExpr };
