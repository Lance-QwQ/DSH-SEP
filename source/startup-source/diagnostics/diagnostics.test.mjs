import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer } from 'node:http';
import { safeHostCode, fatalPayload, startupFailure } from './startup-diagnostic.mjs';
const root = resolve(import.meta.dirname, '..');
const fixtureRoot = join(import.meta.dirname, 'fixtures'); await mkdir(fixtureRoot, { recursive: true });
const moduleRoot = process.env.SEP_DIAGNOSTIC_ROOT || join(root, 'core/test-runtime/p0500/src');

test('known errors become bounded IPC codes with no arbitrary exception fields', () => {
  assert.deepEqual(fatalPayload(Object.assign(Error('secret key=sk-private-123456789'), { code: 'P2_LOCKED' })), { type: 'fatal', code: 'P2_LOCKED', message: 'P2_LOCKED' });
  assert.deepEqual(fatalPayload(Error('SEP_HOST_VERSION_INVALID')), { type: 'fatal', code: 'SEP_HOST_VERSION_INVALID', message: 'SEP_HOST_VERSION_INVALID' });
});

test('unknown, embedded and key-bearing codes never pass the allowlist', () => {
  for (const value of ['P2_LOCKED: key=sk-private-123456789', 'P2_INVENTED', 'unhandled\nP2_LOCKED', '__proto__', 'SEP_HOST_START_FAILED ']) {
    assert.equal(safeHostCode(value), undefined);
    assert.deepEqual(fatalPayload({ code: value, message: value }), { type: 'fatal', code: 'SEP_HOST_START_FAILED', message: 'SEP_HOST_START_FAILED' });
  }
  assert.equal(startupFailure({ hostCode: 'P2_LOCKED' }).hostCode, 'P2_LOCKED');
  assert.equal(startupFailure({ hostCode: 'SECRET' }).hostCode, undefined);
});

async function fixture(packet) {
  const dir = await mkdtemp(join(fixtureRoot, 'run-')), child = join(dir, 'child.mjs');
  await writeFile(child, `process.send(${JSON.stringify(packet)});setTimeout(()=>process.exit(1),80);`);
  const { openGuardian } = await import(pathToFileURL(join(moduleRoot, 'guardian.mjs')));
  const guardian = await openGuardian({ controlRoot: dir, command: { file: process.execPath, args: [child], cwd: dir }, beforeStart: async () => true, restartLimit: 0, readinessTimeoutMs: 3000 });
  return { dir, guardian };
}

test('owned child fatal code reaches startup rejection without changing lifecycle classification', async () => {
  const { dir, guardian } = await fixture({ type: 'fatal', code: 'P2_DATA_DRIFT', message: 'key=sk-private-123456789' });
  try {
    await assert.rejects(guardian.start(), e => e.code === 'GUARDIAN_NOT_READY' && e.hostCode === 'P2_DATA_DRIFT');
    for (let i = 0; i < 30 && !guardian.status().lastExit; i++) await delay(20);
    assert.equal(guardian.status().lastExit.hostCode, 'P2_DATA_DRIFT');
    const journal = await readFile(join(dir, 'guardian/journal.jsonl'), 'utf8');
    assert.equal(journal.includes('sk-private'), false);
  } finally { await guardian.close(); }
});

for (const packet of [
  { type: 'fatal', message: 'P2_LOCKED' },
  { type: 'fatal', code: 'P2_LOCKED: key=sk-private-123456789', message: 'sk-private-123456789' },
  { type: 'untrusted', code: 'P2_LOCKED' },
]) test('untrusted packet fields are ignored: ' + JSON.stringify(packet).slice(0, 35), async () => {
  const { dir, guardian } = await fixture(packet);
  try {
    await assert.rejects(guardian.start(), e => e.code === 'GUARDIAN_NOT_READY' && e.hostCode === undefined);
    assert.equal(JSON.stringify(guardian.status()).includes('sk-private'), false);
    assert.equal((await readFile(join(dir, 'guardian/journal.jsonl'), 'utf8')).includes('sk-private'), false);
  } finally { await guardian.close(); }
});

test('fatal code traverses real Guardian RPC server and client without raw message leakage', async () => {
  const dir = await mkdtemp(join(fixtureRoot, 'rpc-')), child = join(dir, 'child.mjs');
  await writeFile(child, `process.send({type:'fatal',code:'P2_LOCKED',message:'secret-key-123'});setTimeout(()=>process.exit(1),80);`);
  const { openService } = await import(pathToFileURL(join(moduleRoot, 'server.mjs')));
  const { recoveryClient } = await import(pathToFileURL(join(moduleRoot, 'client.mjs')));
  const service = await openService({ controlRoot: join(dir, 'center'), host: { command: { file: process.execPath, args: [child], cwd: dir }, beforeStart: async () => true, restartLimit: 0, readinessTimeoutMs: 3000 } });
  try {
    const client = recoveryClient({ ...service.connection, timeoutMs: 5000 });
    await assert.rejects(client.call('startHost'), e => e.code === 'GUARDIAN_NOT_READY' && e.hostCode === 'P2_LOCKED' && !String(e).includes('secret-key'));
  } finally { await service.close(); }
});

test('RPC client drops nonallowlisted hostCode even from an authenticated response', async () => {
  const { recoveryClient } = await import(pathToFileURL(join(moduleRoot, 'client.mjs')));
  const server = createServer((req, res) => { req.resume(); res.writeHead(409, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: { code: 'GUARDIAN_NOT_READY', hostCode: 'P2_LOCKED secret-key-123' } })); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const client = recoveryClient({ endpoint: `http://127.0.0.1:${server.address().port}/`, token: 'a'.repeat(64) });
    await assert.rejects(client.call('startHost'), e => e.code === 'GUARDIAN_NOT_READY' && e.hostCode === undefined && !String(e).includes('secret-key'));
  } finally { await new Promise(resolve => server.close(resolve)); }
});
