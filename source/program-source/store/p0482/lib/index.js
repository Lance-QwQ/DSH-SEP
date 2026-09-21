// dsh-host-isolation/candidates/dsh-rc2-managed-20260913/memory-settings-ui/lib/types/config.js
import z from "@deepseek-ai/schemastery";
var Config = z.object({ enabled: z.boolean().default(true), requestTimeoutMs: z.natural().min(1e3).max(3e5).default(12e4) });
function resolveConfig(config = {}) {
  const enabled = config.enabled ?? true, requestTimeoutMs = config.requestTimeoutMs ?? 12e4;
  if (typeof enabled !== "boolean" || !Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 1e3 || requestTimeoutMs > 3e5)
    throw new Error("MEMORY_SETTINGS_CONFIG");
  return { enabled, requestTimeoutMs };
}

// dsh-host-isolation/candidates/dsh-rc2-managed-20260913/memory-settings-ui/lib/types/errors.js
var PUBLIC_CODES = /* @__PURE__ */ new Set(["MEMORY_SETTINGS_CONFLICT", "MEMORY_SETTINGS_PROJECT", "MEMORY_SETTINGS_UNAVAILABLE", "MEMORY_SETTINGS_INPUT", "DISPOSED", "ABORTED"]);
function safeErrorCode(value) {
  return typeof value === "string" && PUBLIC_CODES.has(value) ? value : "MEMORY_SETTINGS_UNAVAILABLE";
}

// dsh-host-isolation/candidates/dsh-rc2-managed-20260913/memory-settings-ui/lib/types/index.js
var inject = ["connection"];
var name = "client-ui-settings-memory";
async function readEnvelope(request) {
  const reader = request.body?.getReader();
  if (reader === void 0)
    return new Response("empty body", { status: 400 });
  const chunks = [];
  let length = 0;
  try {
    for (; ; ) {
      const { done, value } = await reader.read();
      if (done)
        break;
      length += value.byteLength;
      if (length > 16384) {
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
function apply(ctx, config = {}) {
  if (!resolveConfig(config).enabled)
    return;
  const connection = ctx.get("connection");
  const handler = async (endpoint, payload, signal) => {
    if (endpoint !== "list" && endpoint !== "get" && endpoint !== "update")
      return { ok: false, error: { code: "bad-request", message: "MEMORY_SETTINGS_INPUT", details: { issues: [] } } };
    if (signal.aborted)
      return { ok: false, error: { code: "cancelled", message: "ABORTED", details: {} } };
    const method = ctx.get("suiteEnhancements")?.memorySettings?.[endpoint];
    if (method === void 0)
      return endpoint === "list" ? { ok: true, value: { version: 1, available: false, reason: "MEMORY_SETTINGS_UNAVAILABLE", projects: [] } } : { ok: false, error: { code: "internal", message: "MEMORY_SETTINGS_UNAVAILABLE", details: {} } };
    try {
      return { ok: true, value: await method(payload, { signal }) };
    } catch (error) {
      const code = error !== null && typeof error === "object" && "code" in error ? error.code : void 0;
      return { ok: false, error: { code: "internal", message: safeErrorCode(code), details: {} } };
    }
  };
  for (const method of ["list", "get", "update"]) {
    const endpoint = "sep-memory/" + method;
    connection.fetch.register({
      path: "/api/" + endpoint,
      methods: ["POST"],
      requestBody: "buffered",
      async fetch(request) {
        const ownedDesktop = ctx.get("sepDesktopTransport")?.kind === "electron-owned-pipe";
        const web = ctx.get("webServer");
        const url = new URL(request.url);
        const localWeb = web?.host === "127.0.0.1" && (url.protocol === "http:" || url.protocol === "https:");
        if (!(ownedDesktop && url.protocol === "dsh-app:") && !localWeb)
          return new Response("forbidden", { status: 403 });
        if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json")
          return new Response("content type", { status: 415 });
        const body = await readEnvelope(request);
        if (body instanceof Response)
          return body;
        if (body === null || typeof body !== "object" || !("type" in body) || body.type !== "client-request" || !("rpcId" in body) || typeof body.rpcId !== "string" || body.rpcId.length > 256 || !("method" in body) || body.method !== endpoint || !("payload" in body))
          return new Response("invalid envelope", { status: 400 });
        const result = await handler(method, body.payload, request.signal);
        return Response.json({ type: "server-response", rpcId: body.rpcId, result });
      }
    });
  }
}
export {
  Config,
  apply,
  inject,
  name
};
//# sourceMappingURL=index.js.map
