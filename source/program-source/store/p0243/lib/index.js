// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/session/session-persistence-jsonl/src/index.ts
import z from "@deepseek-ai/schemastery";
import {
  SessionFormatUnsupportedMigrationError as SessionFormatUnsupportedMigrationError2,
  sessionFormatCatalog as sessionFormatCatalog2
} from "@deepseek-ai/dsh-session-format-catalog";
import { readdirSync, lstatSync, realpathSync } from "node:fs";
import { open as open2, mkdir as mkdir2, readdir, realpath, link, rm as rm2, stat as stat3, truncate } from "node:fs/promises";
import { dirname as dirname2, join as join5, resolve as resolve2 } from "node:path";
import { performance as performance2 } from "node:perf_hooks";
import { scheduler as scheduler2 } from "node:timers/promises";
import { randomBytes as randomBytes2 } from "node:crypto";
import {
  SessionPersistence,
  SessionPersistenceRevision as SessionPersistenceRevision2,
  SessionFormatUnsupportedError as SessionFormatUnsupportedError2,
  SessionPersistenceCorruptionError,
  SessionAlreadyExistsError as SessionAlreadyExistsError2,
  SessionPersistenceNotFoundError as SessionPersistenceNotFoundError2,
  assertStoredId,
  materializeCreateHeader,
  sessionFormatVersionRefusal as sessionFormatVersionRefusal2,
  validateStoredEvents as validateStoredEvents2
} from "@deepseek-ai/dsh-session-persistence";

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/session/session-persistence-jsonl/src/storage.ts
import { errorChain } from "@deepseek-ai/dsh-llm";
import {
  assertContiguous,
  SessionAlreadyExistsError,
  materializeAppendBatch,
  SessionAlreadyOwnedError,
  SessionHandleClosedError,
  SessionPersistenceNotFoundError,
  SessionPersistenceRevision,
  SessionReadOnlyError
} from "@deepseek-ai/dsh-session-persistence";
var LIVE_WRITE_BATCH_MAX_DELAY_MS = 200;
var JsonlSessionHandle = class {
  constructor(storage, id, header, access, state, lease) {
    this.storage = storage;
    this.id = id;
    this.header = header;
    this.access = access;
    this.state = state;
    this.lease = lease;
  }
  storage;
  id;
  header;
  access;
  state;
  lease;
  chain = Promise.resolve();
  closing;
  observedLength = 0;
  /** Routed live events awaiting their batching deadline (persistence-owned copies). */
  buffered = [];
  batchTimer;
  /** Set when a drain failed; the automatic timer stays quiet until the next drain. */
  drainPaused = false;
  draining;
  /** Exact fork-inherited prefix length stored with this session's log. */
  get inheritedEventCount() {
    return this.state.inheritedEventCount;
  }
  /**
   * Read a slice of the valid contiguous logical log; see the seam contract.
   * @param offset - first logical seq to include (default 0).
   * @param length - maximum events returned (default: the rest).
   * @param options - optional cancellation.
   * @returns a slice carrying the aliasing state established by its producer.
   */
  async read(offset = 0, length = Number.MAX_SAFE_INTEGER, options) {
    this.assertOpen("read");
    this.storage.assertRootAvailable();
    if (!Number.isSafeInteger(offset) || offset < 0) {
      throw new TypeError(`read offset must be a non-negative safe integer, got ${String(offset)}`);
    }
    if (!Number.isSafeInteger(length) || length < 0) {
      throw new TypeError(`read length must be a non-negative safe integer, got ${String(length)}`);
    }
    options?.signal?.throwIfAborted();
    let result;
    const primed = this.state.primed;
    if (primed !== void 0) {
      if (this.access === "write") {
        result = this.readPrimed(primed, offset, length);
      } else {
        const currentPath = await this.storage.resolveCurrentLog(this.id, options?.signal);
        if (currentPath === void 0) {
          result = this.readPrimed(primed, offset, length);
        } else {
          this.state.primed = void 0;
          result = await this.readCurrent(currentPath, offset, length, options?.signal);
        }
      }
    } else if (this.access === "write" && !this.state.materialized) {
      result = { eventState: "detached", events: [] };
    } else {
      const currentPath = await this.storage.resolveCurrentLog(this.id, options?.signal);
      if (currentPath !== void 0) {
        result = await this.readCurrent(currentPath, offset, length, options?.signal);
      } else if (this.storage.hasPendingSession(this.id)) {
        result = { eventState: "detached", events: [] };
      } else {
        throw new SessionPersistenceNotFoundError(this.id);
      }
    }
    return result;
  }
  /** Read one slice from the prepared historical prefix retained by this handle. */
  readPrimed(source, offset, length) {
    this.observedLength = Math.max(this.observedLength, source.events.length);
    return { eventState: source.eventState, events: source.events.slice(offset, offset + length) };
  }
  /** Read one current physical generation and enforce this handle's monotonic view. */
  async readCurrent(path, offset, length, signal) {
    const source = await this.storage.readStoredLog(path, this.id, signal);
    if (source.events.length < this.observedLength) {
      throw new Error(`session "${this.id}": stored log shrank below a previously observed prefix (${source.events.length} < ${this.observedLength})`);
    }
    this.observedLength = source.events.length;
    return {
      eventState: source.eventState,
      events: source.events.slice(offset, offset + length)
    };
  }
  /**
   * Durably append a contiguous batch; see the seam contract.
   * @param events - the contiguous batch in seq order.
   * @param options - optional cancellation observed before the write starts.
   */
  async append(events, options) {
    this.assertOpen("append");
    const batch = materializeAppendBatch(events);
    return this.run("append", async () => {
      options?.signal?.throwIfAborted();
      await this.persistContiguous(batch);
    });
  }
  /**
   * Durability barrier; materializes the artifact when nothing has been
   * appended yet, so an explicitly flushed empty session survives this process.
   * @param options - optional cancellation observed before the barrier starts.
   */
  flush(options) {
    return this.run("flush", async () => {
      options?.signal?.throwIfAborted();
      if (this.access !== "write") throw new SessionReadOnlyError(this.id, "flush");
      if (this.state.materialized) return;
      await this.ensureLease();
      await this.storage.persistHeader(this.header, this.state.inheritedEventCount);
      this.state.materialized = true;
    });
  }
  /**
   * Release the handle; see the seam contract. Idempotent and uncancellable.
   * A write handle first drains its routed live buffer through the still-open
   * storage, so backend teardown loses nothing regardless of which fiber
   * unwinds first; a drain or lock-release failure still frees the in-process
   * claim, then rejects — both failures together reject as one
   * `AggregateError`.
   * @returns settlement of the release.
   */
  close() {
    return this.closing ??= (async () => {
      let drainFailure;
      for (; ; ) {
        try {
          await this.drainLive();
        } catch (error) {
          drainFailure = error;
          break;
        }
        await this.chain;
        if (this.buffered.length === 0) break;
      }
      await this.chain;
      const failures = [];
      if (drainFailure !== void 0) {
        failures.push(drainFailure instanceof Error ? drainFailure : new Error(errorChain(drainFailure)));
      }
      try {
        await this.lease?.release();
      } catch (releaseFailure) {
        failures.push(releaseFailure instanceof Error ? releaseFailure : new Error(errorChain(releaseFailure)));
      }
      this.storage.releaseHandle(this, this.state.materialized);
      if (failures.length > 1) throw new AggregateError(failures, `session "${this.id}": close failed to drain and to release its write lock`);
      if (failures[0] !== void 0) throw failures[0];
    })();
  }
  /** `await using` support: delegates to {@link close}. */
  [Symbol.asyncDispose]() {
    return this.close();
  }
  /**
   * Buffer one published live session event and arm the bounded batching
   * window when it is idle. The routing installer is the only caller.
   * @param event - the live event, retained as a persistence-owned copy.
   * @param reportBackgroundFailure - observes a deadline-driven drain failure
   *   (the events stay buffered; the next {@link drainLive} retries loudly).
   */
  enqueueLive(event, reportBackgroundFailure) {
    this.buffered.push(structuredClone(event));
    if (this.batchTimer !== void 0 || this.drainPaused) return;
    this.batchTimer = setTimeout(() => {
      this.batchTimer = void 0;
      this.drainLive().catch(reportBackgroundFailure);
    }, LIVE_WRITE_BATCH_MAX_DELAY_MS);
  }
  /**
   * Durably drain the routed live buffer through the mutation chain;
   * concurrent callers join one drain, and a failure retains the batch in
   * order so `session/flush` can retry and reject loudly.
   */
  drainLive() {
    return this.draining ??= this.drainBuffered().finally(() => {
      this.draining = void 0;
    });
  }
  async drainBuffered() {
    if (this.batchTimer !== void 0) {
      clearTimeout(this.batchTimer);
      this.batchTimer = void 0;
    }
    this.drainPaused = false;
    while (this.buffered.length > 0) {
      await this.enqueueChain(async () => {
        const batch = this.buffered.splice(0);
        try {
          await this.persistContiguous(materializeAppendBatch(batch));
        } catch (error) {
          this.buffered = batch.concat(this.buffered);
          this.drainPaused = true;
          throw error;
        }
      });
    }
  }
  /** The shared durable-append body: contiguity, ownership, torn-tail repair, storage write, state advance. */
  async persistContiguous(batch) {
    if (this.access !== "write") throw new SessionReadOnlyError(this.id, "append");
    if (batch.length === 0) return;
    await this.ensureLease();
    assertContiguous(this.id, batch, this.state.cursor);
    if (this.state.tornTruncateTo !== void 0) {
      await this.storage.truncateTornTail(this.header, this.state.tornTruncateTo);
      this.state.tornTruncateTo = void 0;
    }
    if (this.state.recoveredTail !== void 0) {
      if (this.state.recoveredTail.length > 0) {
        await this.storage.persistBatch(this.header, this.state.recoveredTail, this.state.materialized, this.state.inheritedEventCount);
      }
      this.state.recoveredTail = void 0;
    }
    await this.storage.persistBatch(this.header, batch, this.state.materialized, this.state.inheritedEventCount);
    this.state.materialized = true;
    this.state.cursor += batch.length;
    this.state.primed = void 0;
    this.observedLength = this.state.cursor;
  }
  /**
   * Hold the cross-process write lock before this session's first durable
   * write. An open write handle holds it from construction; a create handle
   * acquires it here — immediately before the first log bytes publish — and
   * keeps it through close even when materialization then fails, so a
   * materializing session stays exclusively owned across retries.
   */
  async ensureLease() {
    this.lease ??= await this.storage.acquireWriteLease(this.header);
  }
  /** Serialize one operation onto the chain without the closed-handle refusal (drain-from-close). */
  enqueueChain(op) {
    const next = this.chain.then(op);
    this.chain = next.catch(() => {
    });
    return next;
  }
  /** Serialize one public mutating operation onto this handle's chain. */
  async run(operation, op) {
    this.assertOpen(operation);
    return this.enqueueChain(async () => {
      this.assertOpen(operation);
      this.storage.assertRootAvailable();
      return op();
    });
  }
  assertOpen(operation) {
    if (this.closing !== void 0) throw new SessionHandleClosedError(this.id, operation);
  }
};
var JsonlBackendTracker = class {
  /** @param name - backend label used in in-memory revision tokens and teardown errors. */
  constructor(name) {
    this.name = name;
  }
  name;
  /** Every open handle; teardown closes what remains. */
  openHandles = /* @__PURE__ */ new Set();
  /** `null` marks a claim whose handle is still being constructed. */
  writers = /* @__PURE__ */ new Map();
  pending = /* @__PURE__ */ new Map();
  counter = 0;
  /**
   * Claim write ownership and record the created session as pending, making
   * it observable to this process before it materializes. Before
   * materialization this registration is the only guard — session ids do not
   * collide across processes, and no durable artifact exists for another
   * process to open; the handle takes the cross-process lock at its first
   * materializing write.
   * @param header - the validated detached header.
   * @param inheritedEventCount - the exact fork-inherited prefix length.
   * @throws {SessionAlreadyExistsError} when a concurrent create or an open
   *   write handle holds the id — for create, the duplicate is the fact.
   */
  registerCreated(header, inheritedEventCount) {
    if (this.writers.has(header.id)) throw new SessionAlreadyExistsError(header.id);
    this.writers.set(header.id, null);
    this.pending.set(header.id, {
      header,
      revision: SessionPersistenceRevision(`memory:${this.name}:${++this.counter}`),
      inheritedEventCount
    });
  }
  /**
   * Claim write ownership for an existing session.
   * @param id - the session to claim.
   * @throws {SessionAlreadyOwnedError} when an active write handle exists.
   */
  claimWrite(id) {
    if (this.writers.has(id)) throw new SessionAlreadyOwnedError(id);
    this.writers.set(id, null);
  }
  /**
   * Roll a failed write open back.
   * @param id - the session whose claim is dropped.
   */
  releaseClaim(id) {
    this.writers.delete(id);
  }
  /**
   * The pending entry for a created-but-unmaterialized session, if any.
   * @param id - the session to look up.
   * @returns the pending header and in-memory revision.
   */
  pendingOf(id) {
    return this.pending.get(id);
  }
  /**
   * Whether this process still tracks a created-but-unmaterialized session.
   * @param id - the session to test.
   * @returns true while the pending entry exists.
   */
  hasPending(id) {
    return this.pending.has(id);
  }
  /**
   * Iterate the pending sessions for listing.
   * @returns the pending entries, keyed by session id.
   */
  pendingEntries() {
    return this.pending.entries();
  }
  /**
   * Drop a pending entry once the session materialized durably.
   * @param id - the session that reached durable storage.
   */
  materialized(id) {
    this.pending.delete(id);
  }
  /**
   * Track one open handle for teardown and, for a write handle, bind it as
   * the session's live event route.
   * @param handle - the just-constructed handle.
   * @returns the same handle, for construction-site chaining.
   */
  adopt(handle) {
    this.openHandles.add(handle);
    if (handle.access === "write") this.writers.set(handle.id, handle);
    return handle;
  }
  /**
   * Release one handle's bookkeeping on close. A write handle drops its
   * ownership claim; a creator that never materialized leaves nothing behind —
   * the session never existed.
   * @param handle - the closing handle.
   * @param materialized - whether the session reached durable storage.
   */
  release(handle, materialized) {
    this.openHandles.delete(handle);
    if (handle.access !== "write") return;
    this.writers.delete(handle.id);
    if (!materialized) this.pending.delete(handle.id);
  }
  /**
   * Drain and flush every active write handle — the service-wide durability
   * barrier behind `SessionPersistence.flush`.
   * @throws {AggregateError} naming each session whose flush failed; the
   *   remaining handles still flush.
   */
  async flushAll() {
    const errors = [];
    for (const writer of [...this.writers.values()]) {
      if (writer === null) continue;
      try {
        await writer.drainLive();
        await writer.flush();
      } catch (error) {
        if (error instanceof SessionHandleClosedError) continue;
        errors.push(error);
      }
    }
    if (errors.length > 0) throw new AggregateError(errors, `${this.name} flush failed`);
  }
  /**
   * Install the backend's live session routing and teardown. Persistence
   * enforces one active write handle per id, so the listeners route published
   * sessions' events by id; the teardown effect closes every open handle —
   * close drains the routed buffer — and aggregates failures. This provider
   * owns no separate storage connection, so closing handles is the complete
   * teardown. Registrations are effects of the current fiber.
   * @param ctx - the backend's context.
   */
  install(ctx) {
    ctx.on("session/event", (session, event) => {
      this.writers.get(session.id)?.enqueueLive(event, (error) => {
        ctx.logger.warn(`session-persistence: background write for session "${session.id}" failed (buffered events retained): ${String(error)}`);
      });
    });
    ctx.on("session/flush", (session) => {
      const writer = this.writers.get(session.id);
      if (writer === null || writer === void 0) return void 0;
      return (async () => {
        await writer.drainLive();
        await writer.flush();
      })();
    });
    ctx.on("session/disposed", (session) => {
      const writer = this.writers.get(session.id);
      if (writer === null || writer === void 0) return;
      writer.close().catch((error) => {
        ctx.logger.warn(`session-persistence: final drain for session "${session.id}" failed: ${String(error)}`);
      });
    });
    ctx.effect(() => async () => {
      const errors = [];
      for (const handle of [...this.openHandles]) {
        try {
          await handle.close();
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length > 0) throw new AggregateError(errors, `${this.name} dispose failed`);
    }, `${this.name} open handles`);
  }
};

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/session/session-persistence-jsonl/src/lease.ts
import { mkdir, open, stat as stat2 } from "node:fs/promises";
import { join as join2, relative, isAbsolute } from "node:path";
import { tryLockExclusive } from "@deepseek-ai/node-addon-system/flock";
import { SessionAlreadyOwnedError as SessionAlreadyOwnedError2 } from "@deepseek-ai/dsh-session-persistence";

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/session/session-persistence-jsonl/src/win32.ts
import { createHash } from "node:crypto";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { join, parse, resolve, toNamespacedPath } from "node:path";
var MOVEFILE_WRITE_THROUGH = 8;
var WAIT_OBJECT_0 = 0;
var WAIT_TIMEOUT = 258;
var ERROR_FILE_NOT_FOUND = 2;
var ERROR_PATH_NOT_FOUND = 3;
var ERROR_ACCESS_DENIED = 5;
var ERROR_NOT_SAME_DEVICE = 17;
var ERROR_SHARING_VIOLATION = 32;
var ERROR_FILE_EXISTS = 80;
var ERROR_INVALID_NAME = 123;
var ERROR_ALREADY_EXISTS = 183;
var bindings;
async function win32() {
  if (bindings !== void 0) return bindings;
  const koffi = (await import("koffi")).default;
  const kernel32 = koffi.load("kernel32.dll");
  bindings = {
    moveFileExW: kernel32.func("__stdcall", "MoveFileExW", "int", ["str16", "str16", "uint"]),
    createSemaphoreW: kernel32.func("__stdcall", "CreateSemaphoreW", "intptr", ["void*", "int", "int", "str16"]),
    waitForSingleObject: kernel32.func("__stdcall", "WaitForSingleObject", "uint", ["intptr", "uint"]),
    releaseSemaphore: kernel32.func("__stdcall", "ReleaseSemaphore", "int", ["intptr", "int", "void*"]),
    closeHandle: kernel32.func("__stdcall", "CloseHandle", "int", ["intptr"]),
    getLastError: kernel32.func("__stdcall", "GetLastError", "uint", [])
  };
  return bindings;
}
function errnoCode(win32Code) {
  switch (win32Code) {
    case ERROR_FILE_NOT_FOUND:
    case ERROR_PATH_NOT_FOUND:
      return "ENOENT";
    case ERROR_ACCESS_DENIED:
      return "EACCES";
    case ERROR_NOT_SAME_DEVICE:
      return "EXDEV";
    case ERROR_SHARING_VIOLATION:
      return "EBUSY";
    case ERROR_FILE_EXISTS:
    case ERROR_ALREADY_EXISTS:
      return "EEXIST";
    case ERROR_INVALID_NAME:
      return "EINVAL";
    default:
      return "EIO";
  }
}
function win32Error(syscall, win32Code, path, dest) {
  const code = errnoCode(win32Code);
  const error = new Error(`${syscall} ${code} (Win32 ${win32Code}): ${path} -> ${dest}`);
  error.code = code;
  error.errno = win32Code;
  error.syscall = syscall;
  error.path = path;
  error.dest = dest;
  error.win32Code = win32Code;
  return error;
}
function isENOENT(error) {
  return error?.code === "ENOENT";
}
function isEEXIST(error) {
  return error?.code === "EEXIST";
}
async function assertDirectory(path) {
  try {
    const probe = path === parse(path).root ? path : toNamespacedPath(path);
    const info = await stat(probe);
    if (info.isDirectory()) return true;
    const error = new Error(`path exists but is not a directory: ${path}`);
    error.code = "ENOTDIR";
    error.path = path;
    throw error;
  } catch (error) {
    if (isENOENT(error)) return false;
    throw error;
  }
}
async function publishNewFileWin32(existing, replacement) {
  const api = await win32();
  const ok = api.moveFileExW(toNamespacedPath(existing), toNamespacedPath(replacement), MOVEFILE_WRITE_THROUGH);
  if (ok === 0) throw win32Error("MoveFileExW", api.getLastError(), existing, replacement);
}
async function acquireLockHandleWin32(path) {
  const api = await win32();
  const name = `Local\\dsh-session-lock-${createHash("sha256").update(resolve(path).toLowerCase()).digest("hex")}`;
  const handle = api.createSemaphoreW(null, 1, 1, name);
  if (handle === 0) throw win32Error("CreateSemaphoreW", api.getLastError(), path, name);
  const wait = api.waitForSingleObject(handle, 0);
  if (wait === WAIT_OBJECT_0) return handle;
  api.closeHandle(handle);
  if (wait === WAIT_TIMEOUT) throw win32Error("WaitForSingleObject", ERROR_SHARING_VIOLATION, path, name);
  throw win32Error("WaitForSingleObject", api.getLastError(), path, name);
}
async function releaseLockHandleWin32(handle) {
  const api = await win32();
  const released = api.releaseSemaphore(handle, 1, null);
  const closed = api.closeHandle(handle);
  if (released === 0 || closed === 0) throw win32Error("ReleaseSemaphore", api.getLastError(), `handle:${handle}`, `handle:${handle}`);
}
async function ensureDurableDirectoryWin32(target, requiredRoot) {
  const absolute = resolve(target);
  const root = requiredRoot === void 0 ? parse(absolute).root : resolve(requiredRoot);
  if (requiredRoot !== void 0 && absolute !== root && !absolute.startsWith(root + "\\")) throw new Error("SESSION_ROOT_ESCAPE");
  if (!await assertDirectory(root)) throw Object.assign(new Error("SESSION_ROOT_MISSING"), { code: "ENOENT" });
  const segments = absolute.slice(root.length).split(/[\\/]+/).filter((part) => part.length > 0);
  let current = root;
  for (const segment of segments) {
    const next = join(current, segment);
    if (!await assertDirectory(next)) await createLeafDirectoryWin32(current, next);
    current = next;
  }
}
async function createLeafDirectoryWin32(parent, target) {
  const staging = await mkdtemp(toNamespacedPath(join(parent, ".dsh-mkdir-")));
  try {
    await publishNewFileWin32(staging, target);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    if (isEEXIST(error) && await assertDirectory(target)) return;
    throw error;
  }
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/session/session-persistence-jsonl/src/lease.ts
var LEASE_FILENAME = "session.lock";
function isLockContention(error) {
  const code = error?.code;
  return code === "EAGAIN" || code === "EWOULDBLOCK";
}
var SessionWriteLease = class _SessionWriteLease {
  constructor(held) {
    this.held = held;
  }
  held;
  released = false;
  /**
   * Acquire the session directory's kernel write lock.
   * @param dir - the session's artifact directory (created if absent).
   * @param id - the session the lock guards, for error identities.
   * @param requiredRoot - an existing root which directory creation must not recreate.
   * @returns the held lock.
   * @throws {SessionAlreadyOwnedError} while another holder keeps the lock.
   */
  static async acquire(dir, id, requiredRoot) {
    const path = join2(dir, LEASE_FILENAME);
    if (requiredRoot === void 0) {
      await mkdir(dir, { recursive: true, mode: 448 });
    } else {
      const suffix = relative(requiredRoot, dir);
      if (isAbsolute(suffix) || suffix === ".." || suffix.startsWith("..\\") || suffix.startsWith("../")) throw new Error("SESSION_ROOT_ESCAPE");
      let current = requiredRoot;
      const rootInfo = await stat2(current);
      if (!rootInfo.isDirectory()) throw new Error("SESSION_ROOT_NOT_DIRECTORY");
      for (const part of suffix.split(/[\\/]/).filter(Boolean)) {
        current = join2(current, part);
        try {
          await mkdir(current, { mode: 448 });
        } catch (error) {
          if (error.code !== "EEXIST" || !(await stat2(current)).isDirectory()) throw error;
        }
      }
    }
    if (process.platform === "win32") {
      let handle;
      try {
        handle = await acquireLockHandleWin32(path);
      } catch (error) {
        if (error?.code === "EBUSY") throw new SessionAlreadyOwnedError2(id);
        throw error;
      }
      return new _SessionWriteLease({ kind: "win32", handle });
    }
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const handle = await open(path, "w");
      try {
        try {
          await tryLockExclusive(handle.fd);
        } catch (error) {
          if (isLockContention(error)) throw new SessionAlreadyOwnedError2(id);
          throw error;
        }
        const held = await handle.stat({ bigint: true });
        const current = await stat2(path, { bigint: true }).catch((error) => {
          if (error?.code === "ENOENT") return void 0;
          throw error;
        });
        if (current !== void 0 && current.ino === held.ino && current.dev === held.dev) {
          return new _SessionWriteLease({ kind: "posix", handle });
        }
      } catch (error) {
        await handle.close();
        throw error;
      }
      await handle.close();
    }
    throw new SessionAlreadyOwnedError2(id);
  }
  /**
   * Release the kernel lock by closing its descriptor or handle. The POSIX
   * lock file is never removed: every acquired lock belongs to a
   * materialized or materializing session, and keeping the file preserves
   * the stable inode later lockers verify against. Idempotent.
   */
  async release() {
    if (this.released) return;
    this.released = true;
    if (this.held.kind === "win32") {
      await releaseLockHandleWin32(this.held.handle);
      return;
    }
    await this.held.handle.close();
  }
};

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/session/session-persistence-jsonl/src/index.ts
import { SESSION_FORMAT_VERSION as SESSION_FORMAT_VERSION2, SessionId as makeSessionId, SessionLogOffset as SessionLogOffset2 } from "@deepseek-ai/dsh-session";

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/session/session-persistence-jsonl/src/format.ts
import { isAbsolute as isAbsolute2, join as join3 } from "node:path";
import {
  SESSION_FORMAT_VERSION,
  SessionLogOffset
} from "@deepseek-ai/dsh-session";
import { parseSessionFormatLogFilename, sessionFormatLogFilename, SessionFormatUnsupportedMigrationError } from "@deepseek-ai/dsh-session-format";
import { sessionFormatCatalog } from "@deepseek-ai/dsh-session-format-catalog";
import { assertV3RowAdmission } from "@deepseek-ai/dsh-session-format-v2-to-v3";
import {
  SessionFormatUnsupportedError,
  sessionFormatVersionRefusal
} from "@deepseek-ai/dsh-session-persistence";
function logSuffix(compression) {
  return `.jsonl${compressionSuffix(compression)}`;
}
function compressionSuffix(compression) {
  return compression === "zstd" ? ".zstd" : "";
}
function generationLogFilename(version, compression) {
  return `${sessionFormatLogFilename(version)}${compressionSuffix(compression)}`;
}
function parseGenerationLogFilename(filename, compression) {
  const suffix = compressionSuffix(compression);
  if (!filename.endsWith(suffix)) return void 0;
  return parseSessionFormatLogFilename(filename.slice(0, filename.length - suffix.length));
}
var HEADER_REQUIRED_KEYS = ["type", "version", "id", "createdAt", "isSeeded", "delegationDepth"];
var HEADER_OPTIONAL_KEYS = ["cwd", "parentSession", "origin", "agentPreset"];
var HEADER_KEYS = /* @__PURE__ */ new Set([...HEADER_REQUIRED_KEYS, ...HEADER_OPTIONAL_KEYS]);
function assertNoRetiredHeaderFields(value) {
  if (typeof value !== "object" || value === null) return;
  if (Object.hasOwn(value, "sandboxMode") || Object.hasOwn(value, "approvalPolicy")) {
    throw new Error("session header uses retired policy baseline fields");
  }
}
function toHeaderLine(header, inheritedEventCount) {
  if (header.isSeeded && inheritedEventCount === void 0) {
    throw new Error("seeded session header requires an inherited event count");
  }
  const cut = SessionLogOffset(inheritedEventCount ?? 0);
  if (!header.isSeeded && cut !== 0) {
    throw new Error("unseeded session header inherited event count must be 0");
  }
  return sessionFormatCatalog.encodeCurrentHeader({
    ...header,
    delegationDepth: header.delegationDepth ?? 0
  }, cut);
}
function fromHeaderLine(line) {
  return {
    meta: {
      version: SESSION_FORMAT_VERSION,
      id: line.id,
      createdAt: line.createdAt,
      ...line.cwd !== void 0 ? { cwd: line.cwd } : {},
      ...line.parentSession !== void 0 ? { parentSession: line.parentSession } : {},
      isSeeded: line.isSeeded,
      ...line.origin !== void 0 ? { origin: line.origin } : {},
      delegationDepth: line.delegationDepth,
      ...line.agentPreset !== void 0 ? { agentPreset: line.agentPreset } : {}
    },
    inheritedEventCount: SessionLogOffset(0)
  };
}
function isHeaderLine(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) && HEADER_REQUIRED_KEYS.every((key) => Object.hasOwn(value, key)) && Object.keys(value).every((key) => HEADER_KEYS.has(key)) && value.type === "session" && typeof value.version === "number" && typeof value.id === "string" && typeof value.createdAt === "number" && Number.isSafeInteger(value.createdAt) && value.createdAt >= 0 && !Object.is(value.createdAt, -0) && typeof value.delegationDepth === "number" && Number.isSafeInteger(value.delegationDepth) && value.delegationDepth >= 0 && !Object.is(value.delegationDepth, -0) && (value.cwd === void 0 || typeof value.cwd === "string" && isAbsolute2(value.cwd)) && (value.parentSession === void 0 || typeof value.parentSession === "string") && typeof value.isSeeded === "boolean" && (value.origin === void 0 || value.origin === "subagent") && (value.agentPreset === void 0 || typeof value.agentPreset === "string");
}
function encodeSegment(raw) {
  if (raw.length === 0) throw new Error("cannot encode an empty path segment");
  if (raw === ".") return "~002E";
  if (raw === "..") return "~002E~002E";
  let out = "";
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i);
    const ch = String.fromCharCode(code);
    if (ch !== "~" && /^[A-Za-z0-9._-]$/.test(ch)) {
      out += ch;
    } else {
      out += "~" + code.toString(16).toUpperCase().padStart(4, "0");
    }
  }
  return out;
}
function projectKey(cwd) {
  if (cwd.length === 0) throw new Error("cannot encode an empty project path");
  let readable = "";
  let separatorRun = false;
  for (let i = 0; i < cwd.length; i++) {
    const code = cwd.charCodeAt(i);
    const ch = String.fromCharCode(code);
    if (ch === "/" || ch === "\\" || ch === ":") {
      if (!separatorRun) readable += "-";
      separatorRun = true;
    } else if (ch !== "~" && /^[A-Za-z0-9._-]$/.test(ch)) {
      readable += ch;
      separatorRun = false;
    } else {
      readable += "~" + code.toString(16).toUpperCase().padStart(4, "0");
      separatorRun = false;
    }
  }
  const slug = readable.replace(/^-+/, "") || "root";
  return `--${slug.slice(0, 251)}--`;
}
function projectDir(root, cwd) {
  if (cwd === void 0) return join3(root, "_no-cwd");
  return join3(root, projectKey(cwd));
}
function sessionDir(root, cwd, id) {
  return join3(projectDir(root, cwd), encodeSegment(id));
}
function generationLogPath(root, cwd, id, version, compression) {
  return join3(sessionDir(root, cwd, id), generationLogFilename(version, compression));
}
function logPath(root, cwd, id, compression) {
  return generationLogPath(root, cwd, id, SESSION_FORMAT_VERSION, compression);
}
function eventLines(events) {
  return events.map(eventLine).join("\n");
}
function eventLine(event) {
  return JSON.stringify(sessionFormatCatalog.encodeCurrentEvent(event));
}
function refuseForeignFormatVersion(parsed) {
  const { version, id } = parsed;
  if (typeof version !== "number" || version === SESSION_FORMAT_VERSION) return;
  throw new SessionFormatUnsupportedError(
    sessionFormatVersionRefusal(typeof id === "string" ? id : String(id), version)
  );
}
function parseHeaderRecord(record) {
  if (record.length === 0 || record.at(-1) !== 10 || record.indexOf(10) !== record.length - 1) {
    throw new Error("empty or header-less session log");
  }
  let parsed;
  try {
    parsed = JSON.parse(record.subarray(0, -1).toString("utf8"));
  } catch {
    throw new Error("corrupt session log: header line is not valid JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("corrupt session log: first line is not a JSON object");
  }
  refuseForeignFormatVersion(parsed);
  assertNoRetiredHeaderFields(parsed);
  if (!isHeaderLine(parsed)) {
    throw new Error("corrupt session log: first line is not a session header");
  }
  let restore;
  try {
    restore = sessionFormatCatalog.createRestore(parsed, {
      recovery: "strict",
      validation: "transformed"
    });
  } catch {
    throw new Error("corrupt session log: first line is not a session header");
  }
  return { meta: fromHeaderLine(parsed).meta, restore };
}
var SessionLogScanner = class {
  /**
   * Create an event scanner from exactly one newline-terminated header record.
   * @param headerRecord - the complete first JSONL record, including its newline.
   */
  constructor(headerRecord, recovery = "recoverable") {
    this.recovery = recovery;
    const parsed = parseHeaderRecord(headerRecord);
    this.meta = parsed.meta;
    this.restore = parsed.restore;
    this.inputBytes = headerRecord.length;
    this.committedBytes = headerRecord.length;
  }
  recovery;
  meta;
  restore;
  eventCount = 0;
  fragments = [];
  fragmentBytes = 0;
  inputBytes;
  committedBytes;
  eventLine = 0;
  issue;
  finished = false;
  /**
   * Consume the next raw plaintext chunk, retaining only an incomplete final record.
   * @param chunk - bytes immediately following all previously supplied bytes.
   */
  write(chunk) {
    if (this.finished) throw new Error("cannot write to a finished session log scanner");
    const chunkStart = this.inputBytes;
    this.inputBytes += chunk.length;
    let lineStart = 0;
    for (let newline = chunk.indexOf(10); newline !== -1; newline = chunk.indexOf(10, lineStart)) {
      const fragment = chunk.subarray(lineStart, newline);
      let line = fragment;
      if (this.fragments.length > 0) {
        if (fragment.length > 0) this.fragments.push(fragment);
        line = Buffer.concat(this.fragments, this.fragmentBytes + fragment.length);
        this.fragments = [];
        this.fragmentBytes = 0;
      }
      this.consumeEventLine(line, chunkStart + newline + 1);
      lineStart = newline + 1;
    }
    if (lineStart < chunk.length) {
      const fragment = Buffer.from(chunk.subarray(lineStart));
      this.fragments.push(fragment);
      this.fragmentBytes += fragment.length;
    }
  }
  /**
   * Snapshot progress before appending a recoverable torn-frame prefix.
   * @returns byte, committed-prefix, and expanded-event cursors.
   */
  checkpoint() {
    return {
      inputBytes: this.inputBytes,
      committedBytes: this.committedBytes,
      eventCount: SessionLogOffset(this.eventCount)
    };
  }
  /**
   * Finish scanning, ignoring a final record without a newline as a torn tail.
   * @returns the header, contiguous event prefix, and safe truncation offset.
   */
  finish() {
    this.finished = true;
    const artifact = this.restore.finish();
    return {
      meta: this.meta,
      inheritedEventCount: SessionLogOffset(artifact.inheritedEventCount),
      events: artifact.events,
      committedBytes: this.committedBytes
    };
  }
  /** Decode one complete event row and update the contiguous prefix. */
  consumeEventLine(line, endByte) {
    this.eventLine += 1;
    let decoded;
    try {
      decoded = JSON.parse(line.toString("utf8"));
    } catch {
      const issue = new Error(`corrupt session log: unparsable committed event at line ${this.eventLine}`);
      if (this.recovery === "strict") throw issue;
      this.issue ??= issue;
      return;
    }
    try {
      assertV3RowAdmission(decoded);
    } catch (error) {
      if (error instanceof SessionFormatUnsupportedMigrationError) throw new SessionFormatUnsupportedError(error.message);
      throw error;
    }
    if (this.issue !== void 0) {
      if (typeof decoded === "object" && decoded !== null && decoded.type === "turn/end") throw this.issue;
      return;
    }
    try {
      this.restore.decodeRow(decoded);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      const issue = new Error(`corrupt session log: invalid committed event at line ${this.eventLine}: ${detail}`, {
        cause: error
      });
      if (this.recovery === "strict") throw issue;
      this.issue = issue;
      if (typeof decoded === "object" && decoded !== null && decoded.type === "turn/end") throw issue;
      return;
    }
    this.eventCount += 1;
    this.committedBytes = endByte;
  }
};
function scanLog(buffer) {
  const headerEnd = buffer.indexOf(10);
  if (headerEnd === -1) throw new Error("empty or header-less session log");
  const scanner = new SessionLogScanner(buffer.subarray(0, headerEnd + 1));
  scanner.write(buffer.subarray(headerEnd + 1));
  return scanner.finish();
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/session/session-persistence-jsonl/src/zstd.ts
import {
  constants,
  zstdCompress,
  zstdDecompress
} from "node:zlib";
import { promisify } from "node:util";

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/session/session-persistence-jsonl/src/zstd-private-decoder.ts
import { constants as bufferConstants } from "node:buffer";
import { createZstdDecompress } from "node:zlib";
var DECODE_CHUNK_SIZE = 1024 * 1024;
function privateZstdStream(stream) {
  const candidate = stream;
  const handle = candidate._handle;
  const errorKey = Reflect.ownKeys(stream).find((key) => typeof key === "symbol" && key.description === "kError");
  if (typeof handle !== "object" || handle === null || typeof handle.writeSync !== "function" || !(candidate._writeState instanceof Uint32Array) || candidate._writeState.length < 2 || typeof candidate._defaultFlushFlag !== "number" || errorKey === void 0 || candidate[errorKey] !== null) return void 0;
  return { stream, errorKey };
}
var NodePrivateZstdFrameDecoder = class _NodePrivateZstdFrameDecoder {
  constructor(stream, errorKey) {
    this.stream = stream;
    this.errorKey = errorKey;
    this.stream.on("error", (error) => {
      this.decoderError ??= error;
    });
  }
  stream;
  errorKey;
  output = Buffer.allocUnsafe(DECODE_CHUNK_SIZE);
  decoderError;
  started = false;
  closed = false;
  /**
   * Create the optimized decoder when this Node release exposes the expected
   * private stream shape.
   * @returns a shared decoder, or `undefined` when callers must use the public fallback.
   */
  static create() {
    const stream = createZstdDecompress({ chunkSize: DECODE_CHUNK_SIZE });
    const privateAccess = privateZstdStream(stream);
    if (privateAccess !== void 0) {
      return new _NodePrivateZstdFrameDecoder(privateAccess.stream, privateAccess.errorKey);
    }
    stream.close();
    return void 0;
  }
  /** @inheritdoc */
  *decode(source, frames) {
    if (this.started) throw new Error("Zstandard frame decoder was already started");
    if (this.closed) throw new Error("cannot start a closed Zstandard frame decoder");
    this.started = true;
    try {
      for (const frame of frames) {
        try {
          yield this.decodeFrame(source.subarray(frame.start, frame.end));
        } catch (error) {
          throw new Error(`corrupt Zstandard session log: frame at byte ${frame.start} failed validation`, {
            cause: error
          });
        }
      }
    } finally {
      this.close();
    }
  }
  /** Decode one frame; its returned scratch view remains valid until the next call. */
  decodeFrame(input) {
    const handle = this.stream._handle;
    if (this.closed || handle === null) throw new Error("cannot decode with a closed Zstandard frame decoder");
    let inputOffset = 0;
    let inputRemaining = input.length;
    let outputBytes = 0;
    const fullChunks = [];
    for (; ; ) {
      handle.writeSync(
        this.stream._defaultFlushFlag,
        input,
        inputOffset,
        inputRemaining,
        this.output,
        0,
        this.output.length
      );
      if (this.decoderError !== void 0) throw this.decoderError;
      const internalError = this.stream[this.errorKey];
      if (internalError !== null) {
        if (internalError instanceof Error) throw internalError;
        throw new Error("Zstandard decoder exposed a non-Error internal failure");
      }
      const outputAfter = this.stream._writeState[0];
      const inputAfter = this.stream._writeState[1];
      const consumed = inputRemaining - inputAfter;
      const produced = this.output.length - outputAfter;
      if (produced > 0) {
        outputBytes += produced;
        if (outputBytes > bufferConstants.MAX_LENGTH) {
          throw new Error(`Zstandard frame output exceeds ${bufferConstants.MAX_LENGTH} bytes`);
        }
      }
      if (outputAfter !== 0) {
        if (inputAfter !== 0) throw new Error("Zstandard frame decoder left trailing input");
        const finalChunk = this.output.subarray(0, produced);
        if (fullChunks.length === 0) return finalChunk;
        if (produced > 0) fullChunks.push(Buffer.from(finalChunk));
        const onlyChunk = fullChunks[0];
        return fullChunks.length === 1 ? onlyChunk : Buffer.concat(fullChunks, outputBytes);
      }
      fullChunks.push(Buffer.from(this.output));
      inputOffset += consumed;
      inputRemaining = inputAfter;
    }
  }
  /** @inheritdoc */
  close() {
    if (this.closed) return;
    this.closed = true;
    this.stream.close();
  }
};

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/session/session-persistence-jsonl/src/zstd-public-decoder.ts
import { zstdDecompressSync } from "node:zlib";
var PublicZstdFrameDecoder = class {
  started = false;
  closed = false;
  /** @inheritdoc */
  *decode(source, frames) {
    if (this.started) throw new Error("Zstandard frame decoder was already started");
    if (this.closed) throw new Error("cannot start a closed Zstandard frame decoder");
    this.started = true;
    try {
      for (const { start, end } of frames) {
        let decoded;
        try {
          decoded = zstdDecompressSync(source.subarray(start, end));
        } catch (error) {
          throw new Error(`corrupt Zstandard session log: frame at byte ${start} failed validation`, {
            cause: error
          });
        }
        yield decoded;
      }
    } finally {
      this.close();
    }
  }
  /** @inheritdoc */
  close() {
    this.closed = true;
  }
};

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/session/session-persistence-jsonl/src/zstd.ts
var ZSTD_MAGIC = 4247762216;
var zstdCompressAsync = promisify(zstdCompress);
var zstdDecompressAsync = promisify(zstdDecompress);
var CHECKSUM_OPTIONS = {
  params: { [constants.ZSTD_c_checksumFlag]: 1 }
};
var INCOMPLETE_FRAME_OPTIONS = {
  finishFlush: constants.ZSTD_e_flush
};
function scanZstdFrames(buffer, maxFrames = Number.POSITIVE_INFINITY) {
  const frames = [];
  let offset = 0;
  while (offset < buffer.length) {
    const start = offset;
    if (buffer.length - offset < 4) return { frames, tornStart: start };
    if (buffer.readUInt32LE(offset) !== ZSTD_MAGIC) {
      throw new Error(`corrupt Zstandard session log: invalid frame magic at byte ${offset}`);
    }
    offset += 4;
    if (offset === buffer.length) return { frames, tornStart: start };
    const descriptor = buffer.readUInt8(offset);
    offset += 1;
    if ((descriptor & 24) !== 0) {
      throw new Error(`corrupt Zstandard session log: reserved frame-header bit at byte ${offset - 1}`);
    }
    const contentSizeFlag = descriptor >>> 6;
    const singleSegment = (descriptor & 32) !== 0;
    const checksum = (descriptor & 4) !== 0;
    const dictionaryFlag = descriptor & 3;
    const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag;
    const contentSizeBytes = contentSizeFlag === 0 ? singleSegment ? 1 : 0 : 1 << contentSizeFlag;
    const remainingHeaderBytes = (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes;
    if (buffer.length - offset < remainingHeaderBytes) return { frames, tornStart: start };
    offset += remainingHeaderBytes;
    for (; ; ) {
      if (buffer.length - offset < 3) return { frames, tornStart: start };
      const blockHeader = buffer.readUIntLE(offset, 3);
      offset += 3;
      const lastBlock = (blockHeader & 1) !== 0;
      const blockType = blockHeader >>> 1 & 3;
      const blockSize = blockHeader >>> 3;
      if (blockType === 3) {
        throw new Error(`corrupt Zstandard session log: reserved block type at byte ${offset - 3}`);
      }
      const payloadBytes = blockType === 1 ? 1 : blockSize;
      if (buffer.length - offset < payloadBytes) return { frames, tornStart: start };
      offset += payloadBytes;
      if (lastBlock) break;
    }
    if (checksum) {
      if (buffer.length - offset < 4) return { frames, tornStart: start };
      offset += 4;
    }
    frames.push({ start, end: offset });
    if (frames.length === maxFrames) return { frames };
  }
  return { frames };
}
async function compressZstdFrame(input) {
  return zstdCompressAsync(input, CHECKSUM_OPTIONS);
}
async function decompressZstdFrame(input) {
  return zstdDecompressAsync(input);
}
function createZstdFrameDecoder() {
  return NodePrivateZstdFrameDecoder.create() ?? new PublicZstdFrameDecoder();
}
async function decompressZstdPrefix(input) {
  return zstdDecompressAsync(input, INCOMPLETE_FRAME_OPTIONS);
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/session/session-persistence-jsonl/src/migration-verifier.ts
import { Worker } from "node:worker_threads";
var MAX_CONCURRENT_VERIFIERS = 2;
var VerificationScheduler = class {
  active = 0;
  waiting = [];
  async run(operation, signal) {
    const permit = this.acquire(signal);
    if (permit !== void 0) await permit;
    try {
      signal?.throwIfAborted();
      return await operation();
    } finally {
      this.release();
    }
  }
  acquire(signal) {
    signal?.throwIfAborted();
    if (this.active < MAX_CONCURRENT_VERIFIERS) {
      this.active += 1;
      return;
    }
    return new Promise((resolve3, reject) => {
      const waiter = {
        grant: () => {
          signal?.removeEventListener("abort", abort);
          resolve3();
        }
      };
      const abort = () => {
        const index = this.waiting.indexOf(waiter);
        this.waiting.splice(index, 1);
        reject(verifierAbortError(signal));
      };
      this.waiting.push(waiter);
      signal?.addEventListener("abort", abort, { once: true });
    });
  }
  release() {
    const next = this.waiting.shift();
    if (next === void 0) {
      this.active -= 1;
      return;
    }
    next.grant();
  }
};
var verificationScheduler = new VerificationScheduler();
function workerSpawn(request) {
  if (!import.meta.url.endsWith(".ts")) {
    return {
      entry: new URL("./worker.cjs", import.meta.url),
      options: { workerData: request, execArgv: [] }
    };
  }
  const workerEntry = new URL("./worker.ts", import.meta.url);
  const bootstrap = [
    `import { register as registerEsm } from ${JSON.stringify(import.meta.resolve("tsx/esm/api"))}`,
    `import { register as registerCjs } from ${JSON.stringify(import.meta.resolve("tsx/cjs/api"))}`,
    "registerCjs()",
    "registerEsm()",
    `await import(${JSON.stringify(workerEntry.href)})`
  ].join("\n");
  return {
    entry: new URL(`data:text/javascript,${encodeURIComponent(bootstrap)}`),
    options: {
      workerData: request,
      execArgv: []
    }
  };
}
function verifyCurrentGenerationInWorker(path, compression, expectedId, expectedEventCount, expectedPrefix, signal) {
  return verificationScheduler.run(() => runVerificationWorker(
    path,
    compression,
    expectedId,
    expectedEventCount,
    expectedPrefix,
    signal
  ), signal);
}
function runVerificationWorker(path, compression, expectedId, expectedEventCount, expectedPrefix, signal) {
  signal?.throwIfAborted();
  const request = {
    path,
    compression,
    expectedId,
    expectedEventCount,
    ...expectedPrefix === void 0 ? {} : { expectedPrefix }
  };
  const { entry, options } = workerSpawn(request);
  const worker = new Worker(entry, options);
  return new Promise((resolve3, reject) => {
    let settled = false;
    const cleanup = () => {
      signal?.removeEventListener("abort", abort);
    };
    const fail = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      void worker.terminate().then(
        () => {
          reject(error);
        },
        (cleanup2) => {
          reject(new AggregateError([error, cleanup2], "migration verifier termination failed"));
        }
      );
    };
    worker.once("message", (value) => {
      if (settled) return;
      if (typeof value !== "object" || value === null || typeof value.ok !== "boolean") {
        fail(new Error("migration verifier returned an invalid response"));
        return;
      }
      const response = value;
      if (!response.ok) {
        const error = new Error(response.message);
        if (response.stack !== void 0) error.stack = response.stack;
        fail(error);
        return;
      }
      settled = true;
      cleanup();
      void worker.terminate().then(
        () => {
          resolve3(response.result);
        },
        (error) => {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      );
    });
    worker.once("error", fail);
    worker.once("exit", (code) => {
      if (!settled) fail(new Error(`migration verifier exited before reporting a result (code ${code})`));
    });
    const abort = () => {
      fail(verifierAbortError(signal));
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}
function verifierAbortError(signal) {
  const reason = signal?.reason;
  return reason instanceof Error ? reason : new Error("migration verifier aborted", { cause: reason });
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/session/session-persistence-jsonl/src/generation.ts
import { currentSessionMessageProjections } from "@deepseek-ai/dsh-session-format-catalog/message-projections";
import { createHash as createHash2, randomBytes } from "node:crypto";
import {
  link as fsLink,
  lstat as fsLstat,
  open as fsOpen,
  readFile as fsReadFile,
  readdir as fsReaddir,
  rm as fsRm,
  stat as fsStat
} from "node:fs/promises";
import { basename, dirname, join as join4 } from "node:path";
import { performance } from "node:perf_hooks";
import { pipeline, Readable } from "node:stream";
import { scheduler } from "node:timers/promises";
import { isDeepStrictEqual } from "node:util";
import { constants as constants2, createZstdCompress } from "node:zlib";
import { Session } from "@deepseek-ai/dsh-session";
import { BlockAssembler, expandAssistantStream } from "@deepseek-ai/dsh-llm";
import { validateStoredEvents } from "@deepseek-ai/dsh-session-persistence";
var MIGRATION_DECODE_YIELD_INTERVAL_MS = 500;
var MIGRATION_WORK_CHUNK_BYTES = 1024 * 1024;
var MIGRATION_WRITE_CHUNK_BYTES = 4 * 1024 * 1024;
var ZSTD_CHECKSUM_OPTIONS = {
  chunkSize: MIGRATION_WORK_CHUNK_BYTES,
  params: { [constants2.ZSTD_c_checksumFlag]: 1 }
};
var JsonlGenerationSourceChangedError = class extends Error {
  /** @param path - historical generation whose revision changed. */
  constructor(path) {
    super(`historical session generation changed during migration: "${path}"`);
    this.path = path;
  }
  path;
  name = "JsonlGenerationSourceChangedError";
};
var JsonlGenerationUnsupportedMigrationError = class extends Error {
  /**
   * @param fromVersion - unchanged source generation version.
   * @param reason - format-edge refusal.
   */
  constructor(fromVersion, reason) {
    super(reason.message, { cause: reason });
    this.fromVersion = fromVersion;
    this.reason = reason;
  }
  fromVersion;
  reason;
  name = "JsonlGenerationUnsupportedMigrationError";
};
var JsonlGenerationTargetConflictError = class extends Error {
  /**
   * @param path - immutable target that prevented exclusive publication.
   * @param reason - why the existing target cannot be accepted.
   */
  constructor(path, reason) {
    super(`current session generation already exists at "${path}": ${reason.message}`, { cause: reason });
    this.path = path;
    this.reason = reason;
  }
  path;
  reason;
  name = "JsonlGenerationTargetConflictError";
};
var defaultFileSystem = {
  open: (path, flags, mode) => fsOpen(path, flags, mode),
  readFile: (path, signal) => fsReadFile(path, signal === void 0 ? void 0 : { signal }),
  readdir: (path) => fsReaddir(path),
  stat: (path) => fsStat(path, { bigint: true }),
  lstat: (path) => fsLstat(path),
  link: fsLink,
  rm: (path) => fsRm(path, { force: true })
};
var defaultInternals = {
  fs: defaultFileSystem,
  randomToken: () => randomBytes(8).toString("hex"),
  platform: process.platform,
  publishNewWin32: publishNewFileWin32,
  barrier: () => {
  }
};
function isEEXIST2(error) {
  return error?.code === "EEXIST";
}
function isErrnoException(error) {
  return typeof error?.code === "string";
}
function identity(value) {
  return [value.dev, value.ino, value.size, value.mtimeNs, value.ctimeNs].join(":");
}
async function readStableJsonlFile(path, signal) {
  return defaultGenerationRuntime.readStable(path, signal);
}
async function readStableSnapshot(path, signal, fs) {
  signal?.throwIfAborted();
  let before = await fs.stat(path);
  for (let attempt = 0; ; attempt += 1) {
    const bytes = await fs.readFile(path, signal);
    signal?.throwIfAborted();
    const after = await fs.stat(path);
    if (identity(before) === identity(after)) {
      signal?.throwIfAborted();
      return { bytes, identity: after };
    }
    if (attempt === 1) {
      return { bytes: bytes.subarray(0, Number(before.size)), identity: before };
    }
    before = after;
  }
}
function storedVersion(header) {
  if (typeof header !== "object" || header === null || Array.isArray(header)) {
    throw new Error("corrupt session log: first line is not a JSON object");
  }
  const version = header.version;
  if (!Number.isSafeInteger(version) || version < 0 || Object.is(version, -0)) {
    throw new Error("corrupt session log: header version is not a non-negative safe integer");
  }
  return version;
}
function parseJson(text, subject) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`corrupt session log: ${subject} is not valid JSON`, { cause: error });
  }
}
var MigratingJsonlRows = class {
  constructor(restore) {
    this.restore = restore;
  }
  restore;
  fragments = [];
  fragmentBytes = 0;
  rowIndex = 0;
  issue;
  /** Consume plaintext bytes following the independently decoded header. */
  write(chunk) {
    let lineStart = 0;
    for (let newline = chunk.indexOf(10); newline !== -1; newline = chunk.indexOf(10, lineStart)) {
      const fragment = chunk.subarray(lineStart, newline);
      let line = fragment;
      if (this.fragments.length > 0) {
        if (fragment.length > 0) this.fragments.push(fragment);
        line = Buffer.concat(this.fragments, this.fragmentBytes + fragment.length);
        this.fragments = [];
        this.fragmentBytes = 0;
      }
      this.consume(line);
      lineStart = newline + 1;
    }
    if (lineStart < chunk.length) {
      const fragment = Buffer.from(chunk.subarray(lineStart));
      this.fragments.push(fragment);
      this.fragmentBytes += fragment.length;
    }
  }
  /** Refuse a record fragment left by structurally complete Zstandard frames. */
  assertCompleteFramesEndOnRecord() {
    if (this.fragments.length > 0) {
      throw new Error("corrupt Zstandard session log: complete frame contains a torn JSONL record");
    }
  }
  finish() {
    return this.restore.finish();
  }
  consume(line) {
    const index = this.rowIndex;
    this.rowIndex += 1;
    let row;
    try {
      row = parseJson(line.toString("utf8"), `row ${index + 1}`);
    } catch (error) {
      this.issue ??= asError(error);
      return;
    }
    if (this.issue !== void 0) {
      if (typeof row === "object" && row !== null && row.type === "turn/end") throw this.issue;
      return;
    }
    this.restore.decodeRow(row);
  }
};
async function startMigrationStream(headerRecord, sourceVersion, format, validateHistoricalHeader) {
  const value = parseJson(headerRecord.subarray(0, -1).toString("utf8"), "header line");
  const version = storedVersion(value);
  if (version !== sourceVersion) {
    throw new Error(`resolved JSONL source filename identifies v${sourceVersion}, but its header identifies v${version}`);
  }
  const header = value;
  const validation = validateHistoricalHeader?.(header);
  if (validation !== void 0) await validation;
  const stream = format.createRestore(header);
  return { parser: new MigratingJsonlRows(stream) };
}
async function consumeMigrationBytes(rows, chunks, signal) {
  signal?.throwIfAborted();
  let yieldDeadline = performance.now() + MIGRATION_DECODE_YIELD_INTERVAL_MS;
  for (const bytes of chunks) {
    for (let offset = 0; offset < bytes.length; offset += MIGRATION_WORK_CHUNK_BYTES) {
      rows.write(bytes.subarray(offset, offset + MIGRATION_WORK_CHUNK_BYTES));
      if (performance.now() < yieldDeadline) continue;
      await scheduler.yield();
      signal?.throwIfAborted();
      yieldDeadline = performance.now() + MIGRATION_DECODE_YIELD_INTERVAL_MS;
    }
  }
}
async function decodeStreamingMigration(bytes, compression, sourceVersion, format, validateHistoricalHeader, signal) {
  signal?.throwIfAborted();
  if (compression === "none") {
    const headerEnd = bytes.indexOf(10);
    if (headerEnd === -1) throw new Error("empty or header-less session log");
    const stream = await startMigrationStream(
      bytes.subarray(0, headerEnd + 1),
      sourceVersion,
      format,
      validateHistoricalHeader
    );
    signal?.throwIfAborted();
    const bodyEnd = bytes.lastIndexOf(10);
    if (bodyEnd > headerEnd) {
      await consumeMigrationBytes(
        stream.parser,
        [bytes.subarray(headerEnd + 1, bodyEnd + 1)],
        signal
      );
    }
    return stream.parser.finish();
  }
  const { frames, tornStart } = scanZstdFrames(bytes);
  if (frames.length === 0) throw new Error("empty or header-less Zstandard session log");
  const decoder = createZstdFrameDecoder();
  try {
    const decoded = decoder.decode(bytes, frames);
    const first = decoded.next();
    if (first.done) throw new Error("empty or header-less Zstandard session log");
    assertIndependentHeaderFrame(first.value);
    const stream = await startMigrationStream(
      first.value,
      sourceVersion,
      format,
      validateHistoricalHeader
    );
    signal?.throwIfAborted();
    await consumeMigrationBytes(stream.parser, decoded, signal);
    stream.parser.assertCompleteFramesEndOnRecord();
    if (tornStart !== void 0) {
      let recovered = Buffer.alloc(0);
      try {
        recovered = await decompressZstdPrefix(bytes.subarray(tornStart));
      } catch {
        if (signal?.aborted) signal.throwIfAborted();
      }
      signal?.throwIfAborted();
      const newline = recovered.lastIndexOf(10);
      if (newline !== -1) {
        await consumeMigrationBytes(
          stream.parser,
          [recovered.subarray(0, newline + 1)],
          signal
        );
      }
    }
    return stream.parser.finish();
  } finally {
    decoder.close();
  }
}
async function verifyCurrentGeneration(path, compression, expectedId, expectedEventCount, fs, expectedPrefix) {
  const before = await fs.stat(path);
  const bytes = await fs.readFile(path);
  const after = await fs.stat(path);
  if (expectedPrefix !== void 0) {
    if (bytes.length < expectedPrefix.bytes) {
      throw new Error("target bytes are shorter than the migrated generation");
    }
    const digest = createHash2("sha256").update(bytes.subarray(0, expectedPrefix.bytes)).digest("hex");
    if (digest !== expectedPrefix.digest) {
      throw new Error("target bytes do not begin with the migrated generation");
    }
    return { identity: after, bytes: expectedPrefix.bytes, digest };
  }
  if (identity(before) !== identity(after)) {
    throw new Error("current session generation changed during verification");
  }
  const snapshot = { bytes, identity: after };
  const generation = decodeCurrentGeneration(snapshot.bytes, compression);
  validateStoredEvents(generation.meta, generation.events, { kind: "jsonl", path });
  if (generation.meta.id !== expectedId) {
    throw new Error(`current session generation contains id "${generation.meta.id}", expected "${expectedId}"`);
  }
  if (generation.events.length !== expectedEventCount) {
    throw new Error(
      `current session generation contains ${generation.events.length} events, expected ${expectedEventCount}`
    );
  }
  Session.fromRestore(
    generation.meta.id,
    generation.events,
    generation.meta,
    generation.inheritedEventCount,
    "detached",
    currentSessionMessageProjections
  );
  assertCurrentAssistantStreams(generation.events);
  return {
    identity: snapshot.identity,
    bytes: snapshot.bytes.length,
    digest: createHash2("sha256").update(snapshot.bytes).digest("hex")
  };
}
function assertCurrentAssistantStreams(events) {
  for (const [index, event] of events.entries()) {
    if (event.type !== "assistant/message" && event.type !== "assistant/attempt") continue;
    const assembler = new BlockAssembler();
    let timed;
    try {
      timed = expandAssistantStream(event.data.stream);
      for (const member of timed) assembler.push(member.chunk);
    } catch (error) {
      throw new Error(`seed ${event.type} at index ${index} has an invalid embedded stream`, { cause: error });
    }
    if (event.type === "assistant/attempt" || timed.length === 0) continue;
    const content = event.data.interrupted === true ? assembler.interruptedBlocks() : assembler.blocks();
    if (!isDeepStrictEqual(event.data.message.content, content)) {
      throw new Error(`seed assistant/message at index ${index} content disagrees with its embedded stream`);
    }
    if (!isDeepStrictEqual(event.data.usage, assembler.usage)) {
      throw new Error(`seed assistant/message at index ${index} usage disagrees with its embedded stream`);
    }
    if (!isDeepStrictEqual(event.data.message.source.replayState, assembler.replayState)) {
      throw new Error(`seed assistant/message at index ${index} replay state disagrees with its embedded stream`);
    }
  }
}
function decodeCurrentGeneration(bytes, compression) {
  if (compression === "none") {
    const headerEnd = bytes.indexOf(10);
    if (headerEnd === -1) throw new Error("empty or header-less session log");
    const scanner = new SessionLogScanner(bytes.subarray(0, headerEnd + 1), "strict");
    scanner.write(bytes.subarray(headerEnd + 1));
    return finishCurrentGenerationScan(scanner);
  }
  const { frames, tornStart } = scanZstdFrames(bytes);
  if (frames.length === 0) throw new Error("empty or header-less Zstandard session log");
  if (tornStart !== void 0) throw new Error("current session generation has a torn physical tail");
  const decoder = createZstdFrameDecoder();
  try {
    const plaintext = decoder.decode(bytes, frames);
    const header = plaintext.next();
    if (header.done) throw new Error("empty or header-less Zstandard session log");
    assertIndependentHeaderFrame(header.value);
    const scanner = new SessionLogScanner(header.value, "strict");
    for (const chunk of plaintext) scanner.write(chunk);
    return finishCurrentGenerationScan(scanner);
  } finally {
    decoder.close();
  }
}
function finishCurrentGenerationScan(scanner) {
  const inputBytes = scanner.checkpoint().inputBytes;
  const decoded = scanner.finish();
  if (decoded.committedBytes !== inputBytes) throw new Error("current session generation has a torn physical tail");
  return decoded;
}
function stringifyJson(value, subject) {
  let text;
  try {
    text = JSON.stringify(value);
  } catch (error) {
    throw new Error(`${subject} is not lossless JSON`, { cause: error });
  }
  if (typeof text !== "string") throw new Error(`${subject} is not lossless JSON`);
  return text;
}
function assertIndependentHeaderFrame(plaintext) {
  if (plaintext.length === 0 || plaintext.indexOf(10) !== plaintext.length - 1) {
    throw new Error("corrupt Zstandard session log: first frame is not exactly one header line");
  }
}
function assertGenerationPaths(sourcePath, sourceVersion, currentPath, currentVersion, compression) {
  const expectedSource = generationLogFilename(sourceVersion, compression);
  const expectedCurrent = generationLogFilename(currentVersion, compression);
  if (basename(sourcePath) !== expectedSource) {
    throw new Error(`resolved JSONL source path must end with "${expectedSource}": ${sourcePath}`);
  }
  if (basename(currentPath) !== expectedCurrent) {
    throw new Error(`current JSONL generation path must end with "${expectedCurrent}": ${currentPath}`);
  }
  if (dirname(sourcePath) !== dirname(currentPath)) {
    throw new Error("source and current JSONL generations must share one Session directory");
  }
  return logSuffix(compression);
}
async function syncDirectory(path, internals) {
  if (internals.platform === "win32") return;
  const handle = await internals.fs.open(path, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}
async function* encodeMigrationRows(artifact, format, signal) {
  signal?.throwIfAborted();
  let lines = [];
  let bytes = 0;
  for (const value of artifact.events) {
    const line = `${stringifyJson(format.encodeEvent(value), `migrated Session event ${value.seq}`)}
`;
    const lineBytes = Buffer.byteLength(line);
    if (bytes > 0 && bytes + lineBytes > MIGRATION_WORK_CHUNK_BYTES) {
      yield Buffer.from(lines.join(""));
      await scheduler.yield();
      signal?.throwIfAborted();
      lines = [];
      bytes = 0;
    }
    lines.push(line);
    bytes += lineBytes;
  }
  yield Buffer.from(lines.join(""));
}
async function writeMigrationChunks(chunks, write) {
  let pending = [];
  let bytes = 0;
  for await (const chunk of chunks) {
    pending.push(chunk);
    bytes += chunk.length;
    if (bytes < MIGRATION_WRITE_CHUNK_BYTES) continue;
    await write(pending.length === 1 ? pending[0] : Buffer.concat(pending, bytes));
    pending = [];
    bytes = 0;
  }
  if (bytes > 0) await write(pending.length === 1 ? pending[0] : Buffer.concat(pending, bytes));
}
async function writeSyncedTemp(currentPath, suffix, compression, artifact, format, signal, internals) {
  signal?.throwIfAborted();
  let path;
  let handle;
  for (; ; ) {
    path = join4(dirname(currentPath), `session.migration.${internals.randomToken()}${suffix}.tmp`);
    try {
      handle = await internals.fs.open(path, "wx", 384);
      break;
    } catch (error) {
      if (isEEXIST2(error)) continue;
      throw error;
    }
  }
  const hash = createHash2("sha256");
  let bytes = 0;
  const write = async (chunk) => {
    await handle.writeFile(chunk);
    hash.update(chunk);
    bytes += chunk.length;
  };
  let failure;
  try {
    const headerValue = format.encodeHeader(artifact.header, artifact.inheritedEventCount);
    const header = Buffer.from(`${stringifyJson(headerValue, "migrated session header")}
`);
    await write(compression === "zstd" ? await compressZstdFrame(header) : header);
    if (artifact.events.length > 0) {
      const rows = encodeMigrationRows(artifact, format, signal);
      if (compression === "none") {
        await writeMigrationChunks(rows, write);
      } else {
        await new Promise((resolve3, reject) => {
          pipeline(
            Readable.from(rows, { objectMode: false, highWaterMark: MIGRATION_WORK_CHUNK_BYTES }),
            createZstdCompress(ZSTD_CHECKSUM_OPTIONS),
            async (source) => {
              await writeMigrationChunks(source, write);
            },
            (error) => {
              if (error instanceof Error) reject(error);
              else resolve3();
            }
          );
        });
      }
    }
    signal?.throwIfAborted();
    await handle.sync();
  } catch (error) {
    failure = error;
  }
  try {
    await handle.close();
  } catch (error) {
    failure = failure === void 0 ? error : new AggregateError([failure, error], `failed to write and close migration stage "${path}"`);
  }
  if (failure !== void 0) {
    const writeError = failure instanceof Error ? failure : new Error("migration stage write failed with a non-Error rejection", { cause: failure });
    await removeTemporary(path, writeError, internals);
    throw writeError;
  }
  return { path, bytes, digest: hash.digest("hex") };
}
async function removeTemporary(path, primaryFailure, internals) {
  try {
    await internals.fs.rm(path);
  } catch (cleanupFailure) {
    throw new AggregateError(
      [primaryFailure, cleanupFailure],
      `failed to clean migration temporary "${path}" after an earlier failure`
    );
  }
}
async function removeCommittedTemporary(path, internals) {
  try {
    await internals.fs.rm(path);
  } catch {
  }
}
async function publishCurrentExclusive(staged, currentPath, internals) {
  if (internals.platform === "win32") {
    try {
      await internals.publishNewWin32(staged, currentPath);
      return true;
    } catch (error) {
      if (isEEXIST2(error)) return false;
      throw error;
    }
  }
  try {
    await internals.fs.link(staged, currentPath);
  } catch (error) {
    if (isEEXIST2(error)) return false;
    throw error;
  }
  await syncDirectory(dirname(currentPath), internals);
  return true;
}
function asError(error) {
  return error instanceof Error ? error : new Error("current-generation validation failed with a non-Error rejection", {
    cause: error
  });
}
async function inspectExpectedCurrent(currentPath, internals, inspect) {
  try {
    const expectedName = basename(currentPath);
    const names = await internals.fs.readdir(dirname(currentPath));
    if (!names.includes(expectedName)) {
      const noncanonical = names.find((name) => name.toLowerCase() === expectedName.toLowerCase());
      if (noncanonical !== void 0) {
        throw new Error(`target resolves to noncanonical directory entry "${noncanonical}"`);
      }
    }
    const info = await internals.fs.lstat(currentPath);
    if (info.isSymbolicLink() || !info.isFile()) {
      throw new Error(`target is a ${info.isSymbolicLink() ? "symbolic link" : "non-regular file"}`);
    }
    return await inspect();
  } catch (error) {
    if (isErrnoException(error)) throw error;
    throw new JsonlGenerationTargetConflictError(currentPath, asError(error));
  }
}
function withOverrides(overrides) {
  return {
    ...defaultInternals,
    ...overrides,
    fs: { ...defaultFileSystem, ...overrides.fs }
  };
}
async function publishPreparedMigration(options, suffix, artifact, sourceIdentity, internals) {
  await scheduler.yield();
  const { sourcePath, currentPath, compression, verifyCurrentFile } = options;
  const eventCount = artifact.events.length;
  let staged = await writeSyncedTemp(currentPath, suffix, compression, artifact, options.format, void 0, internals);
  try {
    const verifiedStage = await verifyCurrentFile(
      staged.path,
      compression,
      artifact.header.id,
      eventCount
    );
    if (verifiedStage.bytes !== staged.bytes || verifiedStage.digest !== staged.digest) {
      throw new Error("staged session generation changed during verification");
    }
    await internals.barrier("before-source-check", 1);
    const beforePublish = await internals.fs.stat(sourcePath);
    if (identity(beforePublish) !== identity(sourceIdentity)) {
      throw new JsonlGenerationSourceChangedError(sourcePath);
    }
    const published = await publishCurrentExclusive(staged.path, currentPath, internals);
    if (published && internals.platform === "win32") staged = { ...staged, path: "" };
    await internals.barrier("after-publication", 1);
    let currentIdentity;
    if (published) {
      if (staged.path !== "") {
        await removeCommittedTemporary(staged.path, internals);
        staged = { ...staged, path: "" };
      }
      currentIdentity = await internals.fs.stat(currentPath);
    } else {
      const winner = await inspectExpectedCurrent(currentPath, internals, async () => {
        const candidate = await verifyCurrentFile(
          currentPath,
          compression,
          artifact.header.id,
          eventCount,
          staged
        );
        if (candidate.bytes !== staged.bytes || candidate.digest !== staged.digest) {
          throw new Error("target bytes differ from the migrated generation");
        }
        return candidate;
      });
      currentIdentity = winner.identity;
      await removeCommittedTemporary(staged.path, internals);
      staged = { ...staged, path: "" };
    }
    return currentIdentity;
  } catch (error) {
    if (staged.path !== "") await removeTemporary(staged.path, error, internals);
    throw error;
  }
}
async function prepareMigration(options, internals) {
  const { sourcePath, sourceVersion, currentPath, compression, format, signal } = options;
  const suffix = assertGenerationPaths(
    sourcePath,
    sourceVersion,
    currentPath,
    format.currentVersion,
    compression
  );
  if (sourceVersion >= format.currentVersion) {
    throw new Error(`migration preparation requires a historical source, got v${sourceVersion}`);
  }
  const source = await readStableSnapshot(sourcePath, signal, internals.fs);
  let artifact;
  try {
    artifact = await decodeStreamingMigration(
      source.bytes,
      compression,
      sourceVersion,
      format,
      options.validateHistoricalHeader,
      signal
    );
  } catch (error) {
    if (format.isUnsupportedMigrationError?.(error) === true) {
      throw new JsonlGenerationUnsupportedMigrationError(sourceVersion, error);
    }
    throw error;
  }
  if (artifact.header.version !== format.currentVersion) {
    throw new Error(`format migration returned v${artifact.header.version}, expected v${format.currentVersion}`);
  }
  const sourceIdentity = source.identity;
  let publication;
  return {
    sourceIdentity,
    artifact,
    publish() {
      if (publication === void 0) {
        publication = publishPreparedMigration(
          options,
          suffix,
          artifact,
          sourceIdentity,
          internals
        );
      }
      return publication;
    }
  };
}
function prepareJsonlMigration(options) {
  return defaultGenerationRuntime.prepare(options);
}
function createJsonlGenerationRuntime(overrides = {}) {
  const internals = withOverrides(overrides);
  return {
    readStable: (path, signal) => readStableSnapshot(path, signal, internals.fs),
    prepare: (options) => prepareMigration(options, internals),
    verify: (path, compression, expectedId, expectedEventCount, expectedPrefix) => verifyCurrentGeneration(
      path,
      compression,
      expectedId,
      expectedEventCount,
      internals.fs,
      expectedPrefix
    )
  };
}
var defaultGenerationRuntime = createJsonlGenerationRuntime();

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/session/session-persistence-jsonl/src/index.ts
var COLD_LOG_MEMO_MAX_ENTRIES = 2;
var DEFAULT_COMPRESSION = "zstd";
var ZSTD_DECODE_YIELD_INTERVAL_MS = 500;
function assertZstdHeaderFrame(plaintext) {
  if (plaintext.length === 0 || plaintext.indexOf(10) !== plaintext.length - 1) {
    throw new Error("corrupt Zstandard session log: first frame is not exactly one header line");
  }
}
var JsonlCompressionSchema = z.union([
  z.const("zstd"),
  z.const("none")
]).default(DEFAULT_COMPRESSION);
function freezeStoredEvent(event) {
  const pending = [event];
  while (pending.length > 0) {
    const current = pending.pop();
    Object.freeze(current);
    for (const key in current) {
      const child = current[key];
      if (child !== null && typeof child === "object") pending.push(child);
    }
  }
}
function freezeStoredEvents(events) {
  for (const event of events) freezeStoredEvent(event);
  Object.freeze(events);
  return { eventState: "shared-frozen", events };
}
function fileRevision(identity2) {
  return SessionPersistenceRevision2([
    identity2.dev,
    identity2.ino,
    identity2.size,
    identity2.mtimeNs,
    identity2.ctimeNs
  ].join(":"));
}
function isENOENT2(error) {
  return error?.code === "ENOENT";
}
function isErrnoException2(error) {
  return typeof error?.code === "string";
}
function abortError(signal) {
  return signal.reason instanceof Error ? signal.reason : new Error("session migration preparation aborted", { cause: signal.reason });
}
function waitWithAbort(operation, signal) {
  if (signal === void 0) return operation;
  if (signal.aborted) return Promise.reject(abortError(signal));
  return new Promise((resolve3, reject) => {
    const stopWaiting = () => {
      reject(abortError(signal));
    };
    signal.addEventListener("abort", stopWaiting, { once: true });
    void operation.then(
      (value) => {
        signal.removeEventListener("abort", stopWaiting);
        resolve3(value);
      },
      (error) => {
        signal.removeEventListener("abort", stopWaiting);
        if (error instanceof Error) {
          reject(error);
        } else {
          reject(new Error("session migration preparation failed", { cause: error }));
        }
      }
    );
  });
}
var JsonlSessionPersistence = class extends SessionPersistence {
  constructor(ctx, config) {
    super(ctx);
    this.config = config;
    if (sessionFormatCatalog2.currentVersion !== SESSION_FORMAT_VERSION2) {
      throw new Error(
        `session-persistence-jsonl: format catalog v${sessionFormatCatalog2.currentVersion} does not match Session v${SESSION_FORMAT_VERSION2}`
      );
    }
    this.root = resolve2(config.root);
    this.compression = config.compression ?? DEFAULT_COMPRESSION;
    this.generationFormat = {
      currentVersion: sessionFormatCatalog2.currentVersion,
      createRestore: (header) => sessionFormatCatalog2.createRestore(header, {
        recovery: "recoverable",
        validation: "transformed"
      }),
      encodeHeader: (header, inheritedEventCount) => sessionFormatCatalog2.encodeCurrentHeader(header, inheritedEventCount),
      encodeEvent: (event) => sessionFormatCatalog2.encodeCurrentEvent(event),
      isUnsupportedMigrationError: (error) => error instanceof SessionFormatUnsupportedMigrationError2
    };
    this.assertUsableRoot();
    this.tracker.install(ctx);
  }
  config;
  static Config = z.object({
    root: z.string().required(),
    requireExistingRoot: z.boolean().default(false),
    compression: JsonlCompressionSchema
  });
  /** Backend label for diagnostics and effects; shadows `Service.name` without changing the service key. */
  name = "session-persistence-jsonl";
  root;
  rootIdentity;
  compression;
  rootEncodingCheck;
  tracker = new JsonlBackendTracker(this.name);
  generationFormat;
  /**
   * Bounded LRU of parsed, validated stored logs keyed by session id and
   * guarded by the stat-derived revision, so an immediate cold-read handoff
   * (observation then resume) parses the artifact once. Every local mutation
   * for an id invalidates its entry; a foreign write misses through the
   * revision guard.
   */
  coldLogMemo = /* @__PURE__ */ new Map();
  /** One joinable decode/migration operation per selected historical Session file revision. */
  migrationPreparations = /* @__PURE__ */ new Map();
  /**
   * Refusal-diagnostics hook: the absolute target path, without touching the filesystem.
   * @param meta - the stored header naming the session and its cwd.
   * @returns the artifact kind and absolute path.
   */
  locate(meta) {
    return { kind: "jsonl", path: logPath(this.root, meta.cwd, meta.id, this.compression) };
  }
  // --- SessionPersistence service API ---
  /**
   * Create a new stored session and take its write ownership. The session is
   * visible to this process immediately; the physical artifact appears on the
   * first append or flush.
   * @param header - the immutable header to store; must be losslessly
   *   JSON-serializable with a non-negative safe-integer `createdAt`.
   * @param options - optional cancellation.
   * @returns the owned write handle.
   */
  async create(header, options) {
    options?.signal?.throwIfAborted();
    const snapshot = materializeCreateHeader(header);
    toHeaderLine(snapshot, options?.inheritedEventCount);
    const inheritedEventCount = SessionLogOffset2(options?.inheritedEventCount ?? 0);
    await this.ensureRootEncoding();
    options?.signal?.throwIfAborted();
    if (this.tracker.hasPending(snapshot.id) || await this.findLog(snapshot.id, options?.signal) !== void 0) {
      throw new SessionAlreadyExistsError2(snapshot.id);
    }
    options?.signal?.throwIfAborted();
    this.tracker.registerCreated(snapshot, inheritedEventCount);
    return this.tracker.adopt(new JsonlSessionHandle(this, snapshot.id, snapshot, "write", { cursor: 0, materialized: false, inheritedEventCount }));
  }
  /**
   * Open an existing stored session for `read` or single-writer `write`.
   * @param id - the stored session to open.
   * @param access - `read` (no ownership) or `write` (atomic in-process claim).
   * @param options - optional cancellation.
   * @returns the open handle.
   */
  async open(id, access, options) {
    options?.signal?.throwIfAborted();
    await this.ensureRootEncoding();
    options?.signal?.throwIfAborted();
    const pending = this.tracker.pendingOf(id);
    if (access === "read") {
      if (pending !== void 0) {
        return this.tracker.adopt(new JsonlSessionHandle(this, id, pending.header, "read", { cursor: 0, materialized: false, inheritedEventCount: pending.inheritedEventCount }));
      }
      const stored = await this.requireStoredLog(id, options?.signal);
      let state;
      if (stored.status === "prepared") {
        state = {
          cursor: 0,
          materialized: true,
          inheritedEventCount: stored.inheritedEventCount,
          primed: stored
        };
      } else {
        state = {
          cursor: 0,
          materialized: true,
          inheritedEventCount: stored.inheritedEventCount
        };
      }
      return this.tracker.adopt(new JsonlSessionHandle(this, id, stored.meta, "read", state));
    }
    this.tracker.claimWrite(id);
    let lease;
    try {
      const resolved = await this.findLog(id, options?.signal);
      if (resolved === void 0) throw new SessionPersistenceNotFoundError2(id);
      lease = await this.acquireLease(id, void 0, dirname2(resolved.currentPath));
      const prepared = await this.requireStoredLog(id, options?.signal);
      options?.signal?.throwIfAborted();
      let stored;
      if (prepared.status === "prepared") {
        stored = await this.publishStoredMigration(id, prepared);
      } else {
        stored = prepared;
      }
      options?.signal?.throwIfAborted();
      return this.tracker.adopt(new JsonlSessionHandle(this, id, stored.meta, "write", {
        cursor: stored.events.length,
        materialized: true,
        tornTruncateTo: stored.tornTruncateTo,
        recoveredTail: stored.recoveredTail,
        inheritedEventCount: stored.inheritedEventCount,
        primed: stored
      }, lease));
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      let releaseFailure;
      try {
        await lease?.release();
      } catch (raw) {
        releaseFailure = raw instanceof Error ? raw : new Error(String(raw));
      }
      this.tracker.releaseClaim(id);
      if (releaseFailure !== void 0) {
        throw new AggregateError([failure, releaseFailure], `session "${id}": write open failed and its lock release failed`);
      }
      throw failure;
    }
  }
  /**
   * Flush every active write handle in one durability barrier; see the seam
   * contract.
   * @returns resolution once every write handle active at the call has flushed.
   */
  async flush() {
    this.assertRootAvailable();
    await this.tracker.flushAll();
  }
  /**
   * Observe one stored session without reading its event log.
   * @param id - the stored session to observe.
   * @param options - optional cancellation.
   * @returns the snapshot (`sizeBytes` carries the physical artifact size), or
   *   `undefined` when the session does not exist.
   */
  async stat(id, options) {
    options?.signal?.throwIfAborted();
    await this.ensureRootEncoding();
    options?.signal?.throwIfAborted();
    const pending = this.tracker.pendingOf(id);
    if (pending !== void 0) {
      return { header: pending.header, revision: pending.revision };
    }
    const selected = await this.findLog(id, options?.signal);
    if (selected === void 0) return void 0;
    const header = await this.readGenerationHeader(selected, id, options?.signal);
    if (header === void 0) return void 0;
    try {
      const identity2 = await stat3(selected.sourcePath, { bigint: true });
      options?.signal?.throwIfAborted();
      return {
        header,
        revision: fileRevision(identity2),
        sizeBytes: Number(identity2.size)
      };
    } catch (error) {
      options?.signal?.throwIfAborted();
      if (isENOENT2(error)) return void 0;
      throw error;
    }
  }
  /**
   * List every stored session visible to this process: materialized artifacts
   * plus this process's created-but-unmaterialized sessions.
   * @param options - optional cancellation.
   * @returns one snapshot per session, in no promised order.
   */
  async list(options) {
    const signal = options?.signal;
    const snapshots = [];
    const listed = /* @__PURE__ */ new Set();
    const pending = [...this.tracker.pendingEntries()];
    for (const artifact of await this.listArtifacts(signal)) {
      signal?.throwIfAborted();
      try {
        const identity2 = await stat3(artifact.path, { bigint: true });
        signal?.throwIfAborted();
        listed.add(artifact.header.id);
        snapshots.push({
          header: artifact.header,
          revision: fileRevision(identity2),
          sizeBytes: Number(identity2.size)
        });
      } catch (error) {
        signal?.throwIfAborted();
        if (!isENOENT2(error)) throw error;
      }
    }
    for (const [id, entry] of pending) {
      if (!listed.has(id)) snapshots.push({ header: entry.header, revision: entry.revision });
    }
    signal?.throwIfAborted();
    return snapshots;
  }
  // --- handle-facing storage internals (package-private via the handle class below) ---
  /** Resolve and read one stored log, refusing loudly when the artifact is absent. */
  async requireStoredLog(id, signal) {
    const selected = await this.findLog(id, signal);
    if (selected === void 0) throw new SessionPersistenceNotFoundError2(id);
    if (selected.sourceVersion < SESSION_FORMAT_VERSION2) {
      const sourceRevision = fileRevision(await stat3(selected.sourcePath, { bigint: true }));
      signal?.throwIfAborted();
      let preparation = this.migrationPreparations.get(id);
      if (preparation === void 0 || preparation.sourcePath !== selected.sourcePath || preparation.sourceRevision !== sourceRevision) {
        const controller = new AbortController();
        const promise = this.loadStoredMigration(id, selected, sourceRevision, controller.signal);
        preparation = {
          sourcePath: selected.sourcePath,
          sourceRevision,
          controller,
          promise,
          settled: false,
          waiters: 0
        };
        this.migrationPreparations.set(id, preparation);
        const created = preparation;
        const release = () => {
          created.settled = true;
          if (this.migrationPreparations.get(id) === created) {
            this.migrationPreparations.delete(id);
          }
        };
        void promise.then(release, release);
      }
      signal?.throwIfAborted();
      return this.waitForPreparation(id, preparation, signal);
    }
    if (selected.sourceVersion > SESSION_FORMAT_VERSION2) {
      const header = await this.readGenerationHeader(selected, id, signal);
      if (header === void 0) {
        throw new SessionPersistenceCorruptionError(
          `session "${id}": stored log has a malformed header (raw log: ${selected.sourcePath})`,
          { cause: new Error("malformed Session header") }
        );
      }
      throw new SessionFormatUnsupportedError2(
        `${sessionFormatVersionRefusal2(id, selected.sourceVersion)} (raw log: ${selected.sourcePath})`,
        { kind: "jsonl", path: selected.sourcePath }
      );
    }
    const probe = fileRevision(await stat3(selected.sourcePath, { bigint: true }));
    const memoized = this.coldLogMemo.get(id);
    if (memoized?.status === "current" && memoized.revision === probe) {
      this.coldLogMemo.delete(id);
      this.coldLogMemo.set(id, memoized);
      return memoized;
    }
    const current = await readStableJsonlFile(selected.sourcePath, signal);
    return this.decodeStoredLog(
      selected.sourcePath,
      id,
      current.bytes,
      fileRevision(current.identity),
      signal
    );
  }
  /** Probe the memo and otherwise decode one historical generation under backend cancellation. */
  async loadStoredMigration(id, selected, sourceRevision, signal) {
    signal.throwIfAborted();
    const memoized = this.coldLogMemo.get(id);
    if (memoized?.status === "prepared" && memoized.revision === sourceRevision) {
      this.coldLogMemo.delete(id);
      this.coldLogMemo.set(id, memoized);
      return memoized;
    }
    return this.prepareStoredMigration(id, selected, signal);
  }
  /** Await shared preparation for one caller and abort it only after its last waiter leaves. */
  async waitForPreparation(id, preparation, signal) {
    preparation.waiters += 1;
    try {
      return await waitWithAbort(preparation.promise, signal);
    } finally {
      preparation.waiters -= 1;
      if (preparation.waiters === 0 && !preparation.settled) {
        if (this.migrationPreparations.get(id) === preparation) {
          this.migrationPreparations.delete(id);
        }
        preparation.controller.abort();
      }
    }
  }
  /** Decode one historical generation without publishing a successor. */
  async prepareStoredMigration(id, selected, signal) {
    let prepared;
    try {
      prepared = await prepareJsonlMigration({
        sourcePath: selected.sourcePath,
        sourceVersion: selected.sourceVersion,
        currentPath: selected.currentPath,
        compression: this.compression,
        format: this.generationFormat,
        verifyCurrentFile: verifyCurrentGenerationInWorker,
        validateHistoricalHeader: (headerValue) => this.validateSourceIdentity(
          selected,
          headerValue,
          id,
          signal
        ),
        signal
      });
    } catch (error) {
      throw this.generationFailure(id, selected, error);
    }
    const meta = this.currentHeader(prepared.artifact.header);
    assertStoredId(id, meta);
    const events = [...prepared.artifact.events];
    validateStoredEvents2(meta, events, { kind: "jsonl", path: selected.sourcePath });
    const stored = {
      status: "prepared",
      meta,
      ...freezeStoredEvents(events),
      tornTruncateTo: void 0,
      recoveredTail: [],
      inheritedEventCount: SessionLogOffset2(prepared.artifact.inheritedEventCount),
      revision: fileRevision(prepared.sourceIdentity),
      publication: { source: selected, value: prepared }
    };
    this.memoizeStoredLog(id, stored);
    return stored;
  }
  /** Publish a prepared historical log before granting write access. */
  async publishStoredMigration(id, stored) {
    const migration = stored.publication;
    let identity2;
    try {
      identity2 = await migration.value.publish();
    } catch (error) {
      if (this.coldLogMemo.get(id) === stored) this.coldLogMemo.delete(id);
      throw this.generationFailure(id, migration.source, error);
    }
    const published = {
      status: "current",
      meta: stored.meta,
      eventState: stored.eventState,
      events: stored.events,
      tornTruncateTo: stored.tornTruncateTo,
      recoveredTail: stored.recoveredTail,
      inheritedEventCount: stored.inheritedEventCount,
      revision: fileRevision(identity2)
    };
    this.memoizeStoredLog(id, published);
    return published;
  }
  /** Translate generation-layer failures into the persistence seam's error vocabulary. */
  generationFailure(id, selected, error) {
    if (error instanceof JsonlGenerationUnsupportedMigrationError) {
      return new SessionFormatUnsupportedError2(
        `${error.message}; source v${error.fromVersion} artifact remains unchanged (raw log: ${selected.sourcePath})`,
        { kind: "jsonl", path: selected.sourcePath }
      );
    }
    if (error instanceof JsonlGenerationSourceChangedError) return error;
    if (error instanceof SessionFormatUnsupportedError2 || error instanceof SessionPersistenceCorruptionError || isErrnoException2(error) || error instanceof DOMException && error.name === "AbortError") return error;
    return new SessionPersistenceCorruptionError(
      `session "${id}": stored log is corrupt: ${String(error)} (raw log: ${selected.sourcePath})`,
      { cause: error }
    );
  }
  /**
   * Read, parse, and validate one stored log as the current logical prefix.
   * @param path - the artifact file to read.
   * @param expectedId - the session identity the artifact must carry.
   * @param signal - optional cancellation for the stat/read/decode work.
   * @returns the validated stored log with any torn-tail truncation point.
   */
  async readStoredLog(path, expectedId, signal) {
    this.assertRootAvailable();
    signal?.throwIfAborted();
    const probe = fileRevision(await stat3(path, { bigint: true }));
    const memoized = this.coldLogMemo.get(expectedId);
    if (memoized?.status === "current" && memoized.revision === probe) {
      this.coldLogMemo.delete(expectedId);
      this.coldLogMemo.set(expectedId, memoized);
      return memoized;
    }
    const { bytes, identity: identity2 } = await readStableJsonlFile(path, signal);
    return this.decodeStoredLog(path, expectedId, bytes, fileRevision(identity2), signal);
  }
  /** Decode and memoize one already-stable current physical snapshot. */
  async decodeStoredLog(path, expectedId, buffer, revision, signal) {
    let parsed;
    try {
      if (this.compression === "zstd") {
        parsed = await this.readZstdPrefix(buffer, signal);
      } else {
        signal?.throwIfAborted();
        const { meta, inheritedEventCount, events: events2, committedBytes } = scanLog(buffer);
        signal?.throwIfAborted();
        parsed = {
          meta,
          inheritedEventCount,
          events: events2,
          tornTruncateTo: committedBytes < buffer.byteLength ? committedBytes : void 0,
          // A torn raw tail is one incomplete JSONL line; it holds no complete
          // record to recover.
          recoveredTail: []
        };
      }
    } catch (error) {
      signal?.throwIfAborted();
      if (error instanceof SessionFormatUnsupportedError2) {
        throw new SessionFormatUnsupportedError2(`${error.message} (raw log: ${path})`, { kind: "jsonl", path });
      }
      throw new SessionPersistenceCorruptionError(`session "${expectedId}": stored log is corrupt: ${String(error)} (raw log: ${path})`, { cause: error });
    }
    signal?.throwIfAborted();
    await this.assertStoredIdentity(path, SESSION_FORMAT_VERSION2, parsed.meta, expectedId, signal);
    signal?.throwIfAborted();
    assertStoredId(expectedId, parsed.meta);
    const location = this.locate(parsed.meta);
    validateStoredEvents2(parsed.meta, parsed.events, location);
    const { events, ...rest } = parsed;
    const stored = {
      status: "current",
      ...rest,
      ...freezeStoredEvents(events),
      revision
    };
    this.memoizeStoredLog(expectedId, stored);
    return stored;
  }
  /** Insert one parsed log into the bounded handoff cache. */
  memoizeStoredLog(id, stored) {
    this.coldLogMemo.delete(id);
    this.coldLogMemo.set(id, stored);
    for (const oldest of this.coldLogMemo.keys()) {
      if (this.coldLogMemo.size <= COLD_LOG_MEMO_MAX_ENTRIES) break;
      this.coldLogMemo.delete(oldest);
    }
  }
  /**
   * Resolve a session's current-generation log path.
   * @param id - the stored session to locate.
   * @param signal - optional cancellation for the directory scans.
   * @returns the current artifact path, or `undefined` while only a historical generation exists.
   */
  async resolveCurrentLog(id, signal) {
    await this.ensureRootEncoding();
    signal?.throwIfAborted();
    const selected = await this.findLog(id, signal);
    if (selected === void 0) return void 0;
    if (selected.sourceVersion === SESSION_FORMAT_VERSION2) return selected.sourcePath;
    if (selected.sourceVersion < SESSION_FORMAT_VERSION2) return void 0;
    const reason = sessionFormatVersionRefusal2(id, selected.sourceVersion);
    throw new SessionFormatUnsupportedError2(
      `${reason} (raw log: ${selected.sourcePath})`,
      { kind: "jsonl", path: selected.sourcePath }
    );
  }
  /**
   * Durably append one validated batch; lazily materializes on the first write.
   * @param header - the session's stored header.
   * @param events - the validated contiguous batch, in seq order.
   * @param isMaterialized - whether the session already has a durable artifact.
   * @param inheritedEventCount - the exact fork-inherited prefix length written into a materializing header line.
   */
  async persistBatch(header, events, isMaterialized, inheritedEventCount) {
    this.coldLogMemo.delete(header.id);
    await this.ensureRootEncoding();
    if (isMaterialized) {
      await this.appendLines(header, events);
    } else {
      await this.materialize(header, inheritedEventCount, events);
      this.tracker.materialized(header.id);
    }
  }
  /**
   * Materialize a header-only artifact for an explicitly durable empty session.
   * @param header - the session's stored header.
   * @param inheritedEventCount - the exact fork-inherited prefix length written into the header line.
   */
  async persistHeader(header, inheritedEventCount) {
    this.coldLogMemo.delete(header.id);
    await this.ensureRootEncoding();
    await this.materialize(header, inheritedEventCount, []);
    this.tracker.materialized(header.id);
  }
  /**
   * Truncate a torn physical tail durably before this session's first new append.
   * @param header - the session's stored header.
   * @param truncateTo - the byte offset the artifact is truncated to.
   */
  async truncateTornTail(header, truncateTo) {
    this.assertRootAvailable();
    this.coldLogMemo.delete(header.id);
    await this.repair(header, truncateTo);
    this.ctx.logger.warn(`${this.name}: session "${header.id}" recovered from a torn tail; incomplete tail bytes were discarded`);
  }
  /**
   * Whether this process still tracks a created-but-unmaterialized session.
   * @param id - the session to test.
   * @returns true while the pending entry exists.
   */
  hasPendingSession(id) {
    return this.tracker.hasPending(id);
  }
  /**
   * Release one handle's backend bookkeeping on close.
   * @param handle - the closing handle.
   * @param materialized - whether the session reached durable storage.
   */
  releaseHandle(handle, materialized) {
    this.tracker.release(handle, materialized);
  }
  /**
   * Acquire the session directory's kernel write lock; the kernel holds it
   * until the handle's close releases the descriptor, including on process death.
   * @param id - the session the lock guards.
   * @param cwd - header cwd used to derive the directory for a fresh session.
   * @param dir - the resolved directory of an existing artifact, when known.
   * @returns the held lock.
   */
  acquireLease(id, cwd, dir = sessionDir(this.root, cwd, id)) {
    this.assertRootAvailable();
    return SessionWriteLease.acquire(dir, id, this.config.requireExistingRoot ? this.root : void 0);
  }
  /**
   * Acquire the cross-process write lock for a materializing created session,
   * called by its handle immediately before the first log bytes publish.
   * @param header - the session's stored header (its cwd derives the directory).
   * @returns the held lock.
   */
  async acquireWriteLease(header) {
    await this.rejectOppositeArtifact(header.cwd, header.id);
    return this.acquireLease(header.id, header.cwd);
  }
  /** Decode complete frames and retain complete JSONL records from a torn final frame. */
  async readZstdPrefix(buffer, signal) {
    signal?.throwIfAborted();
    const { frames, tornStart } = scanZstdFrames(buffer);
    signal?.throwIfAborted();
    if (frames.length === 0) throw new Error("empty or header-less Zstandard session log");
    const decoder = createZstdFrameDecoder();
    let yieldDeadline = performance2.now() + ZSTD_DECODE_YIELD_INTERVAL_MS;
    try {
      const decodedFrames = decoder.decode(buffer, frames);
      signal?.throwIfAborted();
      const headerFrame = decodedFrames.next();
      signal?.throwIfAborted();
      if (headerFrame.done) throw new Error("empty or header-less Zstandard session log");
      assertZstdHeaderFrame(headerFrame.value);
      const scanner = new SessionLogScanner(headerFrame.value);
      let remainingFrames = frames.length - 1;
      for (const plaintext of decodedFrames) {
        signal?.throwIfAborted();
        scanner.write(plaintext);
        remainingFrames -= 1;
        if (remainingFrames > 0 && performance2.now() >= yieldDeadline) {
          await scheduler2.yield();
          signal?.throwIfAborted();
          yieldDeadline = performance2.now() + ZSTD_DECODE_YIELD_INTERVAL_MS;
        }
      }
      signal?.throwIfAborted();
      const complete = scanner.checkpoint();
      if (complete.committedBytes !== complete.inputBytes) {
        throw new Error("corrupt Zstandard session log: complete frame contains a torn JSONL record");
      }
      if (tornStart === void 0) {
        const prefix2 = scanner.finish();
        return {
          meta: prefix2.meta,
          inheritedEventCount: prefix2.inheritedEventCount,
          events: prefix2.events,
          tornTruncateTo: void 0,
          recoveredTail: []
        };
      }
      let recoveredPlaintext = Buffer.alloc(0);
      try {
        signal?.throwIfAborted();
        recoveredPlaintext = await decompressZstdPrefix(buffer.subarray(tornStart));
      } catch {
        if (signal?.aborted) signal.throwIfAborted();
      }
      signal?.throwIfAborted();
      scanner.write(recoveredPlaintext);
      const prefix = scanner.finish();
      return {
        meta: prefix.meta,
        inheritedEventCount: prefix.inheritedEventCount,
        events: prefix.events,
        tornTruncateTo: tornStart,
        recoveredTail: prefix.events.slice(complete.eventCount)
      };
    } catch (error) {
      if (signal?.aborted) signal.throwIfAborted();
      throw error;
    } finally {
      decoder.close();
    }
  }
  async listArtifacts(signal) {
    signal?.throwIfAborted();
    await this.ensureRootEncoding();
    signal?.throwIfAborted();
    const artifacts = [];
    const ids = /* @__PURE__ */ new Set();
    for (const project of await this.listProjectDirs(signal)) {
      signal?.throwIfAborted();
      for (const dir of await this.listSessionDirs(project, signal)) {
        signal?.throwIfAborted();
        const selected = await this.resolveGenerationInDirectory(dir, signal);
        if (selected === void 0) continue;
        let header;
        try {
          header = await this.readGenerationHeader(selected, void 0, signal);
        } catch (error) {
          if (error instanceof SessionFormatUnsupportedError2) continue;
          throw error;
        }
        if (header === void 0) continue;
        if (ids.has(header.id)) {
          throw new Error(`duplicate JSONL session id "${header.id}" appears in multiple project directories`);
        }
        ids.add(header.id);
        artifacts.push({ header, path: selected.sourcePath });
      }
    }
    signal?.throwIfAborted();
    return artifacts;
  }
  /** Read and translate one selected generation header without inspecting its body. */
  async readGenerationHeader(selected, expectedId, signal) {
    let first;
    try {
      first = this.compression === "zstd" ? await this.readFirstZstdLine(selected.sourcePath, signal) : await this.readFirstLine(selected.sourcePath, signal);
    } catch (error) {
      signal?.throwIfAborted();
      if (isENOENT2(error)) return void 0;
      throw error;
    }
    signal?.throwIfAborted();
    if (first === void 0) return void 0;
    let value;
    try {
      value = JSON.parse(first);
    } catch {
      return void 0;
    }
    assertNoRetiredHeaderFields(value);
    const result = sessionFormatCatalog2.readHeader(value);
    if ("storedVersion" in result && result.storedVersion !== selected.sourceVersion) {
      throw new Error(
        `session generation filename identifies v${selected.sourceVersion}, but its header identifies v${result.storedVersion}`
      );
    }
    if (result.status === "unsupported") {
      const physicalId = String(value.id);
      let reason = result.reason;
      if (result.storedVersion > SESSION_FORMAT_VERSION2) {
        reason = sessionFormatVersionRefusal2(physicalId, result.storedVersion);
      }
      throw new SessionFormatUnsupportedError2(
        `${reason} (raw log: ${selected.sourcePath})`,
        { kind: "jsonl", path: selected.sourcePath }
      );
    }
    if (result.status === "malformed") return void 0;
    const header = this.currentHeader(result.header);
    await this.assertStoredIdentity(
      selected.sourcePath,
      selected.sourceVersion,
      header,
      expectedId,
      signal
    );
    return header;
  }
  /** Convert format-catalog string identities to current branded Session metadata. */
  currentHeader(header) {
    if (header.version !== SESSION_FORMAT_VERSION2) {
      throw new Error(`format catalog returned non-current logical header v${header.version}`);
    }
    return {
      version: SESSION_FORMAT_VERSION2,
      id: makeSessionId(header.id),
      createdAt: header.createdAt,
      ...header.cwd === void 0 ? {} : { cwd: header.cwd },
      ...header.parentSession === void 0 ? {} : { parentSession: makeSessionId(header.parentSession) },
      isSeeded: header.isSeeded,
      ...header.origin === void 0 ? {} : { origin: header.origin },
      delegationDepth: header.delegationDepth,
      ...header.agentPreset === void 0 ? {} : { agentPreset: header.agentPreset }
    };
  }
  // --- materialization / append / repair (file mechanics) ---
  /** Atomically write the header line + first batch (temp-write, fsync, publish). */
  async materialize(meta, inheritedEventCount, events) {
    const project = projectDir(this.root, meta.cwd);
    const dir = sessionDir(this.root, meta.cwd, meta.id);
    const finalPath = logPath(this.root, meta.cwd, meta.id, this.compression);
    await this.rejectOppositeArtifact(meta.cwd, meta.id);
    const content = await this.encodeMaterialization(meta, inheritedEventCount, events);
    if (process.platform === "win32") {
      await this.materializeWin32(project, dir, finalPath, meta.id, content);
    } else {
      await this.materializePosix(project, dir, finalPath, meta.id, content);
    }
  }
  /* v8 ignore start -- Windows uses the Win32 durable-publish path; POSIX coverage exercises this peer. */
  async materializePosix(project, dir, finalPath, id, content) {
    this.assertRootAvailable();
    if (!this.config.requireExistingRoot) await mkdir2(this.root, { recursive: true, mode: 448 });
    await this.syncDirPosix(dirname2(this.root));
    await mkdir2(project, { recursive: !this.config.requireExistingRoot, mode: 448 }).catch((error) => {
      if (error.code !== "EEXIST") throw error;
    });
    await this.syncDirPosix(this.root);
    await mkdir2(dir, { recursive: !this.config.requireExistingRoot, mode: 448 }).catch((error) => {
      if (error.code !== "EEXIST") throw error;
    });
    await this.syncDirPosix(project);
    await this.rejectExistingLog(finalPath, id);
    const tmp = await this.writeSyncedTempFile(finalPath, content);
    let linked = false;
    try {
      await link(tmp, finalPath);
      linked = true;
    } finally {
      if (!linked) await rm2(tmp, { force: true });
    }
    await this.syncDirPosix(dir);
    try {
      await rm2(tmp, { force: true });
    } catch {
    }
  }
  /* v8 ignore stop */
  /* v8 ignore start -- native Windows coverage exercises this integration path */
  async materializeWin32(project, dir, finalPath, id, content) {
    this.assertRootAvailable();
    const requiredRoot = this.config.requireExistingRoot ? this.root : void 0;
    await ensureDurableDirectoryWin32(this.root, requiredRoot);
    await ensureDurableDirectoryWin32(project, requiredRoot);
    await ensureDurableDirectoryWin32(dir, requiredRoot);
    await this.rejectExistingLog(finalPath, id);
    const tmp = await this.writeSyncedTempFile(finalPath, content);
    try {
      await publishNewFileWin32(tmp, finalPath);
    } catch (error) {
      await rm2(tmp, { force: true });
      throw error;
    }
  }
  /* v8 ignore stop */
  async rejectExistingLog(finalPath, id) {
    if (await this.resolveGenerationInDirectory(dirname2(finalPath)) !== void 0) {
      throw new Error(`refusing to materialize "${id}": a log already exists on disk (open it instead)`);
    }
  }
  async writeSyncedTempFile(finalPath, content) {
    const tmp = `${finalPath}.${randomBytes2(6).toString("hex")}.tmp`;
    const handle = await open2(tmp, "wx", 384);
    try {
      await handle.writeFile(content);
      await handle.sync();
    } finally {
      await handle.close();
    }
    return tmp;
  }
  /** Encode the header and first batch without combining their frame boundaries. */
  async encodeMaterialization(meta, inheritedEventCount, events) {
    const header = JSON.stringify(toHeaderLine(meta, meta.isSeeded ? inheritedEventCount : void 0)) + "\n";
    if (events.length === 0) {
      return this.compression === "none" ? header : compressZstdFrame(header);
    }
    const body = eventLines(events) + "\n";
    if (this.compression === "none") return header + body;
    const headerFrame = await compressZstdFrame(header);
    const eventFrame = await compressZstdFrame(body);
    return Buffer.concat([headerFrame, eventFrame]);
  }
  /** Encode one durable append batch in the configured physical representation. */
  async encodeEventBatch(events) {
    const body = eventLines(events) + "\n";
    return this.compression === "zstd" ? compressZstdFrame(body) : body;
  }
  /** fsync a POSIX directory so a just-created/renamed entry is crash-durable. */
  /* v8 ignore start -- Windows uses write-through namespace operations; POSIX coverage exercises directory fsync. */
  async syncDirPosix(dir) {
    const handle = await open2(dir, "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  }
  /* v8 ignore stop */
  /**
   * Append and fsync event lines. On a partial write or sync failure, restore the
   * previous size before rethrowing because the unchanged cursor will retry the
   * batch; leaving partial bytes would create duplicate sequence numbers.
   */
  async appendLines(meta, events) {
    const content = await this.encodeEventBatch(events);
    const path = logPath(this.root, meta.cwd, meta.id, this.compression);
    const handle = await open2(path, "a");
    let closed = false;
    const closeAppendHandle = async () => {
      if (closed) return;
      closed = true;
      await handle.close();
    };
    try {
      const { size: before } = await handle.stat();
      try {
        await handle.writeFile(content);
        await handle.sync();
      } catch (error) {
        try {
          await closeAppendHandle();
          await this.rollbackAppend(path, before);
        } catch (rollbackError) {
          throw new AggregateError([error, rollbackError], `failed to roll back append to "${path}"`);
        }
        throw error;
      }
    } finally {
      await closeAppendHandle();
    }
  }
  async rollbackAppend(path, size) {
    const handle = await open2(path, "r+");
    try {
      await handle.truncate(size);
      await handle.sync();
    } finally {
      await handle.close();
    }
  }
  /** Truncate the log file to `offset` bytes and fsync (discard the crash tail). */
  async repair(meta, offset) {
    const path = logPath(this.root, meta.cwd, meta.id, this.compression);
    await truncate(path, offset);
    const handle = await open2(path, "r+");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  }
  // --- discovery helpers ---
  /**
   * Read the first newline-terminated line of a file without loading the whole
   * file. Returns undefined if the file is empty or has no complete first line.
   * Reads in bounded chunks so a huge log costs only the header read.
   */
  async readFirstLine(path, signal) {
    signal?.throwIfAborted();
    const handle = await open2(path, "r");
    try {
      signal?.throwIfAborted();
      const chunks = [];
      const buf = Buffer.alloc(8192);
      for (; ; ) {
        signal?.throwIfAborted();
        const { bytesRead } = await handle.read(buf, 0, buf.length, null);
        signal?.throwIfAborted();
        if (bytesRead === 0) return void 0;
        const slice = buf.subarray(0, bytesRead);
        const nl = slice.indexOf(10);
        if (nl !== -1) {
          chunks.push(slice.subarray(0, nl));
          signal?.throwIfAborted();
          return Buffer.concat(chunks).toString("utf8");
        }
        chunks.push(Buffer.from(slice));
      }
    } finally {
      await handle.close();
    }
  }
  /** Read and validate only the independently compressed header frame. */
  async readFirstZstdLine(path, signal) {
    signal?.throwIfAborted();
    const handle = await open2(path, "r");
    try {
      signal?.throwIfAborted();
      let content = Buffer.alloc(0);
      const chunk = Buffer.alloc(8192);
      for (; ; ) {
        signal?.throwIfAborted();
        const { bytesRead } = await handle.read(chunk, 0, chunk.length, null);
        signal?.throwIfAborted();
        if (bytesRead === 0) return void 0;
        signal?.throwIfAborted();
        content = Buffer.concat([content, chunk.subarray(0, bytesRead)]);
        signal?.throwIfAborted();
        const first = scanZstdFrames(content, 1).frames[0];
        signal?.throwIfAborted();
        if (first === void 0) continue;
        let plaintext;
        try {
          signal?.throwIfAborted();
          plaintext = await decompressZstdFrame(content.subarray(first.start, first.end));
        } catch (error) {
          if (signal?.aborted) signal.throwIfAborted();
          throw new Error("corrupt Zstandard session log: header frame failed validation", { cause: error });
        }
        signal?.throwIfAborted();
        assertZstdHeaderFrame(plaintext);
        return plaintext.subarray(0, -1).toString("utf8");
      }
    } finally {
      await handle.close();
    }
  }
  /** Select the numerically highest canonical generation in one Session directory. */
  async resolveGenerationInDirectory(dir, signal) {
    signal?.throwIfAborted();
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (error) {
      if (isENOENT2(error)) return void 0;
      throw error;
    }
    signal?.throwIfAborted();
    const generations = [];
    const opposite = [];
    for (const entry of entries) {
      const version = parseGenerationLogFilename(entry.name, this.compression);
      if (version !== void 0) {
        generations.push({ path: join5(dir, entry.name), version });
        continue;
      }
      if (parseGenerationLogFilename(entry.name, this.oppositeCompression()) !== void 0) {
        opposite.push(join5(dir, entry.name));
      }
    }
    if (opposite.length > 0) throw this.encodingMismatch(opposite[0]);
    const latest = generations.sort((left, right) => right.version - left.version)[0];
    if (latest === void 0) return void 0;
    return {
      sourcePath: latest.path,
      sourceVersion: latest.version,
      currentPath: join5(
        dir,
        generationLogFilename(sessionFormatCatalog2.currentVersion, this.compression)
      )
    };
  }
  /** Find the unique authoritative generation for an id across project directories. */
  async findLog(id, signal) {
    const matches = [];
    for (const project of await this.listProjectDirs(signal)) {
      signal?.throwIfAborted();
      await this.rejectLegacyFlatArtifact(project, id, signal);
      signal?.throwIfAborted();
      const dir = join5(project, encodeSegment(id));
      const selected = await this.resolveGenerationInDirectory(dir, signal);
      if (selected !== void 0) matches.push(selected);
    }
    if (matches.length > 1) {
      throw new Error(`duplicate JSONL session id "${id}" appears in multiple project directories`);
    }
    signal?.throwIfAborted();
    return matches[0];
  }
  /** Require an existing configured root to be a readable directory. */
  assertUsableRoot() {
    try {
      readdirSync(this.root);
      if (this.config.requireExistingRoot) {
        const info = lstatSync(this.root, { bigint: true });
        const path = realpathSync(this.root);
        if (!info.isDirectory() || info.isSymbolicLink() || info.dev === 0n || info.ino === 0n) {
          throw Object.assign(new Error("SESSION_ROOT_IDENTITY_UNAVAILABLE"), { code: "SESSION_ROOT_IDENTITY_UNAVAILABLE" });
        }
        const observed = { path, dev: info.dev, ino: info.ino, birthtimeNs: info.birthtimeNs };
        const prior = this.rootIdentity;
        if (prior !== void 0 && (prior.path !== observed.path || prior.dev !== observed.dev || prior.ino !== observed.ino || prior.birthtimeNs !== observed.birthtimeNs)) {
          throw Object.assign(new Error("SESSION_ROOT_IDENTITY_CHANGED"), { code: "SESSION_ROOT_IDENTITY_CHANGED" });
        }
        this.rootIdentity ??= observed;
      }
    } catch (error) {
      if (isENOENT2(error) && !this.config.requireExistingRoot) return;
      throw error;
    }
  }
  /** Verify the configured existing root before provider and handle operations, including cached reads and no-op flushes. */
  assertRootAvailable() {
    if (this.config.requireExistingRoot) this.assertUsableRoot();
  }
  /** Reject metadata that does not identify the selected physical log. */
  async assertStoredIdentity(path, storedVersion2, meta, expectedId, signal) {
    signal?.throwIfAborted();
    if (expectedId !== void 0 && meta.id !== expectedId) {
      throw new Error(`corrupt session log "${path}": requested id "${expectedId}" does not match header id "${meta.id}"`);
    }
    let expectedPath;
    try {
      expectedPath = generationLogPath(
        this.root,
        meta.cwd,
        meta.id,
        storedVersion2,
        this.compression
      );
    } catch (error) {
      throw new Error(`corrupt session log "${path}": header id cannot name a storage path`, { cause: error });
    }
    if (path !== expectedPath && !await this.sameFile(path, expectedPath, signal)) {
      throw new Error(`corrupt session log "${path}": header id "${meta.id}" and cwd identify "${expectedPath}"`);
    }
    signal?.throwIfAborted();
  }
  /** Validate a supported historical header against the selected source path. */
  validateSourceIdentity(selected, headerValue, expectedId, signal) {
    const result = sessionFormatCatalog2.readHeader(headerValue);
    if (result.status !== "current" && result.status !== "migration-required") return;
    return this.assertStoredIdentity(
      selected.sourcePath,
      selected.sourceVersion,
      this.currentHeader(result.header),
      expectedId,
      signal
    );
  }
  /**
   * Whether two path spellings resolve to the same physical file. This admits
   * case aliases on case-insensitive filesystems without weakening identity
   * checks on case-sensitive stores.
   */
  async sameFile(path, expectedPath, signal) {
    signal?.throwIfAborted();
    try {
      const [actual, expected] = await Promise.all([realpath(path), realpath(expectedPath)]);
      signal?.throwIfAborted();
      return actual === expected;
    } catch (error) {
      signal?.throwIfAborted();
      if (isENOENT2(error)) return false;
      throw error;
    }
  }
  /** The human-readable project directories under the configured root. */
  async listProjectDirs(signal) {
    try {
      signal?.throwIfAborted();
      const entries = await readdir(this.root, { withFileTypes: true });
      signal?.throwIfAborted();
      return entries.filter((e) => e.isDirectory()).map((e) => join5(this.root, e.name));
    } catch (error) {
      if (isENOENT2(error)) return [];
      throw error;
    }
  }
  /** List session-owned directories and reject the obsolete flat-file layout. */
  async listSessionDirs(project, signal) {
    signal?.throwIfAborted();
    const entries = await readdir(project, { withFileTypes: true });
    signal?.throwIfAborted();
    const legacy = entries.find((entry) => entry.isFile() && (entry.name.endsWith(".jsonl") || entry.name.endsWith(".jsonl.zstd")));
    if (legacy !== void 0) throw this.legacyLayout(join5(project, legacy.name));
    return entries.filter((entry) => entry.isDirectory()).map((entry) => join5(project, entry.name));
  }
  /** Reject a root that already belongs to the other physical encoding. */
  ensureRootEncoding() {
    this.assertRootAvailable();
    this.rootEncodingCheck ??= this.checkRootEncoding();
    return this.rootEncodingCheck;
  }
  async checkRootEncoding() {
    for (const project of await this.listProjectDirs()) {
      for (const dir of await this.listSessionDirs(project)) {
        const incompatible = await this.findOppositeGenerationInDirectory(dir);
        if (incompatible !== void 0) throw this.encodingMismatch(incompatible);
      }
    }
  }
  async rejectLegacyFlatArtifact(project, id, signal) {
    signal?.throwIfAborted();
    const encoded = encodeSegment(id);
    for (const compression of ["zstd", "none"]) {
      const path = join5(project, encoded + logSuffix(compression));
      const artifactExists = await this.exists(path);
      signal?.throwIfAborted();
      if (artifactExists) throw this.legacyLayout(path);
    }
  }
  async rejectOppositeArtifact(cwd, id) {
    const path = await this.findOppositeGenerationInDirectory(sessionDir(this.root, cwd, id));
    if (path !== void 0) throw this.encodingMismatch(path);
  }
  /** Return the highest canonical generation encoded with the other configured suffix. */
  async findOppositeGenerationInDirectory(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (error) {
      if (isENOENT2(error)) return void 0;
      throw error;
    }
    const generations = [];
    for (const entry of entries) {
      const version = parseGenerationLogFilename(entry.name, this.oppositeCompression());
      if (version !== void 0) generations.push({ name: entry.name, version });
    }
    const latest = generations.sort((left, right) => right.version - left.version)[0];
    return latest === void 0 ? void 0 : join5(dir, latest.name);
  }
  oppositeCompression() {
    return this.compression === "zstd" ? "none" : "zstd";
  }
  encodingMismatch(path) {
    return new Error(
      `session artifact ${JSON.stringify(path)} uses ${logSuffix(this.oppositeCompression())}, but this backend is configured for compression ${JSON.stringify(this.compression)}; use a separate root or select the matching compression mode`
    );
  }
  legacyLayout(path) {
    return new Error(
      `session artifact ${JSON.stringify(path)} uses the unsupported flat-file layout; use a separate root or move it into a project/session directory before loading`
    );
  }
  async exists(path) {
    try {
      const handle = await open2(path, "r");
      await handle.close();
      return true;
    } catch (error) {
      if (isENOENT2(error)) {
        if (process.platform === "win32") await this.assertLogParentAllowsAbsence(path);
        return false;
      }
      throw error;
    }
  }
  /* v8 ignore start -- native Windows coverage exercises this repair; POSIX open reports ENOTDIR before this point. */
  async assertLogParentAllowsAbsence(path) {
    try {
      const parent = dirname2(path);
      const info = await stat3(parent);
      if (info.isDirectory()) return;
      const error = new Error(`ENOTDIR: parent path exists but is not a directory: ${parent}`);
      error.code = "ENOTDIR";
      error.path = parent;
      throw error;
    } catch (error) {
      if (isENOENT2(error)) return;
      throw error;
    }
  }
  /* v8 ignore stop */
};
var index_default = JsonlSessionPersistence;
export {
  JsonlCompressionSchema,
  index_default as default,
  scanZstdFrames
};
//# sourceMappingURL=index.js.map
