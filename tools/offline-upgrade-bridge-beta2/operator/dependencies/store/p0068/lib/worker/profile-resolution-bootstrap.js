import { createRequire, isBuiltin } from "node:module";
import { getEnvironmentData } from "node:worker_threads";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
//#region ../../../node_modules/.pnpm/resolve.exports@2.0.3/node_modules/resolve.exports/dist/index.mjs
function e(e, n, r) {
	throw new Error(r ? `No known conditions for "${n}" specifier in "${e}" package` : `Missing "${n}" specifier in "${e}" package`);
}
function n(n, i, o, f) {
	let s, u, l = r(n, o), c = function(e) {
		let n = new Set(["default", ...e.conditions || []]);
		return e.unsafe || n.add(e.require ? "require" : "import"), e.unsafe || n.add(e.browser ? "browser" : "node"), n;
	}(f || {}), a = i[l];
	if (void 0 === a) {
		let e, n, r, t;
		for (t in i) n && t.length < n.length || ("/" === t[t.length - 1] && l.startsWith(t) ? (u = l.substring(t.length), n = t) : t.length > 1 && (r = t.indexOf("*", 1), ~r && (e = RegExp("^" + t.substring(0, r) + "(.*)" + t.substring(1 + r) + "$").exec(l), e && e[1] && (u = e[1], n = t))));
		a = i[n];
	}
	return a || e(n, l), s = t(a, c), s || e(n, l, 1), u && function(e, n) {
		let r, t = 0, i = e.length, o = /[*]/g, f = /[/]$/;
		for (; t < i; t++) e[t] = o.test(r = e[t]) ? r.replace(o, n) : f.test(r) ? r + n : r;
	}(s, u), s;
}
function r(e, n, r) {
	if (e === n || "." === n) return ".";
	let t = e + "/", i = t.length, o = n.slice(0, i) === t, f = o ? n.slice(i) : n;
	return "#" === f[0] ? f : o || !r ? "./" === f.slice(0, 2) ? f : "./" + f : f;
}
function t(e, n, r) {
	if (e) {
		if ("string" == typeof e) return r && r.add(e), [e];
		let i, o;
		if (Array.isArray(e)) {
			for (o = r || /* @__PURE__ */ new Set(), i = 0; i < e.length; i++) t(e[i], n, o);
			if (!r && o.size) return [...o];
		} else for (i in e) if (n.has(i)) return t(e[i], n, r);
	}
}
function f(e, r, t) {
	if (e.imports) return n(e.name, e.imports, r, t);
}
//#endregion
//#region lib/types/profile-resolution/resolver.js
/** In-memory profile package routing for Node's default ESM and CommonJS loaders. */
const EMPTY_ATTRIBUTES = Object.freeze({});
/**
* Split a bare request into its package name without allocating path segments.
* @param request - module specifier to classify.
* @returns the bare package name, or undefined for non-package requests.
*/
function barePackageName(request) {
	if (!request || request[0] === "." || request[0] === "/" || request[0] === "\\" || request[0] === "#" || request.includes(":") || isBuiltin(request)) return;
	const first = request.indexOf("/");
	if (request[0] !== "@") return first < 0 ? request : request.slice(0, first);
	if (first < 0) return;
	const second = request.indexOf("/", first + 1);
	return second < 0 ? request : request.slice(0, second);
}
function canonicalPath(path) {
	try {
		return realpathSync(path);
	} catch {
		return resolve(path);
	}
}
function prefixes(path) {
	const configured = resolve(path) + sep;
	const canonical = canonicalPath(path) + sep;
	return canonical === configured ? [configured] : [configured, canonical];
}
function compileResolution(resolution) {
	return {
		entries: new Map(resolution.entries.map((entry) => [entry.name, entry])),
		profilesDir: resolution.profilesDir,
		profileDir: resolution.profileDir,
		profilePaths: prefixes(resolution.profilesDir),
		profile: resolution.profileDir === void 0 ? [] : prefixes(resolution.profileDir),
		installationPaths: [...new Set(resolution.entries.filter((entry) => entry.scope === "installation").flatMap((entry) => prefixes(entry.packageDir)))],
		linkedPaths: resolution.linkedRoots.flatMap((root) => prefixes(root.realPath)),
		localPackageNames: new Set(resolution.localPackageNames),
		esmRoutes: /* @__PURE__ */ new Map(),
		cjsRoutes: /* @__PURE__ */ new Map()
	};
}
/**
* The interception layer of a profile is `<profileParent>/node_modules`: an entry occupies its name there, so its
* subpath misses continue above it, and a name without an entry continues at it.
*/
function computeProfileLayer(dir, active) {
	const profileParent = dirname(dir);
	return {
		kind: "profile",
		active,
		localPrefix: dir + sep,
		nativeAfter: join(profileParent, "package.json"),
		after: join(dirname(profileParent), "package.json")
	};
}
/** The interception layer of a module path: from its profile directory inside a profiles tree, or its linked root. */
function findInterceptionLayer(path, resolution) {
	const treeRoot = resolution.profilePaths.find((prefix) => path.startsWith(prefix));
	const activeProfile = resolution.profile.find((prefix) => path.startsWith(prefix));
	const dir = treeRoot !== void 0 ? profileChild(path, treeRoot) : activeProfile?.slice(0, -1);
	if (dir !== void 0) return computeProfileLayer(dir, activeProfile !== void 0);
	if (!startsWithin(path, resolution.linkedPaths)) return void 0;
	if (startsWithin(path, resolution.installationPaths)) return void 0;
	return { kind: "linked" };
}
/** Package names a directory's current manifest lists as peers; an unreadable manifest lists none. */
function readPeerNames(directory) {
	try {
		const peers = JSON.parse(readFileSync(join(directory, "package.json"), "utf8")).peerDependencies;
		return new Set(peers !== null && typeof peers === "object" ? Object.keys(peers) : []);
	} catch (_error) {
		return /* @__PURE__ */ new Set();
	}
}
function startsWithin(path, roots) {
	for (const root of roots) if (path.startsWith(root)) return true;
	return false;
}
/**
* The profile directory owning a module inside the profiles tree: the first path segment below the tree root.
* @param path - module path below `treePrefix`.
* @param treePrefix - profiles directory with a trailing separator.
* @returns the profile directory without a trailing separator.
*/
function profileChild(path, treePrefix) {
	const rest = path.slice(treePrefix.length);
	const end = rest.indexOf(sep);
	return treePrefix + (end < 0 ? rest : rest.slice(0, end));
}
function nativePackageDir(parent, name) {
	for (const searchPath of createRequire(parent).resolve.paths(name)) {
		const candidate = join(searchPath, name);
		if (existsSync(join(candidate, "package.json"))) return candidate;
	}
}
function localPackageCandidate(searchPath, name, flavor) {
	const candidate = join(searchPath, name);
	const stat = statSync(candidate, { throwIfNoEntry: false });
	return (flavor === "esm" ? stat?.isDirectory() === true : stat !== void 0 || [
		".js",
		".json",
		".node"
	].some((extension) => existsSync(candidate + extension))) ? candidate : void 0;
}
function selfReferenceName(parent) {
	let current = dirname(parent);
	while (true) {
		const manifestPath = join(current, "package.json");
		if (existsSync(manifestPath)) {
			let manifest;
			try {
				manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
			} catch (_error) {
				return null;
			}
			return typeof manifest.name === "string" && manifest.exports != null ? manifest.name : false;
		}
		/* v8 ignore next -- scoped module requests normally find an owning manifest before node_modules. */
		if (basename(current) === "node_modules") return false;
		const next = dirname(current);
		if (next === current) return false;
		current = next;
	}
}
function packageImportsTarget(parent, request, conditions) {
	let current = dirname(parent);
	while (true) {
		const manifestPath = join(current, "package.json");
		if (existsSync(manifestPath)) {
			let manifest;
			try {
				manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
			} catch (_error) {
				/* v8 ignore next -- native resolution cannot report MODULE_NOT_FOUND after an invalid scope manifest */
				return;
			}
			try {
				const target = f(manifest, request, {
					conditions: [...conditions],
					unsafe: true
				})?.[0];
				return target !== void 0 && barePackageName(target) !== void 0 ? {
					specifier: target,
					parentURL: pathToFileURL(manifestPath).href
				} : void 0;
			} catch (_error) {
				/* v8 ignore next -- native resolution cannot report MODULE_NOT_FOUND before selecting a valid mapping */
				return;
			}
		}
		if (basename(current) === "node_modules") return void 0;
		const next = dirname(current);
		/* v8 ignore next -- a MODULE_NOT_FOUND package-import target always has an owning package scope */
		if (next === current) return void 0;
		current = next;
	}
}
function packageSearchPaths(entry, request, cjs) {
	const name = barePackageName(request);
	/* v8 ignore next -- interception routes are created only for bare package requests */
	if (name === void 0) return cjs._nodeModulePaths(dirname(entry.declarer));
	const suffix = sep + name.split("/").join(sep);
	return entry.packageDir.endsWith(suffix) ? [entry.packageDir.slice(0, -suffix.length)] : cjs._nodeModulePaths(dirname(entry.declarer));
}
function localCandidateOwnsResolution(candidate, resolved, request, name) {
	if (startsWithin(resolved, prefixes(candidate))) return true;
	if (sameResolution(candidate, resolved)) return true;
	if ([
		".js",
		".json",
		".node"
	].some((extension) => sameResolution(candidate + extension, resolved))) return true;
	/* v8 ignore next -- a bounded native lookup can escape a candidate only through its root legacy main */
	if (request !== name) return false;
	try {
		const manifest = JSON.parse(readFileSync(join(candidate, "package.json"), "utf8"));
		/* v8 ignore next -- a bounded native lookup outside the package directory requires a legacy main */
		if (typeof manifest.main !== "string") return false;
		return sameResolution(createRequire(join(candidate, "package.json")).resolve(resolve(candidate, manifest.main)), resolved);
	} catch (_error) {
		/* v8 ignore next -- this helper runs only after the same native resolution succeeded */
		return false;
	}
}
function isUnselectedPackageMiss(error) {
	const failure = error;
	return failure.code === "MODULE_NOT_FOUND" && failure.path === void 0;
}
function sameResolution(left, right) {
	if (left === right) return true;
	return canonicalPath(left) === canonicalPath(right);
}
/** One mutable pointer to the immutable runtime resolution. */
var ResolutionRouter = class {
	nodeModulePaths;
	current;
	linkedTargets;
	constructor(resolution, nodeModulePaths) {
		this.nodeModulePaths = nodeModulePaths;
		this.current = compileResolution(resolution);
		this.linkedTargets = new Map(resolution.linkedRoots.map((root) => [root.name, root.realPath]));
	}
	replace(successor) {
		const entries = new Map(successor.entries.map((entry) => [entry.name, entry]));
		if (successor.profilesDir !== this.current.profilesDir || successor.profileDir !== this.current.profileDir) throw new Error("profile resolution: a successor cannot change its profile scope");
		for (const [name, current] of this.current.entries) {
			const next = entries.get(name);
			if (next === void 0 || !sameResolution(current.packageDir, next.packageDir) || !sameResolution(current.declarer, next.declarer) || current.version !== next.version || current.scope !== next.scope) throw new Error(`profile resolution: replacing ${JSON.stringify(name)} requires a process restart`);
		}
		const localPackageNames = new Set(successor.localPackageNames);
		for (const name of this.current.localPackageNames) if (!localPackageNames.has(name)) throw new Error(`profile resolution: removing local package ${JSON.stringify(name)} requires a process restart`);
		for (const name of localPackageNames) if (!this.current.localPackageNames.has(name) && this.current.entries.has(name)) throw new Error(`profile resolution: overriding ${JSON.stringify(name)} locally requires a process restart`);
		for (const root of successor.linkedRoots) {
			const previous = this.linkedTargets.get(root.name);
			if (previous !== void 0 && !sameResolution(previous, root.realPath)) throw new Error(`profile resolution: relinking ${JSON.stringify(root.name)} requires a process restart`);
		}
		const next = compileResolution(successor);
		for (const { name, realPath } of successor.linkedRoots) if (!this.linkedTargets.has(name)) this.linkedTargets.set(name, realPath);
		this.current = next;
	}
	/** Whether a module path has an interception layer: it lies in the profiles tree, the active profile, or a linked root. */
	hasInterceptionLayerForPath(path) {
		return findInterceptionLayer(path, this.current) !== void 0;
	}
	/** Whether an importer URL is scoped; the answer is memoized with the importer's routes. */
	hasInterceptionLayerForUrl(parentURL) {
		return this.getOrCreateParentRoutesForUrl(parentURL) !== false;
	}
	createParentRoutes(parent, resolution) {
		const layer = findInterceptionLayer(parent, resolution);
		return layer === void 0 ? void 0 : {
			parent,
			layer,
			requests: /* @__PURE__ */ new Map()
		};
	}
	getOrCreateParentRoutesForUrl(parentURL) {
		const resolution = this.current;
		let parentRoutes = resolution.esmRoutes.get(parentURL);
		if (parentRoutes !== void 0) return parentRoutes;
		let parent;
		try {
			parent = fileURLToPath(parentURL);
		} catch {
			parent = void 0;
		}
		parentRoutes = parent === void 0 ? false : this.createParentRoutes(parent, resolution) ?? false;
		resolution.esmRoutes.set(parentURL, parentRoutes);
		return parentRoutes;
	}
	routeScoped(request, parentRoutes, resolution, flavor, cjs) {
		const { parent, layer, requests } = parentRoutes;
		const memo = layer.kind === "profile" && (cjs === void 0 || cjs.cacheable);
		const name = barePackageName(request);
		if (name === void 0) return void 0;
		if (parentRoutes.selfReferenceName === void 0 || !memo) parentRoutes.selfReferenceName = selfReferenceName(parent);
		if (parentRoutes.selfReferenceName === name || parentRoutes.selfReferenceName === null) {
			const state = { route: { kind: "native" } };
			if (memo) requests.set(request, state);
			return state;
		}
		if (layer.kind === "linked") return this.routeLinked(request, name, parent, resolution, flavor, cjs);
		const target = resolution.entries.get(name);
		const candidates = [];
		const localSearchPaths = [];
		for (const searchPath of createRequire(parent).resolve.paths(name)) {
			if (!searchPath.startsWith(layer.localPrefix)) break;
			localSearchPaths.push(searchPath);
			const candidate = localPackageCandidate(searchPath, name, flavor);
			if (candidate !== void 0) candidates.push(candidate);
		}
		if (candidates.length > 0) if (cjs !== void 0) try {
			const resolved = cjs.resolveNative(localSearchPaths);
			const selected = candidates.find((candidate) => localCandidateOwnsResolution(candidate, resolved, request, name));
			if (selected !== void 0) {
				const state = {
					route: {
						kind: "native",
						packageDir: selected
					},
					packageDir: selected,
					cjs: resolved
				};
				if (memo) requests.set(request, state);
				return state;
			}
		} catch (error) {
			if (!isUnselectedPackageMiss(error)) throw error;
		}
		else {
			const selected = candidates[0];
			const state = {
				route: {
					kind: "native",
					packageDir: selected
				},
				packageDir: selected
			};
			requests.set(request, state);
			return state;
		}
		const route = target !== void 0 && (target.scope === "installation" || layer.active) ? {
			kind: "interception",
			entry: target,
			after: layer.after
		} : {
			kind: "native-after-interception",
			parent: layer.nativeAfter
		};
		const state = { route };
		if (route.kind === "interception" && memo) requests.set(request, state);
		return state;
	}
	routeLinked(request, name, parent, resolution, flavor, cjs) {
		const target = resolution.entries.get(name);
		if (target === void 0) return { route: { kind: "native" } };
		const ancestors = this.nodeModulePaths(dirname(parent));
		const ancestorSet = new Set(ancestors);
		const searchPaths = flavor === "esm" ? ancestors : createRequire(parent).resolve.paths(name);
		for (const searchPath of searchPaths) {
			const directory = dirname(searchPath);
			if (ancestorSet.has(searchPath) && readPeerNames(directory).has(name)) {
				const route = {
					kind: "interception",
					entry: target,
					after: join(dirname(directory), "package.json")
				};
				if (cjs === void 0) return { route };
				try {
					const resolved = cjs.resolveEntry(target, route.after);
					if (localCandidateOwnsResolution(target.packageDir, resolved, request, name)) return {
						route,
						packageDir: target.packageDir,
						cjs: resolved
					};
				} catch (error) {
					if (!isUnselectedPackageMiss(error)) throw error;
				}
				continue;
			}
			const candidate = localPackageCandidate(searchPath, name, flavor);
			if (candidate === void 0) continue;
			if (cjs === void 0) return {
				route: {
					kind: "native",
					packageDir: candidate
				},
				packageDir: candidate
			};
			try {
				const resolved = cjs.resolveNative([searchPath]);
				if (localCandidateOwnsResolution(candidate, resolved, request, name)) return {
					route: {
						kind: "native",
						packageDir: candidate
					},
					packageDir: candidate,
					cjs: resolved
				};
			} catch (error) {
				if (!isUnselectedPackageMiss(error)) throw error;
			}
		}
		return cjs === void 0 ? { route: { kind: "native" } } : {
			route: { kind: "native" },
			cjs: cjs.resolveNative([])
		};
	}
	routeLocalPackage(request, parentRoutes, resolution) {
		const name = barePackageName(request);
		const { layer } = parentRoutes;
		if (name === void 0 || layer.kind !== "profile" || !layer.active || !resolution.localPackageNames.has(name)) return void 0;
		const state = { route: { kind: "native" } };
		parentRoutes.requests.set(request, state);
		return state;
	}
	routeUrl(request, parentURL) {
		const resolution = this.current;
		const parentRoutes = this.getOrCreateParentRoutesForUrl(parentURL);
		if (parentRoutes === false) return void 0;
		const cached = parentRoutes.requests.get(request);
		if (cached !== void 0) return cached;
		const local = this.routeLocalPackage(request, parentRoutes, resolution);
		if (local !== void 0) return local;
		return this.routeScoped(request, parentRoutes, resolution, "esm");
	}
	routePath(request, parent, cjs) {
		const resolution = this.current;
		let parentRoutes = resolution.cjsRoutes.get(parent);
		if (parentRoutes === false) return void 0;
		const cached = cjs.cacheable ? parentRoutes?.requests.get(request) : void 0;
		if (cached !== void 0) return cached;
		if (parentRoutes === void 0) {
			parentRoutes = this.createParentRoutes(parent, resolution) ?? false;
			resolution.cjsRoutes.set(parent, parentRoutes);
			if (parentRoutes === false) return void 0;
		}
		return this.routeScoped(request, parentRoutes, resolution, "cjs", cjs);
	}
	packageDir(specifier, parentURL) {
		const name = barePackageName(specifier);
		if (name === void 0) return void 0;
		const state = this.routeUrl(name, parentURL);
		if (state?.route.kind === "interception") return state.route.entry.packageDir;
		if (state?.packageDir !== void 0) return state.packageDir;
		let parent;
		try {
			parent = state?.route.kind === "native-after-interception" ? state.route.parent : fileURLToPath(parentURL);
		} catch {
			return;
		}
		const found = nativePackageDir(parent, name);
		if (state !== void 0 && found !== void 0) state.packageDir = found;
		return found;
	}
};
function internalModules() {
	const addon = createRequire(import.meta.url)("node-addon-require-builtin");
	const esmModule = addon.requireBuiltin("internal/modules/esm/loader");
	const cjsModule = addon.requireBuiltin("internal/modules/cjs/loader");
	const cjsHelpers = addon.requireBuiltin("internal/modules/helpers");
	const esmUtils = addon.requireBuiltin("internal/modules/esm/utils");
	const esmResolve = addon.requireBuiltin("internal/modules/esm/resolve");
	const esm = esmModule.getOrInitializeCascadedLoader();
	const modern = "getOrCreateModuleJob" in esm;
	/* v8 ignore start -- the supported Node 22/24/26 matrix validates each available Internal interface */
	if (typeof esm.resolveSync !== "function" || typeof Reflect.get(esm, modern ? "getOrCreateModuleJob" : "getModuleJobForImport") !== "function" || !modern && typeof Reflect.get(esm, "resolve") !== "function" || typeof cjsModule.Module._resolveFilename !== "function" || typeof cjsHelpers.getCjsConditions !== "function" || typeof esmUtils.getDefaultConditions !== "function" || typeof esmResolve.defaultResolve !== "function") throw new Error("profile resolution: unsupported Node module loader");
	/* v8 ignore stop */
	return {
		esm,
		esmDefaultResolve: (specifier, context) => esmResolve.defaultResolve(specifier, context),
		esmConditions: esmUtils.getDefaultConditions(),
		cjs: cjsModule.Module,
		cjsConditions: cjsHelpers.getCjsConditions(),
		modern
	};
}
/**
* Replace a resolver error's message and the same text in its stack.
* Node's module-hooks thread serializes errors and returns the stack accessor as a read-only configurable
* data property, so a rejected stack assignment redefines the property value.
* @param error - resolver error to update in place.
* @param message - replacement message.
*/
function replaceErrorMessage(error, message) {
	const { message: originalMessage, stack } = error;
	error.message = message;
	/* v8 ignore next -- Node's resolver errors always carry a stack */
	if (stack === void 0) return;
	const replaced = stack.replace(originalMessage, message);
	if (!Reflect.set(error, "stack", replaced)) Object.defineProperty(error, "stack", { value: replaced });
}
function throwWithImporter(error, routedParent, parent) {
	const code = error.code;
	if (error instanceof Error && (code === "ERR_MODULE_NOT_FOUND" || code === "ERR_PACKAGE_PATH_NOT_EXPORTED")) {
		const routedPath = fileURLToPath(routedParent);
		const parentPath = fileURLToPath(parent);
		replaceErrorMessage(error, error.message.replaceAll(routedParent, parent).replaceAll(routedPath, parentPath));
	}
	throw error;
}
function throwWithoutCjsAnchor(error, anchor) {
	const resolved = error;
	const requireStack = resolved.requireStack;
	if (error instanceof Error && resolved.code === "MODULE_NOT_FOUND" && requireStack?.[0] !== void 0 && sameResolution(requireStack[0], anchor)) {
		const originalMessage = error.message;
		const originalBlock = `\nRequire stack:\n${requireStack.map((path) => `- ${path}`).join("\n")}`;
		const remaining = requireStack.slice(1);
		/* v8 ignore next -- routed calls always retain the original importing module */
		const replacement = remaining.length === 0 ? "" : `\nRequire stack:\n${remaining.map((path) => `- ${path}`).join("\n")}`;
		error.message = originalMessage.replace(originalBlock, replacement);
		resolved.requireStack = remaining;
		const stack = error.stack;
		/* v8 ignore next -- Node's resolver errors always carry a stack */
		if (stack !== void 0) error.stack = stack.replace(originalMessage, error.message);
	}
	throw error;
}
/**
* Install one runtime resolution as the interception on Node's default ESM and CommonJS resolvers.
* @param resolution - complete package table and profile scope.
* @returns an interception that publishes a successor or restores the native methods.
*/
function installRuntimeInterception(resolution) {
	const { esm, esmDefaultResolve, esmConditions, cjs, cjsConditions, modern } = internalModules();
	const router = new ResolutionRouter(resolution, (directory) => cjs._nodeModulePaths(directory));
	let delegatedEsm;
	const adaptEsm = (native) => {
		const adapted = (request, parent, attributes) => {
			const delegated = delegatedEsm;
			/* v8 ignore next -- reentry requires a separate synchronous Node hook; supported launches install none */
			if (delegated !== void 0 && delegated.parent === parent && delegated.request === request) return native(request, parent, attributes);
			if (parent === void 0 || !router.hasInterceptionLayerForUrl(parent)) return native(request, parent, attributes);
			const state = router.routeUrl(request, parent);
			if (state === void 0) {
				const target = request[0] === "#" ? packageImportsTarget(fileURLToPath(parent), request, esmConditions) : void 0;
				if (target === void 0) return native(request, parent, attributes);
				const restoreImporter = (error) => throwWithImporter(error, target.parentURL, parent);
				let expected;
				try {
					expected = adapted(target.specifier, target.parentURL, attributes);
					/* v8 ignore next -- Node 24+ resolves synchronously; the Node 22 matrix covers its Promise result */
					if (expected instanceof Promise) expected = expected.catch(restoreImporter);
				} catch (error) {
					return restoreImporter(error);
				}
				return expected;
			}
			const cacheable = attributes === EMPTY_ATTRIBUTES || Object.keys(attributes).length === 0;
			if (cacheable && state.esm !== void 0) return state.esm;
			const route = state.route;
			if (route.kind === "native") {
				const result = native(request, parent, attributes);
				if (cacheable && !(result instanceof Promise)) state.esm = result;
				return result;
			}
			const routedParent = pathToFileURL(route.kind === "interception" ? route.entry.declarer : route.parent).href;
			const previous = delegatedEsm;
			delegatedEsm = {
				parent: routedParent,
				request
			};
			const restoreImporter = (error) => throwWithImporter(error, routedParent, parent);
			try {
				let result;
				try {
					result = native(request, routedParent, attributes);
				} catch (error) {
					return restoreImporter(error);
				}
				/* v8 ignore next -- Node 24+ resolves synchronously; the Node 22 matrix covers its Promise result */
				if (result instanceof Promise) return result.catch(restoreImporter);
				if (cacheable) state.esm = result;
				return result;
			} finally {
				delegatedEsm = previous;
			}
		};
		return adapted;
	};
	let restoreEsm;
	/* v8 ignore else -- CI coverage runs Node 24 v2; the Node 22 matrix exercises the v1 adapter */
	if (modern) {
		const loader = esm;
		const original = Reflect.get(loader, "resolveSync");
		const resolveRequest = adaptEsm((request, parent, attributes) => original.call(loader, parent, {
			specifier: request,
			attributes
		}));
		const wrapped = (parent, request, ...rest) => rest.length ? Reflect.apply(original, loader, [
			parent,
			request,
			...rest
		]) : resolveRequest(request.specifier, parent, request.attributes ?? EMPTY_ATTRIBUTES);
		loader.resolveSync = wrapped;
		restoreEsm = () => {
			/* v8 ignore else -- interceptions are disposed in reverse installation order */
			if (loader.resolveSync === wrapped) loader.resolveSync = original;
		};
	} else {
		const loader = esm;
		const original = Reflect.get(loader, "resolve");
		const originalSync = Reflect.get(loader, "resolveSync");
		const resolveRequest = adaptEsm((request, parent, attributes) => original.call(loader, request, parent, attributes));
		const resolveRequestSync = adaptEsm((request, parent, attributes) => originalSync.call(loader, request, parent, attributes));
		const wrapped = (request, parent, attributes = EMPTY_ATTRIBUTES) => resolveRequest(request, parent, attributes);
		const wrappedSync = (request, parent, attributes = EMPTY_ATTRIBUTES) => resolveRequestSync(request, parent, attributes);
		loader.resolve = wrapped;
		loader.resolveSync = wrappedSync;
		restoreEsm = () => {
			if (loader.resolve === wrapped) loader.resolve = original;
			if (loader.resolveSync === wrappedSync) loader.resolveSync = originalSync;
		};
	}
	const originalFilename = Reflect.get(cjs, "_resolveFilename");
	let delegatedCjs = 0;
	const resolveRoutedCjs = (request, routed, parent, main, options) => {
		const anchor = routed.kind === "interception" ? routed.entry.declarer : routed.parent;
		const synthetic = new cjs(anchor);
		synthetic.parent = parent;
		synthetic.filename = anchor;
		synthetic.paths = routed.kind === "interception" ? packageSearchPaths(routed.entry, request, cjs) : cjs._nodeModulePaths(dirname(anchor));
		try {
			return originalFilename.call(cjs, request, synthetic, main, options);
		} catch (error) {
			return throwWithoutCjsAnchor(error, anchor);
		}
	};
	const resolveNativeCjs = (request, searchPaths, parent, parentFilename, main, conditions) => {
		const synthetic = new cjs(parentFilename);
		if (parent.parent !== void 0) synthetic.parent = parent.parent;
		synthetic.filename = parentFilename;
		synthetic.paths = [...searchPaths];
		const options = conditions === void 0 ? void 0 : { conditions };
		return originalFilename.call(cjs, request, synthetic, main, options);
	};
	const resolvePackageImportCjs = (target, conditions) => {
		const state = router.routeUrl(target.specifier, target.parentURL);
		const resolveFrom = (parentURL) => fileURLToPath(esmDefaultResolve(target.specifier, {
			parentURL,
			conditions: [...conditions]
		}).url);
		/* v8 ignore next -- the target manifest was found inside the established profile scope */
		if (state === void 0) return resolveFrom(target.parentURL);
		if (state.route.kind === "native") return resolveFrom(target.parentURL);
		const route = state.route;
		if (route.kind === "native-after-interception") return resolveFrom(pathToFileURL(route.parent).href);
		return resolveFrom(pathToFileURL(route.entry.declarer).href);
	};
	const wrappedFilename = (request, parent, main, options) => {
		if (delegatedCjs || !parent?.filename || options?.paths !== void 0) return originalFilename.call(cjs, request, parent, main, options);
		const parentFilename = parent.filename;
		const cacheable = options?.conditions === void 0;
		const routedOptions = options?.conditions === void 0 ? void 0 : { conditions: options.conditions };
		const state = router.routePath(request, parentFilename, {
			cacheable,
			resolveNative: (searchPaths) => resolveNativeCjs(request, searchPaths, parent, parentFilename, main, options?.conditions),
			resolveEntry: (entry, after) => {
				delegatedCjs++;
				try {
					return resolveRoutedCjs(request, {
						kind: "interception",
						entry,
						after
					}, parent, main, routedOptions);
				} finally {
					delegatedCjs--;
				}
			}
		});
		if (state === void 0) {
			const scoped = router.hasInterceptionLayerForPath(parentFilename);
			const conditions = options?.conditions ?? cjsConditions;
			const target = request[0] === "#" && scoped ? packageImportsTarget(parentFilename, request, conditions) : void 0;
			if (target === void 0) return originalFilename.call(cjs, request, parent, main, options);
			return resolvePackageImportCjs(target, conditions);
		}
		if (state.cjs !== void 0) return state.cjs;
		const route = state.route;
		if (route.kind === "native") {
			const result = originalFilename.call(cjs, request, parent, main, options);
			if (cacheable) state.cjs = result;
			return result;
		}
		delegatedCjs++;
		try {
			let expected;
			try {
				expected = resolveRoutedCjs(request, route, parent, main, routedOptions);
			} catch (error) {
				if (route.kind !== "interception" || !isUnselectedPackageMiss(error)) throw error;
				expected = resolveRoutedCjs(request, {
					kind: "native-after-interception",
					parent: route.after
				}, parent, main, routedOptions);
			}
			if (cacheable) state.cjs = expected;
			return expected;
		} finally {
			delegatedCjs--;
		}
	};
	cjs._resolveFilename = wrappedFilename;
	return {
		packageDir(specifier, parentURL) {
			return router.packageDir(specifier, parentURL);
		},
		replace(next) {
			router.replace(next);
		},
		dispose() {
			/* v8 ignore else -- interceptions are disposed in reverse installation order */
			if (cjs._resolveFilename === wrappedFilename) cjs._resolveFilename = originalFilename;
			restoreEsm();
		}
	};
}
//#endregion
//#region lib/types/profile-resolution/worker-bootstrap.js
/** Install the inherited runtime resolution in one Harness-owned Worker. */
const registration = getEnvironmentData("@deepseek-ai/dsh-app-boot/profile-resolution");
if (registration !== void 0) installRuntimeInterception(registration.resolution);
//#endregion
export {};
