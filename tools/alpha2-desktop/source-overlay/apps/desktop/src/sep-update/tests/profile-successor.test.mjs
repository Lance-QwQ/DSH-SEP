import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
import {openControl,DATA_DOMAINS} from '../../../../../packages/sep/system-enhancement-package/src/p2/control.js';
import {openRecovery} from '../../../../../packages/sep/recovery/src/controller.mjs';
import {createOfflinePublisher} from '../runtime/offline-publisher.mjs';
import {createNativeProgramAdapter} from '../runtime/native-program.mjs';
import {acquireOwnerFile} from '../../../../../packages/sep/system-enhancement-package/src/owner-lease.mjs';
import {acquireStartupLease} from '../runtime/launcher/startup-lease.mjs';
const json=async p=>JSON.parse(await readFile(p,'utf8'));
const error=code=>Object.assign(Error(code),{code});
function testAdapters(root,hook){const statePaths=[join(root,'native-one.json'),join(root,'native-two.json')],programPath=join(root,'launch.mjs');const programs=new Map([['v0','original'],['v1','committed-but-launch-fails'],['v2','repaired']]);
 const adapters={DATA_DOMAINS,async verifyInputs(){},async verifyInstalled(){},async install(){},async assertQuiescent(){},async health({plan,direction}){return {status:'pass',version:plan.versions[direction]};},
  program:{async publish({plan,direction}){await writeFile(programPath,programs.get(plan.versions[direction]));},async verify({plan,direction}){assert.equal(await readFile(programPath,'utf8'),programs.get(plan.versions[direction]));}},
  native:{async acquire(){const lease=await acquireStartupLease(join(root,'lease.sqlite'));return()=>lease.close();},async record(state){for(const path of statePaths)await writeFile(path,JSON.stringify(state));},async verify({state}={}){if(state)for(const path of statePaths)assert.deepEqual(await json(path),state);}},
  async onProgress(e){await hook?.(e);}
 };

return adapters;
}
async function fixture(t){
 const root=await mkdtemp(join(tmpdir(),'sep-successor-'));const storageRoot=join(root,'storage'),profileRoot=join(root,'profile'),controlRoot=join(root,'recovery');
 await mkdir(storageRoot);await mkdir(profileRoot);
 const c=await openControl({storageRoot,mode:'maintenance',initialize:true});await c.close();
 let controller=await openRecovery({controlRoot});t.after(()=>controller.close());
 const budgetPath=join(root,'budget.json');await writeFile(budgetPath,'{"spentYuan":2.37,"reservedYuan":0.2,"limitYuan":100}\n');const budget=await readFile(budgetPath);
 const statePaths=[join(root,'native-one.json'),join(root,'native-two.json')];for(const p of statePaths)await writeFile(p,JSON.stringify({schemaVersion:1,operationId:randomUUID(),profile:'web',phase:'reconciled'}));
 const programPath=join(root,'launch.mjs');await writeFile(programPath,'original');const markerPath=join(root,'marker.json');
 const programs=new Map([['v0','original'],['v1','committed-but-launch-fails'],['v2','repaired']]);let phaseHook;
 const adapters=testAdapters(root,e=>phaseHook?.(e));
 const pub=()=>createOfflinePublisher({controller,openControl,assertQuiescent:async()=>{},adapters});
 async function input(name,old,candidate){const directory=join(root,name),binding=join(root,name+'-candidate.txt');await writeFile(binding,programs.get(candidate));return {directory,profileRoot,storageRoot,budgetPath,markerPath,bindings:[binding],nativeStatePaths:statePaths,versions:{old,candidate},protocols:{old:{maintenance:1},candidate:{maintenance:1}}};}
 const parent=await pub().prepare(await input('parent','v0','v1'));await pub().apply(parent);
 // Simulate the updater's genuine post-commit hold, including the parent marker.
 const hold=await openControl({storageRoot,mode:'maintenance',initialize:false});await hold.setBarrier({closed:true,transactionId:parent.id,planHash:parent.hash});await hold.close();await writeFile(markerPath,await readFile(parent.transactionPath));
 return {root,parent,budget,budgetPath,markerPath,programPath,statePaths,pub,input,storageRoot,adapters,async checkpoint(){const c=await openControl({storageRoot,mode:'maintenance',initialize:false});try{return await c.checkpoint()}finally{await c.close()}},set hook(v){phaseHook=v;},async closeRecovery(){await controller.close();},async reboot(){await controller.close();controller=await openRecovery({controlRoot});},get controller(){return controller}};
}
if(process.argv[2]==='--abrupt-successor'){
 const root=process.argv[3],p=await json(process.argv[4]),phase=process.argv[5];const controller=await openRecovery({controlRoot:join(root,'recovery')});
 const adapters=testAdapters(root,e=>{if(e.phase===phase)process.exit(77)});
 try{const options=await json(join(root,'test-native.json'));const np=await createNativeProgramAdapter({...options,acquireOwnerFile});adapters.native=np.native;adapters.program=np.program;}catch(e){if(e.code!=='ENOENT')throw e;}
 const pub=createOfflinePublisher({controller,openControl,assertQuiescent:async()=>{},adapters});
 try{await pub.apply(p);}finally{await controller.close();}process.exit(78);
}
test('reviewed successor repairs a committed hold without replaying its decision or budget',async t=>{
 const f=await fixture(t);const plan=await f.pub().prepare({...await f.input('repair','v1','v2'),successorOf:f.parent});
 assert.notEqual(plan.hash,f.parent.hash);assert.equal((await f.checkpoint()).barrier.transactionId,f.parent.id);
 const r=await f.pub().apply(plan);assert.equal(r.status,'committed');assert.equal(await readFile(f.programPath,'utf8'),'repaired');
 const cp=await f.checkpoint();assert.equal(cp.barrier.closed,false);assert.equal(cp.events.filter(e=>e.type==='committed'&&e.payload.transactionId===f.parent.id).length,1);assert.equal(cp.events.filter(e=>e.type==='committed'&&e.payload.transactionId===plan.id).length,1);assert.deepEqual(await readFile(f.budgetPath),f.budget);assert.equal(f.controller.status().maintenance,null);await assert.rejects(lstat(f.markerPath),{code:'ENOENT'});
});
for(const phase of ['transaction-saved','marker-saved','committed','opened'])test('resume interrupted successor at '+phase+' retains parent decision',async t=>{
 const f=await fixture(t),p=await f.pub().prepare({...await f.input('repair','v1','v2'),successorOf:f.parent});let fired=false;
 f.hook=e=>{if(e.phase===phase&&!fired){fired=true;throw error('TEST_INTERRUPTION')}};
 await assert.rejects(f.pub().apply(p),{code:'TEST_INTERRUPTION'});assert.equal(fired,true);f.hook=null;await f.reboot();
 const result=await f.pub().recover(p),cp=await f.checkpoint();assert.equal(result.status,'committed');assert.equal(cp.barrier.closed,false);assert.equal(cp.events.filter(e=>e.type==='committed'&&e.payload.transactionId===f.parent.id).length,1);assert.deepEqual(await readFile(f.budgetPath),f.budget);assert.equal(f.controller.status().maintenance,null);
});
test('candidate replacement after review invalidates successor before touching held program',async t=>{
 const f=await fixture(t),input=await f.input('repair','v1','v2'),p=await f.pub().prepare({...input,successorOf:f.parent});const before=await f.checkpoint();await writeFile(input.bindings[0],'replaced');
 await assert.rejects(f.pub().apply(p),{code:'PGR_PLAN_CHANGED'});assert.deepEqual((await f.checkpoint()).head,before.head);assert.equal(await readFile(f.programPath,'utf8'),'committed-but-launch-fails');
});
test('budget change while waiting invalidates successor without resetting consumption',async t=>{
 const f=await fixture(t),p=await f.pub().prepare({...await f.input('repair','v1','v2'),successorOf:f.parent});const before=await f.checkpoint();const changed='{"spentYuan":3.11,"reservedYuan":0.2,"limitYuan":100}';await writeFile(f.budgetPath,changed);
 await assert.rejects(f.pub().apply(p),{code:'PGR_BUDGET_CHANGED'});assert.equal(await readFile(f.budgetPath,'utf8'),changed);assert.deepEqual((await f.checkpoint()).head,before.head);
});
test('ordinary update cannot silently take ownership of a committed maintenance hold',async t=>{
 const f=await fixture(t),before=await f.checkpoint();await assert.rejects(f.pub().prepare(await f.input('repair','v1','v2')),{code:'PGR_OPERATION_EXISTS'});assert.deepEqual((await f.checkpoint()).head,before.head);
});
test('new repair plan retains legitimate business data created after the original update',async t=>{
 const f=await fixture(t);
 // Open with a distinct lawful maintenance commit, write data, then hold that latest plan.
 const p=await f.pub().prepare({...await f.input('repair','v1','v2'),successorOf:f.parent});await f.pub().apply(p);
 const c=await openControl({storageRoot:f.storageRoot,mode:'maintenance',initialize:false});const path=join(f.storageRoot,DATA_DOMAINS[0]+'.json');await c.business({operation:'synthetic'},()=>writeFile(path,'{"synthetic":"new-business"}'));await c.setBarrier({closed:true,transactionId:p.id,planHash:p.hash});await c.close();await writeFile(f.markerPath,await readFile(p.transactionPath));
 const next=await f.pub().prepare({...await f.input('repair-next','v2','v2'),successorOf:p});await f.pub().apply(next);assert.equal(await readFile(path,'utf8'),'{"synthetic":"new-business"}');assert.deepEqual(await readFile(f.budgetPath),f.budget);assert.equal((await f.checkpoint()).barrier.closed,false);
});

