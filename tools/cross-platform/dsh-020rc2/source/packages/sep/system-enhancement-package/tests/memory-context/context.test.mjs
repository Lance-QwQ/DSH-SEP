import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {load as loadHost} from './host.mjs';
import {pathToFileURL} from 'node:url';
import {Scope} from '../../src/scope.js';

let installMemoryContext;
try { ({installMemoryContext}=await import(process.env.SEP_MEMORY_CONTEXT_MODULE??'../../src/memory-context.js')); }
catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;}
const {LlmAdapter,createUserMessage}=await loadHost('dsh-llm');
const user=text=>createUserMessage({source:{kind:'user'},content:[{type:'text',text}]});
const memory=(text,form='snapshot')=>createUserMessage({source:{kind:'plugin:'+(process.env.SEP_MEMORY_TEST_PRODUCER??'dsh-enhancement-suite/memory'),form,...(form==='snapshot'?{sections:[{name:'memory',text}]}:{summary:'Synthetic memory update'})},content:[{type:'text',text}]});
const envelope=messages=>JSON.stringify(messages);

async function setup(t,{responses,persistence=false,install=true}={}){
  await mkdir('.test-home',{recursive:true});
  const root=await mkdtemp(resolve('.test-home/memory-context-'));
  const a=join(root,'project'),outside=join(root,'outside');await mkdir(a);await mkdir(outside);
  const {Context}=await loadHost('cordis'),ctx=new Context(),modules=new Map(),rows=[];t.after(()=>ctx.fiber.dispose());
  for(const name of ['dsh-system-prompt','dsh-tools','dsh-fs-local','dsh-storage','dsh-storage-json','dsh-storage-domain','dsh-llm','dsh-session','dsh-session-projection','dsh-agent','dsh-agent-loop','dsh-token-meter','dsh-compaction-basic',...(persistence?['dsh-session-persistence-jsonl']:[])]){
    const p=await loadHost(name);modules.set(name,p.default??p);rows.push({name,config:name==='dsh-agent-loop'?{agents:[]}:name==='dsh-compaction-basic'?{auto:false,maxTokens:128}:name==='dsh-storage-json'?{root:join(root,'store')}:name==='dsh-storage-domain'?{backend:'json'}:name==='dsh-session-persistence-jsonl'?{root:join(root,'sessions'),compression:'none'}:{}});
  }
  const loader=await loadHost('cordis-plugin-loader'),include=await loadHost('cordis-plugin-include');ctx.baseUrl=pathToFileURL(root).href+'/';await ctx.plugin(loader.default);ctx.loader.builtins.include=include.default;
  ctx.loader.internal={version:'v2',async import(name){assert.ok(modules.has(name));return modules.get(name);}};
  await writeFile(join(root,'cordis.yml'),JSON.stringify(rows));await ctx.loader.create({name:'cordis:include',config:{path:pathToFileURL(join(root,'cordis.yml')).href}});await ctx.loader.await();
  const requests=[];
  class Offline extends LlmAdapter{
    async *stream(options){
      requests.push(options);
      const block=await responses?.(options,requests.length,ctx)??{type:'text',text:options.purpose==='compaction'?'Brief synthetic checkpoint.':'Done.'};
      yield {type:'block-start',index:0,blockType:block.type};
      if(block.type==='text')yield {type:'text-delta',index:0,text:block.text};
      else yield {type:'tool-call-delta',index:0,id:block.id,name:block.name,argumentsDelta:block.arguments};
      yield {type:'block-end',index:0,block};
      yield {type:'finish',reason:{kind:block.type==='tool-call'?'tool-calls':'stop'}};
    }
  }
  ctx.llm.registerAdapter(['offline'],new Offline());
  const scope=new Scope(ctx.fs,[{root:a,sources:['.']}]);await scope.init();
  let manager,fiber;
  async function mount(){
    assert.equal(typeof installMemoryContext,'function','Four-layer memory must install durable context retirement');
    modules.set('test-memory-context',{name:'test-memory-context',inject:['llm','agents','sessions'],async apply(child){manager=await installMemoryContext(child,{scope,track:work=>work,signal:new AbortController().signal});}});fiber=await ctx.loader.create({name:'test-memory-context'});await ctx.loader.await();
  }
  if(install)await mount();
  const handles=[];t.after(async()=>{for(const handle of handles)await handle.dispose();});
  const agentOptions={provider:'offline',model:'offline',maxTokens:128};
  const agent=async(cwd=a)=>{const handle=await ctx.agents.create({sessionId:randomUUID(),meta:{cwd},agentOptions});handles.push(handle);return handle;};
  const resume=async id=>{const handle=await ctx.agents.resume({resumeSessionId:id,agentOptions});handles.push(handle);return handle;};
  const finish=async(who,text='Continue the synthetic task.')=>{who.followup(user(text));await who.whenIdle();assert.equal(who.session.snapshotEvents().findLast(event=>event.type==='turn/end').data.reason.kind,'completed');};
  const tool=(name,value)=>ctx.tools.register({name,description:'Synthetic read-only archive.',parameters:{type:'object',properties:{}},output:{schema:{type:'object'},render:(_args,data)=>[{type:'text',text:JSON.stringify(data)}]},execute:()=>value});
  return {ctx,root,a,outside,requests,agent,resume,finish,mount,tool,get manager(){return manager;},get fiber(){return fiber;}};
}

