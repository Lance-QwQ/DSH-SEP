import z from "@deepseek-ai/schemastery";
//#region lib/types/config.js
const Config = z.object({
	enabled: z.boolean().default(true),
	requestTimeoutMs: z.natural().min(1e3).max(3e5).default(12e4)
});
/** Validate defaults also for direct non-Loader composition. */
function resolveConfig(config = {}) {
	const enabled = config.enabled ?? true, requestTimeoutMs = config.requestTimeoutMs ?? 12e4;
	if (typeof enabled !== "boolean" || !Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 1e3 || requestTimeoutMs > 3e5) throw new Error("MEMORY_SETTINGS_CONFIG");
	return {
		enabled,
		requestTimeoutMs
	};
}
//#endregion
//#region lib/types/errors.js
const PUBLIC_CODES = new Set([
	"MEMORY_SETTINGS_CONFLICT",
	"MEMORY_SETTINGS_PROJECT",
	"MEMORY_SETTINGS_UNAVAILABLE",
	"MEMORY_SETTINGS_INPUT",
	"DISPOSED",
	"ABORTED"
]);
/** Preserve only owned error codes; stacks, paths and memory content never become UI copy. */
function safeErrorCode(value) {
	return typeof value === "string" && PUBLIC_CODES.has(value) ? value : "MEMORY_SETTINGS_UNAVAILABLE";
}
//#endregion
//#region lib/types/index.js
/** Host bridge needs only Connection; a missing suite must not block browser boot. */
const inject = ["connection"];
const name = "client-ui-settings-memory";
/** Bound a settings envelope before parsing, independently of the carrier's attachment limit. */
async function readEnvelope(request, maximum = 16384) {
	const reader = request.body?.getReader();
	if (reader === void 0) return new Response("empty body", { status: 400 });
	const chunks = [];
	let length = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			length += value.byteLength;
			if (length > maximum) {
				await reader.cancel();
				return new Response("body limit", { status: 413 });
			}
			chunks.push(value);
		}
		const bytes = new Uint8Array(length);
		let offset = 0;
		for (const chunk of chunks) {
			bytes.set(chunk, offset);
			offset += chunk.byteLength;
		}
		return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	} catch {
		return new Response("invalid body", { status: 400 });
	} finally {
		reader.releaseLock();
	}
}
/** Register owned exact routes on the shared Web/Desktop carrier; the suite owns project authorization. */
function apply(ctx, config = {}) {
	if (!resolveConfig(config).enabled) return;
	const connection = ctx.get("connection");
	registerAssessmentRoutes(ctx, connection);
	for (const budget of [false, true]) {
		const prefix = budget ? "sep-budget/" : "sep-memory/";
		const unavailable = budget ? "BUDGET_SETTINGS_UNAVAILABLE" : "MEMORY_SETTINGS_UNAVAILABLE";
		const handler = async (endpoint, payload, signal) => {
			if (endpoint !== "list" && endpoint !== "get" && endpoint !== "update" && !(budget && endpoint === "updateDefault")) return {
				ok: false,
				error: {
					code: "bad-request",
					message: "MEMORY_SETTINGS_INPUT",
					details: { issues: [] }
				}
			};
			if (signal.aborted) return {
				ok: false,
				error: {
					code: "cancelled",
					message: "ABORTED",
					details: {}
				}
			};
			const method = ctx.get("suiteEnhancements")?.[budget ? "budgetSettings" : "memorySettings"]?.[endpoint];
			if (method === void 0) return endpoint === "list" ? {
				ok: true,
				value: budget ? {
					version: 1,
					available: false,
					reason: unavailable,
					sessions: []
				} : {
					version: 1,
					available: false,
					reason: unavailable,
					projects: []
				}
			} : {
				ok: false,
				error: {
					code: "internal",
					message: unavailable,
					details: {}
				}
			};
			try {
				return {
					ok: true,
					value: await method(payload, { signal })
				};
			} catch (error) {
				const code = error !== null && typeof error === "object" && "code" in error ? error.code : void 0;
				return {
					ok: false,
					error: {
						code: "internal",
						message: budget ? safeBudgetErrorCode(code) : safeErrorCode(code),
						details: {}
					}
				};
			}
		};
		for (const method of budget ? [
			"list",
			"get",
			"update",
			"updateDefault"
		] : [
			"list",
			"get",
			"update"
		]) {
			const endpoint = prefix + method;
			connection.fetch.register({
				path: "/api/" + endpoint,
				methods: ["POST"],
				requestBody: "buffered",
				async fetch(request) {
					const ownedDesktop = ctx.get("sepDesktopTransport")?.kind === "electron-owned-pipe";
					const web = ctx.get("webServer");
					const url = new URL(request.url);
					const localWeb = web?.host === "127.0.0.1" && (url.protocol === "http:" || url.protocol === "https:");
					if (!(ownedDesktop && url.protocol === "dsh-app:") && !localWeb) return new Response("forbidden", { status: 403 });
					if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") return new Response("content type", { status: 415 });
					const body = await readEnvelope(request);
					if (body instanceof Response) return body;
					if (body === null || typeof body !== "object" || !("type" in body) || body.type !== "client-request" || !("rpcId" in body) || typeof body.rpcId !== "string" || body.rpcId.length > 256 || !("method" in body) || body.method !== endpoint || !("payload" in body)) return new Response("invalid envelope", { status: 400 });
					const result = await handler(method, body.payload, request.signal);
					return Response.json({
						type: "server-response",
						rpcId: body.rpcId,
						result
					});
				}
			});
		}
	}
}
const BUDGET_PUBLIC_CODES = new Set([
	"BUDGET_SETTINGS_CONFLICT",
	"BUDGET_SETTINGS_SESSION",
	"BUDGET_SETTINGS_UNAVAILABLE",
	"BUDGET_SETTINGS_INPUT",
	"BUDGET_LEDGER_MISSING",
	"BUDGET_LEDGER_CHANGED",
	"BUDGET_LOCKED",
	"DISPOSED",
	"ABORTED"
]);
function safeBudgetErrorCode(value) {
	return typeof value === "string" && BUDGET_PUBLIC_CODES.has(value) ? value : "BUDGET_SETTINGS_UNAVAILABLE";
}
/** Only the authenticated owned Desktop can submit discovery; settings also allow the authenticated loopback Web carrier. */
function registerAssessmentRoutes(ctx, connection) {
	for (const method of [
		"get",
		"update",
		"observe",
		"retry"
	]) {
		const endpoint = "sep-assessment/" + method;
		connection.fetch.register({
			path: "/api/" + endpoint,
			methods: ["POST"],
			requestBody: "buffered",
			async fetch(request) {
				const transport = ctx.get("sepDesktopTransport");
				const web = ctx.get("webServer");
				const url = new URL(request.url);
				const owned = transport?.kind === "electron-owned-pipe" && url.protocol === "dsh-app:" || transport?.kind === "sep-owned-http" && url.protocol === "http:" && url.hostname === "dsh.internal";
				const local = web?.host === "127.0.0.1" && (url.protocol === "http:" || url.protocol === "https:");
				if (!owned && (method === "observe" || !local)) return new Response("forbidden", { status: 403 });
				if (request.headers.get("content-type")?.split(";", 1)[0] !== "application/json") return new Response("content type", { status: 415 });
				const body = await readEnvelope(request, method === "observe" ? 65e4 : 16384);
				if (body instanceof Response) return body;
				if (body === null || typeof body !== "object" || !("type" in body) || body.type !== "client-request" || !("rpcId" in body) || typeof body.rpcId !== "string" || body.rpcId.length > 256 || !("method" in body) || body.method !== endpoint || !("payload" in body)) return new Response("invalid envelope", { status: 400 });
				const suite = ctx.get("suiteEnhancements");
				let result;
				try {
					if (request.signal.aborted) throw Object.assign(/* @__PURE__ */ new Error("ABORTED"), { code: "ABORTED" });
					const operation = suite?.updateAssessment?.[method];
					if (operation === void 0) {
						if (method !== "get") throw new Error("unavailable");
						result = {
							ok: true,
							value: {
								version: 1,
								available: false,
								enabled: false,
								latest: null,
								usage: null
							}
						};
					} else result = {
						ok: true,
						value: await operation(body.payload, { signal: request.signal })
					};
				} catch {
					result = {
						ok: false,
						error: {
							code: "internal",
							message: "ASSESSMENT_UNAVAILABLE",
							details: {}
						}
					};
				}
				return Response.json({
					type: "server-response",
					rpcId: body.rpcId,
					result
				});
			}
		});
	}
}
//#endregion
export { Config, apply, inject, name };