for(const phase of ['transaction-saved','marker-saved','maintenance-closed','health-passed','committed','opened'])test('process termination at '+phase+' releases leases and resumes safely',async t=>{
 const f=await fixture(t),p=await f.pub().prepare({...await f.input('repair','v1','v2'),successorOf:f.parent});await f.closeRecovery();
 await assert.rejects(exec(process.execPath,[import.meta.filename,'--abrupt-successor',f.root,p.planPath,phase],{windowsHide:true,timeout:20000}),e=>e.code===77);
 await f.reboot();const r=await f.pub().recover(p),cp=await f.checkpoint();assert.equal(r.status,'committed');assert.equal(cp.barrier.closed,false);assert.equal(cp.pending.length,0);assert.equal(cp.events.filter(e=>e.type==='committed'&&e.payload.transactionId===f.parent.id).length,1);assert.deepEqual(await readFile(f.budgetPath),f.budget);assert.equal(f.controller.status().maintenance,null);
});

test('failed repair stays closed and permits only two durable candidate attempts',async t=>{
 const f=await fixture(t),p=await f.pub().prepare({...await f.input('repair','v1','v2'),successorOf:f.parent});f.hook=e=>{if(e.phase==='health-passed')throw error('TEST_UNCERTAIN_HEALTH')};
 await assert.rejects(f.pub().apply(p),{code:'TEST_UNCERTAIN_HEALTH'});assert.equal((await f.checkpoint()).barrier.closed,true);
 await assert.rejects(f.pub().recover(p),{code:'TEST_UNCERTAIN_HEALTH'});f.hook=null;
 const before=await f.checkpoint();await assert.rejects(f.pub().recover(p),{code:'PGR_SUCCESSOR_ATTEMPTS_EXHAUSTED'});assert.deepEqual((await f.checkpoint()).head,before.head);assert.equal(before.barrier.closed,true);assert.equal(before.events.filter(e=>e.type==='rolled_back'&&e.payload.transactionId===p.id).length,0);assert.deepEqual(await readFile(f.budgetPath),f.budget);
});

