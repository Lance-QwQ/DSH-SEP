import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {load,modules,recovery,recoveryPlugin,suite,plugin,evidence,sourceBinding} from './host.mjs';
const {LlmAdapter,createUserMessage}=await load('dsh-llm'),{SessionId,Session}=await load('dsh-session');
const blocks=block=>[{type:'block-start',index:0,blockType:block.type},{type:'block-end',index:0,block},{type:'finish',reason:{kind:block.type==='tool-call'?'tool-calls':'stop'}}];
const toolValue=options=>{const message=options.messages.findLast(message=>message.role==='tool');if(!message)return null;try{return JSON.parse(message.content.filter(block=>block.type==='text').map(block=>block.text).join(''));}catch{return null;}};

async function setup(t,name,{approve=true,failCheck=false}={}){
 const dir=join(evidence,name),workspace=join(dir,'workspace');await mkdir(workspace,{recursive:true});await mkdir(join(dir,'file-recovery'));await writeFile(join(workspace,'example.txt'),'before\n');await writeFile(join(workspace,'untouched.txt'),'KEEP_THIS_FILE\n');
 const {Context}=await load('cordis'),ctx=new Context(),events=[],requests=[],errors=[],questions=[];let service,agent,firstTurn=true;
 t.after(async()=>{
  try{await ctx.fiber.dispose();}finally{await service?.close();}
  await writeFile(join(dir,'observed.json'),JSON.stringify({sourceBinding,requests,events,errors,questions,agentStatus:agent?.status},null,2)+'\n');
  if(agent){const reader=new Context();try{const backend=await load('dsh-session-persistence-jsonl');await reader.plugin(backend.default,{root:join(dir,'sessions'),compression:'none'});const handle=await reader.sessionPersistence.open(agent.id,'read');try{const durable=await handle.read();assert.deepEqual(durable.events,events);assert.doesNotThrow(()=>Session.create(agent.id,durable.events,durable.header));await writeFile(join(dir,'durable-session.json'),JSON.stringify(durable,null,2)+'\n');}finally{await handle.close();}}finally{await reader.fiber.dispose();}}
 });
 service=await recovery.openService({controlRoot:join(dir,'recovery-control')});assert.ok(service.controller,'The real recovery service must own its journal');const project=await service.controller.addProject({root:workspace});
 class Replay extends LlmAdapter{
  async resolveModel(provider,id){return {provider,id,name:'Recorded SEP workflow'};}
  async *stream(options){
   requests.push(structuredClone(options));const step=requests.length;let block;
   if(!firstTurn){block={type:'text',text:'A new ordinary turn can finish after the earlier tool failure.'};}
   else{
    const prior=toolValue(options);let args;
    if(step===1)args={action:'prepare',path:'example.txt',format:'text',checks:[{kind:'contains',value:failCheck?'MISSING_CONTENT':'after'}]};
    else if(step===2)args={action:'stage',id:prior.id,content:'after\n'};
    else if(step===3)args={action:'verify',id:prior.id};
    else if(step===4)args={action:'review',id:prior.id};
    else if(step===5)args={action:'publish',id:prior.id,planHash:prior.planHash??'0'.repeat(64)};
    if(args)block={type:'tool-call',id:'recorded-'+step,name:'suite_change',arguments:JSON.stringify(args)};
    else{assert.equal(step,6,'Closeout must not request a seventh model step');block={type:'text',text:'MODEL_SELF_REPORT_ALL_TESTS_PASSED'};}
   }
   yield*blocks(block);
  }
 }
 const map=new Map(modules);map.set('sep-suite',suite);map.set('sep-under-test',plugin);map.set('host-recovery',recoveryPlugin);
 map.set('recorded-boundaries',{name:'recorded-boundaries',inject:['llm','userQuestions'],apply(c){
  c.llm.registerAdapter(['recorded'],new Replay());
  c.on('user-questions/request',request=>{assert.equal(request.agent,agent);assert.equal(request.questions.length,1);const question=request.questions[0];assert.equal(question.intent.kind,'plan-review');assert.ok(question.detail.includes('candidateSha256'));assert.ok(question.detail.includes('not_run'));questions.push({question:structuredClone(question),answer:approve?'approve':'reject'});return {answers:[{id:question.id,selected:[approve?question.intent.approve:'取消']}]};});
 }});
 const configs={
  'dsh-tools':{mode:'native'},'dsh-agent-loop':{agents:[]},
  'dsh-fs-local':{cwd:workspace,requireRecovery:true,recovery:{root:join(dir,'file-recovery'),maxFileBytes:1048576,maxTotalBytes:16777216,maxEntries:128,retentionMs:86400000}},
  'dsh-sandbox-policy':{mode:'workspace-write',workspaceRoot:workspace},
  'dsh-storage-json':{root:join(dir,'storage')},'dsh-storage-domain':{backend:'json'},'dsh-session-persistence-jsonl':{root:join(dir,'sessions'),compression:'none'},
  'host-recovery':service.hostConnection,
  'sep-suite':{enabled:true,lockDirectory:join(dir,'locks'),projects:[{root:workspace,sources:['.'],recoveryProjectId:project.id}],recovery:{enabled:true},modules:{rag:false,memory:false,media:false}},
  'sep-under-test':{enabled:true,projects:[{root:workspace,sources:['.'],recoveryProjectId:project.id}],recoveryEnabled:true},
 };
 const names=['dsh-llm','dsh-session','dsh-session-projection','dsh-system-prompt','dsh-tools','dsh-agent','dsh-agent-loop','dsh-fs-local','dsh-sandbox-policy','dsh-user-questions','dsh-storage','dsh-storage-json','dsh-storage-domain','dsh-session-persistence-jsonl','host-recovery','sep-suite','sep-under-test','recorded-boundaries'];
 await writeFile(join(dir,'cordis.yml'),JSON.stringify(names.map(name=>({name,...configs[name]?{config:configs[name]}:{}})),null,2)+'\n');
 const loader=await load('cordis-plugin-loader'),include=await load('cordis-plugin-include');ctx.baseUrl=pathToFileURL(dir).href+'/';await ctx.plugin(loader.default);ctx.loader.builtins.include=include.default;ctx.loader.internal={version:'v2',async import(name){assert.ok(map.has(name),'missing real plugin '+name);return map.get(name);}};await ctx.loader.create({name:'cordis:include',config:{path:pathToFileURL(join(dir,'cordis.yml')).href}});await ctx.loader.await();
 assert.ok(ctx.get('suiteSafeChanges')?.enabled,'The Loader must activate the shipping safe-change plugin');assert.equal(ctx.fs.recoveryStatus,process.platform==='win32'?'ready':'unsupported');
 ctx.on('session/event',(session,event)=>{if(session===agent?.session)events.push(event);});ctx.on('agent/error',payload=>errors.push({code:payload.error?.code,message:payload.error?.message}));
 agent=await ctx.agentLoop.create(SessionId(name),{provider:'recorded',model:'recorded'},{cwd:workspace});
 async function send(text){agent.followup(createUserMessage({content:[{type:'text',text}],source:{kind:'user'}}));await agent.whenIdle();const end=agent.session.snapshotEvents().findLast(event=>event.type==='turn/end');assert.equal(end.data.reason.kind,'completed',JSON.stringify(end));}
 const notice=()=>events.findLast(event=>event.type==='user/message'&&event.data.source?.kind==='plugin:sep-safe-change');
 const values=()=>events.filter(event=>event.type==='tool/result').map(event=>{const message=event.data.message;let value;try{value=JSON.parse(message.content.filter(block=>block.type==='text').map(block=>block.text).join(''));}catch{}return {isError:message.isError,value,message};});
 return {dir,workspace,ctx,agent,events,requests,errors,questions,send,notice,values,nextTurn(){firstTurn=false;}};
}

