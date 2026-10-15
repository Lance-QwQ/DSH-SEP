import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile,symlink,access,chmod} from 'node:fs/promises';
import {join} from 'node:path';
import {fixture} from './transaction-fixtures.mjs';
const mod=await import('./linux-install.mjs').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e;});
async function sample(){const f=await fixture(),payload=join(f.base,'payload');await mkdir(payload,{mode:0o700});await mkdir(join(payload,'bin'));await writeFile(join(payload,'bin/start'),'synthetic program',{mode:0o500});await symlink('bin/start',join(payload,'start'));return {...f,payload,destination:join(f.base,'installed'),dataRoot:join(f.base,'daily-data')};}
test('Linux installer creates a hash-bound independent program and blank private data root',async()=>{
 assert.equal(typeof mod.sealPayload,'function');const f=await sample(),manifest=await mod.sealPayload(f.payload),plan=await mod.reviewInstallation({...f,manifestSha256:manifest.sha256});assert.equal(plan.status,'pass');const result=await mod.install({...f,planHash:plan.planHash,manifestSha256:manifest.sha256});assert.equal(result.status,'pass');assert.equal(await readFile(join(f.destination,'bin/start'),'utf8'),'synthetic program');const record=JSON.parse(await readFile(join(f.dataRoot,'installation.json')));assert.equal(record.program,f.destination);assert.equal(record.committed,true);
});
test('Linux installer rejects payload replacement after review before changing program or data',async()=>{
 const f=await sample(),m=await mod.sealPayload(f.payload),p=await mod.reviewInstallation({...f,manifestSha256:m.sha256});await chmod(join(f.payload,'bin/start'),0o700);await writeFile(join(f.payload,'bin/start'),'changed');await assert.rejects(()=>mod.install({...f,manifestSha256:m.sha256,planHash:p.planHash}),{code:'SEP_LINUX_INSTALL_PAYLOAD_CHANGED'});await assert.rejects(access(f.dataRoot),{code:'ENOENT'});
});
test('Linux installer refuses aliased destinations, external symlinks and an existing data root',async()=>{
 const a=await sample();await symlink('/etc/passwd',join(a.payload,'bad'));await assert.rejects(()=>mod.sealPayload(a.payload),{code:'SEP_LINUX_INSTALL_LINK_OUTSIDE'});
 const b=await sample(),m=await mod.sealPayload(b.payload);await mkdir(b.dataRoot,{mode:0o700});await writeFile(join(b.dataRoot,'keep'),'ledger-and-user-data');await assert.rejects(()=>mod.reviewInstallation({...b,manifestSha256:m.sha256}),{code:'SEP_LINUX_INSTALL_ALREADY_EXISTS'});assert.equal(await readFile(join(b.dataRoot,'keep'),'utf8'),'ledger-and-user-data');
 const c=await sample(),cm=await mod.sealPayload(c.payload),alias=join(c.base,'alias');await symlink(c.base,alias);await assert.rejects(()=>mod.reviewInstallation({...c,destination:join(alias,'installed'),manifestSha256:cm.sha256}),e=>/SEP_PROJECT_PATH|SEP_LINUX_INSTALL_ALIAS/.test(e.code));
});
test('Linux durable commit record followed by missing journal commit is repaired without replacing data',async()=>{
 const f=await sample(),m=await mod.sealPayload(f.payload),p=await mod.reviewInstallation({...f,manifestSha256:m.sha256});await mod.install({...f,manifestSha256:m.sha256,planHash:p.planHash});const path=join(f.dataRoot,'install-journal.json'),j=JSON.parse(await readFile(path));await writeFile(join(f.dataRoot,'keep'),'preserved ledger');await writeFile(path,JSON.stringify({...j,phase:'published'}));await assert.rejects(()=>mod.assertInstalled(f.destination,f.dataRoot),{code:'SEP_LINUX_INSTALL_NOT_COMMITTED'});await mod.recoverInstallation({destination:f.destination,dataRoot:f.dataRoot,planHash:p.planHash});assert.equal(await readFile(join(f.dataRoot,'keep'),'utf8'),'preserved ledger');await mod.assertInstalled(f.destination,f.dataRoot);
});
test('Linux installation interrupted after program publication cannot open business until explicit recovery commits',async()=>{
 const f=await sample(),m=await mod.sealPayload(f.payload),p=await mod.reviewInstallation({...f,manifestSha256:m.sha256});await assert.rejects(()=>mod.install({...f,manifestSha256:m.sha256,planHash:p.planHash,onPhase:phase=>{if(phase==='published')throw Error('synthetic interruption');}}),/synthetic interruption/);await assert.rejects(()=>mod.assertInstalled(f.destination,f.dataRoot),{code:'SEP_LINUX_INSTALL_NOT_COMMITTED'});const r=await mod.recoverInstallation({destination:f.destination,dataRoot:f.dataRoot,planHash:p.planHash});assert.equal(r.status,'pass');await mod.assertInstalled(f.destination,f.dataRoot);
});
