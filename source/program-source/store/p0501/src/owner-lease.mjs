import { DatabaseSync } from 'node:sqlite';
import { open, mkdir, lstat, realpath, link, unlink, rename } from 'node:fs/promises';
import { resolve, dirname, join, isAbsolute, parse } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const MAX_BYTES = 64 * 1024;
const fail = (code, cause) => { throw Object.assign(new Error(code, cause ? { cause } : undefined), { code }); };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const key = path => resolve(path).toLowerCase();
const same = (a, b) => a.dev === b.dev && a.ino === b.ino;
const sameVersion = (a, b) => same(a, b) && a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;
const localVolumes = new Map();
let ownIdentity;

async function powershell(script) {
  const executable = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  try {
    const { stdout } = await execFileAsync(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 8000, maxBuffer: 64 * 1024 });
    return JSON.parse(stdout.trim());
  } catch (cause) { fail('OWNER_UNKNOWN', cause); }
}

export async function inspectWindowsProcess(pid) {
  if (process.platform !== 'win32' || !Number.isInteger(pid) || pid < 1 || pid > 0xffffffff) return { state: 'unknown' };
  // Get-Process alone can mask access-denied as absence. CIM existence + a
  // creation-time query + kill(0) are independent checks; uncertainty blocks.
  const data = await powershell(`$ErrorActionPreference='Stop';try{$rows=@(Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}');if($rows.Count -eq 0){[Console]::Write('{"state":"absent"}')}elseif($rows.Count -eq 1){$p=Get-Process -Id ${pid} -ErrorAction Stop;@{state='alive';pid=${pid};startTimeUtcTicks=$p.StartTime.ToUniversalTime().Ticks.ToString()}|ConvertTo-Json -Compress}else{[Console]::Write('{"state":"unknown"}')}}catch{[Console]::Write('{"state":"unknown"}')}`);
  let zero = 'alive';
  try { process.kill(pid, 0); } catch (e) { zero = e.code === 'ESRCH' ? 'absent' : 'unknown'; }
  if (data.state === 'absent' && zero === 'absent') return { state: 'absent' };
  if (data.state === 'alive' && zero === 'alive' && data.pid === pid && /^\d{16,20}$/.test(data.startTimeUtcTicks)) return data;
  return { state: 'unknown' };
}

export function classifyOwnerProcess(owner, observed) {
  if (observed?.state === 'absent') return 'stale';
  if (observed?.state !== 'alive' || observed.pid !== owner.pid || !/^\d{16,20}$/.test(observed.startTimeUtcTicks)) return 'unknown';
  if (owner.sepOwner !== undefined) {
    if (owner.sepOwner?.schema !== 1 || owner.sepOwner.pid !== owner.pid || !/^\d{16,20}$/.test(owner.sepOwner.startTimeUtcTicks)) return 'unknown';
    if (owner.sepOwner.startTimeUtcTicks !== observed.startTimeUtcTicks) return 'stale';
  }
  return 'alive';
}

async function currentIdentity() {
  if (!ownIdentity) ownIdentity = inspectWindowsProcess(process.pid).then(value => {
    if (value.state !== 'alive') fail('OWNER_UNKNOWN');
    return { schema: 1, pid: value.pid, startTimeUtcTicks: value.startTimeUtcTicks };
  }).catch(error => { ownIdentity = undefined; throw error; });
  return ownIdentity;
}

async function canonicalDirectory(path) {
  const stat = await lstat(path, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink() || key(await realpath(path)) !== key(path)) fail('OWNER_PATH');
}
async function localPath(path) {
  if (process.platform !== 'win32' || !isAbsolute(path) || resolve(path) !== path || !/^[a-zA-Z]:[\\/]/.test(path) || path.slice(2).includes(':')) fail('OWNER_PATH');
  await canonicalDirectory(dirname(path));
  const volume = parse(path).root;
  if (!localVolumes.has(volume.toLowerCase())) {
    // Reject mapped network paths as well as explicit UNC paths.
    const result = await powershell(`try{$d=[System.IO.DriveInfo]::new('${volume.replaceAll("'", "''")}');@{type=[int]$d.DriveType}|ConvertTo-Json -Compress}catch{[Console]::Write('{"type":0}')}`);
    if (![2, 3, 6].includes(result.type)) fail('OWNER_PATH');
    localVolumes.set(volume.toLowerCase(), true);
  }
}

