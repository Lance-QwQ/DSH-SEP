// Real transaction core + native helper; synthetic caller authority is the
// future host-plugin boundary. No fake model, disk, database or transaction.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rename,symlink} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createProjectTree} from '../apfs-tree/project-tree.mjs';
import {openTrustedProject} from '../transactions/transaction-store.mjs';
import {openMacManagedProject} from '../transactions/mac-managed-project.mjs';
import {wrapManagedProject} from '../lifecycle/managed-project-lifecycle.mjs';
import {createControlledFileProfile} from './controlled-files.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
assert.ok(process.env.SEP_MAC_PROFILE_TEST_ROOT,'explicit synthetic test root required');
assert.ok(process.env.SEP_MAC_TREE_HELPER,'fixed native helper required');
const base=resolve(process.env.SEP_MAC_PROFILE_TEST_ROOT),helperPath=process.env.SEP_MAC_TREE_HELPER,helperSha256=sha(await readFile(helperPath));
await mkdir(base,{recursive:true,mode:0o700});
const fixtures=[];
const code=wanted=>e=>e.code===wanted;
async function fixture(contents={}){
 const parent=await mkdtemp(join(base,'profile-')),root=join(parent,'managed'),source=join(parent,'source');
 await mkdir(root,{mode:0o700});await mkdir(source,{mode:0o700});await mkdir(join(source,'folder'),{mode:0o700});
 for(const [path,body]of Object.entries({'a.txt':'original','b.txt':'public',...contents}))await writeFile(join(source,path),body,{mode:0o600});
 const callers=new WeakMap();const caller=(sessionId='session-a',depth=0,cwd=source)=>{const exec={signal:new AbortController().signal};callers.set(exec,{sessionId,depth,cwd});return exec;};
 let profile,project;const open=async(options={})=>{
  const {wrapCore,projectDeadlineMs=100,...profileOptions}=options;
  const io=createProjectTree({helperPath,helperSha256,lockPath:join(root,'.native.lock')});
  const core=await (process.platform==='darwin'?openMacManagedProject({root,source,helperPath,helperSha256}):openTrustedProject({root,source,io}));
  project=wrapManagedProject(wrapCore?wrapCore(core):core,{closeDeadlineMs:projectDeadlineMs});
  try{profile=await createControlledFileProfile({project,source,authorize:async exec=>{const value=callers.get(exec);if(!value)throw Object.assign(Error('unknown agent'),{code:'SEP_MAC_AGENT_SCOPE'});return {...value};},closeDeadlineMs:100,...profileOptions});return profile;}
  catch(e){await project.close();throw e;}
 };
 const f={parent,root,source,caller,callers,open,get profile(){return profile;},get project(){return project;}};fixtures.push(f);return f;
}
test.after(async()=>{for(const f of fixtures)await (f.profile?.controller.close()??f.project?.close()).catch(()=>{});});
test('read observes managed bytes and exact approved commit leaves imported source untouched',async()=>{
 const f=await fixture(),p=await f.open(),exec=f.caller();
 assert.deepEqual(await p.execute('read',{file_path:'a.txt'},exec),{path:'a.txt',exists:true,text:'original',version:sha('original')});
 assert.deepEqual(await p.execute('write',{file_path:'a.txt',content:'changed'},exec),{path:'a.txt',updated:true,staged:true});
 assert.equal(await readFile(join((await f.project.current()).path,'a.txt'),'utf8'),'original');
 const review=await p.controller.review();assert.deepEqual(review.changes,[{path:'a.txt',kind:'modified'}]);
 assert.equal((await p.controller.commit({planHash:review.planHash})).status,'committed');
 assert.equal((await p.execute('read',{file_path:'a.txt'},exec)).text,'changed');
 assert.equal(await readFile(join(f.source,'a.txt'),'utf8'),'original');
 assert.equal(p.source,f.source);
});
test('observation belongs to its session and is required before mutation',async()=>{
 const f=await fixture(),p=await f.open(),a=f.caller(),b=f.caller('session-b');
 await assert.rejects(p.execute('write',{file_path:'a.txt',content:'bad'},a),code('FS_NOT_OBSERVED'));
 await p.execute('read',{file_path:'a.txt'},a);
 await assert.rejects(p.execute('write',{file_path:'a.txt',content:'bad'},b),code('FS_NOT_OBSERVED'));
 assert.equal((await p.controller.plans()).length,0);
});
test('absent read grants creation only under an existing parent and edit stays not-found',async()=>{
 const f=await fixture(),p=await f.open(),exec=f.caller();
 assert.deepEqual(await p.execute('read',{file_path:'folder/new.txt'},exec),{path:'folder/new.txt',exists:false,version:'absent'});
 await assert.rejects(p.execute('edit',{file_path:'folder/new.txt',old_string:'x',new_string:'y'},exec),code('FS_NOT_FOUND'));
 await p.execute('write',{file_path:'folder/new.txt',content:'created'},exec);
 const r=await p.controller.review();await p.controller.commit({planHash:r.planHash});
 assert.equal((await p.execute('read',{file_path:'folder/new.txt'},exec)).text,'created');
 await assert.rejects(p.execute('read',{file_path:'missing/child.txt'},exec),code('FS_NOT_DIRECTORY'));
});
test('staged edits compose in one selected plan and invalidate old observations',async()=>{
 const f=await fixture(),p=await f.open(),exec=f.caller();
 await p.execute('read',{file_path:'a.txt'},exec);await p.execute('read',{file_path:'b.txt'},exec);
 await p.execute('write',{file_path:'a.txt',content:'one'},exec);
 await assert.rejects(p.execute('write',{file_path:'b.txt',content:'two'},exec),code('FS_NOT_OBSERVED'));
 await p.execute('read',{file_path:'b.txt'},exec);await p.execute('write',{file_path:'b.txt',content:'two'},exec);
 assert.equal((await p.controller.plans()).length,1);
 assert.equal((await p.execute('read',{file_path:'a.txt'},exec)).text,'one');
 const r=await p.controller.review();assert.deepEqual(r.changes,[{path:'a.txt',kind:'modified'},{path:'b.txt',kind:'modified'}]);
 await p.controller.commit({planHash:r.planHash});assert.equal((await p.execute('read',{file_path:'b.txt'},exec)).text,'two');
});
test('edit requires exactly one nonempty text match and never commits automatically',async()=>{
 const f=await fixture({'a.txt':'foo foo'}),p=await f.open(),exec=f.caller();await p.execute('read',{file_path:'a.txt'},exec);
 await assert.rejects(p.execute('edit',{file_path:'a.txt',old_string:'foo',new_string:'bar'},exec),code('FS_EDIT_AMBIGUOUS'));
 await assert.rejects(p.execute('edit',{file_path:'a.txt',old_string:'missing',new_string:'bar'},exec),code('FS_EDIT_NOT_FOUND'));
 await p.execute('edit',{file_path:'a.txt',old_string:'foo foo',new_string:'bar'},exec);
 assert.equal((await p.execute('read',{file_path:'a.txt'},exec)).text,'bar');assert.equal((await f.project.current()).sequence,0);
});
test('child reads staged bytes but cannot write, edit, or recurse beyond one level',async()=>{
 const f=await fixture(),p=await f.open(),parent=f.caller(),child=f.caller('child',1);
 await p.execute('read',{file_path:'a.txt'},parent);await p.execute('write',{file_path:'a.txt',content:'staged'},parent);
 assert.equal((await p.execute('read',{file_path:'a.txt'},child)).text,'staged');
 await assert.rejects(p.execute('write',{file_path:'a.txt',content:'bad'},child),code('SEP_MAC_CHILD_READONLY'));
 await assert.rejects(p.execute('edit',{file_path:'a.txt',old_string:'staged',new_string:'bad'},child),code('SEP_MAC_CHILD_READONLY'));
 await assert.rejects(p.execute('read',{file_path:'a.txt'},f.caller('grandchild',2)),code('SEP_MAC_CHILD_DEPTH'));
});
test('model entry cannot invoke management or unisolated execution',async()=>{
 const f=await fixture(),p=await f.open(),exec=f.caller();
 for(const method of ['commit','restore','recover','discard','withView'])await assert.rejects(p.execute(method,{},exec),code('SEP_MAC_TOOL_UNAVAILABLE'));
 for(const method of ['bash','mcp_call','context_prepare'])await assert.rejects(p.execute(method,{command:'touch must-not-exist'},exec),code('SEP_MAC_EXECUTION_UNAVAILABLE'));
 assert.equal((await p.controller.plans()).length,0);assert.equal((await f.project.current()).sequence,0);
});
test('unknown or another project caller cannot borrow observation or read bytes',async()=>{
 const f=await fixture(),p=await f.open();
 await assert.rejects(p.execute('read',{file_path:'a.txt'},{}),code('SEP_MAC_AGENT_SCOPE'));
 await assert.rejects(p.execute('read',{file_path:'a.txt'},f.caller('foreign',0,f.parent)),code('SEP_MAC_AGENT_SCOPE'));
 await assert.rejects(p.execute('read',{file_path:'a.txt',sessionId:'spoof'},f.caller()),code('SEP_MAC_TOOL_INPUT'));
});
test('paths are canonical project-relative and never return source sibling bytes',async()=>{
 const f=await fixture(),p=await f.open(),exec=f.caller();await writeFile(join(f.parent,'secret'),'private');
 for(const path of ['../secret','/etc/passwd','folder/../a.txt','folder\\x','a.txt/','./a.txt','a.txt\0','file:secret'])await assert.rejects(p.execute('read',{file_path:path},exec),code('FS_PATH_OUTSIDE'));
});
test('read bounds and strict UTF8 reject overlarge or binary contents before exposing text',async()=>{
 const f=await fixture({'big.txt':'x'.repeat(32769),'binary':Buffer.from([0xff,0x00])}),p=await f.open(),exec=f.caller();
 await assert.rejects(p.execute('read',{file_path:'big.txt'},exec),code('FS_TOO_LARGE'));
 await assert.rejects(p.execute('read',{file_path:'binary'},exec),code('FS_NOT_TEXT'));
});
test('candidate content tampering and symlink replacement are never returned',async()=>{
 const f=await fixture(),p=await f.open(),exec=f.caller();await p.execute('read',{file_path:'a.txt'},exec);await p.execute('write',{file_path:'a.txt',content:'safe'},exec);
 const r=await p.controller.review(),view=await f.project.view(r.planHash);await writeFile(join(view.path,'a.txt'),'unreviewed');
 await assert.rejects(p.execute('read',{file_path:'a.txt'},exec),code('SEP_PROJECT_CANDIDATE_CHANGED'));
 const g=await fixture(),q=await g.open(),current=await g.project.current();await rename(join(current.path,'a.txt'),join(g.parent,'moved'));await symlink(join(g.parent,'moved'),join(current.path,'a.txt'));
 await assert.rejects(q.execute('read',{file_path:'a.txt'},g.caller()),e=>/^SEP_PROJECT_/.test(e.code));
});
test('controller refuses a different approval and requires explicit review',async()=>{
 const f=await fixture(),p=await f.open(),exec=f.caller();await p.execute('read',{file_path:'a.txt'},exec);await p.execute('write',{file_path:'a.txt',content:'new'},exec);
 const [plan]=await p.controller.plans();await assert.rejects(p.controller.commit({planHash:plan.planHash}),code('SEP_MAC_REVIEW_REQUIRED'));
 const r=await p.controller.review();await assert.rejects(p.controller.commit({planHash:'0'.repeat(64)}),code('SEP_PROJECT_STALE_PLAN'));await p.controller.commit({planHash:r.planHash});
});
test('restart requires trusted plan selection and does not silently discard staged work',async()=>{
 const f=await fixture(),p=await f.open(),exec=f.caller();await p.execute('read',{file_path:'a.txt'},exec);await p.execute('write',{file_path:'a.txt',content:'resume'},exec);const r=await p.controller.review();await p.controller.close();
 const q=await f.open();await assert.rejects(q.execute('read',{file_path:'a.txt'},exec),code('SEP_MAC_RESTART_REVIEW_REQUIRED'));
 await q.controller.resume({planHash:r.planHash});assert.equal((await q.execute('read',{file_path:'a.txt'},exec)).text,'resume');await q.controller.discard(r.planHash);assert.equal((await q.execute('read',{file_path:'a.txt'},exec)).text,'original');
});
test('restore creates another reviewable plan instead of rewriting current immediately',async()=>{
 const f=await fixture(),p=await f.open(),exec=f.caller();await p.execute('read',{file_path:'a.txt'},exec);await p.execute('write',{file_path:'a.txt',content:'second'},exec);const r=await p.controller.review();await p.controller.commit({planHash:r.planHash});
 await p.controller.restore(1);assert.equal(await readFile(join((await f.project.current()).path,'a.txt'),'utf8'),'second');const restore=await p.controller.review();await p.controller.commit({planHash:restore.planHash});assert.equal((await p.execute('read',{file_path:'a.txt'},exec)).text,'original');
});
test('pre-cancelled request leaves no candidate or observation usable for a write',async()=>{
 const f=await fixture(),p=await f.open(),exec=f.caller();const abort=new AbortController();abort.abort();exec.signal=abort.signal;
 await assert.rejects(p.execute('read',{file_path:'a.txt'},exec),code('SEP_MAC_CANCELLED'));exec.signal=new AbortController().signal;
 await assert.rejects(p.execute('write',{file_path:'a.txt',content:'bad'},exec),code('FS_NOT_OBSERVED'));assert.equal((await p.controller.plans()).length,0);
});
test('close blocks new work and retains lease until a trusted view callback drains',async()=>{
 const f=await fixture(),p=await f.open();let release,started;const began=new Promise(r=>{started=r;}),hold=new Promise(r=>{release=r;});
 const active=p.controller.withView(async view=>{assert.equal(view.entries.find(x=>x.path==='a.txt').sha256,sha('original'));started();await hold;});await began;
 const closing=p.controller.close();await assert.rejects(p.execute('read',{file_path:'a.txt'},f.caller()),code('SEP_MAC_PROFILE_CLOSED'));
 const first=await closing;assert.equal(first.status,'blocked');assert.equal(first.resourcesConfirmedReleased,false);
 const otherIo=createProjectTree({helperPath,helperSha256,lockPath:join(f.root,'.native.lock')});await assert.rejects(openTrustedProject({root:f.root,source:f.source,io:otherIo}),code('SEP_PROJECT_LOCKED'));
 release();await active;assert.equal((await p.controller.whenClosed()).status,'pass');assert.equal((await p.controller.close()).resourcesConfirmedReleased,true);
});
test('underlying admission closure is reported before any later model request',async()=>{
 const f=await fixture(),p=await f.open();await f.project.close();
 assert.equal(p.controller.status().admissionOpen,false);assert.equal(p.controller.status().phase,'blocked');
 await assert.rejects(p.execute('read',{file_path:'a.txt'},f.caller()),code('SEP_MAC_PROFILE_CLOSED'));
});
test('an inner deadline is not permanent cleanup failure after the actual invocation drains',async()=>{
 const f=await fixture();let started,release;const began=new Promise(r=>{started=r;}),hold=new Promise(r=>{release=r;});
 // Only the completion boundary is delayed; core.current actually verifies
 // the SQLite state and native snapshot before holding its accepted call.
 const p=await f.open({projectDeadlineMs:20,closeDeadlineMs:500,wrapCore:core=>({...core,async current(){const result=await core.current();started();await hold;return result;}})});
 const active=f.project.current();await began;const first=await p.controller.close();assert.equal(first.status,'blocked');assert.equal(first.resourcesConfirmedReleased,false);
 release();await active;let timer;const final=await Promise.race([p.controller.whenClosed(),new Promise(r=>{timer=setTimeout(()=>r({status:'not_closed'}),2000);})]);clearTimeout(timer);
 assert.equal(final.status,'pass');assert.equal((await p.controller.close()).resourcesConfirmedReleased,true);
});
