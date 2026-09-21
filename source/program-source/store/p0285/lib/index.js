// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/storage/storage-json/src/index.ts
import { mkdir as mkdir2 } from "node:fs/promises";
import z from "@deepseek-ai/schemastery";
import { StorageError as StorageError4, UNIT_NAME_RE, storageBackendServiceKey } from "@deepseek-ai/dsh-storage";

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/storage/storage-json/src/single-unit.ts
import { readFile } from "node:fs/promises";
import { join as join2 } from "node:path";
import { StorageError as StorageError2 } from "@deepseek-ai/dsh-storage";

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/storage/storage-json/src/atomic.ts
import { open, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
async function writeAtomic(path, data, retry) {
  const tmp = join(dirname(path), `.${randomUUID()}.tmp`);
  const progress = { stage: "open", attempts: 0, published: false };
  let handle;
  try {
    handle = await open(tmp, "wx", 384);
    progress.stage = "write";
    await handle.writeFile(data, "utf8");
    progress.stage = "sync";
    await handle.sync();
    progress.stage = "close";
    const completed = handle;
    handle = void 0;
    await completed.close();
    progress.stage = "rename";
    for (; ; ) {
      progress.attempts++;
      try {
        await rename(tmp, path);
        break;
      } catch (error) {
        const code = error.code;
        if (process.platform !== "win32" || code !== "EPERM" && code !== "EBUSY" || progress.attempts > retry.maxRetries) throw error;
        await delay(retry.delayMs * progress.attempts);
      }
    }
    progress.published = true;
    progress.stage = "directory-sync";
    await fsyncDirectory(dirname(path), progress);
  } catch (error) {
    if (handle) {
      try {
        await handle.close();
      } catch (closeError) {
        progress.closeError = describeSecondary("close", closeError);
      }
    }
    if (!progress.published) {
      try {
        await rm(tmp, { force: true });
      } catch (cleanupError) {
        progress.cleanupError = describeSecondary("cleanup", cleanupError);
      }
    }
    const failure = error instanceof Error ? error : new Error("JSON publication failed", { cause: error });
    throw Object.assign(failure, { storagePublish: progress });
  }
}
function describeSecondary(stage, error) {
  const code = error.code;
  return { stage, ...typeof code === "string" ? { code } : {}, message: error instanceof Error ? error.message : String(error) };
}
async function fsyncDirectory(path, progress) {
  if (process.platform === "win32") return;
  const handle = await open(path, "r");
  try {
    await handle.sync();
  } catch (error) {
    try {
      await handle.close();
    } catch (closeError) {
      progress.closeError = describeSecondary("close", closeError);
    }
    throw error;
  }
  await handle.close();
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/storage/storage-json/src/format.ts
import { StorageError } from "@deepseek-ai/dsh-storage";
function serialize(name2, state) {
  const tables = {};
  for (const [table, records] of state.tables) {
    tables[table] = Object.fromEntries(records);
  }
  const document = {
    unit: { name: name2, version: state.version },
    global: state.global,
    tables
  };
  return `${JSON.stringify(document, null, 2)}
`;
}
function parse(text, descriptor) {
  let document;
  try {
    document = JSON.parse(text);
  } catch (error) {
    throw new StorageError("malformed-medium", `unit '${descriptor.name}': file is not valid JSON`, { cause: error });
  }
  if (typeof document !== "object" || document === null) {
    throw new StorageError("malformed-medium", `unit '${descriptor.name}': file is not a JSON object`);
  }
  const { unit, global: globalValue, tables } = document;
  if (typeof unit !== "object" || unit === null || unit["name"] !== descriptor.name || typeof unit["version"] !== "number") {
    throw new StorageError("malformed-medium", `unit '${descriptor.name}': missing or foreign unit header`);
  }
  const version = unit["version"];
  if (version !== descriptor.version) {
    throw new StorageError(
      "version-mismatch",
      `unit '${descriptor.name}': stored version ${version} != expected ${descriptor.version}`
    );
  }
  if (typeof tables !== "object" || tables === null) {
    throw new StorageError("malformed-medium", `unit '${descriptor.name}': tables is not an object`);
  }
  const state = { version, global: globalValue ?? null, tables: /* @__PURE__ */ new Map() };
  for (const table of descriptor.tables) {
    const records = tables[table];
    if (records === void 0) {
      state.tables.set(table, /* @__PURE__ */ new Map());
      continue;
    }
    if (typeof records !== "object" || records === null || Array.isArray(records)) {
      throw new StorageError("malformed-medium", `unit '${descriptor.name}': table '${table}' is not an object`);
    }
    state.tables.set(table, new Map(Object.entries(records)));
  }
  return state;
}
function serializeRecord(version, value) {
  return `${JSON.stringify({ version, record: value }, null, 2)}
`;
}
function parseRecord(text, versions) {
  let document;
  try {
    document = JSON.parse(text);
  } catch {
    return void 0;
  }
  if (typeof document !== "object" || document === null) return void 0;
  const { version: stamped, record } = document;
  if (typeof stamped !== "number" || !versions.includes(stamped)) return void 0;
  return record;
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/storage/storage-json/src/single-unit.ts
async function openSingleUnit(descriptor, root, onClose, retry) {
  const path = join2(root, `${descriptor.name}.json`);
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const state = text === void 0 ? {
    version: descriptor.version,
    global: null,
    tables: new Map(descriptor.tables.map((table) => [table, /* @__PURE__ */ new Map()]))
  } : parse(text, descriptor);
  return new JsonKvUnit(descriptor, path, state, onClose, retry);
}
var JsonKvUnit = class {
  constructor(descriptor, path, state, onClose, retry) {
    this.descriptor = descriptor;
    this.path = path;
    this.state = state;
    this.onClose = onClose;
    this.retry = retry;
  }
  descriptor;
  path;
  state;
  onClose;
  retry;
  closed = false;
  writeTail = Promise.resolve();
  publicationFailure;
  /** In-flight publishes; close() drains them before releasing the unit. */
  inFlight = /* @__PURE__ */ new Set();
  // oxlint-disable-next-line typescript/require-await -- async keeps the closed guard a rejection, not a synchronous throw
  async loadAll() {
    this.assertOpen();
    const tables = {};
    for (const [table, records] of this.state.tables) {
      tables[table] = Object.fromEntries(records);
    }
    return { tables, global: this.state.global };
  }
  async putRecord(table, key, value) {
    this.assertOpen();
    await this.enqueue(async () => {
      const records = new Map(this.records(table));
      records.set(key, value);
      const tables = new Map(this.state.tables);
      tables.set(table, records);
      await this.publish({ ...this.state, tables });
    });
  }
  async deleteRecord(table, key) {
    this.assertOpen();
    await this.enqueue(async () => {
      const records = new Map(this.records(table));
      if (!records.has(key)) return;
      records.delete(key);
      const tables = new Map(this.state.tables);
      tables.set(table, records);
      await this.publish({ ...this.state, tables });
    });
  }
  async setGlobal(value) {
    this.assertOpen();
    if (!this.descriptor.hasGlobal) {
      throw new Error(`unit '${this.descriptor.name}' does not declare a global slot`);
    }
    await this.enqueue(() => this.publish({ ...this.state, global: value }));
  }
  async close() {
    if (this.closed) {
      await Promise.allSettled(this.inFlight);
      return;
    }
    this.closed = true;
    await Promise.allSettled(this.inFlight);
    this.onClose();
  }
  assertOpen() {
    if (this.publicationFailure) throw this.publicationFailure;
    if (this.closed) {
      throw new StorageError2("closed", `unit '${this.descriptor.name}' is closed`);
    }
  }
  records(table) {
    const records = this.state.tables.get(table);
    if (!records) {
      throw new Error(`unit '${this.descriptor.name}' does not declare table '${table}'`);
    }
    return records;
  }
  /** Reserve ordering before the first await; close drains accepted queued writes. */
  enqueue(operation) {
    const write = this.writeTail.then(() => {
      if (this.publicationFailure) throw this.publicationFailure;
      return operation();
    });
    this.writeTail = write.catch(() => {
    });
    this.inFlight.add(write);
    write.catch(() => {
    }).finally(() => this.inFlight.delete(write));
    return write;
  }
  async publish(candidate) {
    try {
      await writeAtomic(this.path, serialize(this.descriptor.name, candidate), this.retry);
      this.state = candidate;
    } catch (error) {
      if (error.storagePublish?.published) {
        this.state = candidate;
        this.publicationFailure = error;
      }
      throw error;
    }
  }
};

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/storage/storage-json/src/per-record-unit.ts
import { mkdir, readFile as readFile2, readdir, rename as rename2, rm as rm2, lstat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname as dirname2, join as join3 } from "node:path";
import { StorageError as StorageError3 } from "@deepseek-ai/dsh-storage";
var SAFE_KEY_RE = /^[a-zA-Z0-9_-]+$/;
var BOOTSTRAP_PENDING = ".sep-bootstrap.pending.json";
async function assertBootstrapComplete(dir) {
  try {
    await lstat(join3(dir, BOOTSTRAP_PENDING));
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  throw new StorageError3("malformed-medium", "incomplete legacy bootstrap requires maintenance; preserve the legacy file and pending marker");
}
async function openPerRecordUnit(descriptor, root, onClose, retry) {
  return new PerRecordJsonUnit(descriptor, join3(root, descriptor.name), onClose, retry);
}
async function loadPerRecordState(descriptor, dir, retry) {
  const versions = acceptedStamps(descriptor);
  const state = {
    version: descriptor.version,
    global: null,
    tables: new Map(descriptor.tables.map((table) => [table, /* @__PURE__ */ new Map()]))
  };
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const hasNewDocuments = entries === void 0 ? false : (await Promise.all(entries.map(async (entry) => {
    if (entry.isDirectory()) {
      const records = state.tables.get(entry.name);
      if (records !== void 0) {
        return loadTableRecords(records, versions, join3(dir, entry.name));
      }
    }
    if (entry.name === "global.json" && descriptor.hasGlobal) {
      const global = await readRecord(join3(dir, entry.name), versions);
      if (global !== void 0) state.global = global;
      return true;
    }
    return false;
  }))).some(Boolean);
  if (!hasNewDocuments) await bootstrapLegacyUnit(descriptor, dir, state, retry);
  return state;
}
function acceptedStamps(descriptor) {
  return [descriptor.version, ...descriptor.compatibleVersions ?? []];
}
async function bootstrapLegacyUnit(descriptor, dir, state, retry) {
  const legacyPath = join3(dirname2(dir), `${descriptor.name}.json`);
  let text;
  try {
    text = await readFile2(legacyPath, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return;
  }
  let document;
  try {
    document = JSON.parse(text);
  } catch {
    return;
  }
  if (document.unit?.name !== descriptor.name) return;
  const stamped = document.unit.version;
  if (typeof stamped !== "number" || !acceptedStamps(descriptor).includes(stamped)) return;
  const tables = document.tables;
  if (typeof tables !== "object" || tables === null) return;
  const recordsByTable = tables;
  for (const [table, records] of Object.entries(recordsByTable)) {
    if (!state.tables.has(table)) continue;
    if (typeof records !== "object" || records === null || Array.isArray(records)) {
      throw new StorageError3("malformed-medium", "legacy table is not a record map");
    }
    for (const key of Object.keys(records)) assertSafeKey(descriptor.name, key);
  }
  await mkdir(dir, { recursive: true, mode: 448 });
  const marker = join3(dir, BOOTSTRAP_PENDING);
  await writeAtomic(marker, JSON.stringify({
    schema: 1,
    unit: descriptor.name,
    sourceSha256: createHash("sha256").update(text).digest("hex")
  }) + "\n", retry);
  for (const [table, records] of Object.entries(recordsByTable)) {
    const target = state.tables.get(table);
    if (target === void 0) continue;
    for (const [key, value] of Object.entries(records)) {
      const path = join3(dir, table, `${key}.json`);
      await mkdir(dirname2(path), { recursive: true, mode: 448 });
      await writeAtomic(path, serializeRecord(descriptor.version, value), retry);
      target.set(key, value);
    }
  }
  await rm2(marker);
}
async function loadTableRecords(records, versions, dir) {
  const files = await readdir(dir, { withFileTypes: true });
  const hasDocuments = files.some((file) => file.name.endsWith(".json"));
  const loaded = await Promise.all(files.map(async (file) => {
    if (!file.name.endsWith(".json")) return;
    const key = file.name.slice(0, -".json".length);
    if (!SAFE_KEY_RE.test(key)) return;
    const record = await readRecord(join3(dir, file.name), versions);
    if (record !== void 0) return [key, record];
  }));
  for (const record of loaded) {
    if (record !== void 0) records.set(...record);
  }
  return hasDocuments;
}
async function readRecord(path, versions) {
  try {
    return parseRecord(await readFile2(path, "utf8"), versions);
  } catch {
    return void 0;
  }
}
var PerRecordJsonUnit = class {
  constructor(descriptor, dir, onClose, retry) {
    this.descriptor = descriptor;
    this.dir = dir;
    this.onClose = onClose;
    this.retry = retry;
  }
  descriptor;
  dir;
  onClose;
  retry;
  closed = false;
  /** In-flight durable writes; close() drains them before releasing the unit. */
  inFlight = /* @__PURE__ */ new Set();
  operationTail = Promise.resolve();
  /** Re-read the tree: the directory is the authoritative state. */
  async loadAll() {
    this.assertOpen();
    return this.tracked(async () => {
      const state = await loadPerRecordState(this.descriptor, this.dir, this.retry);
      const tables = {};
      for (const [table, records] of state.tables) tables[table] = Object.fromEntries(records);
      return { tables, global: state.global };
    });
  }
  /** Durably replace one record: its own document, atomically. */
  async putRecord(table, key, value) {
    this.assertOpen();
    assertSafeKey(this.descriptor.name, key);
    await this.tracked(() => this.writeDocument(join3(this.tableDir(table), `${key}.json`), value));
  }
  /** Durably delete one record. Idempotent: a missing key is a no-op. */
  async deleteRecord(table, key) {
    this.assertOpen();
    assertSafeKey(this.descriptor.name, key);
    await this.tracked(() => rm2(join3(this.tableDir(table), `${key}.json`), { force: true }));
  }
  /**
   * Move one record's document aside as `<key>.json.bak.<YYYYMMDDHHmm>`. The
   * moved file no longer ends in `.json`, so every later read ignores it; the
   * bytes stay on disk for inspection. A same-minute backup of the same
   * key overwrites the previous backup (the newer bytes are the ones worth
   * keeping).
   */
  async backupRecord(table, key) {
    this.assertOpen();
    assertSafeKey(this.descriptor.name, key);
    const path = join3(this.tableDir(table), `${key}.json`);
    const moved = `${path}.bak.${backupStamp(/* @__PURE__ */ new Date())}`;
    await this.tracked(() => rename2(path, moved));
    return moved;
  }
  /** Durably replace the global singleton. Only valid when declared. */
  async setGlobal(value) {
    this.assertOpen();
    if (!this.descriptor.hasGlobal) {
      throw new Error(`unit '${this.descriptor.name}' does not declare a global slot`);
    }
    await this.tracked(() => this.writeDocument(join3(this.dir, "global.json"), value));
  }
  /* jscpd:ignore-start -- the two unit classes are standalone; the drain/guard lifecycle mirrors the shared KvUnit contract */
  /** Drain in-flight writes and release the unit. Idempotent. */
  async close() {
    if (this.closed) {
      await Promise.allSettled(this.inFlight);
      return;
    }
    this.closed = true;
    await Promise.allSettled(this.inFlight);
    this.onClose();
  }
  assertOpen() {
    if (this.closed) {
      throw new StorageError3("closed", `unit '${this.descriptor.name}' is closed`);
    }
  }
  /* jscpd:ignore-end */
  /** Resolve a declared table's directory; an undeclared table is a caller bug and throws. */
  tableDir(table) {
    if (!this.descriptor.tables.includes(table)) {
      throw new Error(`unit '${this.descriptor.name}' does not declare table '${table}'`);
    }
    return join3(this.dir, table);
  }
  /** Durably replace one document, creating its parent directory. */
  writeDocument(path, value) {
    return (async () => {
      await mkdir(dirname2(path), { recursive: true, mode: 448 });
      await writeAtomic(path, serializeRecord(this.descriptor.version, value), this.retry);
    })();
  }
  /** Include bootstrap and queued work in close's drain before releasing ownership. */
  tracked(operation) {
    const write = this.operationTail.then(async () => {
      await assertBootstrapComplete(this.dir);
      return operation();
    });
    this.operationTail = write.then(() => {
    }, () => {
    });
    this.inFlight.add(write);
    write.catch(() => {
    }).finally(() => this.inFlight.delete(write));
    return write;
  }
};
function backupStamp(now) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${String(now.getFullYear())}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}`;
}
function assertSafeKey(unit, key) {
  if (!SAFE_KEY_RE.test(key)) {
    throw new Error(`unit '${unit}': per-record key '${key}' is not path-safe (must match ${SAFE_KEY_RE})`);
  }
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/storage/storage-json/src/index.ts
var RenameRetryConfig = z.object({
  maxRetries: z.number().step(1).min(0).max(5).default(3),
  delayMs: z.number().step(1).min(1).max(1e3).default(25)
});
var name = "storage-json";
var inject = ["storage"];
var Config = z.object({
  root: z.string().required(),
  renameRetry: RenameRetryConfig.default({ maxRetries: 3, delayMs: 25 })
});
var JsonStorageBackend = class {
  constructor(root, retry) {
    this.root = root;
    this.retry = RenameRetryConfig(retry ?? {});
  }
  root;
  open = /* @__PURE__ */ new Map();
  // Reserved synchronously at open() entry so a concurrent open of the same
  // unit fails, and close() can await opens still in flight.
  opening = /* @__PURE__ */ new Map();
  closed = false;
  retry;
  kv = {
    // The body up to the first await runs synchronously, so the opening-slot
    // reservation below still excludes a concurrent open of the same unit.
    open: async (descriptor) => {
      if (this.closed) throw new StorageError4("closed", "json backend is closed");
      validateDescriptor(descriptor);
      if (this.open.has(descriptor.name) || this.opening.has(descriptor.name)) {
        throw new Error(`unit '${descriptor.name}' is already open; a unit has exactly one live handle`);
      }
      const opening = this.openUnit(descriptor);
      this.opening.set(descriptor.name, opening);
      return opening.finally(() => this.opening.delete(descriptor.name));
    }
  };
  async openUnit(descriptor) {
    await mkdir2(this.root, { recursive: true, mode: 448 });
    const onClose = () => this.open.delete(descriptor.name);
    const unit = descriptor.layout === "per-record" ? await openPerRecordUnit(descriptor, this.root, onClose, this.retry) : await openSingleUnit(descriptor, this.root, onClose, this.retry);
    if (this.closed) {
      await unit.close();
      throw new StorageError4("closed", "json backend is closed");
    }
    this.open.set(descriptor.name, unit);
    return unit;
  }
  async close() {
    if (!this.closed) {
      this.closed = true;
    }
    await Promise.allSettled([...this.opening.values()]);
    for (const unit of [...this.open.values()]) {
      await unit.close();
    }
  }
};
function validateDescriptor(descriptor) {
  if (!UNIT_NAME_RE.test(descriptor.name)) {
    throw new StorageError4("malformed-medium", `invalid unit name '${descriptor.name}'`);
  }
  for (const table of descriptor.tables) {
    if (!UNIT_NAME_RE.test(table)) {
      throw new StorageError4("malformed-medium", `invalid table name '${table}' in unit '${descriptor.name}'`);
    }
  }
}
function apply(ctx, config) {
  const backend = new JsonStorageBackend(config.root, config.renameRetry);
  ctx.effect(() => {
    const unregister = ctx.storage.backend.register("json", backend);
    return async () => {
      unregister();
      await backend.close();
    };
  });
  ctx.provide(storageBackendServiceKey("json"), backend);
}
export {
  Config,
  JsonStorageBackend,
  apply,
  inject,
  name
};
//# sourceMappingURL=index.js.map
