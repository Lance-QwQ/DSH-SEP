import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, lstat, link, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { acquireOwnerFile, classifyOwnerProcess, inspectOwnerFile } from './owner-file.mjs';

const root = fileURLToPath(new URL('./fixtures/', import.meta.url));
await mkdir(root, { recursive: true });
const fixture = () => mkdtemp(join(root, 'owner-'));
const payload = () => ({ version: 1, pid: process.pid, token: crypto.randomUUID() });
const validatePrior = v => { assert.equal(v.version, 1); assert.equal(typeof v.token, 'string'); };

test('exclusive owner publishes complete JSON and release removes its own metadata', async () => {
  const path = join(await fixture(), 'owner.json');
  const lease = await acquireOwnerFile({ path, payload: payload(), validatePrior });
  assert.equal(JSON.parse(await readFile(path, 'utf8')).pid, process.pid);
  assert.equal(lease.bytes, await readFile(path, 'utf8'));
  await lease.assertOwned();
  await assert.rejects(acquireOwnerFile({ path, payload: payload(), validatePrior }), { code: 'OWNER_LEASE_BUSY' });
  await lease.release();
  await assert.rejects(lstat(path), { code: 'ENOENT' });
  const again = await acquireOwnerFile({ path, payload: payload(), validatePrior });
  await again.release();
});

const launch = (path, mode = 'hold') => {
  const child = spawn(process.execPath, [fileURLToPath(new URL('./owner-child.mjs', import.meta.url)), path, mode], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true });
  const ready = new Promise((resolve, reject) => {
    child.once('message', resolve); child.once('error', reject);
    child.once('exit', code => reject(Error('child exited before ready: ' + code)));
  });
  return { child, ready };
};

test('a killed owner releases the native lease; full stale metadata is archived', async () => {
  const path = join(await fixture(), 'owner.json');
  const { child, ready } = launch(path); await ready;
  await assert.rejects(acquireOwnerFile({ path, payload: payload(), validatePrior }), { code: 'OWNER_LEASE_BUSY' });
  const closed = once(child, 'exit'); child.kill(); await closed;
  const lease = await acquireOwnerFile({ path, payload: payload(), validatePrior });
  assert.equal(lease.archived.length, 1);
  assert.equal(JSON.parse(await readFile(lease.archived[0], 'utf8')).pid, child.pid);
  await lease.release();
});

test('a legacy dead owner without a receipt is archived after caller validation', async () => {
  const path = join(await fixture(), 'owner.json');
  const child = spawn(process.execPath, ['-e', ''], { windowsHide: true }); await once(child, 'exit');
  const old = { version: 1, pid: child.pid, token: 'legacy' };
  await writeFile(path, JSON.stringify(old));
  const lease = await acquireOwnerFile({ path, payload: payload(), validatePrior });
  assert.deepEqual(JSON.parse(await readFile(lease.archived[0], 'utf8')), old);
  await lease.release();
});

test('a live legacy owner is never removed even when caller validates schema', async () => {
  const path = join(await fixture(), 'owner.json'); const old = JSON.stringify(payload()); await writeFile(path, old);
  await assert.rejects(acquireOwnerFile({ path, payload: payload(), validatePrior }), { code: 'OWNER_ALIVE' });
  assert.equal(await readFile(path, 'utf8'), old);
});

test('unknown or malformed legacy metadata never gets removed', async () => {
  for (const bytes of ['', '{', JSON.stringify({ pid: 99999999 })]) {
    const path = join(await fixture(), 'owner.json'); await writeFile(path, bytes);
    await assert.rejects(acquireOwnerFile({ path, payload: payload(), validatePrior }), { code: 'OWNER_INVALID' });
    assert.equal(await readFile(path, 'utf8'), bytes);
  }
});

test('multi-link owner metadata is rejected without a matching publication receipt', async () => {
  const dir = await fixture(), path = join(dir, 'owner.json'); await writeFile(path, JSON.stringify(payload())); await link(path, join(dir, 'other.json'));
  await assert.rejects(acquireOwnerFile({ path, payload: payload(), validatePrior }), { code: 'OWNER_PATH' });
  assert.equal((await lstat(path)).nlink, 2);
});

test('a retained poisoned owner still blocks same living process', async () => {
  const path = join(await fixture(), 'owner.json'); const lease = await acquireOwnerFile({ path, payload: payload(), validatePrior });
  await lease.release({ remove: false });
  await assert.rejects(acquireOwnerFile({ path, payload: payload(), validatePrior }), { code: 'OWNER_ALIVE' });
});

for (const phase of ['intent-durable', 'stage-created', 'stage-durable', 'target-linked', 'published']) {
  test('crash at ' + phase + ' does not create a permanently unrecoverable owner', async () => {
    const path = join(await fixture(), 'owner.json'); const { child, ready } = launch(path, phase); await ready;
    await once(child, 'exit');
    const inspected = await inspectOwnerFile({ path, validatePrior });
    assert.ok(['absent', 'stale'].includes(inspected.state), JSON.stringify(inspected));
    const lease = await acquireOwnerFile({ path, payload: payload(), validatePrior });
    assert.equal(JSON.parse(await readFile(path, 'utf8')).pid, process.pid);
    assert.equal((await lstat(path)).nlink, 1); await lease.release();
  });
}

