import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, unlink, lstat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
const project = resolve(import.meta.dirname, '../../..');
const old = join(project, 'dsh-daily/releases/sep-alpha2-updatefix-20260924/store/p0500/src');
const target = join(import.meta.dirname, '../core/test-runtime/p0500/src');
const fixtures = join(import.meta.dirname, 'journal-fixtures'); await mkdir(fixtures, { recursive: true });
async function start(kind, dir, root, crashOnPublication = false) {
  const method = kind === 'controller' ? 'openRecovery' : 'openGuardian';
  const childFile = join(dir, 'child.mjs');
  const options = kind === 'controller' ? { controlRoot: dir } : { controlRoot: dir, command: { file: process.execPath, args: [], cwd: dir } };
  const patch = crashOnPublication ? `import fs from 'node:fs/promises';import {syncBuiltinESMExports} from 'node:module';const original=fs.link;fs.link=async(...args)=>{await original(...args);process.send({published:true});setTimeout(()=>process.exit(73),30);await new Promise(()=>{});};syncBuiltinESMExports();` : '';
  await writeFile(childFile, `${patch}const {${method}}=await import(${JSON.stringify(pathToFileURL(join(root, kind + '.mjs')).href)});await ${method}(${JSON.stringify(options)});process.send({ready:true});setInterval(()=>{},1000);`);
  const child = spawn(process.execPath, [childFile], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  let stderr = ''; child.stderr.on('data', v => stderr += v);
  const done = once(child, 'exit');
  const message = await Promise.race([once(child, 'message').then(([m]) => m), done.then(() => { throw Error(stderr); })]);
  if (crashOnPublication) { assert.equal(message.published, true); await done; }
  else { child.kill(); await done; }
}
async function openKind(kind, dir) {
  const mod = await import(pathToFileURL(join(target, kind + '.mjs')));
  return kind === 'controller' ? mod.openRecovery({ controlRoot: dir }) : mod.openGuardian({ controlRoot: dir, command: { file: process.execPath, args: [], cwd: dir } });
}
for (const kind of ['controller', 'guardian']) {
  for (const fault of ['missing', 'corrupt']) test(`${kind} legacy dead owner with ${fault} journal is retained and refused`, async () => {
    const dir = await mkdtemp(join(fixtures, kind + '-')); await start(kind, dir, old);
    const base = kind === 'controller' ? dir : join(dir, 'guardian');
    const owner = join(base, kind === 'controller' ? 'owner.lock.json' : 'owner.json'), journal = join(base, 'journal.jsonl');
    const bytes = await readFile(owner, 'utf8');
    if (fault === 'missing') await unlink(journal); else await writeFile(journal, '{broken}\n');
    let handle, failure;
    try { handle = await openKind(kind, dir); } catch (error) { failure = error; }
    finally { await handle?.close(); }
    assert.equal(failure?.code, kind === 'controller' ? 'OWNER_LOCKED' : 'GUARDIAN_OWNER_UNPROVEN');
    assert.equal(await readFile(owner, 'utf8'), bytes);
    if (fault === 'missing') await assert.rejects(lstat(journal), { code: 'ENOENT' });
    else assert.equal(await readFile(journal, 'utf8'), '{broken}\n');
  });
  test(`${kind} new owner publication interruption already has a durable journal`, async () => {
    const dir = await mkdtemp(join(fixtures, kind + '-')); await start(kind, dir, target, true);
    const base = kind === 'controller' ? dir : join(dir, 'guardian');
    assert.equal(await readFile(join(base, 'journal.jsonl'), 'utf8'), '');
    const handle = await openKind(kind, dir); await handle.close();
  });
}
