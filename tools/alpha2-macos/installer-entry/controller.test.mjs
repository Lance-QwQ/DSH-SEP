import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile,lstat,symlink} from 'node:fs/promises';
import {join} from 'node:path';
import {fork} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {openTestInstallerController} from './testing.mjs';
import {setup,missing,homeTree,recordRoot,hash} from './fixture.mjs';
import {verifyPackage} from '../package/package-inventory.mjs';
async function closed(app){const r=await app.close();assert.equal(r.status,'pass');assert.equal(r.resourcesReleased,true);}
async function pause(f,phase){
  const input=join(f.root,'worker.json');await writeFile(input,JSON.stringify({config:f.config}),{flag:'wx',mode:0o600});
  const child=fork(new URL('./crash-worker.mjs',import.meta.url),[input,phase],{stdio:['ignore','pipe','pipe','ipc']});child.stdout.resume();child.stderr.resume();
  const exit=new Promise(r=>child.once('exit',(code,signal)=>r({code,signal})));let timer,preview;
  try{
    const event=await Promise.race([new Promise((resolve,reject)=>{
      child.on('message',m=>{if(m.kind==='preview')preview=m.preview;else if(m.kind==='pause')resolve(m);else reject(Error('FIXTURE_'+m.kind+': '+m.code));});
      child.once('exit',()=>reject(Error('FIXTURE_EARLY_EXIT')));
    }),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('FIXTURE_DEADLINE')),15000);})]);
    return {child,exit,event,preview};
  }catch(e){child.kill('SIGKILL');await exit;throw e;}finally{clearTimeout(timer);}
}
async function stop(p){p.child.kill('SIGKILL');assert.equal((await p.exit).signal,'SIGKILL');}
async function resume(app,id){
  for(let n=0;n<100;n++){try{return await app.resume({transactionId:id});}catch(e){if(!['SEP_INSTALLER_BUSY','SEP_INSTALL_BUSY'].includes(e.code))throw e;await delay(30);}}
  throw Error('RESUME_STILL_BUSY');
}
test('preview and cancellation leave the account and signed source byte-identical',async()=>{
  const f=await setup(),before=await homeTree(f),app=await openTestInstallerController(f.config);
  try{const p=await app.preview();assert.equal(p.status,'pass');assert.equal(p.phase,'preview');assert.equal(p.plan.target,f.target);assert.equal(p.plan.dataRoot,f.dataRoot);assert.equal(p.plan.actions.createApplications,true);
    assert.equal((await app.cancel({planHash:p.planHash})).phase,'cancelled');assert.deepEqual(await homeTree(f),before);await verifyPackage(f.source,f.receipt.inventory);assert.equal(await missing(f.governance),true);
  }finally{await closed(app);}
});
test('wrong confirmation digest cannot create directories or start the lower transaction',async()=>{
  const f=await setup(),before=await homeTree(f),app=await openTestInstallerController(f.config);
  try{await app.preview();await assert.rejects(app.confirm({planHash:'f'.repeat(64)}),{code:'SEP_INSTALLER_CONFIRMATION_MISMATCH'});assert.deepEqual(await homeTree(f),before);}finally{await closed(app);}
});
test('changed source after preview invalidates confirmation before account writes',async()=>{
  const f=await setup(),before=await homeTree(f),app=await openTestInstallerController(f.config);
  try{const p=await app.preview();await writeFile(join(f.source,'Contents/Resources/README.txt'),'changed');await assert.rejects(app.confirm({planHash:p.planHash}),{code:'SEP_INSTALLER_PLAN_CHANGED'});assert.deepEqual(await homeTree(f),before);}finally{await closed(app);}
});
test('a destination created after preview is retained and invalidates the plan',async()=>{
  const f=await setup(),app=await openTestInstallerController(f.config);
  try{const p=await app.preview();await mkdir(f.parent,{mode:0o700});await writeFile(f.target,'other owner');await assert.rejects(app.confirm({planHash:p.planHash}),{code:'SEP_INSTALLER_PLAN_CHANGED'});assert.equal(await readFile(f.target,'utf8'),'other owner');assert.equal(await missing(f.governance),true);}finally{await closed(app);}
});
test('data appearing after preview is retained and invalidates the plan',async()=>{
  const f=await setup(),app=await openTestInstallerController(f.config);
  try{const p=await app.preview();await mkdir(f.dataRoot,{recursive:true,mode:0o700});await writeFile(join(f.dataRoot,'ledger'),'do not reset');await assert.rejects(app.confirm({planHash:p.planHash}),{code:'SEP_INSTALLER_PLAN_CHANGED'});assert.equal(await readFile(join(f.dataRoot,'ledger'),'utf8'),'do not reset');assert.equal(await missing(f.target),true);}finally{await closed(app);}
});
test('an already-existing data root refuses first adoption without touching its contents',async()=>{
  const f=await setup();await mkdir(f.dataRoot,{recursive:true,mode:0o700});await writeFile(join(f.dataRoot,'PROFILE.json'),'download-path private binding');const before=await homeTree(f),app=await openTestInstallerController(f.config);
  try{await assert.rejects(app.preview(),{code:'SEP_INSTALLER_DATA_EXISTS'});assert.deepEqual(await homeTree(f),before);}finally{await closed(app);}
});
test('an aliased Applications parent refuses native admission and leaves outside files intact',async()=>{
  const f=await setup(),outside=join(f.root,'outside');await mkdir(outside,{mode:0o700});await writeFile(join(outside,'keep'),'retain');await symlink(outside,f.parent);const app=await openTestInstallerController(f.config);
  try{await assert.rejects(app.preview(),{code:'SEP_INSTALLER_PATH'});assert.equal(await readFile(join(outside,'keep'),'utf8'),'retain');assert.equal(await missing(join(outside,'DSH SEP.app')),true);}finally{await closed(app);}
});
test('confirmed fixed-path install durably binds upper confirmation to core plan before commit',async()=>{
  const f=await setup(),app=await openTestInstallerController(f.config);
  try{const p=await app.preview(),r=await app.confirm({planHash:p.planHash});assert.equal(r.phase,'committed');assert.equal(r.target,f.target);assert.equal(r.applicationStarted,false);await verifyPackage(f.target,f.receipt.inventory);await verifyPackage(f.source,f.receipt.inventory);
    const dir=recordRoot(f,p.plan.transactionId),confirmation=await readFile(join(dir,'confirmation.json')),core=await readFile(join(dir,'core-plan.json')),state=JSON.parse(await readFile(join(dir,'state.json'),'utf8'));
    assert.equal(JSON.parse(confirmation).planHash,p.planHash);assert.equal(JSON.parse(core).confirmationSha256,hash(confirmation));assert.equal(state.corePlanSha256,hash(core));assert.equal(state.confirmationSha256,hash(confirmation));assert.equal(state.phase,'committed');
    for(const file of['confirmation.json','core-plan.json','state.json']){const s=await lstat(join(dir,file));assert.equal(s.mode&0o777,0o600);assert.equal(s.nlink,1);}assert.equal((await lstat(dir)).mode&0o777,0o700);assert.equal(await missing(f.dataRoot),true);assert.equal(await readFile(join(f.home,'official-dsh-sentinel'),'utf8'),'unrelated official instance');
  }finally{await closed(app);}
});
test('corrupted upper confirmation refuses recovery rather than trusting the target name',async()=>{
  const f=await setup(),app=await openTestInstallerController(f.config);
  try{const p=await app.preview();await app.confirm({planHash:p.planHash});await writeFile(join(recordRoot(f,p.plan.transactionId),'confirmation.json'),'{broken');await assert.rejects(app.resume({transactionId:p.plan.transactionId}),{code:'SEP_INSTALLER_JOURNAL'});await verifyPackage(f.target,f.receipt.inventory);}finally{await closed(app);}
});
test('SIGKILL after durable confirmation without lower plan cannot trigger an installation',async()=>{
  const f=await setup(),p=await pause(f,'confirmed');await stop(p);const app=await openTestInstallerController(f.config);
  try{await assert.rejects(resume(app,p.event.transactionId),{code:'SEP_INSTALLER_PLAN_INCOMPLETE'});assert.equal(await missing(f.target),true);assert.equal(await missing(join(recordRoot(f,p.event.transactionId),'core-plan.json')),true);}finally{await closed(app);}
});
test('SIGKILL after durable bound lower plan can explicitly resume the approved installation',async()=>{
  const f=await setup(),p=await pause(f,'planned');await stop(p);const app=await openTestInstallerController(f.config);
  try{assert.equal(await missing(f.target),true);const r=await resume(app,p.event.transactionId);assert.equal(r.phase,'committed');await verifyPackage(f.target,f.receipt.inventory);assert.equal(await missing(f.dataRoot),true);}finally{await closed(app);}
});
test('SIGKILL after core verification resumes only that recorded staged package',async()=>{
  const f=await setup(),p=await pause(f,'core-verified');await stop(p);const app=await openTestInstallerController(f.config);
  try{assert.equal(await missing(f.target),true);const r=await resume(app,p.event.transactionId);assert.equal(r.phase,'committed');await verifyPackage(f.target,f.receipt.inventory);}finally{await closed(app);}
});
test('published recovery with later business data preserves it and does not restart the app',async()=>{
  const f=await setup(),p=await pause(f,'core-published');await stop(p);await mkdir(f.dataRoot,{recursive:true,mode:0o700});await writeFile(join(f.dataRoot,'ledger'),'real activity after publication');const before=await readFile(join(f.dataRoot,'ledger')),app=await openTestInstallerController(f.config);
  try{const r=await resume(app,p.event.transactionId);assert.equal(r.phase,'committed');assert.equal(r.applicationStarted,false);assert.deepEqual(await readFile(join(f.dataRoot,'ledger')),before);await verifyPackage(f.target,f.receipt.inventory);}finally{await closed(app);}
});
test('a live upper transaction lease refuses concurrent recovery',async()=>{
  const f=await setup(),p=await pause(f,'planned'),app=await openTestInstallerController(f.config);
  try{await assert.rejects(app.resume({transactionId:p.event.transactionId}),{code:'SEP_INSTALLER_BUSY'});assert.equal(await missing(f.target),true);}finally{await stop(p);await closed(app);}
});
test('cancelled previews cannot later authorize installation',async()=>{
  const f=await setup(),app=await openTestInstallerController(f.config);
  try{const p=await app.preview();await app.cancel({planHash:p.planHash});await assert.rejects(app.confirm({planHash:p.planHash}),{code:'SEP_INSTALLER_CANCELLED'});assert.equal(await missing(f.target),true);assert.equal(await missing(f.governance),true);}finally{await closed(app);}
});
test('closed controller references refuse new preview and confirmation admission',async()=>{
  const f=await setup(),app=await openTestInstallerController(f.config),p=await app.preview();await closed(app);assert.equal((await app.whenClosed()).status,'pass');
  await assert.rejects(app.preview(),{code:'SEP_INSTALLER_CLOSED'});await assert.rejects(app.confirm({planHash:p.planHash}),{code:'SEP_INSTALLER_CLOSED'});assert.equal(await missing(f.governance),true);
});
test('unknown recovery id neither creates a journal nor adopts a path',async()=>{
  const f=await setup(),before=await homeTree(f),app=await openTestInstallerController(f.config);
  try{await assert.rejects(app.resume({transactionId:'1'.repeat(32)}),{code:'SEP_INSTALLER_NOT_FOUND'});assert.deepEqual(await homeTree(f),before);}finally{await closed(app);}
});
test('a symlink replacing the lower-plan record is refused without writing its external target',async()=>{
  const f=await setup(),outside=join(f.root,'outside-record');await writeFile(outside,'retain');
  const app=await openTestInstallerController({...f.config,onProgress:async event=>{if(event.phase==='confirmed')await symlink(outside,join(recordRoot(f,event.transactionId),'core-plan.json'));}});
  try{const p=await app.preview();await assert.rejects(app.confirm({planHash:p.planHash}),{code:'SEP_INSTALLER_JOURNAL'});assert.equal(await readFile(outside,'utf8'),'retain');assert.equal(await missing(f.target),true);}finally{await closed(app);}
});