test(process.platform==='win32'?'real Loader publishes after trusted approval and retains native backup without another model call':'real Loader refuses approved publication when native recovery is unsupported without modifying the file',{timeout:60000},async t=>{
 const r=await setup(t,'approve');await r.send('Change example.txt from before to after, verify the declared check, review and publish after my button answer.');
 if(process.platform!=='win32'){assert.equal(await readFile(join(r.workspace,'example.txt'),'utf8'),'before\n');assert.equal(await readFile(join(r.workspace,'untouched.txt'),'utf8'),'KEEP_THIS_FILE\n');assert.equal(r.questions.length,1);assert.equal(r.requests.length,6);assert.equal(r.values().at(-1).isError,true);const summary=JSON.parse(r.notice().data.content[0].text).safeChangeCloseout;assert.ok(summary.history.some(item=>item.code==='SC_RECOVERY_REQUIRED'));assert.equal(summary.acceptance,'not_established');return;}
 assert.equal(await readFile(join(r.workspace,'example.txt'),'utf8'),'after\n');assert.equal(await readFile(join(r.workspace,'untouched.txt'),'utf8'),'KEEP_THIS_FILE\n');assert.equal(r.questions.length,1);assert.equal(r.requests.length,6);assert.equal(r.events.filter(event=>event.type==='user/message'&&event.data.source.kind==='user').length,1,'No second typed confirmation is required');
 const results=r.values();assert.equal(results.filter(result=>result.isError).length,0,JSON.stringify(results));assert.equal(results.at(-1).value.status,'committed');assert.ok(results.at(-1).value.mutationId);
 assert.equal(results[2].value.validation.textChecks,'pass');assert.equal(results[2].value.validation.languageSyntax,'not_run');assert.equal(results[2].value.validation.runtimeTests,'not_run');
 assert.equal(results.at(-1).value.closeout.acceptance,'not_established');assert.deepEqual(results.at(-1).value.closeout.counts,{pass:1,fail:0,skipped:0,not_covered:2});
 const notice=r.notice();assert.ok(notice);assert.match(notice.data.source.summary,/通过 1.*失败 0.*未覆盖 2/);assert.equal(JSON.parse(notice.data.content[0].text).safeChangeCloseout.candidates[0].publication,'committed');
 assert.ok(r.requests.at(-1).messages.some(message=>message.role==='tool'&&JSON.stringify(message.content).includes('not_established')),'The normal post-tool model step sees structured closeout');
 const mutations=await r.ctx.fs.listMutations({});assert.ok(mutations.some(item=>item.mutationId===results.at(-1).value.mutationId),'The real native recovery provider retains the committed mutation');
});

