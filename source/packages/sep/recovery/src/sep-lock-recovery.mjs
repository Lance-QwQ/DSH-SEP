import fs from 'node:fs/promises';
import path from 'node:path';
import { ChildProcess } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';

const scopes = new WeakMap(), receipts = new WeakMap();
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = code => { throw Object.assign(new Error(code), { code }); };
const equalPath = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const blocked = reason => ({ status: 'blocked', reason, recovered: false });
async function identity(dir) {
  if (typeof dir !== 'string' || !path.isAbsolute(dir) || dir.startsWith('\\\\') || /[\x00-\x1f]/.test(dir)) fail('SEP_PATH_INVALID');
  const resolved = path.resolve(dir);
  let part = path.parse(resolved).root;
  for (const name of path.relative(part, resolved).split(path.sep).filter(Boolean)) {
    part = path.join(part, name);
    const entry = await fs.lstat(part, { bigint: true });
    if (!entry.isDirectory() || entry.isSymbolicLink() || entry.ino === 0n) fail('SEP_DIRECTORY_UNVERIFIED');
    if (!equalPath(await fs.realpath(part), part)) fail('SEP_DIRECTORY_UNVERIFIED');
  }
  const entry = await fs.lstat(resolved, { bigint: true });
  return { path: resolved, dev: String(entry.dev), ino: String(entry.ino) };
}
async function lock(file) {
  let entry;
  try { entry = await fs.lstat(file, { bigint: true }); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  if (!entry.isFile() || entry.isSymbolicLink() || entry.nlink !== 1n || entry.ino === 0n || entry.size > 4096n) fail('SEP_LOCK_UNVERIFIED');
  const handle = await fs.open(file, 'r');
  try {
    const held = await handle.stat({ bigint: true });
    if (held.dev !== entry.dev || held.ino !== entry.ino || held.nlink !== 1n) fail('SEP_LOCK_CHANGED');
    const bytes = await handle.readFile();
    const after = await fs.lstat(file, { bigint: true });
    if (after.dev !== entry.dev || after.ino !== entry.ino || after.size !== BigInt(bytes.length) || after.nlink !== 1n) fail('SEP_LOCK_CHANGED');
    let value;
    try { value = JSON.parse(bytes.toString('utf8')); } catch { fail('SEP_LOCK_INVALID'); }
    return { path: file, dev: String(entry.dev), ino: String(entry.ino), sha256: sha(bytes), size: bytes.length, bytes: bytes.toString('base64'), value };
  } finally { await handle.close(); }
}
function alive(child) {
  return child instanceof ChildProcess && Number.isSafeInteger(child.pid) && child.pid > 0 && child.exitCode === null && child.signalCode === null;
}
function absentPid(pid) {
  try { process.kill(pid, 0); return false; }
  catch (error) { return error.code === 'ESRCH'; }
}
function paths(suiteLockDirectory, storageRoot) {
  return { suite: path.join(suiteLockDirectory, 'dsh-system-enhancement-package-v1.lock'),
    p2: storageRoot ? path.join(storageRoot, '.suite-memory', 'p2', 'owner.lock') : null };
}
async function verifyScope(scope) {
  if (!same(await identity(scope.suite.path), scope.suite)) fail('SEP_DIRECTORY_CHANGED');
  if (scope.storage && !same(await identity(scope.storage.path), scope.storage)) fail('SEP_DIRECTORY_CHANGED');
}

/** Call before creating this generation's child. Existing locks are a launch refusal. */
export async function prepareSepLockScope({ suiteLockDirectory, storageRoot, resolveStorageIdentity } = {}) {
  const suite = await identity(suiteLockDirectory), storage = storageRoot === undefined ? null : await identity(storageRoot);
  const files = paths(suite.path, storage?.path);
  if (await lock(files.suite) || files.p2 && await lock(files.p2)) fail('SEP_LOCK_PREEXISTS');
  const metadata = Object.freeze({ id: randomUUID(), suiteLockDirectory: suite.path, storageRoot: storage?.path ?? null, preparedAt: Date.now() });
  scopes.set(metadata, { suite, storage, files, resolveStorageIdentity, preparedAt: metadata.preparedAt, consumed: false });
  return metadata;
}

/** In-memory capability bound to a real child handle; a JSON copy cannot authorize recovery. */
export async function captureSepLockReceipt({ child, generation, prepared, suiteLockDirectory, storageRoot } = {}) {
  const scope = scopes.get(prepared);
  if (!scope || scope.consumed || !alive(child) || !Number.isSafeInteger(generation) || generation < 1) fail('SEP_CAPTURE_UNPROVEN');
  if (!equalPath(path.resolve(suiteLockDirectory ?? ''), scope.suite.path)
    || (scope.storage ? !equalPath(path.resolve(storageRoot ?? ''), scope.storage.path) : storageRoot !== undefined)) fail('SEP_CAPTURE_SCOPE_CHANGED');
  const capability = { child, generation, scope, observedExit: null, store: null, p2: null, p2Directory: null, used: false, result: null };
  const onClose = (code, signal) => { capability.observedExit = { code, signal }; };
  child.once('close', onClose);
  try {
    await verifyScope(scope);
    const store = await lock(scope.files.suite), p2 = scope.files.p2 ? await lock(scope.files.p2) : null;
    if (!store || scope.storage && !p2 || !alive(child) || capability.observedExit) fail('SEP_CAPTURE_INCOMPLETE');
    for (const item of [store, p2].filter(Boolean)) {
      if (item.value.pid !== child.pid || !Number.isFinite(Date.parse(item.value.createdAt))
        || Date.parse(item.value.createdAt) < scope.preparedAt || Date.parse(item.value.createdAt) > Date.now()) fail('SEP_CAPTURE_OWNER_MISMATCH');
    }
    if (p2) {
      const expected = scope.resolveStorageIdentity ? await scope.resolveStorageIdentity({storageRoot:scope.storage.path,locationKey:`${scope.storage.dev}:${scope.storage.ino}`,root:path.dirname(scope.files.p2)}) : sha(`${process.platform === 'win32' ? scope.storage.path.toLowerCase() : scope.storage.path}\n${scope.storage.dev}:${scope.storage.ino}`);
      if (!/^[a-f0-9]{8}-[a-f0-9-]{27}$/.test(p2.value.token ?? '') || p2.value.identity !== expected) fail('SEP_CAPTURE_OWNER_MISMATCH');
      capability.p2Directory = await identity(path.dirname(scope.files.p2));
    }
    capability.store = store; capability.p2 = p2; scope.consumed = true;
    const receipt = Object.freeze({ id: randomUUID(), scopeId: prepared.id, generation, pid: child.pid,
      capturedAt: new Date().toISOString(), store: { sha256: store.sha256, dev: store.dev, ino: store.ino },
      p2: p2 ? { sha256: p2.sha256, dev: p2.dev, ino: p2.ino, token: p2.value.token } : null });
    receipts.set(receipt, capability); return receipt;
  } catch (error) { child.removeListener('close', onClose); throw error; }
}

/** This does not recover a guardian that lost the in-memory owned-handle capability. */
export async function recoverSepOwnedLocks({ receipt, exit, openControl } = {}) {
  const held = receipts.get(receipt);
  if (!held || !held.observedExit || exit?.generation !== held.generation
    || exit.code !== held.observedExit.code || exit.signal !== held.observedExit.signal
    || alive(held.child) || !absentPid(held.child.pid)) return blocked('SEP_EXIT_UNPROVEN');
  if (held.result) return { ...held.result };
  if (held.used) return blocked('SEP_RECOVERY_ALREADY_ATTEMPTED');
  let control, guard, guardProof;
  const guardPath = path.join(held.scope.suite.path, '.guardian-lock-recovery.guard');
  const verifyGuard = async () => {
    if (!guardProof || !same(await lock(guardPath), guardProof)) fail('SEP_RECOVERY_GUARD_CHANGED');
  };
  try {
    await verifyScope(held.scope);
    if (held.p2Directory && !same(await identity(held.p2Directory.path), held.p2Directory)) fail('SEP_DIRECTORY_CHANGED');
    const storeNow = await lock(held.scope.files.suite), p2Now = held.scope.files.p2 ? await lock(held.scope.files.p2) : null;
    if (!storeNow && !p2Now) {
      // Verify a clean data checkpoint even when application shutdown already removed both locks.
      if (held.scope.storage) {
        if (typeof openControl !== 'function') fail('SEP_CONTROL_REQUIRED');
        control = await openControl({ storageRoot: held.scope.storage.path, mode: 'maintenance' });
        const cp = await control.checkpoint();
        if (cp.pending.length || cp.barrier.closed || cp.deletions.some(item => item.cleanup !== 'complete')) fail('SEP_PENDING_WORK');
        await control.withAccess(async () => {});
        await control.close(); control = null;
      }
      held.result = { status: 'pass', recovered: false, generation: held.generation }; return { ...held.result };
    }
    if (!same(storeNow, held.store) || !same(p2Now, held.p2)) fail('SEP_LOCK_CHANGED');
    guard = await fs.open(guardPath, 'wx', 0o600);
    await guard.writeFile(JSON.stringify({ receiptId: receipt.id, generation: held.generation, guardianPid: process.pid })); await guard.sync();
    guardProof = await lock(guardPath);
    held.used = true;
    await verifyScope(held.scope); await verifyGuard();
    if (!absentPid(held.child.pid) || !same(await lock(held.scope.files.suite), held.store)
      || held.p2 && !same(await lock(held.scope.files.p2), held.p2)) fail('SEP_LOCK_CHANGED');
    let checkpoint = null;
    if (held.p2) {
      if (typeof openControl !== 'function') fail('SEP_CONTROL_REQUIRED');
      control = await openControl({ storageRoot: held.scope.storage.path, mode: 'maintenance', recoverLockToken: held.p2.value.token });
      const cp = await control.checkpoint();
      if (cp.pending.length || cp.barrier.closed || cp.deletions.some(item => item.cleanup !== 'complete')) fail('SEP_PENDING_WORK');
      await control.withAccess(async () => {});
      checkpoint = { head: cp.head, businessSeq: cp.businessSeq, deletionSeq: cp.deletionSeq };
    }
    await verifyScope(held.scope); await verifyGuard();
    if (!same(await lock(held.scope.files.suite), held.store) || !absentPid(held.child.pid)) fail('SEP_LOCK_CHANGED');
    const archiveDirectory = path.join(held.scope.suite.path, 'guardian-recovered-locks');
    try { await fs.mkdir(archiveDirectory); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    await identity(archiveDirectory);
    const archive = path.join(archiveDirectory, `${receipt.id}.json`);
    try { await fs.lstat(archive); fail('SEP_ARCHIVE_EXISTS'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await fs.rename(held.scope.files.suite, archive);
    const archived = await lock(archive);
    if (!same({ ...archived, path: held.store.path }, held.store) || await lock(held.scope.files.suite)) fail('SEP_LOCK_CHANGED');
    await control?.withAccess(async () => {});
    await control?.close(); control = null;
    await verifyGuard();
    held.result = { status: 'pass', recovered: true, generation: held.generation, suiteArchive: archive, checkpoint };
    return { ...held.result };
  } catch (error) {
    return blocked(typeof error.code === 'string' ? error.code : 'SEP_RECOVERY_FAILED');
  } finally {
    let cleanupFailure = null;
    try { await control?.close(); } catch { cleanupFailure = 'SEP_CONTROL_CLOSE_FAILED'; }
    if (guard) {
      try { await verifyGuard(); await guard.close(); guard = null; await fs.unlink(guardPath); }
      catch { cleanupFailure = 'SEP_RECOVERY_GUARD_CHANGED'; await guard?.close().catch(() => {}); }
    }
    if (cleanupFailure) { held.result = null; return blocked(cleanupFailure); }
  }
}
