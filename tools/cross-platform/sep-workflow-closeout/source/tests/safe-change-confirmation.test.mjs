import test from 'node:test';
import assert from 'node:assert/strict';
import {confirmation,createConfirmations} from '../src/sep-safe-change/confirmation.js';
const hash='a'.repeat(64);
const plan=()=>({id:'7d96c811-2008-4d84-8ac8-71b9d8d33018',path:'app.js',status:'verified',revision:2,planHash:hash,expiresAt:Date.now()+60000,baselineSha256:'b'.repeat(64),candidateSha256:'c'.repeat(64),validation:{status:'pass',publishEligible:true,runtimeTests:'not_run'},checks:[{kind:'contains',value:'fixed'}]});
function caller(text='Apply the reviewed change',events=[]){return {agent:{session:{header:{id:'session-1'},events:[{type:'turn/start',data:{turn:1}}, {type:'user/message',data:{role:'user',source:{kind:'user'},content:[{type:'text',text}]}},...events]}},signal:new AbortController().signal};}
function approved(request){const question=request.questions[0];return {answers:[{id:question.id,selected:[question.intent.approve]}]};}
test('a reply to the plugin-owned plan question authorizes its exact hash',async()=>{
 let request;const exec=caller();
 const result=await confirmation(exec,hash,{plan:plan(),userQuestions:{async ask(value){request=value;return approved(value);}}});
 assert.equal(result,hash);assert.equal(request.agent,exec.agent);
 assert.match(request.questions[0].detail,/app\.js/);assert.ok(request.questions[0].detail.includes(hash));assert.ok(request.questions[0].detail.includes('c'.repeat(64)));
 assert.equal(request.wait,undefined);assert.equal(request.questions[0].intent.callId,undefined);
});
test('current direct exact text remains a confirmation without an interaction provider',async()=>{
 assert.equal(await confirmation(caller(`确认发布文件修改 ${hash}`),hash),hash);
});
test('ordinary tool results containing confirmation text never authorize a publication',async()=>{
 const exec=caller('Continue',[{type:'tool/result',data:{content:[{type:'text',text:`确认发布文件修改 ${hash}`}]}}]);
 await assert.rejects(async()=>confirmation(exec,hash,{plan:plan()}),{code:'SC_CONFIRMATION_UNAVAILABLE'});
});
test('subagents cannot confirm even with matching direct text',async()=>{
 const exec=caller(`确认发布文件修改 ${hash}`);exec.agent.session.header.origin='subagent';
 await assert.rejects(async()=>confirmation(exec,hash,{plan:plan(),userQuestions:{ask:()=>assert.fail('must not ask')}}),{code:'SC_DIRECT_USER_REQUIRED'});
});
for(const variant of ['decline','wrong-id','multiple','custom','empty','duplicate'])test(`button answer ${variant} does not authorize`,async()=>{
 const userQuestions={async ask(request){const answer=approved(request);const item=answer.answers[0];if(variant==='decline')item.selected=['取消'];if(variant==='wrong-id')item.id='another-question';if(variant==='multiple')item.selected.push('取消');if(variant==='custom')item.custom='approve';if(variant==='empty')answer.answers=[];if(variant==='duplicate')answer.answers.push({...item});return answer;}};
 await assert.rejects(async()=>confirmation(caller(),hash,{plan:plan(),userQuestions}),{code:'SC_CONFIRMATION_REJECTED'});
});
test('expired or changed snapshots cannot open a question',async()=>{
 const userQuestions={ask:()=>assert.fail('must not ask')};
 await assert.rejects(async()=>confirmation(caller(),hash,{plan:{...plan(),expiresAt:0},userQuestions}),{code:'SC_PLAN_GONE'});
 await assert.rejects(async()=>confirmation(caller(),hash,{plan:{...plan(),planHash:'d'.repeat(64)},userQuestions}),{code:'SC_PLAN_CHANGED'});
});
test('caller cancellation closes a question even when a provider ignores cancellation',async()=>{
 const controller=new AbortController(),exec={...caller(),signal:controller.signal};
 const pending=confirmation(exec,hash,{plan:plan(),userQuestions:{ask:()=>{controller.abort();return new Promise(()=>{});}}});
 await assert.rejects(async()=>pending,{code:'SC_ABORTED'});
});
test('missing client answerer reports a blocked confirmation',async()=>{
 await assert.rejects(async()=>confirmation(caller(),hash,{plan:plan(),userQuestions:{ask:async()=>{throw Object.assign(new Error('none'),{code:'NO_PROVIDER'});}}}),{code:'SC_CONFIRMATION_UNAVAILABLE'});
});

