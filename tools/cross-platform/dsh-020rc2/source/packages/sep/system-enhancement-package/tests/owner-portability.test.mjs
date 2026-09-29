import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, writeFile, readFile, symlink, link, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
const root = await realpath(process.env.SEP_TEST_TMP || tmpdir());
const modules = [new URL('../src/owner-lease.mjs', import.meta.url), new URL('../../recovery/src/owner-lease.mjs', import.meta.url)];
const bootId = '11111111-1111-4111-8111-111111111111';
const identity = (platform = 'linux', birth = '12345') => ({ schema: 2, platform, pid: 123, bootId, namespace: platform === 'linux' ? 'pid:[123]' : 'host', birth });
async function child(url, path, event) {
  const code = `import {acquireOwnerFile} from ${JSON.stringify(url.href)}; await acquireOwnerFile({path:${JSON.stringify(path)},payload:{pid:process.pid},validatePrior:()=>true,onEvent:async event=>{if(event===${JSON.stringify(event)})process.exit(77)}});`;
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, ['--input-type=module', '-e', code], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; let timedOut = false;
    for (const stream of [p.stdout, p.stderr]) stream.on('data', x => { output = (output + x).slice(-8192); });
    const timer = setTimeout(() => { timedOut = true; p.kill(); }, 30000);
    p.on('error', e => { clearTimeout(timer); reject(e); });
    p.on('close', code => { clearTimeout(timer); if (timedOut) reject(new Error('Child deadline exceeded')); else if(code !== 77) reject(new Error(`Child exit ${code}: ${output}`)); else resolve(); });
  });
}
for (const url of modules) {
  const api = await import(url);
  const label = url.pathname.includes('/recovery/') ? 'recovery' : 'suite';
  const fresh = async () => join(await mkdtemp(join(root, `sep-owner-${label}-`)), 'owner.lock');
  const acquire = path => api.acquireOwnerFile({ path, payload: {pid: process.pid}, validatePrior: () => true });
  test(`${label}: Windows schema 1 identity comparison retained`, () => {
    const owner = {pid:123,sepOwner:{schema:1,pid:123,startTimeUtcTicks:'638000000000000000'}};
    assert.equal(api.classifyOwnerProcess(owner,{state:'alive',pid:123,startTimeUtcTicks:'638000000000000000'}),'alive');
    assert.equal(api.classifyOwnerProcess(owner,{state:'alive',pid:123,startTimeUtcTicks:'638000000000000001'}),'stale');
  });
  test(`${label}: POSIX PID reuse and uncertain/foreign identity`, () => {
    const owner = {pid:123,sepOwner:identity()};
    const observed = {state:'alive',...identity()};
    assert.equal(api.classifyOwnerProcess(owner,observed),'alive');
    assert.equal(api.classifyOwnerProcess(owner,{...observed,birth:'999'}),'stale');
    assert.equal(api.classifyOwnerProcess(owner,{state:'absent',platform:'linux',bootId,namespace:'pid:[123]'}),'stale');
    assert.equal(api.classifyOwnerProcess(owner,{state:'absent'}),'unknown');
    assert.equal(api.classifyOwnerProcess(owner,{state:'absent',platform:'darwin',bootId,namespace:'host'}),'unknown');
    assert.equal(api.classifyOwnerProcess({pid:123},{state:'absent',platform:'linux',bootId,namespace:'pid:[123]'}),'unknown');
    assert.equal(api.classifyOwnerProcess(owner,{...observed,bootId:'invalid'}),'unknown');
  });
  test(`${label}: macOS equal-second births remain alive; unknown identities never reclaimed`, () => {
    const own = identity('darwin','Mon Sep 28 12:30:00 2026');
    const observed = {state:'alive',...own};
    assert.equal(api.classifyOwnerProcess({pid:123,sepOwner:own},observed),'alive');
    assert.equal(api.classifyOwnerProcess({pid:123,sepOwner:own},{...observed,birth:'Mon Sep 28 12:30:01 2026'}),'stale');
    assert.equal(api.classifyOwnerProcess({pid:123,sepOwner:own},{...observed,birth:undefined}),'unknown');
    assert.equal(api.classifyOwnerProcess({pid:123,sepOwner:identity()},{state:'absent',platform:'linux',bootId,namespace:'pid:[456]'}),'unknown');
  });
  test(`${label}: same live PID without SQLite holder is not reclaimed`, async () => {
    const path=await fresh(); const one=await acquire(path); await one.release({remove:false});
    const prior=await readFile(path,'utf8');
    await assert.rejects(acquire(path),{code:'OWNER_ALIVE'});
    assert.equal(await readFile(path,'utf8'),prior);
  });
  test(`${label}: foreign platform record is retained`, {skip:process.platform==='win32'?'POSIX migration boundary':false}, async () => {
    const path=await fresh(); const prior=JSON.stringify({pid:123,sepOwner:{schema:1,pid:123,startTimeUtcTicks:'638000000000000000'}});
    await writeFile(path,prior); await assert.rejects(acquire(path),{code:'OWNER_UNKNOWN'});
    assert.equal(await readFile(path,'utf8'),prior);
  });
  test(`${label}: fresh lock, exclusive contender, release and reacquire`, async () => {
    const path = await fresh(); const one = await acquire(path);
    try {
      assert.equal(one.owner.sepOwner.schema,process.platform==='win32'?1:2);
      await assert.rejects(acquire(path),{code:'OWNER_LEASE_BUSY'});
      assert.equal((await api.inspectOwnerFile({path,validatePrior:()=>true})).state,'alive');
      await one.assertOwned();
    } finally { await one.release(); }
    const two = await acquire(path); await two.release();
    assert.equal((await api.inspectOwnerFile({path,validatePrior:()=>true})).state,'absent');
  });
  for (const event of ['intent-durable','stage-created','stage-durable','target-linked','published']) {
    test(`${label}: interrupted publication at ${event} is recoverable`, async () => {
      const path = await fresh(); await child(url,path,event);
      assert.equal((await api.inspectOwnerFile({path,validatePrior:()=>true})).state,'stale');
      const lease = await acquire(path); try { await lease.assertOwned(); } finally { await lease.release(); }
    });
  }
  test(`${label}: malformed owner remains intact`, async () => {
    const path = await fresh(); await writeFile(path,'{"pid":123,"sepOwner":{"schema":9}}');
    await assert.rejects(acquire(path),{code:'OWNER_INVALID'});
    assert.equal(await readFile(path,'utf8'),'{"pid":123,"sepOwner":{"schema":9}}');
  });
  test(`${label}: hard-linked owner is rejected without deleting either link`, async () => {
    const path = await fresh(); await writeFile(path,'{"pid":123}'); await link(path,path+'.copy');
    await assert.rejects(acquire(path),{code:'OWNER_PATH'});
    assert.equal(await readFile(path+'.copy','utf8'),'{"pid":123}');
  });
  test(`${label}: symlink parent rejected`, {skip:process.platform==='win32'?'Requires privileged symlink setup on Windows':false}, async () => {
    const path = await fresh(); await mkdir(path+'.real'); await symlink(path+'.real',path+'.alias','dir');
    await assert.rejects(acquire(join(path+'.alias','lock')),{code:'OWNER_PATH'});
  });
}