for(const abrupt of [false,true])test('real native publication '+(abrupt?'after abrupt termination':'applies')+' preserves the same governed storage',async t=>{
 const f=await fixture(t),input=await f.input('native-repair','v1','v2'),homeRoot=join(f.root,'home'),oldSource=join(f.root,'old-launch.mjs'),candidateSource=join(f.root,'candidate-launch.mjs');await mkdir(homeRoot);await mkdir(input.directory);await writeFile(oldSource,'committed-but-launch-fails');await writeFile(candidateSource,'repaired');
 const options={homeRoot,profileRoot:input.profileRoot,oldHostRoot:input.profileRoot,candidateHostRoot:input.profileRoot,transactionDirectory:input.directory,publicFiles:[{path:f.programPath,oldSource,candidateSource}],beforeAliases:[],candidateAliases:[]};
 const np=await createNativeProgramAdapter({...options,acquireOwnerFile});const release=await np.native.acquire();try{await np.native.record({schemaVersion:1,operationId:f.parent.id,profile:'web',phase:'reconciled'});}finally{await release();}
 const pub=()=>createOfflinePublisher({controller:f.controller,openControl,assertQuiescent:async()=>{},adapters:{...testAdapters(f.root),native:np.native,program:np.program}});
 const p=await pub().prepare({...input,bindings:[oldSource,candidateSource],nativeStatePaths:np.native.statePaths,successorOf:f.parent});
 if(abrupt){await writeFile(join(f.root,'test-native.json'),JSON.stringify(options));await f.closeRecovery();await assert.rejects(exec(process.execPath,[import.meta.filename,'--abrupt-successor',f.root,p.planPath,'health-passed'],{windowsHide:true,timeout:20000}),e=>e.code===77);await f.reboot();await pub().recover(p);}else await pub().apply(p);
 assert.equal(await readFile(f.programPath,'utf8'),'repaired');const cp=await f.checkpoint();assert.equal(cp.barrier.closed,false);assert.equal(cp.pending.length,0);assert.equal(cp.events.filter(e=>e.type==='committed'&&e.payload.transactionId===f.parent.id).length,1);assert.equal(cp.events.filter(e=>e.type==='committed'&&e.payload.transactionId===p.id).length,1);assert.deepEqual(await readFile(f.budgetPath),f.budget);assert.equal(f.controller.status().maintenance,null);
});
test('ordinary update still rolls back on failed candidate health',async t=>{const f=await fixture(t),repair=await f.pub().prepare({...await f.input('repair','v1','v2'),successorOf:f.parent});await f.pub().apply(repair);const next=await f.pub().prepare(await f.input('ordinary','v2','v1'));f.hook=e=>{if(e.phase==='health-passed')throw error('TEST_HEALTH')};const r=await f.pub().apply(next);assert.equal(r.status,'rolled_back');assert.equal(await readFile(f.programPath,'utf8'),'repaired');assert.equal((await f.checkpoint()).barrier.closed,false);assert.deepEqual(await readFile(f.budgetPath),f.budget)});
test('another hold after a repair commit requires a new reviewed plan without replay',async t=>{const f=await fixture(t),p=await f.pub().prepare({...await f.input('repair','v1','v2'),successorOf:f.parent});await f.pub().apply(p);const c=await openControl({storageRoot:f.storageRoot,mode:'maintenance',initialize:false});await c.setBarrier({closed:true,transactionId:p.id,planHash:p.hash});await c.close();await writeFile(f.markerPath,await readFile(p.transactionPath));const before=await f.checkpoint();await assert.rejects(f.pub().recover(p),{code:'PGR_COMMITTED_HOLD_REQUIRES_SUCCESSOR'});assert.deepEqual((await f.checkpoint()).head,before.head);assert.deepEqual(await readFile(f.budgetPath),f.budget)});