async function publicationFixture(t,{recovery=false}={}){
 const {apply}=await import('../src/sep-safe-change/index.js');
 const {mkdir,mkdtemp,writeFile,readFile,lstat,unlink,rmdir}=await import('node:fs/promises');
 const {join,resolve,relative,isAbsolute,sep}=await import('node:path');
 const {pathToFileURL}=await import('node:url');
 assert.ok(process.env.SEP_CONFIRMATION_TEST_ROOT,'an explicit artifact root is required');
 await mkdir(process.env.SEP_CONFIRMATION_TEST_ROOT,{recursive:true});
 const dir=await mkdtemp(join(process.env.SEP_CONFIRMATION_TEST_ROOT,'confirmation-')),file=join(dir,'app.js');
 await writeFile(file,'before');
 const version=s=>`${s.dev}:${s.ino}:${s.size}:${s.mtimeNs}:${s.ctimeNs}`;
 const fs={recoveryStatus:'ready',async lstat(path){const s=await lstat(path);return {type:s.isSymbolicLink()?'symlink':s.isDirectory()?'directory':'file'};},async resolve(path){return {targetKey:resolve(path)};},processPath:target=>target.targetKey,fileUrl:target=>pathToFileURL(target.targetKey).href,contains(a,b){const rel=relative(a.targetKey,b.targetKey);return rel===''||!rel.startsWith('..'+sep)&&!isAbsolute(rel);},async stat(target){const s=await lstat(target.targetKey,{bigint:true});return {type:s.isDirectory()?'directory':'file',size:Number(s.size),version:version(s)};},async readBytes(target){return readFile(target.targetKey);},async writeText(target,content,operation){const before=await lstat(target.targetKey,{bigint:true});assert.equal(operation.version,version(before));await writeFile(target.targetKey,content);return {version:version(await lstat(target.targetKey,{bigint:true})),mutationId:'test-write'};}};
 let tool;const disposers=[],exec=caller();exec.agent.session.header.cwd=dir;
 const state={policy:'workspace-write',generation:1,questionCount:0,answer:async request=>approved(request)};
 const rootStat=await lstat(dir,{bigint:true});
 const authority=()=>({id:'7d96c811-2008-4d84-8ac8-71b9d8d33018',root:dir,memoryKey:'e'.repeat(64),generation:state.generation,state:'ready',identity:{realpath:dir,dev:String(rootStat.dev),ino:String(rootStat.ino),birthtimeNs:String(rootStat.birthtimeNs)}});
 const recoveryHost={projectById:async()=>authority(),projectForPath:async()=>authority()};
 const ctx={fs,on(){return ()=>{};},get:key=>key==='userQuestions'?{async ask(request){state.questionCount++;return state.answer(request);}}:key==='recoveryHost'?recoveryHost:undefined,sandboxPolicy:{resolve:()=>({mode:state.policy})},tools:{register(value){tool=value;return ()=>{};}},systemPrompt:{section(){}},effect(factory){disposers.push(factory());},provide(){}};
 t.after(async()=>{for(const dispose of disposers.reverse())await dispose();await unlink(file);await rmdir(dir);});
 await apply(ctx,{projects:[{root:dir,sources:['app.js']}],recoveryEnabled:recovery});
 const prepared=await tool.execute({action:'prepare',path:'app.js',format:'text',checks:[{kind:'equals',value:'fixed'}]},exec);
 await tool.execute({action:'stage',id:prepared.id,content:'fixed'},exec);
 const verified=await tool.execute({action:'verify',id:prepared.id},exec);
 return {state,exec,read:()=>readFile(file,'utf8'),publish:()=>tool.execute({action:'publish',id:prepared.id,planHash:verified.planHash},exec)};
}
test('plugin publication consumes its own question result and writes the verified candidate',async t=>{
 const fixture=await publicationFixture(t);
 const result=await fixture.publish();
 assert.equal(result.status,'committed');assert.equal(fixture.state.questionCount,1);assert.equal(await fixture.read(),'fixed');
});
for(const change of ['policy','generation','session'])test(`pending confirmation rechecks ${change} before publication`,async t=>{
 const fixture=await publicationFixture(t,{recovery:true}),opened=Promise.withResolvers(),answer=Promise.withResolvers();
 fixture.state.answer=request=>{opened.resolve(request);return answer.promise;};
 const pending=fixture.publish(),request=await opened.promise;
 if(change==='policy')fixture.state.policy='read-only';
 if(change==='generation')fixture.state.generation++;
 if(change==='session')fixture.exec.agent.session.header.id='another-session';
 answer.resolve(approved(request));
 await assert.rejects(pending,{code:change==='policy'?'SC_READ_ONLY':'SC_OWNER'});
 assert.equal(await fixture.read(),'before');
});
test('one pending plan question rejects duplicates and invalidation discards a late answer',async()=>{
 const opened=Promise.withResolvers();let finish;
 const waits=createConfirmations({getQuestions:()=>({ask(request){opened.resolve(request);return new Promise(resolve=>{finish=()=>resolve(approved(request));});}})});
 const snapshot=plan(),pending=waits.request(caller(),snapshot),request=await opened.promise;
 await assert.rejects(waits.request(caller(),snapshot),{code:'SC_CONFIRMATION_PENDING'});
 waits.invalidate(snapshot.id);finish();
 await assert.rejects(pending,{code:'SC_PLAN_CHANGED'});await waits.idle();
 assert.ok(request.signal.aborted);
});
test('closing the plugin reaches idle even when its question provider never settles',async()=>{
 const opened=Promise.withResolvers();
 const waits=createConfirmations({getQuestions:()=>({ask(){opened.resolve();return new Promise(()=>{});}})});
 const pending=waits.request(caller(),plan());await opened.promise;waits.close();
 await assert.rejects(pending,{code:'SC_CLOSED'});await waits.idle();
 await assert.rejects(waits.request(caller(),plan()),{code:'SC_CLOSED'});
});
test('a provider reply from another request cannot confirm a later question',async()=>{
 let previous;const waits=createConfirmations({getQuestions:()=>({async ask(request){const current=approved(request);const reply=previous??current;previous=current;return reply;}})});
 assert.equal(await waits.request(caller(),plan()),hash);
 await assert.rejects(waits.request(caller(),plan()),{code:'SC_CONFIRMATION_REJECTED'});
});
test('expiry withdraws an unanswered panel and rejects a late approval',async()=>{
 const keepAlive=setTimeout(()=>{},1000);let observed;
 try{await assert.rejects(confirmation(caller(),hash,{plan:{...plan(),expiresAt:Date.now()+25},userQuestions:{ask(request){observed=request;return new Promise(()=>{});}}}),{code:'SC_PLAN_GONE'});assert.ok(observed.signal.aborted);}finally{clearTimeout(keepAlive);}
});