async function snapshot(path, { links = 1, optional = false, maxBytes = MAX_BYTES } = {}) {
  let before;
  try { before = await lstat(path, { bigint: true }); } catch (e) { if (optional && e.code === 'ENOENT') return null; throw e; }
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== BigInt(links) || before.ino === 0n || before.size > BigInt(maxBytes) || key(await realpath(path)) !== key(path)) fail('OWNER_PATH');
  const handle = await open(path, 'r');
  try {
    const held = await handle.stat({ bigint: true });
    if (!sameVersion(before, held)) fail('OWNER_CHANGED');
    const bytes = await handle.readFile('utf8');
    const after = await lstat(path, { bigint: true });
    if (!sameVersion(held, after) || after.nlink !== BigInt(links)) fail('OWNER_CHANGED');
    return { bytes, stat: after };
  } finally { await handle.close(); }
}
async function safeSqlitePath(path, optional = true) {
  for (const p of [path, path + '-journal', path + '-wal', path + '-shm']) {
    let s;
    try { s = await lstat(p, { bigint: true }); } catch (e) { if (e.code === 'ENOENT' && (optional || p !== path)) continue; throw e; }
    if (!s.isFile() || s.isSymbolicLink() || s.nlink !== 1n || s.ino === 0n || key(await realpath(p)) !== key(p)) fail('OWNER_PATH');
  }
}
function sqliteError(e) {
  if (/locked|busy/i.test(e?.message || '')) fail('OWNER_LEASE_BUSY', e);
  fail('OWNER_INVALID', e);
}
async function nativeLease(state, { existingOnly = false } = {}) {
  const file = join(state, 'lease.sqlite');
  await safeSqlitePath(file, !existingOnly);
  let db, identity;
  try {
    db = new DatabaseSync(file); db.exec('PRAGMA busy_timeout=0; BEGIN IMMEDIATE');
    await safeSqlitePath(file, false); identity = await lstat(file, { bigint: true });
  } catch (e) { try { db?.close(); } catch {} if (e.code?.startsWith('OWNER_')) throw e; sqliteError(e); }
  let closed = false;
  return {
    async assertOwned() {
      if (closed) fail('OWNER_CHANGED');
      await canonicalDirectory(state); await safeSqlitePath(file, false);
      if (!same(identity, await lstat(file, { bigint: true }))) fail('OWNER_CHANGED');
      db.prepare('SELECT 1').get();
    },
    close() { if (closed) return; closed = true; try { db.exec('ROLLBACK'); } finally { db.close(); } },
  };
}

async function ledgerOpen(state) {
  const path = join(state, 'publication.sqlite'); await safeSqlitePath(path);
  let db;
  try {
    db = new DatabaseSync(path); db.exec('PRAGMA busy_timeout=0; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS publication (id INTEGER PRIMARY KEY CHECK(id=1), receipt TEXT NOT NULL)');
    await safeSqlitePath(path, false);
  } catch (e) { try { db?.close(); } catch {} if (e.code?.startsWith('OWNER_')) throw e; sqliteError(e); }
  return {
    read() { const row = db.prepare('SELECT receipt FROM publication WHERE id=1').get(); if (!row) return null; try { return JSON.parse(row.receipt); } catch (e) { fail('OWNER_INVALID', e); } },
    write(value) { db.prepare('INSERT INTO publication(id,receipt) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET receipt=excluded.receipt').run(JSON.stringify(value)); },
    clear() { db.prepare('DELETE FROM publication WHERE id=1').run(); },
    close() { db.close(); },
  };
}

async function parsePrior(bytes, validatePrior) {
  let owner;
  try {
    owner = JSON.parse(bytes);
    if (!owner || typeof owner !== 'object' || Array.isArray(owner) || !Number.isInteger(owner.pid) || owner.pid < 1 || owner.pid > 0xffffffff) fail('OWNER_INVALID');
    if (owner.sepOwner !== undefined && (owner.sepOwner?.schema !== 1 || owner.sepOwner.pid !== owner.pid || !/^\d{16,20}$/.test(owner.sepOwner.startTimeUtcTicks))) fail('OWNER_INVALID');
    if (await validatePrior(owner, { bytes }) === false) fail('OWNER_INVALID');
  } catch (e) { fail('OWNER_INVALID', e); }
  return owner;
}
async function requireStale(owner) {
  const state = classifyOwnerProcess(owner, await inspectWindowsProcess(owner.pid));
  if (state === 'alive') fail('OWNER_ALIVE');
  if (state !== 'stale') fail('OWNER_UNKNOWN');
}
function validateReceipt(receipt, path, state) {
  if (!receipt || receipt.schema !== 1 || receipt.path !== path || !/^[a-f0-9-]{36}$/.test(receipt.id) || receipt.stage !== join(state, 'publish-' + receipt.id + '.json') || typeof receipt.bytes !== 'string' || Buffer.byteLength(receipt.bytes) > MAX_BYTES || hash(receipt.bytes) !== receipt.sha256 || !['intent', 'published'].includes(receipt.phase)) fail('OWNER_INVALID');
  let owner; try { owner = JSON.parse(receipt.bytes); } catch (e) { fail('OWNER_INVALID', e); }
  if (owner.sepOwner?.schema !== 1 || owner.pid !== owner.sepOwner.pid || !/^\d{16,20}$/.test(owner.sepOwner.startTimeUtcTicks)) fail('OWNER_INVALID');
  return owner;
}