for(const code of ['ENOSPC','EACCES'])test('injected '+code+' during repair keeps maintenance and resumes without resetting data',async t=>{const f=await fixture(t),p=await f.pub().prepare({...await f.input('repair','v1','v2'),successorOf:f.parent});f.adapters.install=async()=>{throw error(code)};await assert.rejects(f.pub().apply(p),{code});const failed=await f.checkpoint();assert.equal(failed.barrier.closed,true);assert.equal(failed.events.filter(e=>e.type==='committed'&&e.payload.transactionId===p.id).length,0);assert.ok(failed.pending.length>0);assert.deepEqual(await readFile(f.budgetPath),f.budget);f.adapters.install=async()=>{};await f.pub().recover(p);const after=await f.checkpoint();assert.equal(after.barrier.closed,false);assert.equal(after.pending.length,0);assert.deepEqual(await readFile(f.budgetPath),f.budget)});
test('a live P2 writer blocks repair admission without disturbing its owner',async t=>{const f=await fixture(t),p=await f.pub().prepare({...await f.input('repair','v1','v2'),successorOf:f.parent}),owner=await openControl({storageRoot:f.storageRoot,mode:'maintenance',initialize:false});try{const before=await owner.checkpoint();await assert.rejects(f.pub().apply(p),{code:'PGR_STORAGE_OWNED'});assert.deepEqual((await owner.checkpoint()).head,before.head);await owner.assertOwned();}finally{await owner.close()}});
test('foreign Recovery maintenance cannot be taken over by the repair plan',async t=>{const f=await fixture(t),p=await f.pub().prepare({...await f.input('repair','v1','v2'),successorOf:f.parent});await f.controller.beginMaintenance({id:randomUUID()});const before=await f.checkpoint();await assert.rejects(f.pub().apply(p),e=>e.code==='RECOVERY_MAINTENANCE_CONFLICT'||e.code==='RECOVERY_MAINTENANCE_OWNER');assert.deepEqual((await f.checkpoint()).head,before.head)});
test('pending deletion cleanup prevents preparation of a successor',async t=>{const f=await fixture(t),c=await openControl({storageRoot:f.storageRoot,mode:'maintenance',initialize:false});try{await c.deletion({id:'synthetic-deleted-record',owner:'project:test',status:'purged'});}finally{await c.close()}const before=await f.checkpoint();await assert.rejects(f.pub().prepare({...await f.input('repair','v1','v2'),successorOf:f.parent}),{code:'PGR_DELETION_PENDING'});assert.deepEqual((await f.checkpoint()).head,before.head);assert.deepEqual(await readFile(f.budgetPath),f.budget)});
test('completed deletion authority survives a later reviewed successor unchanged',async t=>{const f=await fixture(t),p=await f.pub().prepare({...await f.input('repair','v1','v2'),successorOf:f.parent});await f.pub().apply(p);const c=await openControl({storageRoot:f.storageRoot,mode:'maintenance',initialize:false});let deletions;try{await c.business({operation:'purge_owned_backups',recordId:'forgotten'},async()=>{await c.deletion({id:'forgotten',owner:'project:test',status:'purged'});assert.equal((await c.completeDeletion({id:'forgotten'})).complete,true)});deletions=(await c.checkpoint()).deletions;await c.setBarrier({closed:true,transactionId:p.id,planHash:p.hash});}finally{await c.close()}await writeFile(f.markerPath,await readFile(p.transactionPath));const next=await f.pub().prepare({...await f.input('next','v2','v2'),successorOf:p});await f.pub().apply(next);assert.deepEqual((await f.checkpoint()).deletions,deletions);assert.equal(deletions[0].cleanup,'complete')});
test('missing deletion journal blocks repair without recreating authority or changing budget',async t=>{const f=await fixture(t),p=await f.pub().prepare({...await f.input('repair','v1','v2'),successorOf:f.parent}),{rename}=await import('node:fs/promises'),journal=join(f.storageRoot,'.suite-memory/p2/journal.jsonl'),retained=journal+'.retained';await rename(journal,retained);try{await assert.rejects(f.pub().apply(p),e=>['P2_JOURNAL_INVALID','P2_COVERAGE_UNKNOWN'].includes(e.code));await assert.rejects(readFile(journal),{code:'ENOENT'});assert.deepEqual(await readFile(f.budgetPath),f.budget);}finally{await rename(retained,journal)}assert.equal((await f.checkpoint()).barrier.closed,true)});
