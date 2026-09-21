// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/client/connection/src/index.ts
import z3 from "@deepseek-ai/schemastery";

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/client/connection/src/api-path.ts
var API_PATH = "/api";

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/client/connection/src/http-bridge.ts
import { Readable } from "node:stream";
var DEFAULT_MAX_REQUEST_BODY_BYTES = 300 * 1024 * 1024;
async function bridge(req, res, apiHandler, maxRequestBodyBytes = DEFAULT_MAX_REQUEST_BODY_BYTES) {
  const abort = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) abort.abort();
  });
  const url = new URL(req.url ?? "/", "http://dsh.internal");
  const method = req.method ?? "GET";
  const headers = Object.fromEntries(
    Object.entries(req.headers).filter(([, value]) => typeof value === "string")
  );
  const bodyMode = apiHandler.requestBodyMode({ method, url });
  let request;
  if (bodyMode === "buffered") {
    const declaredLength = req.headers["content-length"];
    if (declaredLength !== void 0 && Number(declaredLength) > maxRequestBodyBytes) {
      res.writeHead(413, { connection: "close" });
      res.end();
      req.destroy();
      return;
    }
    const chunks = [];
    let received = 0;
    for await (const chunk of req) {
      const buffer = chunk;
      received += buffer.byteLength;
      if (received > maxRequestBodyBytes) {
        res.writeHead(413, { connection: "close" });
        res.end();
        req.destroy();
        return;
      }
      chunks.push(buffer);
    }
    request = new Request(url, {
      method,
      headers,
      ...chunks.length > 0 ? { body: Buffer.concat(chunks) } : {},
      signal: abort.signal
    });
  } else {
    request = new Request(url, {
      method,
      headers,
      body: Readable.toWeb(req),
      signal: abort.signal,
      duplex: "half"
    });
  }
  const response = await apiHandler.fetch(request);
  const requestUnread = bodyMode === "streaming" && !req.readableEnded;
  const responseHeaders = Object.fromEntries(response.headers.entries());
  res.writeHead(response.status, requestUnread ? { ...responseHeaders, connection: "close" } : responseHeaders);
  if (response.body === null) {
    res.end();
    if (requestUnread) req.destroy();
    return;
  }
  for await (const chunk of response.body) {
    if (!res.write(chunk)) {
      await new Promise((resolve) => {
        const done = () => {
          res.off("drain", done);
          res.off("close", done);
          resolve();
        };
        res.once("drain", done);
        res.once("close", done);
      });
    }
  }
  res.end();
  if (requestUnread) req.destroy();
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/client/connection/src/loopback-hostname.ts
function isLoopbackHostname(hostname) {
  if (hostname === "localhost" || hostname === "[::1]") return true;
  const parts = hostname.split(".");
  return parts.length === 4 && parts[0] === "127" && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/client/connection/src/api-request-trust.ts
function header(headers, name2) {
  if (headers instanceof Headers) return headers.get(name2) ?? void 0;
  const value = headers[name2];
  return typeof value === "string" ? value : void 0;
}
function parseAuthority(authority) {
  try {
    return new URL(`http://${authority}`);
  } catch {
    return void 0;
  }
}
function assertTrustedAuthority(entry) {
  const entryUrl = parseAuthority(entry);
  if (entryUrl !== void 0 && canonicalAuthority(entry, entryUrl) === entry.toLowerCase()) return;
  throw new Error(`client-connection: trustedHosts entry ${JSON.stringify(entry)} is not a bare host[:port] authority`);
}
function canonicalAuthority(entry, entryUrl) {
  const port = entryUrl.port !== "" ? entryUrl.port : new URL(`https://${entry}`).port;
  return port === "" ? entryUrl.hostname : `${entryUrl.hostname}:${port}`;
}
function isTrustedAuthority(hostUrl, trustedHosts) {
  return trustedHosts.some((entry) => {
    const entryUrl = parseAuthority(entry);
    if (entryUrl === void 0) return false;
    return canonicalAuthority(entry, entryUrl) === entryUrl.hostname ? entryUrl.hostname === hostUrl.hostname : entryUrl.host === hostUrl.host;
  });
}
function isTrustedApiRequest(request, trustedHosts) {
  const host = header(request.headers, "host");
  if (host === void 0) return false;
  const hostUrl = parseAuthority(host);
  if (hostUrl === void 0) return false;
  if (!isLoopbackHostname(hostUrl.hostname) && !isTrustedAuthority(hostUrl, trustedHosts)) return false;
  if (header(request.headers, "sec-fetch-site") === "cross-site") return false;
  const origin = header(request.headers, "origin");
  if (origin === void 0) return true;
  try {
    return new URL(origin).host === hostUrl.host;
  } catch {
    return false;
  }
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/client/connection/src/browser-auth.ts
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { credentialKey } from "@deepseek-ai/dsh-credentials";
var AUTH_RECORD_KEY = credentialKey("client-connection", "browser-session");
var DAY_MILLISECONDS = 24 * 60 * 60 * 1e3;
var SECRET_BYTES = 32;
var TOKEN_QUERY = "token";
var COOKIE_PREFIX = "dsh-auth-";
var COOKIE_PAYLOAD_VERSION = 1;
var STORED_SECRET_VERSION = 1;
var BASE64URL_PATTERN = /^[A-Za-z0-9_-]*$/;
var PROCESS_LAUNCH_TOKENS = /* @__PURE__ */ new WeakMap();
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function encodeBase64Url(value) {
  return Buffer.from(value).toString("base64").replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}
function decodeBase64Url(value) {
  if (!BASE64URL_PATTERN.test(value) || value.length % 4 === 1) return void 0;
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const decoded = Buffer.from(value.replaceAll("-", "+").replaceAll("_", "/") + padding, "base64");
  return encodeBase64Url(decoded) === value ? decoded : void 0;
}
function processLaunchToken(owner) {
  const existing = PROCESS_LAUNCH_TOKENS.get(owner);
  if (existing !== void 0) return existing;
  const created = encodeBase64Url(randomBytes(SECRET_BYTES));
  PROCESS_LAUNCH_TOKENS.set(owner, created);
  return created;
}
function header2(headers, name2) {
  if (headers instanceof Headers) return headers.get(name2) ?? void 0;
  const value = headers[name2];
  return typeof value === "string" ? value : void 0;
}
function requestAuthority(headers) {
  const host = header2(headers, "host");
  if (host === void 0) return void 0;
  try {
    return new URL(`http://${host}`).host;
  } catch {
    return void 0;
  }
}
function canonicalSecret(value) {
  if (typeof value !== "string") return void 0;
  const decoded = decodeBase64Url(value);
  if (decoded === void 0 || decoded.byteLength !== SECRET_BYTES) return void 0;
  return decoded;
}
function storedSecret(record) {
  if (record === void 0) return void 0;
  if (record.kind !== "grant" || !isRecord(record.payload) || record.payload.version !== STORED_SECRET_VERSION) {
    throw new Error("client-connection: browser-session credential record has an unsupported format");
  }
  const secret = canonicalSecret(record.payload.secret);
  if (secret === void 0) {
    throw new Error("client-connection: browser-session credential record has an invalid secret");
  }
  return secret;
}
function tokenMatches(actual, expected) {
  const actualBytes = Buffer.from(actual, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  return actualBytes.byteLength === expectedBytes.byteLength && timingSafeEqual(actualBytes, expectedBytes);
}
function cookieName(authority) {
  return COOKIE_PREFIX + encodeBase64Url(createHash("sha256").update(authority).digest());
}
function cookieValue(headerValue, name2) {
  for (const segment of headerValue.split(";")) {
    const at = segment.indexOf("=");
    if (at === -1 || segment.slice(0, at).trim() !== name2) continue;
    return segment.slice(at + 1).trim();
  }
  return void 0;
}
function sessionCookie(name2, value, expiresAt, maxAgeSeconds) {
  return `${name2}=${value}; Max-Age=${String(maxAgeSeconds)}; Path=/; Expires=${new Date(expiresAt).toUTCString()}; HttpOnly; SameSite=Strict`;
}
function signature(secret, body) {
  return createHmac("sha256", secret).update(body).digest();
}
function encodeCookie(payload, secret) {
  const body = encodeBase64Url(Buffer.from(JSON.stringify(payload), "utf8"));
  return `v1.${body}.${encodeBase64Url(signature(secret, body))}`;
}
function decodeCookie(value, secret) {
  const parts = value.split(".");
  const [version, body, encodedSignature] = parts;
  if (parts.length !== 3 || version !== "v1" || body === void 0 || encodedSignature === void 0) {
    return void 0;
  }
  const actualSignature = decodeBase64Url(encodedSignature);
  if (actualSignature === void 0) return void 0;
  const expectedSignature = signature(secret, body);
  if (actualSignature.byteLength !== expectedSignature.byteLength || !timingSafeEqual(actualSignature, expectedSignature)) return void 0;
  let decoded;
  try {
    const bodyBytes = decodeBase64Url(body);
    if (bodyBytes === void 0) return void 0;
    decoded = JSON.parse(bodyBytes.toString("utf8"));
  } catch {
    return void 0;
  }
  if (!isRecord(decoded) || decoded.version !== COOKIE_PAYLOAD_VERSION || typeof decoded.authority !== "string" || !Number.isSafeInteger(decoded.issuedAt) || !Number.isSafeInteger(decoded.expiresAt)) return void 0;
  return decoded;
}
async function initializeSecret(credentials) {
  const generated = {
    version: STORED_SECRET_VERSION,
    secret: encodeBase64Url(randomBytes(SECRET_BYTES))
  };
  const record = await credentials.modifyRecord(AUTH_RECORD_KEY, (current) => {
    if (current !== void 0) {
      storedSecret(current);
      return Promise.resolve(void 0);
    }
    return Promise.resolve({ kind: "grant", payload: generated });
  });
  const secret = storedSecret(record);
  if (secret === void 0) {
    throw new Error("client-connection: browser-session credential record was not created");
  }
  return secret;
}
var BrowserAuth = class _BrowserAuth {
  constructor(processOwner, secret, maxAgeDays) {
    this.secret = secret;
    this.launchToken = processLaunchToken(processOwner);
    this.maxAgeMilliseconds = maxAgeDays * DAY_MILLISECONDS;
    if (!Number.isSafeInteger(this.maxAgeMilliseconds) || !Number.isSafeInteger(Date.now() + this.maxAgeMilliseconds)) {
      throw new Error("client-connection: cookieMaxAgeDays exceeds the safe timestamp range");
    }
  }
  secret;
  launchToken;
  maxAgeMilliseconds;
  /**
   * Initialize browser authentication and create its durable signing secret
   * when this Harness home has none.
   * @param processOwner - root application context retaining one token across Connection reloads.
   * @param credentials - persistent credential provider for the Web profile.
   * @param maxAgeDays - positive absolute browser-cookie lifetime in days.
   * @returns initialized authentication owner with the process owner's launch token.
   */
  static async create(processOwner, credentials, maxAgeDays, lifetime = "persistent") {
    const stored = await initializeSecret(credentials);
    const secret = lifetime === "process" ? createHmac("sha256", stored).update(`sep-process-cookie:${processLaunchToken(processOwner)}`).digest() : stored;
    return new _BrowserAuth(processOwner, secret, maxAgeDays);
  }
  /**
   * Add this process's launch token to the ordinary application root URL.
   * @param baseUrl - canonical browser origin without credentials.
   * @returns root URL carrying the process token as its sole authentication input.
   */
  authenticatedUrl(baseUrl) {
    const url = new URL(baseUrl);
    url.pathname = "/";
    url.search = "";
    url.hash = "";
    url.searchParams.set(TOKEN_QUERY, this.launchToken);
    return url.href;
  }
  /**
   * Authenticate an index request. A valid root query token mints the cookie
   * and redirects to clean `/`; a valid cookie lets the caller serve the
   * index; every other request receives the same minimal 401 response.
   * @param req - incoming root or configured-index request.
   * @param res - response owned when this method returns false.
   * @returns true only when the caller may serve index.html.
   */
  authorizeIndex(req, res) {
    const url = new URL(req.url ?? "/", "http://dsh.invalid");
    const tokens = url.searchParams.getAll(TOKEN_QUERY);
    if (tokens.length > 0) {
      const authority = requestAuthority(req.headers);
      if (req.method === "GET" && url.pathname === "/" && tokens.length === 1 && authority !== void 0 && tokenMatches(tokens.join(""), this.launchToken)) {
        const issuedAt = Date.now();
        const expiresAt = issuedAt + this.maxAgeMilliseconds;
        const value = encodeCookie({
          version: COOKIE_PAYLOAD_VERSION,
          authority,
          issuedAt,
          expiresAt
        }, this.secret);
        res.writeHead(303, {
          "cache-control": "no-store",
          "location": "/",
          "referrer-policy": "no-referrer",
          "set-cookie": sessionCookie(
            cookieName(authority),
            value,
            expiresAt,
            Math.floor(this.maxAgeMilliseconds / 1e3)
          )
        });
        res.end();
        return false;
      }
      if (req.method === "GET" && url.pathname === "/" && this.isAuthenticated(req)) {
        res.writeHead(303, {
          "cache-control": "no-store",
          "location": "/",
          "referrer-policy": "no-referrer"
        });
        res.end();
        return false;
      }
      this.writeUnauthorized(req, res);
      return false;
    }
    if (this.isAuthenticated(req)) return true;
    this.writeUnauthorized(req, res);
    return false;
  }
  /**
   * Verify the authority-bound browser cookie on a Host request.
   * @param request - request headers carrying Host and Cookie.
   * @returns true only for an unexpired cookie signed by this activation's loaded secret.
   */
  isAuthenticated(request) {
    const authority = requestAuthority(request.headers);
    const rawCookie = header2(request.headers, "cookie");
    if (authority === void 0 || rawCookie === void 0) return false;
    const value = cookieValue(rawCookie, cookieName(authority));
    if (value === void 0) return false;
    const payload = decodeCookie(value, this.secret);
    if (payload === void 0 || payload.authority !== authority) return false;
    const now = Date.now();
    return payload.issuedAt <= now && payload.expiresAt > now && payload.expiresAt > payload.issuedAt && payload.expiresAt - payload.issuedAt <= this.maxAgeMilliseconds;
  }
  writeUnauthorized(req, res) {
    res.writeHead(401, {
      "cache-control": "no-store",
      "content-type": "text/plain; charset=utf-8"
    });
    res.end(req.method === "HEAD" ? void 0 : "dsh web authentication required; reopen the URL printed by dsh web.\n");
  }
};

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/client/connection/src/rpc-host.ts
import { Service } from "@deepseek-ai/cordis";

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/client/connection/src/rpc.ts
function RpcId(id) {
  return id;
}
function transportError(error) {
  return {
    ok: false,
    error: {
      code: "gateway/internal",
      message: error instanceof Error ? error.message : String(error),
      details: {}
    }
  };
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/client/connection/src/rpc-schema.ts
import { z } from "zod";
var rpcIdSchema = z.string();
var rpcErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.string(), z.unknown())
});
function rpcResultSchema(value) {
  return z.union([
    z.object({ ok: z.literal(true), value }),
    z.object({ ok: z.literal(false), error: rpcErrorSchema })
  ]);
}
var clientRequestSchema = z.object({
  type: z.literal("client-request"),
  rpcId: rpcIdSchema,
  method: z.string(),
  payload: z.unknown()
});
var serverResponseSchema = z.object({
  type: z.literal("server-response"),
  rpcId: rpcIdSchema,
  result: rpcResultSchema(z.unknown().optional())
});
var rpcMessageSchema = z.discriminatedUnion("type", [
  clientRequestSchema,
  serverResponseSchema
]);

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/client/connection/src/rpc-host.ts
var INVALID_REQUEST_RPC_ID = RpcId("invalid-request");
var CHANNEL_PATTERN = /^\/[A-Za-z0-9._~-]+$/;
var ENDPOINT_SEGMENT_PATTERN = /^[A-Za-z0-9_$.-]+$/;
var HostConnectionService = class extends Service {
  /**
   * Provide the Host half over the active HTTP server.
   * @param ctx - owning Connection plugin context.
   * @param trustedHosts - deployment authorities accepted by the Host/Origin fence.
   * @param browserAuth - process token and persistent browser-session owner.
   */
  constructor(ctx, trustedHosts, browserAuth) {
    super(ctx, "connection");
    this.trustedHosts = trustedHosts;
    this.browserAuth = browserAuth;
  }
  trustedHosts;
  browserAuth;
  interceptors = /* @__PURE__ */ new Map();
  fetchRoutes = /* @__PURE__ */ new Map();
  /** Generic channel registry scoped to the Context reading this service. */
  get rpc() {
    const owner = this.ctx;
    return {
      handle: (channel, handler) => this.register(owner, channel, handler),
      intercept: (channel, matches, handler) => this.registerInterceptor(owner, channel, matches, handler)
    };
  }
  /** Exact Fetch-route registry scoped to the Context reading this service. */
  get fetch() {
    const owner = this.ctx;
    return {
      register: (route) => this.registerFetchRoute(owner, route)
    };
  }
  /** Apply the configured Host/Origin fence, then browser authentication. */
  requestRejection(request) {
    if (!isTrustedApiRequest(request, this.trustedHosts)) return 403;
    return this.browserAuth.isAuthenticated(request) ? void 0 : 401;
  }
  /** Authenticate an index request through the process-token exchange or cookie. */
  authorizeIndex(request, response) {
    return this.browserAuth.authorizeIndex(request, response);
  }
  /** Add this process's launch token to the clean application URL. */
  authenticatedUrl(baseUrl) {
    return this.browserAuth.authenticatedUrl(baseUrl);
  }
  /**
   * Compose one shared-channel Fetch handler from exact routes and its interceptor.
   * @param channel - shared channel mounted by Connection.
   * @returns Fetch handler that selects one owner or returns 404.
   */
  createSharedFetchHandler(channel) {
    return {
      requestBodyMode: ({ method, url }) => {
        const route = this.fetchRoutes.get(url.pathname);
        return route?.methods.has(method) === true ? route.requestBody : "buffered";
      },
      fetch: (request) => {
        const pathname = new URL(request.url).pathname;
        const route = this.fetchRoutes.get(pathname);
        if (route?.methods.has(request.method) === true) return route.fetch(request);
        const endpoint = endpointFromPath(channel, pathname);
        const interceptor = this.interceptors.get(channel);
        if (endpoint === void 0 || interceptor === void 0 || !interceptor.matches(endpoint)) {
          return Promise.resolve(new Response("not found", { status: 404 }));
        }
        return interceptor.fetchHandler.fetch(request);
      }
    };
  }
  registerFetchRoute(owner, route) {
    assertFetchRoute(route);
    const registered = {
      methods: new Set(route.methods),
      requestBody: route.requestBody,
      fetch: route.fetch
    };
    return owner.effect(() => {
      if (this.fetchRoutes.has(route.path)) {
        throw new Error(`connection: exact Fetch route ${JSON.stringify(route.path)} is already registered`);
      }
      this.fetchRoutes.set(route.path, registered);
      return () => {
        this.fetchRoutes.delete(route.path);
      };
    }, `client-connection: ${route.path} Fetch route`);
  }
  register(owner, channel, handler) {
    assertChannel(channel);
    const fetchHandler = rpcFetchHandler(channel, handler);
    const route = {
      kind: "prefix",
      path: channel,
      handler: async (req, res) => {
        const rejection = this.requestRejection(req);
        if (rejection !== void 0) {
          res.writeHead(rejection);
          res.end(rejection === 401 ? "unauthorized" : "forbidden");
          return;
        }
        await bridge(req, res, fetchHandler);
      }
    };
    return owner.effect(
      () => owner.webServer.register(route),
      `client-connection: ${channel} rpc channel`
    );
  }
  registerInterceptor(owner, channel, matches, handler) {
    if (channel !== API_PATH) {
      throw new Error(`connection: invalid shared RPC channel ${JSON.stringify(channel)}`);
    }
    const interceptor = {
      matches,
      fetchHandler: rpcFetchHandler(channel, handler)
    };
    return owner.effect(() => {
      if (this.interceptors.has(channel)) {
        throw new Error(`connection: shared RPC channel ${JSON.stringify(channel)} already has an interceptor`);
      }
      this.interceptors.set(channel, interceptor);
      return () => {
        this.interceptors.delete(channel);
      };
    }, `client-connection: ${channel} rpc interceptor`);
  }
};
function rpcFetchHandler(channel, handler) {
  return {
    requestBodyMode: () => "buffered",
    async fetch(request) {
      const endpoint = endpointFromPath(channel, new URL(request.url).pathname);
      if (request.method !== "POST" || endpoint === void 0) {
        return new Response("not found", { status: 404 });
      }
      const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
      if (mediaType !== "application/json") {
        return new Response("content type must be application/json", { status: 415 });
      }
      let body;
      try {
        body = await request.json();
      } catch {
        return new Response("body is not JSON", { status: 400 });
      }
      const envelope = clientRequestSchema.safeParse(body);
      if (!envelope.success) {
        return invalidEnvelopeResponse(body, envelope.error.issues);
      }
      const message = envelope.data;
      if (message.method !== endpoint) {
        return errorResponse(message.rpcId, {
          code: "gateway/bad-request",
          message: `method ${JSON.stringify(message.method)} does not match endpoint ${JSON.stringify(endpoint)}`,
          details: { issues: [] }
        });
      }
      try {
        const result = await handler(endpoint, message.payload, request.signal);
        return fullResponse(message.rpcId, result);
      } catch (error) {
        return new Response(`handler failure: ${String(error)}`, { status: 500 });
      }
    }
  };
}
function invalidEnvelopeResponse(body, issues) {
  const rawId = body?.rpcId;
  const rpcId = typeof rawId === "string" ? RpcId(rawId) : INVALID_REQUEST_RPC_ID;
  return errorResponse(rpcId, {
    code: "gateway/bad-request",
    message: "invalid client-request message",
    details: { issues }
  });
}
function endpointFromPath(channel, pathname) {
  if (!pathname.startsWith(`${channel}/`)) return void 0;
  const endpoint = pathname.slice(channel.length + 1);
  const segments = endpoint.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === ".." || !ENDPOINT_SEGMENT_PATTERN.test(segment))) {
    return void 0;
  }
  return endpoint;
}
function errorResponse(rpcId, error) {
  return fullResponse(rpcId, { ok: false, error });
}
function fullResponse(rpcId, result) {
  const body = { type: "server-response", rpcId, result };
  return Response.json(body);
}
function assertChannel(channel) {
  if (!CHANNEL_PATTERN.test(channel) || channel === "/api") {
    throw new Error(`connection: invalid or reserved RPC channel ${JSON.stringify(channel)}`);
  }
}
function assertFetchRoute(route) {
  if (endpointFromPath(API_PATH, route.path) === void 0) {
    throw new Error(`connection: invalid exact Fetch route ${JSON.stringify(route.path)}`);
  }
  if (route.methods.length === 0) {
    throw new Error(`connection: exact Fetch route ${JSON.stringify(route.path)} declares no methods`);
  }
  const methods = new Set(route.methods);
  if (methods.size !== route.methods.length) {
    throw new Error(`connection: exact Fetch route ${JSON.stringify(route.path)} repeats a method`);
  }
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/client/connection/src/recovery-config.ts
import z2 from "@deepseek-ai/schemastery";
var MAX_TIMER_MS = 2147483647;
var ConnectionRecoveryConfigSchema = z2.object({
  backoffBaseMs: z2.natural().min(1).max(MAX_TIMER_MS).default(500),
  backoffFactor: z2.number().min(1).max(Number.MAX_VALUE).default(2),
  backoffMaxMs: z2.natural().min(1).max(MAX_TIMER_MS).default(1e4),
  generationReadyWarnMs: z2.natural().min(1).max(MAX_TIMER_MS).default(3e3),
  generationReadyTimeoutMs: z2.natural().min(1).max(MAX_TIMER_MS).default(15e3)
});
function resolveConnectionConfig(config = {}) {
  const resolved = ConnectionRecoveryConfigSchema(config);
  if (!Number.isFinite(resolved.backoffFactor)) {
    throw new RangeError("connection recovery backoffFactor must be finite");
  }
  return resolved;
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/client/connection/src/index.ts
var name = "client-connection";
var REQUEST_ENVELOPE_HEADROOM_BYTES = 1024 * 1024;
function assertImageBodyCapacity(ctx, maxRequestBodyBytes) {
  const attachments = ctx.get("attachments");
  if (attachments === void 0) return;
  const requiredImageBodyBytes = Math.ceil(
    attachments.imageLimits.maxMessageImageBytes * 4 / 3
  ) + REQUEST_ENVELOPE_HEADROOM_BYTES;
  if (maxRequestBodyBytes < requiredImageBodyBytes) {
    throw new Error(
      `client-connection maxRequestBodyBytes (${String(maxRequestBodyBytes)}) must be at least ${String(requiredImageBodyBytes)} for the configured aggregate image limit`
    );
  }
}
var inject = ["credentials"];
var Config = z3.object({
  recovery: ConnectionRecoveryConfigSchema.default({}),
  trustedHosts: z3.array(String).default([]),
  cookieMaxAgeDays: z3.natural().min(1).default(30),
  cookieLifetime: z3.union(["persistent", "process"]).default("persistent"),
  maxRequestBodyBytes: z3.natural().min(1).default(DEFAULT_MAX_REQUEST_BODY_BYTES)
});
async function apply(ctx, config) {
  const recovery = resolveConnectionConfig(config?.recovery);
  const trustedHosts = config?.trustedHosts ?? [];
  const cookieMaxAgeDays = config?.cookieMaxAgeDays ?? 30;
  const maxRequestBodyBytes = config?.maxRequestBodyBytes ?? DEFAULT_MAX_REQUEST_BODY_BYTES;
  for (const entry of trustedHosts) assertTrustedAuthority(entry);
  assertImageBodyCapacity(ctx, maxRequestBodyBytes);
  const connection = new HostConnectionService(
    ctx,
    trustedHosts,
    await BrowserAuth.create(ctx.root, ctx.credentials, cookieMaxAgeDays, config?.cookieLifetime)
  );
  ctx.inject(["webServer"], (webCtx) => {
    assertImageBodyCapacity(webCtx, maxRequestBodyBytes);
    webCtx.on("webserver/index-inject", (table) => {
      table.push({ kind: "global", name: "__DSH_CONNECTION_RECOVERY__", value: recovery });
    });
    const fetchHandler = connection.createSharedFetchHandler(API_PATH);
    const route = {
      kind: "prefix",
      path: API_PATH,
      handler: async (req, res) => {
        const rejection = connection.requestRejection(req);
        if (rejection !== void 0) {
          res.writeHead(rejection);
          res.end(rejection === 401 ? "unauthorized" : "forbidden");
          return;
        }
        await webCtx.waterfall("connection/request", req, res, () => bridge(req, res, fetchHandler, maxRequestBodyBytes));
      }
    };
    webCtx.effect(() => webCtx.webServer.register(route), "client-connection: /api route");
  });
  ctx.inject(["attachments"], (attachmentCtx) => {
    assertImageBodyCapacity(attachmentCtx, maxRequestBodyBytes);
  });
}
export {
  API_PATH,
  Config,
  HostConnectionService,
  RpcId,
  apply,
  clientRequestSchema,
  inject,
  name,
  rpcErrorSchema,
  rpcIdSchema,
  rpcMessageSchema,
  rpcResultSchema,
  serverResponseSchema,
  transportError
};
//# sourceMappingURL=index.js.map