async function reconcilePublication(ledger, path, state, validatePrior) {
  const receipt = ledger.read(); if (!receipt) return;
  const owner = validateReceipt(receipt, path, state);
  await requireStale(owner);
  let stageStat;
  try { stageStat = await lstat(receipt.stage, { bigint: true }); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (stageStat) {
    if (![1n, 2n].includes(stageStat.nlink)) fail('OWNER_PATH');
    const staged = await snapshot(receipt.stage, { links: Number(stageStat.nlink) });
    if (stageStat.nlink === 2n) {
      const target = await snapshot(path, { links: 2 });
      if (!same(staged.stat, target.stat) || staged.bytes !== receipt.bytes || target.bytes !== receipt.bytes) fail('OWNER_INVALID');
      await parsePrior(target.bytes, validatePrior);
    } else if (!receipt.bytes.startsWith(staged.bytes)) fail('OWNER_INVALID');
    // A complete intent is durable before any stage creation; an empty/partial
    // stage is therefore attributable without guessing from a timestamp.
    const again = await snapshot(receipt.stage, { links: Number(stageStat.nlink) });
    if (!sameVersion(again.stat, staged.stat) || again.bytes !== staged.bytes) fail('OWNER_CHANGED');
    await unlink(receipt.stage);
  }
  ledger.clear();
}

async function cleanupFailedPublication(ledger, native, receipt) {
  await native.assertOwned();
  if (ledger.read()?.id !== receipt.id) fail('OWNER_CHANGED');
  let targetStat;
  try { targetStat = await lstat(receipt.path, { bigint: true }); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (targetStat) {
    if (![1n, 2n].includes(targetStat.nlink)) fail('OWNER_PATH');
    const target = await snapshot(receipt.path, { links: Number(targetStat.nlink) });
    if (target.bytes === receipt.bytes) {
      if (targetStat.nlink === 2n) {
        const stage = await snapshot(receipt.stage, { links: 2 });
        if (!same(target.stat, stage.stat) || stage.bytes !== receipt.bytes) fail('OWNER_CHANGED');
      }
      await unlink(receipt.path);
    }
  }
  const staged = await snapshot(receipt.stage, { optional: true });
  if (staged) {
    if (!receipt.bytes.startsWith(staged.bytes)) fail('OWNER_CHANGED');
    await unlink(receipt.stage);
  }
  ledger.clear();
}

export async function acquireOwnerFile({ path, payload, validatePrior, onEvent = async () => {} }) {
  if (typeof validatePrior !== 'function' || !payload || payload.pid !== process.pid || typeof onEvent !== 'function') fail('OWNER_INVALID');
  await localPath(path);
  const state = path + '.sep-owner'; await mkdir(state, { recursive: false }).catch(e => { if (e.code !== 'EEXIST') throw e; }); await canonicalDirectory(state);
  const native = await nativeLease(state); let ledger, handle, ownReceipt, released = false;
  const archived = [];
  try {
    ledger = await ledgerOpen(state);
    await reconcilePublication(ledger, path, state, validatePrior);
    const old = await snapshot(path, { optional: true });
    if (old) {
      const owner = await parsePrior(old.bytes, validatePrior); await requireStale(owner); await native.assertOwned();
      const again = await snapshot(path);
      if (!sameVersion(old.stat, again.stat) || old.bytes !== again.bytes) fail('OWNER_CHANGED');
      const archive = join(state, 'retired-' + randomUUID() + '.json');
      await rename(path, archive);
      const check = await snapshot(archive);
      if (!same(check.stat, old.stat) || check.bytes !== old.bytes) fail('OWNER_CHANGED');
      archived.push(archive);
    }
    const owner = { ...payload, sepOwner: await currentIdentity() };
    const bytes = JSON.stringify(owner) + '\n'; if (Buffer.byteLength(bytes) > MAX_BYTES) fail('OWNER_INVALID');
    const id = randomUUID(), stage = join(state, 'publish-' + id + '.json');
    const receipt = { schema: 1, id, path, stage, bytes, sha256: hash(bytes), phase: 'intent' };
    ledger.write(receipt); ownReceipt = receipt; await onEvent('intent-durable');
    const temp = await open(stage, 'wx', 0o600);
    try { await onEvent('stage-created'); await temp.writeFile(bytes); await temp.sync(); } finally { await temp.close(); }
    await onEvent('stage-durable'); await native.assertOwned();
    // link is an atomic, no-replace publication of already durable complete
    // bytes. A concurrent legacy wx writer wins or loses; it is never replaced.
    try { await link(stage, path); } catch (e) { if (e.code === 'EEXIST') fail('OWNER_CHANGED', e); throw e; }
    await onEvent('target-linked'); await unlink(stage);
    receipt.phase = 'published'; ledger.write(receipt); await onEvent('published');
    handle = await open(path, 'r+'); const identity = await handle.stat({ bigint: true });
    const assertOwned = async () => {
      if (released) fail('OWNER_CHANGED'); await native.assertOwned();
      const actual = await snapshot(path);
      if (!same(identity, actual.stat) || actual.bytes !== bytes) fail('OWNER_CHANGED');
    };
    await assertOwned();
    const release = async ({ remove = true } = {}) => {
      if (released) return;
      try {
        await assertOwned();
        if (remove) { await unlink(path); ledger.clear(); }
      } finally { released = true; try { await handle.close(); } finally { try { ledger.close(); } finally { native.close(); } } }
    };
    return { handle, bytes, owner, archived, assertOwned, release, close: release };
  } catch (e) {
    if (ownReceipt) try { await cleanupFailedPublication(ledger, native, ownReceipt); } catch (cleanupError) { e.cleanupError = cleanupError; }
    try { await handle?.close(); } finally { try { ledger?.close(); } finally { native.close(); } }
    throw e;
  }
}

export async function inspectOwnerFile({ path, validatePrior }) {
  let native, receiptDb;
  try {
    if (typeof validatePrior !== 'function') fail('OWNER_INVALID'); await localPath(path);
    const state = path + '.sep-owner'; let existing = false;
    try { await canonicalDirectory(state); await lstat(join(state, 'lease.sqlite')); existing = true; } catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (existing) native = await nativeLease(state, { existingOnly: true });
    let receipt, receiptOwner;
    const receiptPath = join(state, 'publication.sqlite');
    if (existing) {
      let hasReceipt = false;
      try { await lstat(receiptPath); hasReceipt = true; } catch (e) { if (e.code !== 'ENOENT') throw e; }
      if (hasReceipt) {
        await safeSqlitePath(receiptPath, false);
        receiptDb = new DatabaseSync(receiptPath, { readOnly: true });
        const table = receiptDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='publication'").get();
        const row = table ? receiptDb.prepare('SELECT receipt FROM publication WHERE id=1').get() : null;
        if (row) { receipt = JSON.parse(row.receipt); receiptOwner = validateReceipt(receipt, path, state); }
      }
    }
    let links = 1;
    try { links = Number((await lstat(path, { bigint: true })).nlink); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (links !== 1 && !(links === 2 && receipt)) fail('OWNER_PATH');
    const old = await snapshot(path, { optional: true, links });
    if (!old) {
      if (!receiptOwner) return { state: 'absent' };
      const observed = await inspectWindowsProcess(receiptOwner.pid);
      return { state: classifyOwnerProcess(receiptOwner, observed), owner: receiptOwner, identity: observed, publication: 'pending' };
    }
    if (links === 2) {
      const stage = await snapshot(receipt.stage, { links: 2 });
      if (!same(stage.stat, old.stat) || old.bytes !== receipt.bytes || stage.bytes !== receipt.bytes) fail('OWNER_INVALID');
    }
    const owner = await parsePrior(old.bytes, validatePrior);
    const observed = await inspectWindowsProcess(owner.pid);
    return { state: classifyOwnerProcess(owner, observed), owner, identity: observed };
  } catch (e) { return { state: e.code === 'OWNER_LEASE_BUSY' ? 'alive' : 'unknown', reason: e.code || 'OWNER_UNKNOWN' }; }
  finally { try { receiptDb?.close(); } finally { native?.close(); } }
}