test('memory context retires previous snapshots and notices through durable surface replacements before every model request',async t=>{
  const s=await setup(t);const {agent}=await s.agent();
  const stale=agent.session.append('user/message',memory('OBSOLETE_L3_VALUE'),{surfaceOp:'append'});
  agent.session.append('user/message',memory('OBSOLETE_NOTICE','notice'),{surfaceOp:'append'});
  agent.session.append('user/message',user('USER_ORIGINAL_MUST_STAY'),{surfaceOp:'append'});
  agent.session.append('user/message',createUserMessage({source:{kind:'plugin',plugin:'dsh-compaction-basic'},content:[{type:'text',text:'PRIOR_CHECKPOINT_MUST_STAY'}]}),{surfaceOp:'append'});
  s.ctx.on('agent/pre-step',async(_payload,next)=>{const decision=await next();return {...decision,messages:[...decision.messages,memory('CURRENT_L3_VALUE')]};});
  await s.finish(agent);
  assert.doesNotMatch(envelope(s.requests[0].messages),/OBSOLETE_L3_VALUE|OBSOLETE_NOTICE/);
  assert.match(envelope(s.requests[0].messages),/CURRENT_L3_VALUE/);
  assert.match(envelope(s.requests[0].messages),/USER_ORIGINAL_MUST_STAY/);
  assert.match(envelope(s.requests[0].messages),/PRIOR_CHECKPOINT_MUST_STAY/);
  assert.ok(agent.session.snapshotEvents().some(event=>event.surfaceOp?.op==='replace'&&event.sourceEventSeqs.includes(stale.seq)),'The removal must be reconstructible from the durable event log');
  assert.match(envelope(agent.session.snapshotEvents()),/OBSOLETE_L3_VALUE/,'Audit history remains available to the user');
  assert.doesNotMatch(envelope(agent.session.deriveMessages()),/CURRENT_L3_VALUE|OBSOLETE_L3_VALUE/,'Completed-turn snapshots no longer form background');
});

test('archive results remain usable in the authorized turn and leave later ordinary requests without breaking tool pairing',async t=>{
  const s=await setup(t,{responses:(_options,count)=>count===1?{type:'tool-call',id:'archive-call',name:'suite_memory_archive_get',arguments:'{}'}:undefined});
  s.tool('suite_memory_archive_get',{text:'COLD_ARCHIVE_PAYLOAD'});
  const {agent}=await s.agent();await s.finish(agent,'Read the requested archive.');
  assert.equal(s.requests.length,2);assert.match(envelope(s.requests[1].messages),/COLD_ARCHIVE_PAYLOAD/);
  const original=agent.session.snapshotEvents().find(event=>event.type==='tool/result'&&event.surfaceOp==='append');
  const replacement=agent.session.snapshotEvents().find(event=>event.type==='tool/result'&&event.surfaceOp?.op==='replace');
  assert.ok(replacement);assert.equal(replacement.data.message.source.callId,original.data.message.source.callId);
  assert.deepEqual(replacement.sourceEventSeqs,[original.seq]);
  await s.finish(agent,'Now do an unrelated task.');
  assert.doesNotMatch(envelope(s.requests.at(-1).messages),/COLD_ARCHIVE_PAYLOAD/);
  assert.match(envelope(agent.session.snapshotEvents()),/COLD_ARCHIVE_PAYLOAD/);
});

test('restored native sessions retire historical suite snapshots and archive results before a new request',async t=>{
  const s=await setup(t,{persistence:true,install:false,responses:(_options,count)=>count===1?{type:'tool-call',id:'legacy-call',name:'suite_memory_archive_search',arguments:'{}'}:undefined});
  s.tool('suite_memory_archive_search',{text:'LEGACY_ARCHIVE_PAYLOAD'});
  const first=await s.agent();await s.finish(first.agent);
  first.agent.session.append('user/message',memory('LEGACY_SNAPSHOT_PAYLOAD'),{surfaceOp:'append'});
  await s.ctx.sessions.flush(first.agent.session);const id=first.agent.id;await first.dispose();
  await s.mount();const restored=await s.resume(id);await s.finish(restored.agent,'A normal new task.');
  assert.doesNotMatch(envelope(s.requests.at(-1).messages),/LEGACY_ARCHIVE_PAYLOAD|LEGACY_SNAPSHOT_PAYLOAD/);
  await s.ctx.sessions.flush(restored.agent.session);await restored.dispose();
  const again=await s.resume(id);assert.doesNotMatch(envelope(again.agent.session.deriveMessages()),/LEGACY_ARCHIVE_PAYLOAD|LEGACY_SNAPSHOT_PAYLOAD/);
});

