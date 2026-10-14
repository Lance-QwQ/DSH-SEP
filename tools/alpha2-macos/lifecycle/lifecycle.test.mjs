import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createProjectTree} from '../apfs-tree/project-tree.mjs';
import {openTrustedProject} from '../transactions/transaction-store.mjs';
import {wrapManagedProject} from './managed-project-lifecycle.mjs';
const base=process.env.SEP_MAC_LIFECYCLE_TEST_ROOT,helperPath=process.env.SEP_MAC_TREE_HELPER;
assert.ok(base&&helperPath);assert.equal(resolve(base),base);await mkdir(base,{mode:0o700});
const hash=x=>createHash('sha256').update(x).digest('hex');
const helperSha256=hash(await readFile(helperPath));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const bounded=async promise=>{let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('TEST_DEADLINE')),3000);})]);}finally{clearTimeout(timer);}};
const fixtures=[];
async function fixture(){const parent=await mkdtemp(join(base,'case-')),root=join(parent,'managed'),source=join(parent,'source');await mkdir(root,{mode:0o700});await mkdir(source,{mode:0o700});await writeFile(join(source,'a'),'original',{mode:0o600});const io=createProjectTree({helperPath,helperSha256,lockPath:join(root,'.native.lock')});const core=await openTrustedProject({root,source,io});fixtures.push(core);return {root,source,core};}
test.after(async()=>{for(const core of fixtures)await core.close();});
test('all real API methods are present and stale references reject after actual close',async()=>{
 const {core}=await fixture(),facade=wrapManagedProject(core,{closeDeadlineMs:1000});
 for(const name of Object.keys(core))assert.equal(typeof facade[name],'function',name);
 const old=facade.current;assert.equal((await old()).generation,1);assert.equal((await facade.close()).status,'pass');
 await assert.rejects(old(),{code:'SEP_MAC_PROJECT_CLOSED'});assert.equal((await facade.whenClosed()).resourcesConfirmedReleased,true);
});
test('long accepted real read keeps whenClosed pending after bounded close, then drains',async()=>{
 const {core}=await fixture(),entered=deferred(),release=deferred();
 // Delay the completion boundary after a real SQLite/native snapshot. This
 // models a caller still processing the accepted read, not a fake tree.
 const facade=wrapManagedProject({...core,current:async()=>{const result=await core.current();entered.resolve();await release.promise;return result;}},{closeDeadlineMs:15});
 const pending=facade.current();await bounded(entered.promise);let finished=false;facade.whenClosed().then(()=>{finished=true;});
 const first=facade.close(),same=facade.close();assert.equal(first,same);const receipt=await bounded(first);
 assert.equal(receipt.status,'blocked');assert.equal(receipt.code,'SEP_MAC_CLOSE_DEADLINE');assert.equal(receipt.pending.read,1);assert.equal(receipt.resourcesConfirmedReleased,false);assert.equal(finished,false);
 await assert.rejects(facade.plans(),{code:'SEP_MAC_PROJECT_CLOSED'});release.resolve();assert.equal((await pending).generation,1);
 assert.equal((await bounded(facade.whenClosed())).resourcesConfirmedReleased,true);assert.equal((await facade.close()).status,'pass');assert.equal(receipt.status,'blocked');
});
test('ordinary real read failure releases its slot and does not invent cleanup failure',async()=>{
 const {core}=await fixture(),facade=wrapManagedProject(core,{closeDeadlineMs:1000});
 await assert.rejects(facade.view('invalid'),{code:'SEP_PROJECT_PLAN_INVALID'});assert.equal(facade.status().pending.total,0);assert.equal((await facade.close()).status,'pass');
});
test('ordinary real write rejection releases its slot and preserves source',async()=>{
 const {core,source}=await fixture(),facade=wrapManagedProject(core,{closeDeadlineMs:1000});
 await assert.rejects(facade.planWrite({path:'a',expectedSha256:'0'.repeat(64),text:'wrong'}),{code:'SEP_PROJECT_STALE_VERSION'});
 assert.equal(await readFile(join(source,'a'),'utf8'),'original');assert.equal(facade.status().pending.total,0);assert.equal((await facade.close()).status,'pass');
});
test('accepted real write drains before core close and remains only a reviewed candidate',async()=>{
 const {core,source}=await fixture(),entered=deferred(),release=deferred();
 const facade=wrapManagedProject({...core,planWrite:async input=>{const result=await core.planWrite(input);entered.resolve();await release.promise;return result;}},{closeDeadlineMs:15});
 const operation=facade.planWrite({path:'a',expectedSha256:hash('original'),text:'review'});await bounded(entered.promise);const close=await bounded(facade.close());assert.equal(close.status,'blocked');assert.equal(close.pending.write,1);
 release.resolve();assert.equal((await operation).status,'ready');assert.equal((await bounded(facade.whenClosed())).status,'pass');assert.equal(await readFile(join(source,'a'),'utf8'),'original');
});
test('unknown native completion cannot become pass through successful core disposal',async()=>{
 const {core}=await fixture();const facade=wrapManagedProject({...core,current:async()=>{await core.current();throw Object.assign(Error('private diagnostic'),{code:'SEP_PROJECT_CLEANUP_UNCONFIRMED'});}},{closeDeadlineMs:1000});
 await assert.rejects(facade.current(),{code:'SEP_PROJECT_CLEANUP_UNCONFIRMED'});const receipt=await facade.close();assert.equal(receipt.status,'blocked');assert.equal(receipt.resourcesConfirmedReleased,false);assert.ok(!JSON.stringify(receipt).includes('private diagnostic'));
 assert.equal((await facade.close()).status,'blocked');let resolved=false;facade.whenClosed().then(()=>{resolved=true;});await new Promise(r=>setImmediate(r));assert.equal(resolved,false);
});
test('core blocked close stays blocked and whenClosed never lies',async()=>{
 const {core}=await fixture();const facade=wrapManagedProject({...core,close:async()=>{await core.close();return {status:'blocked'};}},{closeDeadlineMs:1000});
 const receipt=await facade.close();assert.equal(receipt.status,'blocked');assert.equal(receipt.resourcesConfirmedReleased,false);
 await assert.rejects(facade.current(),{code:'SEP_MAC_PROJECT_CLOSED'});
});
test('core close failure returns bounded redacted blocked receipt',async()=>{
 const {core}=await fixture();const facade=wrapManagedProject({...core,close:async()=>{await core.close();throw Object.assign(Error('PRIVATE_PATH_OR_CONTENT'),{code:'SEP_PROJECT_CLEANUP_UNCONFIRMED'});}},{closeDeadlineMs:1000});
 const receipt=await facade.close();assert.equal(receipt.status,'blocked');assert.equal(receipt.code,'SEP_PROJECT_CLEANUP_UNCONFIRMED');assert.ok(!JSON.stringify(receipt).includes('PRIVATE'));assert.equal(receipt.resourcesConfirmedReleased,false);
});
test('cleanup uncertainty immediately closes new admission while owning actual disposal',async()=>{
 const {core}=await fixture();const facade=wrapManagedProject({...core,current:async()=>{await core.current();throw Object.assign(Error('private'),{code:'SEP_PROJECT_CLEANUP_UNCONFIRMED'});}},{closeDeadlineMs:1000});
 const old=facade.plans;await assert.rejects(facade.current(),{code:'SEP_PROJECT_CLEANUP_UNCONFIRMED'});
 assert.equal(facade.status().admissionOpen,false);await assert.rejects(old(),{code:'SEP_MAC_PROJECT_CLOSED'});
 assert.equal((await facade.close()).status,'blocked');
});
test('deadline during actual close waits for late ownership acknowledgement',async()=>{
 const {core}=await fixture(),entered=deferred(),release=deferred();const facade=wrapManagedProject({...core,close:async()=>{const result=await core.close();entered.resolve();await release.promise;return result;}},{closeDeadlineMs:15});
 const closing=facade.close();await bounded(entered.promise);const receipt=await bounded(closing);
 assert.equal(receipt.status,'blocked');assert.equal(receipt.pending.total,0);assert.equal(receipt.resourcesConfirmedReleased,false);
 let resolved=false;facade.whenClosed().then(()=>{resolved=true;});await new Promise(r=>setImmediate(r));assert.equal(resolved,false);
 release.resolve();assert.equal((await bounded(facade.whenClosed())).status,'pass');assert.equal((await facade.close()).status,'pass');
});
test('temporary blocked close retries actual ownership release and resolves whenClosed only then',async()=>{
 const {core}=await fixture();let calls=0,resolved=false;const facade=wrapManagedProject({...core,close:async()=>++calls===1?{status:'blocked',code:'SEP_MAC_RESOURCE_BUSY'}:core.close()},{closeDeadlineMs:1000});
 facade.whenClosed().then(()=>{resolved=true;});const first=await facade.close();assert.equal(first.status,'blocked');assert.equal(calls,1);assert.equal(resolved,false);
 await assert.rejects(facade.current(),{code:'SEP_MAC_PROJECT_CLOSED'});assert.equal((await facade.close()).status,'pass');assert.equal(calls,2);assert.equal((await bounded(facade.whenClosed())).resourcesConfirmedReleased,true);
 assert.equal((await facade.close()).status,'pass');assert.equal(calls,2);assert.equal(first.status,'blocked');
});
test('temporary close exception is not memoized and actual cleanup is retried',async()=>{
 const {core}=await fixture();let calls=0;const facade=wrapManagedProject({...core,close:async()=>{if(++calls===1)throw Object.assign(Error('PRIVATE'),{code:'SEP_MAC_RESOURCE_BUSY'});return core.close();}},{closeDeadlineMs:1000});
 assert.equal((await facade.close()).status,'blocked');assert.equal((await facade.close()).status,'pass');assert.equal(calls,2);assert.equal((await bounded(facade.whenClosed())).status,'pass');
});
test('retry can release core after close uncertainty but cannot erase the uncertainty',async()=>{
 const {core}=await fixture();let calls=0,resolved=false;const facade=wrapManagedProject({...core,close:async()=>{if(++calls===1)throw Object.assign(Error('PRIVATE'),{code:'SEP_PROJECT_CLEANUP_UNCONFIRMED'});return core.close();}},{closeDeadlineMs:1000});
 facade.whenClosed().then(()=>{resolved=true;});assert.equal((await facade.close()).status,'blocked');const second=await facade.close();assert.equal(calls,2);assert.equal(second.status,'blocked');assert.equal(second.code,'SEP_PROJECT_CLEANUP_UNCONFIRMED');assert.equal(second.resourcesConfirmedReleased,false);assert.equal(resolved,false);
});
