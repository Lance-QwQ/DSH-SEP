// Real SQLite + native POSIX/APFS helper. POSIX_TEST runs do not certify macOS.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,chmod} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {spawn} from 'node:child_process';
import {createProjectTree} from '../apfs-tree/project-tree.mjs';
import {openTrustedProject} from './transaction-store.mjs';
import {openMacManagedProject} from './mac-managed-project.mjs';
const sha=body=>createHash('sha256').update(body).digest('hex');
const base=resolve(process.env.SEP_MAC_TRANSACTION_TEST_ROOT??'');
assert.ok(process.env.SEP_MAC_TRANSACTION_TEST_ROOT,'explicit isolated output root required');
const helperPath=process.env.SEP_MAC_TREE_HELPER;
assert.ok(helperPath,'native helper is required');
const helperSha256=sha(await readFile(helperPath));
await mkdir(base,{recursive:true,mode:0o700});
const fixtures=[];
async function fixture(){
 const parent=await mkdtemp(join(base,'transaction-'));const root=join(parent,'managed'),source=join(parent,'source');
 await mkdir(root,{mode:0o700});await mkdir(source,{mode:0o700});await writeFile(join(source,'a.txt'),'original',{mode:0o600});await writeFile(join(source,'b.txt'),'public',{mode:0o600});
 const io=createProjectTree({helperPath,helperSha256,lockPath:join(root,'.native.lock')});
 let api;const open=async options=>(api=await (process.platform==='darwin'?openMacManagedProject({root,source,helperPath,helperSha256,...options}):openTrustedProject({root,source,io,...options})));
 const f={root,source,io,open,parent,get api(){return api;}};fixtures.push(f);return f;
}
test.after(async()=>{for(const f of fixtures)try{await f.api?.close();}catch{};});
test('trusted edit is invisible until reviewed hash is committed; original remains unchanged',async()=>{
 const f=await fixture(),p=await f.open();
 const plan=await p.planWrite({path:'a.txt',expectedSha256:sha('original'),text:'updated'});
 assert.equal(await readFile(join((await p.current()).path,'a.txt'),'utf8'),'original');
 assert.deepEqual((await p.review(plan.planHash)).changes,[{path:'a.txt',kind:'modified'}]);
 const done=await p.commit({planHash:plan.planHash});assert.equal(done.status,'committed');assert.equal(done.sequence,1);
 assert.equal(await readFile(join((await p.current()).path,'a.txt'),'utf8'),'updated');
 assert.equal(await readFile(join(f.source,'a.txt'),'utf8'),'original');
});
test('trusted create preserves absent guard and stale hashes never create a plan',async()=>{
 const f=await fixture(),p=await f.open();
 await assert.rejects(p.planWrite({path:'a.txt',expectedSha256:'absent',text:'bad'}),e=>e.code==='SEP_PROJECT_STALE_VERSION');
 await assert.rejects(p.planWrite({path:'a.txt',expectedSha256:sha('wrong'),text:'bad'}),e=>e.code==='SEP_PROJECT_STALE_VERSION');
 const plan=await p.planWrite({path:'c.txt',expectedSha256:'absent',text:'created'});await p.commit({planHash:plan.planHash});
 assert.equal(await readFile(join((await p.current()).path,'c.txt'),'utf8'),'created');
});
test('candidate tampering invalidates approval and does not publish',async()=>{
 const f=await fixture(),p=await f.open();const plan=await p.planWrite({path:'a.txt',expectedSha256:sha('original'),text:'reviewed'});
 const v=await p.view(plan.planHash);await writeFile(join(v.path,'a.txt'),'unreviewed');
 await assert.rejects(p.commit({planHash:plan.planHash}),e=>e.code==='SEP_PROJECT_CANDIDATE_CHANGED');
 assert.equal((await p.current()).sequence,0);
});
test('a committed sibling plan makes older approval stale',async()=>{
 const f=await fixture(),p=await f.open();
 const a=await p.planWrite({path:'a.txt',expectedSha256:sha('original'),text:'first'});
 const b=await p.planWrite({path:'b.txt',expectedSha256:sha('public'),text:'second'});
 await p.commit({planHash:a.planHash});await assert.rejects(p.commit({planHash:b.planHash}),e=>e.code==='SEP_PROJECT_STALE_PLAN');
});
test('expired approval is refused without resetting the journal',async()=>{
 const f=await fixture(),p=await f.open();const plan=await p.planWrite({path:'a.txt',expectedSha256:sha('original'),text:'stale'});await p.close();
 const db=new DatabaseSync(join(f.root,'state.sqlite'));const row=db.prepare('SELECT id,value FROM transactions').get();const t=JSON.parse(row.value);t.createdAt=1;db.prepare('UPDATE transactions SET value=? WHERE id=?').run(JSON.stringify(t),row.id);db.close();
 const reopened=await f.open();await assert.rejects(reopened.commit({planHash:plan.planHash}),e=>e.code==='SEP_PROJECT_PLAN_EXPIRED');assert.equal((await reopened.current()).sequence,0);
});
test('unknown cleanup refuses all admission and cannot be cleared by ordinary recover',async()=>{
 const f=await fixture(),p=await f.open();await p.close();const db=new DatabaseSync(join(f.root,'state.sqlite'));
 db.prepare('INSERT INTO transactions VALUES(?,?)').run('00000000-0000-4000-8000-000000000001',JSON.stringify({id:'00000000-0000-4000-8000-000000000001',state:'cleanup_blocked',kind:'unknown'}));db.close();
 const reopened=await f.open();await assert.rejects(reopened.current(),e=>e.code==='SEP_PROJECT_RECOVERY_REQUIRED');await assert.rejects(reopened.recover(),e=>e.code==='SEP_PROJECT_CLEANUP_BLOCKED');
});
test('arbitrary shell is rejected before dispatch and source changes',async()=>{
 const f=await fixture(),p=await f.open();await assert.rejects(p.run({command:['/bin/sh','-c','touch SHOULD_NOT_EXIST']}),e=>e.code==='SEP_MAC_SHELL_UNAVAILABLE');assert.equal((await p.current()).sequence,0);
});
test('exclusive owner rejects concurrent controllers and permits reopen after close',async()=>{
 const f=await fixture(),p=await f.open();await assert.rejects(openTrustedProject({root:f.root,source:f.source,io:f.io}),e=>e.code==='SEP_PROJECT_LOCKED');await p.close();const again=await f.open();assert.equal((await again.current()).generation,1);
});
test('an unfinished native operation blocks reopening until its actual lock is released',async()=>{
 const f=await fixture(),p=await f.open();await p.close();
 const child=spawn('python3',['-c','import fcntl,sys; f=open(sys.argv[1],"r+"); fcntl.flock(f,fcntl.LOCK_EX); print("READY",flush=True); sys.stdin.read();',join(f.root,'.native.lock')],{stdio:['pipe','pipe','pipe']});
 const done=new Promise((res,rej)=>{child.once('error',rej);child.once('close',(code,signal)=>res({code,signal}));});
 try{
  await new Promise((res,rej)=>{const timer=setTimeout(()=>rej(Error('native lock holder deadline')),3000);child.stdout.once('data',b=>{clearTimeout(timer);assert.equal(String(b).trim(),'READY');res();});child.once('error',rej);});
  await assert.rejects(f.open(),e=>e.code==='SEP_PROJECT_BUSY');child.stdin.end();assert.deepEqual(await done,{code:0,signal:null});
  const reopened=await f.open();assert.equal((await reopened.current()).generation,1);
 }finally{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');await done;}
});
test('pre-cancelled commit preserves the approved candidate and current generation',async()=>{
 const f=await fixture(),p=await f.open();const plan=await p.planWrite({path:'a.txt',expectedSha256:sha('original'),text:'updated'});const ac=new AbortController();ac.abort();
 await assert.rejects(p.commit({planHash:plan.planHash,signal:ac.signal}),e=>e.code==='SEP_PROJECT_CANCELLED');assert.equal((await p.current()).sequence,0);assert.equal((await p.review(plan.planHash)).planHash,plan.planHash);
});
test('native entry refuses unsupported platforms before opening or writing a project',async()=>{
 if(process.platform==='darwin'){const f=await fixture(),p=await f.open();assert.equal((await p.current()).generation,1);}
 else await assert.rejects(openMacManagedProject({root:'/nonexistent',source:'/nonexistent',helperPath:'/nonexistent',helperSha256:'1'.repeat(64)}),e=>e.code==='SEP_MAC_PLATFORM_UNAVAILABLE');
});
test('restoration is a separately reviewed new generation',async()=>{
 const f=await fixture(),p=await f.open();const a=await p.planWrite({path:'a.txt',expectedSha256:sha('original'),text:'updated'});await p.commit({planHash:a.planHash});
 const restore=await p.planRestore(1);assert.equal((await p.current()).sequence,1);await p.commit({planHash:restore.planHash});assert.equal((await p.current()).sequence,2);assert.equal(await readFile(join((await p.current()).path,'a.txt'),'utf8'),'original');
});
test('deletion authority purges historical bodies and prevents resurrection on restore',async()=>{
 const f=await fixture(),p=await f.open();let markers=[];await p.bindDocumentAuthority({identity:'synthetic-p2',read:async()=>markers});
 const a=await p.planWrite({path:'a.txt',expectedSha256:sha('original'),text:'updated'});await p.commit({planHash:a.planHash});
 const review=await p.reviewDocument('a.txt');markers=[{id:'delete-1',owner:'project:synthetic',status:'purged',documentPath:'a.txt',planHash:'1'.repeat(64),managedPlanHash:review.planHash}];
 await p.deleteDocument({marker:markers[0],expectedPlanHash:review.planHash});const restore=await p.planRestore(1);await p.commit({planHash:restore.planHash});
 await assert.rejects(readFile(join((await p.current()).path,'a.txt')),e=>e.code==='ENOENT');
 await assert.rejects(p.planWrite({path:'elsewhere.txt',expectedSha256:'absent',text:'original'}),e=>e.code==='SEP_PROJECT_DOCUMENT_COPY_REMOVED');
 assert.equal(await readFile(join(f.source,'a.txt'),'utf8'),'original');
 await p.close();const reopened=await f.open();await assert.rejects(reopened.current(),e=>e.code==='SEP_PROJECT_DOCUMENT_AUTHORITY_REQUIRED');
 await assert.rejects(reopened.bindDocumentAuthority({identity:'synthetic-p2',read:async()=>[]}),e=>e.code==='SEP_PROJECT_DOCUMENT_AUTHORITY_INVALID');
});
async function crash(f,event,mode='commit'){
 const args=[fileURLToPath(new URL('./transaction-crash-worker.mjs',import.meta.url)),f.root,f.source,event,mode];
 const child=spawn(process.execPath,args,{env:{...process.env,SEP_MAC_TREE_HELPER:helperPath},stdio:['ignore','pipe','pipe']});let out='',err='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);
 const result=await new Promise((res,rej)=>{const timer=setTimeout(()=>{child.kill('SIGKILL');rej(Error('crash worker deadline '+out+err));},15000);child.on('error',rej);child.on('close',(code,signal)=>{clearTimeout(timer);res({code,signal});});});
 assert.equal(result.signal,'SIGKILL',out+err);return out;
}
for(const phase of ['intent-durable','published-durable','health-passed','committed-durable'])test('SIGKILL at '+phase+' recovers only a durable generation',async()=>{
 const f=await fixture();const p=await f.open();await p.close();await crash(f,phase);
 const after=await f.open();if(phase!=='committed-durable')await assert.rejects(after.current(),e=>e.code==='SEP_PROJECT_RECOVERY_REQUIRED');
 await after.recover();const current=await after.current();assert.equal(current.sequence,phase==='committed-durable'?1:0);
 assert.equal(await readFile(join(current.path,'a.txt'),'utf8'),phase==='committed-durable'?'updated':'original');
});
test('SIGKILL after first document copy removal resumes only the approved deletion prefix',async()=>{
 const f=await fixture();const p=await f.open();await p.close();await crash(f,'document-copy-unlinked','delete');
 const reopened=await f.open();await assert.rejects(reopened.current(),e=>e.code==='SEP_PROJECT_DOCUMENT_AUTHORITY_REQUIRED');
 const markers=JSON.parse(await readFile(join(f.parent,'authority.json'),'utf8'));await reopened.bindDocumentAuthority({identity:'synthetic-p2',read:async()=>markers});
 await reopened.recover();await assert.rejects(readFile(join((await reopened.current()).path,'a.txt')),e=>e.code==='ENOENT');
});
test('rolled-back target does not poison deletion inventory and its generation id is not reused',async()=>{
 const f=await fixture();const p=await f.open();await p.close();await crash(f,'published-durable');
 const reopened=await f.open();await reopened.recover();let markers=[];await reopened.bindDocumentAuthority({identity:'synthetic-p2',read:async()=>markers});
 assert.equal((await reopened.reviewDocument('a.txt')).generationCopies,1);
 const next=await reopened.planWrite({path:'a.txt',expectedSha256:sha('original'),text:'next'});const committed=await reopened.commit({planHash:next.planHash});assert.equal(committed.generation,3);
 const review=await reopened.reviewDocument('a.txt');markers=[{id:'delete-after-rollback',owner:'project:synthetic',status:'purged',documentPath:'a.txt',planHash:'2'.repeat(64),managedPlanHash:review.planHash}];
 await reopened.deleteDocument({marker:markers[0],expectedPlanHash:review.planHash});const restore=await reopened.planRestore(1);await reopened.commit({planHash:restore.planHash});
 await assert.rejects(readFile(join((await reopened.current()).path,'a.txt')),e=>e.code==='ENOENT');
});
test('cancel after target publication retains recovery intent and does not poison later deletion',async()=>{
 const f=await fixture(),ac=new AbortController();const p=await f.open({onEvent:event=>{if(event==='health-passed')ac.abort();}});
 const plan=await p.planWrite({path:'a.txt',expectedSha256:sha('original'),text:'never-committed'});
 await assert.rejects(p.commit({planHash:plan.planHash,signal:ac.signal}),e=>e.code==='SEP_PROJECT_CANCELLED');await p.close();
 const reopened=await f.open();await reopened.recover();assert.equal((await reopened.current()).sequence,0);assert.equal((await reopened.reviewDocument('a.txt')).generationCopies,1);
});
test('first-import copy crash has a durable intent and can resume without replacing the original',async()=>{
 const f=await fixture();await crash(f,'bootstrap-copy-durable','bootstrap');
 const opened=await f.open();assert.equal((await opened.current()).generation,1);assert.equal(await readFile(join((await opened.current()).path,'a.txt'),'utf8'),'original');assert.equal(await readFile(join(f.source,'a.txt'),'utf8'),'original');
});
test('an unexplained initialization directory is retained and refused',async()=>{
 const f=await fixture();await mkdir(join(f.root,'generations'),{mode:0o700});await writeFile(join(f.root,'generations','foreign.txt'),'must-retain',{mode:0o600});
 await assert.rejects(f.open(),e=>e.code==='SEP_PROJECT_INITIALIZATION_INCOMPLETE');assert.equal(await readFile(join(f.root,'generations','foreign.txt'),'utf8'),'must-retain');
});
test('a changed source after interrupted first import is refused without removing the captured copy',async()=>{
 const f=await fixture();await crash(f,'bootstrap-copy-durable','bootstrap');await writeFile(join(f.source,'a.txt'),'new source');
 await assert.rejects(f.open(),e=>e.code==='SEP_PROJECT_INITIALIZATION_INCOMPLETE');assert.equal(await readFile(join(f.root,'generations','1','data','a.txt'),'utf8'),'original');
});
test('unknown bodies introduced into interrupted bootstrap are retained and refused',async()=>{
 const f=await fixture();await crash(f,'bootstrap-copy-durable','bootstrap');const unknown=join(f.root,'generations','1','data','foreign.txt');await writeFile(unknown,'foreign',{mode:0o600});
 await assert.rejects(f.open(),e=>e.code==='SEP_PROJECT_INITIALIZATION_INCOMPLETE');assert.equal(await readFile(unknown,'utf8'),'foreign');
});
test('a native cleanup-unknown report durably blocks admission and close cannot claim pass',async()=>{
 const f=await fixture();let injected=false;
 // Only the native completion boundary is fault-injected; the actual file
 // write and all SQLite/copy/recovery operations still execute for real.
 const io={...f.io,async applyFile(...args){const result=await f.io.applyFile(...args);if(!injected){injected=true;throw Object.assign(Error('unconfirmed native exit'),{code:'SEP_PROJECT_CLEANUP_UNCONFIRMED'});}return result;}};
 const p=await openTrustedProject({root:f.root,source:f.source,io});
 try{await assert.rejects(p.planWrite({path:'a.txt',expectedSha256:sha('original'),text:'unknown'}),e=>e.code==='SEP_PROJECT_CLEANUP_UNCONFIRMED');await assert.rejects(p.current(),e=>e.code==='SEP_PROJECT_RECOVERY_REQUIRED');}
 finally{assert.equal((await p.close()).status,'blocked');}
 const reopened=await f.open();await assert.rejects(reopened.current(),e=>e.code==='SEP_PROJECT_RECOVERY_REQUIRED');await assert.rejects(reopened.recover(),e=>e.code==='SEP_PROJECT_CLEANUP_BLOCKED');
});
test('read-only snapshot cleanup uncertainty also blocks future admission and close',async()=>{
 const f=await fixture();let uncertain=false;const io={...f.io,async tree(...args){const result=await f.io.tree(...args);if(uncertain){uncertain=false;throw Object.assign(Error('injected native completion fault'),{code:'SEP_PROJECT_CLEANUP_UNCONFIRMED'});}return result;}};
 const p=await openTrustedProject({root:f.root,source:f.source,io});try{uncertain=true;await assert.rejects(p.current(),e=>e.code==='SEP_PROJECT_CLEANUP_UNCONFIRMED');await assert.rejects(p.current(),e=>e.code==='SEP_PROJECT_RECOVERY_REQUIRED');}finally{assert.equal((await p.close()).status,'blocked');}
 const reopened=await f.open();await assert.rejects(reopened.current(),e=>e.code==='SEP_PROJECT_RECOVERY_REQUIRED');
});
test('bootstrap cleanup preserves the original uncertainty when handle disposal also fails',async()=>{
 const f=await fixture();let uncertain=false;const io={...f.io,async tree(...args){const result=await f.io.tree(...args);if(args[0]===f.source){uncertain=true;throw Object.assign(Error('primary'),{code:'SEP_PROJECT_CLEANUP_UNCONFIRMED'});}return result;},async directory(...args){const held=await f.io.directory(...args);return {stat:(...a)=>held.stat(...a),async close(){await held.close();if(uncertain)throw Object.assign(Error('secondary'),{code:'SEP_TEST_CLOSE'});}};}};
 await assert.rejects(openTrustedProject({root:f.root,source:f.source,io}),e=>e.code==='SEP_PROJECT_CLEANUP_UNCONFIRMED');assert.equal(await readFile(join(f.source,'a.txt'),'utf8'),'original');
});
test('owner-directory observation failure closes the acquired native handle',async()=>{
 const f=await fixture();let actual;const io={...f.io,async directory(...args){const held=await f.io.directory(...args);if(args[0]!==f.root)return held;actual=held;return {async stat(...a){await held.stat(...a);throw Object.assign(Error('observation uncertain'),{code:'SEP_PROJECT_CLEANUP_UNCONFIRMED'});},close:()=>held.close()};}};
 try{await assert.rejects(openTrustedProject({root:f.root,source:f.source,io}),e=>e.code==='SEP_PROJECT_CLEANUP_UNCONFIRMED');await assert.rejects(actual.stat({bigint:true}),e=>e.code==='SEP_PROJECT_CLOSED');}
 finally{await actual?.close();}
});