test('real question rejection never writes the file and remains visible in the persisted closeout',{timeout:60000},async t=>{
 const r=await setup(t,'reject',{approve:false});await r.send('Prepare and review the file, then request my publication decision.');assert.equal(await readFile(join(r.workspace,'example.txt'),'utf8'),'before\n');assert.equal(r.questions.length,1);assert.equal(r.requests.length,6);assert.ok(r.values().at(-1).isError);const summary=JSON.parse(r.notice().data.content[0].text).safeChangeCloseout;assert.ok(summary.history.some(item=>item.code==='SC_CONFIRMATION_REJECTED'));assert.equal(summary.acceptance,'not_established');
});

test('failed content evidence cannot publish, completed is not acceptance, and the next ordinary turn still runs',{timeout:60000},async t=>{
 const r=await setup(t,'check-failure',{failCheck:true});await r.send('Exercise the declared failing check, then finish.');assert.equal(await readFile(join(r.workspace,'example.txt'),'utf8'),'before\n');assert.equal(r.questions.length,0);assert.equal(r.requests.length,6);const summary=JSON.parse(r.notice().data.content[0].text).safeChangeCloseout;assert.equal(summary.counts.fail,1);assert.equal(summary.acceptance,'not_established');assert.ok(summary.history.some(item=>item.action==='verify'&&item.status==='fail'));assert.ok(r.values().at(-1).isError);r.nextTurn();await r.send('Answer this separate ordinary task.');assert.equal(r.requests.length,7);assert.equal(r.events.filter(event=>event.type==='user/message'&&event.data.source?.kind==='plugin:sep-safe-change').length,1);assert.equal(r.events.filter(event=>event.type==='turn/end').length,2);
});