test('creation identity explicitly distinguishes PID reuse; unknown query never means stale', () => {
  const owner = { pid: 42, sepOwner: { schema: 1, pid: 42, startTimeUtcTicks: '638000000000000000' } };
  assert.equal(classifyOwnerProcess(owner, { state: 'alive', pid: 42, startTimeUtcTicks: '638000000000000001' }), 'stale');
  assert.equal(classifyOwnerProcess(owner, { state: 'alive', pid: 42, startTimeUtcTicks: '638000000000000000' }), 'alive');
  assert.equal(classifyOwnerProcess(owner, { state: 'unknown' }), 'unknown');
  assert.equal(classifyOwnerProcess(owner, { state: 'alive', pid: 42 }), 'unknown');
  assert.equal(classifyOwnerProcess({ pid: 42 }, { state: 'alive', pid: 42, startTimeUtcTicks: '638000000000000001' }), 'alive');
});

test('a different persisted creation identity permits reuse of a currently live PID', async () => {
  const path = join(await fixture(), 'owner.json');
  const old = { ...payload(), sepOwner: { schema: 1, pid: process.pid, startTimeUtcTicks: '638000000000000000' } };
  await writeFile(path, JSON.stringify(old));
  const lease = await acquireOwnerFile({ path, payload: payload(), validatePrior });
  assert.equal(lease.archived.length, 1); assert.notEqual(lease.owner.sepOwner.startTimeUtcTicks, old.sepOwner.startTimeUtcTicks);
  await lease.release();
});

test('a hardlinked SQLite lease file cannot be used as native ownership', async () => {
  const dir = await fixture(), path = join(dir, 'owner.json'), state = path + '.sep-owner'; await mkdir(state);
  await writeFile(join(state, 'lease.sqlite'), ''); await link(join(state, 'lease.sqlite'), join(dir, 'aliased.sqlite'));
  await assert.rejects(acquireOwnerFile({ path, payload: payload(), validatePrior }), { code: 'OWNER_PATH' });
  await assert.rejects(lstat(path), { code: 'ENOENT' });
});

test('caller journal validation refusal retains a dead owner byte for byte', async () => {
  const path = join(await fixture(), 'owner.json'), bytes = JSON.stringify({ ...payload(), pid: 4294967295 }); await writeFile(path, bytes);
  await assert.rejects(acquireOwnerFile({ path, payload: payload(), validatePrior: () => { throw Error('invalid journal'); } }), { code: 'OWNER_INVALID' });
  assert.equal(await readFile(path, 'utf8'), bytes);
});

test('inspect does not create owner state when metadata and native lease are absent', async () => {
  const path = join(await fixture(), 'owner.json');
  assert.equal((await inspectOwnerFile({ path, validatePrior })).state, 'absent');
  await assert.rejects(lstat(path + '.sep-owner'), { code: 'ENOENT' });
});

test('crash while creating empty SQLite files is inspectable and recoverable', async () => {
  const path = join(await fixture(), 'owner.json'), state = path + '.sep-owner'; await mkdir(state);
  await writeFile(join(state, 'lease.sqlite'), ''); await writeFile(join(state, 'publication.sqlite'), '');
  assert.equal((await inspectOwnerFile({ path, validatePrior })).state, 'absent');
  const lease = await acquireOwnerFile({ path, payload: payload(), validatePrior }); await lease.release();
});

test('a failed notification after stage creation can retry without restarting current process', async () => {
  const path = join(await fixture(), 'owner.json');
  await assert.rejects(acquireOwnerFile({ path, payload: payload(), validatePrior, onEvent: async phase => { if (phase === 'stage-created') throw Object.assign(Error('SYNTHETIC'), { code: 'SYNTHETIC' }); } }), { code: 'SYNTHETIC' });
  const lease = await acquireOwnerFile({ path, payload: payload(), validatePrior }); await lease.release();
});

test('release rejects a changed owner without deleting replacement bytes', async () => {
  const path = join(await fixture(), 'owner.json'), lease = await acquireOwnerFile({ path, payload: payload(), validatePrior });
  const changed = JSON.stringify({ ...payload(), token: 'replacement' }); await writeFile(path, changed);
  await assert.rejects(lease.release(), { code: 'OWNER_CHANGED' });
  assert.equal(await readFile(path, 'utf8'), changed);
});

test('legacy wx publication in the final gap cannot be overwritten', async () => {
  const path = join(await fixture(), 'owner.json'), foreign = JSON.stringify({ ...payload(), token: 'foreign' });
  await assert.rejects(acquireOwnerFile({ path, payload: payload(), validatePrior, onEvent: async phase => { if (phase === 'stage-durable') await writeFile(path, foreign, { flag: 'wx' }); } }), { code: 'OWNER_CHANGED' });
  assert.equal(await readFile(path, 'utf8'), foreign);
});

test('a Windows junction target is rejected without following it', async () => {
  const dir = await fixture(), path = join(dir, 'owner.json'), real = join(dir, 'real');
  await mkdir(real); await symlink(real, path, 'junction');
  await assert.rejects(acquireOwnerFile({ path, payload: payload(), validatePrior }), { code: 'OWNER_PATH' });
  assert.equal((await lstat(path)).isSymbolicLink(), true);
});
