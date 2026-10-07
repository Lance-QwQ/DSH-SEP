import { Context, Service } from "@deepseek-ai/cordis";
//#region lib/types/remote-error.js
/** The one Remote failure class shared by owners, the Gateway, and consumers. */
/**
* One Remote call failure: a real Error carrying its stable code and typed
* details. Owners throw it at the failure point; the Host Gateway encodes it
* onto the wire unchanged; the Client face rebuilds an instance for the
* `RemoteResult` error branch, so `throw result.error` keeps throw semantics.
* Discrimination is always by `code`, never by instanceof.
*/
var RemoteError = class extends Error {
	code;
	details;
	/** Structural marker: cross-realm/bundle identification never uses instanceof. */
	isDSHRemoteError = true;
	/**
	* @param code - stable failure code declared in {@link RemoteErrorDetailsMap}.
	* @param message - human diagnostic carried across the wire.
	* @param details - structured payload typed by the code.
	* @param options - standard Error options (`cause` survives in-process only).
	*/
	constructor(code, message, details, options) {
		super(message, options);
		this.code = code;
		this.details = details;
		this.name = "RemoteError";
	}
};
/**
* Structurally identify a RemoteError thrown across module or realm copies of
* this class. Mechanism-internal: the Gateway and test assertions use it;
* business code receives typed failures and never needs it.
* @param value - a caught value.
* @returns the failure when the marker matches, otherwise undefined.
*/
function remoteErrorOf(value) {
	if (typeof value === "object" && value !== null && value.isDSHRemoteError === true && typeof value.code === "string") return value;
}
//#endregion
//#region lib/types/owned-value.js
/** Generic invocation-owned values returned by synchronous Client Context resolvers. */
/** Shared identity across independently bundled Context providers and Gateway. */
const TYPERT_OWNED_VALUE = Symbol.for("dsh.typert.owned-value");
/**
* Transfer cleanup ownership without adding another resource reference count.
* @param value - resolved payload passed to the invocation.
* @param release - non-throwing synchronous release, called at most once.
* @returns an owned payload disposed after invocation and reply settlement.
*/
function typertOwnedValue(value, release) {
	let active = true;
	return {
		[TYPERT_OWNED_VALUE]: true,
		value,
		[Symbol.dispose]() {
			if (!active) return;
			active = false;
			release();
		}
	};
}
/**
* Identify invocation-owned values using the shared marker.
* @param value - borrowed or owned resolver result.
* @returns whether the result carries invocation cleanup.
*/
function isTypertOwnedValue(value) {
	return typeof value === "object" && value !== null && TYPERT_OWNED_VALUE in value && value[TYPERT_OWNED_VALUE] === true;
}
//#endregion
//#region lib/types/json-value.js
/**
* Lossless JSON checks every Remote carrier shares: the Client handle before it
* queues an uplink item, the Gateway at its wire and codec-less uplink
* boundaries, and the in-process mock.
*/
/**
* Test whether a value crosses JSON transport without coercion or omission.
* @param value - candidate boundary value.
* @returns whether the value is losslessly JSON-compatible.
*/
function isRemoteJsonValue(value) {
	return visitJsonValue(value, /* @__PURE__ */ new Set());
}
/**
* Test whether a value may travel as one uplink item: a lossless JSON value, or
* a top-level `undefined`, which the wire carries as an `item` frame without
* `value`. Nested `undefined`, `NaN`, and infinities stay rejected.
* @param value - candidate uplink item.
* @returns whether the item crosses every carrier unchanged.
*/
function isRemoteUplinkItem(value) {
	return value === void 0 || isRemoteJsonValue(value);
}
function visitJsonValue(value, ancestors) {
	if (value === null || typeof value === "string" || typeof value === "boolean") return true;
	if (typeof value === "number") return Number.isFinite(value) && !Object.is(value, -0);
	if (typeof value !== "object") return false;
	if (ancestors.has(value)) return false;
	ancestors.add(value);
	try {
		if (Array.isArray(value)) {
			if (Object.getPrototypeOf(value) !== Array.prototype || Reflect.ownKeys(value).length !== value.length + 1) return false;
			for (let index = 0; index < value.length; index++) if (!Object.hasOwn(value, index) || !visitJsonValue(value[index], ancestors)) return false;
			return true;
		}
		const prototype = Object.getPrototypeOf(value);
		if (prototype !== Object.prototype && prototype !== null) return false;
		for (const key of Reflect.ownKeys(value)) {
			if (typeof key !== "string") return false;
			if (Object.getOwnPropertyDescriptor(value, key)?.enumerable !== true || !visitJsonValue(Reflect.get(value, key), ancestors)) return false;
		}
		return true;
	} finally {
		ancestors.delete(value);
	}
}
//#endregion
//#region lib/types/index.js
/**
* Remote decorators and explicit Gateway bindings backed by versioned
* descriptors carried on decorated class prototypes. Strict reflection
* remains a Typert compiler responsibility.
* @module @deepseek-ai/dsh-typert-protocol
*/
const TYPERT_REMOTE_SEGMENT_PATTERN = /^[A-Za-z0-9_$.-]+$/;
/**
* Test one generated Remote name against the Connection endpoint grammar.
* @param value - namespace, method, lookup, or Context segment.
* @returns whether the value can cross the shared RPC carrier unchanged.
*/
function isTypertRemoteSegment(value) {
	return value !== "." && value !== ".." && TYPERT_REMOTE_SEGMENT_PATTERN.test(value);
}
const REMOTE_METHOD_DESCRIPTOR = "@deepseek-ai/dsh-typert-protocol/remote-methods";
/**
* Bind one visible Service field to a Cordis key and Remote namespace. A
* service that owns a Cordis Context also gives its tree `ctx.invocation`,
* `undefined` outside a Remote call, so no `TypertRemoteService` is needed for
* a Host composition to read it.
* @param service - owning Service instance, normally `this`.
* @param serviceKey - exact Cordis service key.
* @param options - optional distinct wire namespace.
* @returns a frozen, inspectable binding with no compiler-injected metadata.
*/
function bindTypertRemote(service, serviceKey, options = {}) {
	validateName("service key", serviceKey);
	const namespace = options.namespace ?? serviceKey;
	validateName("namespace", namespace);
	const ctx = Reflect.get(service, "ctx");
	if (ctx instanceof Context) provideInvocationAccessor(ctx);
	return Object.freeze({
		service,
		serviceKey,
		namespace
	});
}
/** Cordis Service base that exposes its registered name through Typert Gateway. */
var TypertRemoteService = class extends Service {
	/** Visible binding consumed by the Gateway's source-mode discovery. */
	typertRemote;
	/**
	* Register the Service and bind the same key to Typert Gateway.
	* @param ctx - owning Cordis Context.
	* @param serviceKey - exact Cordis service key and default wire namespace.
	* @param options - optional distinct wire namespace.
	*/
	constructor(ctx, serviceKey, options = {}) {
		super(ctx, serviceKey);
		this.typertRemote = bindTypertRemote(this, this.name, options);
	}
};
/**
* Make `ctx.invocation` read as `undefined` outside a Remote call instead of the
* reflect service's "cannot get property" error; a call-derived Context shadows
* the accessor with its own property. The first Remote Service constructed in a
* tree registers it on the root, where it outlives any one Service.
*/
function provideInvocationAccessor(ctx) {
	if (Object.hasOwn(ctx.root.reflect.props, "invocation")) return;
	ctx.root.accessor("invocation", { get: () => void 0 });
}
function Remote(methodExportOrOptions, context) {
	if (typeof methodExportOrOptions === "string") {
		validateName("Remote export name", methodExportOrOptions);
		return remoteDecorator({ kind: "direct" }, void 0, methodExportOrOptions);
	}
	if (typeof methodExportOrOptions === "object") {
		if (remoteOptionMode(methodExportOrOptions) !== "stream" || Reflect.ownKeys(methodExportOrOptions).length !== 1) throw new TypeError("typert-protocol: Remote options must contain exactly mode: \"stream\"");
		return remoteDecorator({ kind: "direct" }, "stream");
	}
	if (context === void 0) throw new TypeError("typert-protocol: Remote decorator context is missing");
	addMarkerInitializer(context, { kind: "direct" });
}
function remoteOptionMode(options) {
	return Reflect.get(options, "mode");
}
function remoteDecorator(invocation, mode, exportName) {
	return function(_method, context) {
		addMarkerInitializer(context, invocation, mode, exportName);
	};
}
/**
* Create a decorator for a method resolved from one Remote Scope.
* @param key - scope key declared through the Context map.
* @param exportName - optional Remote export name; defaults to the method name.
* @returns a standard method decorator that records a versioned prototype descriptor.
*/
function RemoteScope(key, exportName) {
	validateName("Scope key", key);
	if (exportName !== void 0) validateName("Remote export name", exportName);
	return remoteDecorator({
		kind: "context",
		context: key
	}, void 0, exportName);
}
/**
* Read Remote markers attached to a live Service's class prototype.
* The returned snapshot cannot mutate the stored descriptor.
* @param service - live Service instance.
* @returns markers in class declaration order.
*/
function remoteMethods(service) {
	const prototype = Object.getPrototypeOf(service);
	if (prototype === null) return [];
	return (readRemoteMethodDescriptor(prototype)?.methods ?? []).map((marker) => ({ ...marker }));
}
function readRemoteMethodDescriptor(prototype) {
	const property = Object.getOwnPropertyDescriptor(prototype, REMOTE_METHOD_DESCRIPTOR);
	if (property === void 0) return void 0;
	const descriptor = property.value;
	if (descriptor === null || typeof descriptor !== "object") throw new TypeError("typert-protocol: Remote method descriptor must be an object");
	const version = Reflect.get(descriptor, "version");
	if (version !== 1) throw new TypeError(`typert-protocol: unsupported Remote method descriptor version ${String(version)}`);
	const methods = Reflect.get(descriptor, "methods");
	if (!Array.isArray(methods)) throw new TypeError("typert-protocol: Remote method descriptor methods must be an array");
	return descriptor;
}
function addMarkerInitializer(context, invocation, mode, exportName) {
	if (context.private || context.static || typeof context.name !== "string") throw new TypeError("typert-protocol: Remote decorators require a public instance method with a string name");
	const method = context.name;
	context.addInitializer(function() {
		const prototype = Object.getPrototypeOf(this);
		if (prototype === null) throw new TypeError(`typert-protocol: cannot mark Remote method "${method}" on an object without a prototype`);
		mark(prototype, method, invocation, mode, exportName);
	});
}
function mark(prototype, method, invocation, mode, exportName) {
	const descriptor = readRemoteMethodDescriptor(prototype);
	const marker = Object.freeze({
		method,
		...exportName === void 0 || exportName === method ? {} : { exportName },
		...mode === void 0 ? {} : { mode },
		invocation: Object.freeze(invocation)
	});
	const current = descriptor?.methods.find((candidate) => candidate.method === method);
	if (current !== void 0) {
		if (current.exportName === marker.exportName && current.mode === marker.mode && sameInvocation(current.invocation, invocation)) return;
		throw new Error(`typert-protocol: Remote method "${method}" has conflicting invocation markers`);
	}
	Object.defineProperty(prototype, REMOTE_METHOD_DESCRIPTOR, {
		configurable: true,
		value: Object.freeze({
			version: 1,
			methods: Object.freeze([...descriptor?.methods ?? [], marker])
		})
	});
}
function sameInvocation(left, right) {
	if (left.kind === "direct") return right.kind === "direct";
	if (right.kind === "direct") return false;
	return left.context === right.context;
}
function validateName(subject, value) {
	if (!isTypertRemoteSegment(value)) throw new TypeError(`typert-protocol: ${subject} must contain only RPC endpoint segment characters`);
}
//#endregion
export { Remote, RemoteError, RemoteScope, TYPERT_OWNED_VALUE, TypertRemoteService, bindTypertRemote, isRemoteJsonValue, isRemoteUplinkItem, isTypertOwnedValue, isTypertRemoteSegment, remoteErrorOf, remoteMethods, typertOwnedValue };