test('current archive results cannot be baked into a native compaction checkpoint; retired results no longer block compaction',async t=>{
  const s=await setup(t,{responses:(_options,count)=>count===1?{type:'tool-call',id:'compact-archive-call',name:'suite_memory_archive_get',arguments:'{}'}:undefined});
  s.tool('suite_memory_archive_get',{text:'DO_NOT_COMPACT_L4'});const {agent}=await s.agent();let blocked;
  s.ctx.on('agent/pre-step',async({agent,step},next)=>{
    if(step===2){const nodes=agent.session.surface.nodes;try{await s.ctx.compaction.compactRegion(nodes[0],nodes.at(-1),agent);}catch(error){blocked=error;}}
    return next();
  });
  await s.finish(agent,`Read the requested archive. ${'Synthetic historical task details. '.repeat(400)}`);
  assert.match(String(blocked),/MEMORY_CONTEXT_COMPACTION_BLOCKED/);
  assert.equal(s.requests.filter(request=>request.purpose==='compaction').length,0,'Blocking happens before any provider call');
  assert.match(envelope(s.requests.at(-1).messages),/DO_NOT_COMPACT_L4/,'The ordinary in-turn request still receives the authorized result');
  await s.finish(agent,'Continue without archive access.');
  await s.ctx.compaction.compactNow(agent,new AbortController().signal);
  const compact=s.requests.find(request=>request.purpose==='compaction');assert.ok(compact);
  assert.doesNotMatch(envelope(compact.messages),/DO_NOT_COMPACT_L4/);
});

test('context retirement honors project authorization and leaves other plugin/user content unchanged',async t=>{
  const s=await setup(t);const {agent}=await s.agent(s.outside);
  agent.session.append('user/message',memory('OUTSIDE_SCOPE_CONTENT'),{surfaceOp:'append'});
  await s.finish(agent);
  assert.match(envelope(s.requests[0].messages),/OUTSIDE_SCOPE_CONTENT/);
  assert.equal(agent.session.snapshotEvents().filter(event=>event.surfaceOp?.op==='replace').length,0);
});

test('native compaction sees the persisted replacement surface and a fresh snapshot is only added to the next ordinary request',async t=>{
  const s=await setup(t);const {agent}=await s.agent();
  const stale=agent.session.append('user/message',memory('OLD_SNAPSHOT_MUST_NOT_ENTER_SUMMARY'),{surfaceOp:'append'});
  agent.session.append('user/message',user('Synthetic ordinary task history. '.repeat(500)),{surfaceOp:'append'});
  s.ctx.on('agent/pre-step',async({agent},next)=>{
    const nodes=agent.session.surface.nodes;await s.ctx.compaction.compactRegion(nodes[0],nodes.at(-1),agent);
    const decision=await next();return {...decision,messages:[...decision.messages,memory('FRESH_SNAPSHOT_AFTER_SUMMARY')]};
  });
  await s.finish(agent);
  assert.equal(s.requests[0].purpose,'compaction');
  assert.doesNotMatch(envelope(s.requests[0].messages),/OLD_SNAPSHOT_MUST_NOT_ENTER_SUMMARY|FRESH_SNAPSHOT_AFTER_SUMMARY/);
  assert.match(envelope(s.requests[1].messages),/FRESH_SNAPSHOT_AFTER_SUMMARY/);
  const replacement=agent.session.snapshotEvents().find(event=>event.surfaceOp?.op==='replace'&&event.sourceEventSeqs.includes(stale.seq));
  assert.ok(replacement.seq<agent.session.snapshotEvents().find(event=>event.type==='compaction/start').seq);
});

test('cancelled turns retire archive bodies and unrelated read-only tool bodies remain available',async t=>{
  const s=await setup(t,{responses:async(options,count,ctx)=>{
    if(count===1)return {type:'tool-call',id:'cancel-archive-call',name:'suite_memory_archive_get',arguments:'{}'};
    if(count===2){ctx.agents.get(options.sessionId).cancel({kind:'user'});options.signal.throwIfAborted();}
  }});
  s.tool('suite_memory_archive_get',{text:'CANCELLED_ARCHIVE_BODY'});
  const {agent}=await s.agent();agent.followup(user('Read the archive.'));await agent.whenIdle();
  assert.equal(agent.session.snapshotEvents().findLast(event=>event.type==='turn/end').data.reason.kind,'aborted');
  assert.doesNotMatch(envelope(agent.session.deriveMessages()),/CANCELLED_ARCHIVE_BODY/);
  await s.finish(agent,'An ordinary new task.');assert.doesNotMatch(envelope(s.requests.at(-1).messages),/CANCELLED_ARCHIVE_BODY/);
  const s2=await setup(t,{responses:(_options,count)=>count===1?{type:'tool-call',id:'regular-call',name:'suite_search',arguments:'{}'}:undefined});
  s2.tool('suite_search',{text:'ORDINARY_KNOWLEDGE_RESULT'});const normal=await s2.agent();
  await s2.finish(normal.agent);await s2.finish(normal.agent);
  assert.match(envelope(s2.requests.at(-1).messages),/ORDINARY_KNOWLEDGE_RESULT/);
});
