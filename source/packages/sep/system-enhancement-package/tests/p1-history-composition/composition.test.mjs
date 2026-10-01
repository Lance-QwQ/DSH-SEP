import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {load,modules,plugin,groupPlugin,evidence,sourceBinding} from './host.mjs';
const {LlmAdapter,createUserMessage}=await load('dsh-llm'),{SessionId,Session}=await load('dsh-session');
const task={tasks:[{label:'fixed-child',prompt:'Reply SYNTHETIC_CHILD.'}]};
const goodPrework=JSON.stringify({ready:"Hello, I'm ready!",california:['Gamma','Alpha'],californiaTotal:500000,southern:['Beta','Delta','Gamma'],constraints:['Windows','read-only']});
async function setup(t,name,{prework=false}={}){
 const dir=join(evidence,name),workspace=join(dir,'workspace');await mkdir(workspace,{recursive:true});
 const {Context}=await load('cordis'),ctx=new Context();let agent,entered;const preworkEntered=new Promise(r=>entered=r);
 const events=[],errors=[],requests=[],children=[];let preworkCount=0,cancelFirst=prework,action=null,emitted=false;
 class Replay extends LlmAdapter{
  async resolveModel(provider,id){return {provider,id,name:'Synthetic history regression'};}
  async *stream(options){
   requests.push({purpose:options.purpose,sessionId:options.sessionId,tools:options.tools?.map(t=>({name:t.name,parameters:t.parameters}))});
   let block={type:'text',text:'SYNTHETIC_DONE'};
   if(options.purpose==='sep-prework'){
    preworkCount++;
    if(cancelFirst){cancelFirst=false;entered();await new Promise((resolve,reject)=>{if(options.signal.aborted)return reject(options.signal.reason);options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true});});}
    block={type:'text',text:goodPrework};
   }else if(options.sessionId===agent?.id&&!emitted){
    emitted=true;const text=action;
    let tool,args={};if(text==='EXPLICIT_REVIEW')tool='suite_review';if(text==='TASK_PAGE'){tool='suite_tasks';args={offset:0,limit:1};const spec=options.tools.find(t=>t.name===tool);assert.equal(spec.parameters.type,'object');assert.ok(spec.parameters.properties.offset&&spec.parameters.properties.limit&&spec.parameters.properties.id);}
    if(text==='DELEGATE_FIXED'){tool='suite_delegate';args=task;}
    if(tool)block={type:'tool-call',id:'call-'+requests.length,name:tool,arguments:JSON.stringify(args)};
   }
   yield {type:'block-start',index:0,blockType:block.type};if(block.type==='text')yield {type:'text-delta',index:0,text:block.text};yield {type:'block-end',index:0,block};
   yield {type:'usage',usage:{inputTokens:1,cacheReadTokens:0,cacheWriteTokens:0,outputTokens:1}};
   yield {type:'finish',reason:{kind:block.type==='tool-call'?'tool-calls':'stop'}};
  }
 }
 const map=new Map(modules);map.set('sep-under-test',plugin);map.set('sep-group',groupPlugin);map.set('synthetic-model',{name:'synthetic-model',inject:['llm'],apply(c){c.llm.registerAdapter(['deepseek-official'],new Replay());}});
 const names=['dsh-llm','dsh-session','dsh-session-projection','dsh-system-prompt','dsh-tools','dsh-agent','dsh-agent-loop','dsh-fs-local','dsh-fs-observation-policy','dsh-tool-fs','dsh-attachment-local','dsh-storage','dsh-storage-json','dsh-storage-domain','dsh-subagent','dsh-subagent-spawn-in-process','dsh-user-approval','dsh-session-persistence-jsonl','synthetic-model','sep-under-test',...(prework?['sep-group']:[])];
 const config={'dsh-tools':{mode:'native'},'dsh-agent-loop':{agents:[]},'dsh-fs-local':{cwd:workspace},'dsh-attachment-local':{dshHome:join(dir,'home')},'dsh-storage-json':{root:join(dir,'storage')},'dsh-storage-domain':{backend:'json'},'dsh-session-persistence-jsonl':{root:join(dir,'sessions'),compression:'none'},'sep-under-test':{enabled:true,lockDirectory:join(dir,'locks'),projects:[{root:workspace,sources:['.']}],modules:{rag:false,memory:false,media:false},p1:{enabled:true,prework,model:'deepseek-flash',maxTokens:128,budgetPath:join(dir,'budget.json'),limitCny:100,taskLimitCny:5,profileLimits:{maxInputBytes:1048576,maxOutputTokens:128}}},'sep-group':{enabled:true,projects:[{id:'synthetic-project',root:workspace}]}};
 await writeFile(join(dir,'cordis.yml'),JSON.stringify(names.map(name=>({name,...config[name]?{config:config[name]}:{}}))));
 const loader=await load('cordis-plugin-loader'),include=await load('cordis-plugin-include');ctx.baseUrl=pathToFileURL(dir).href+'/';await ctx.plugin(loader.default);ctx.loader.builtins.include=include.default;ctx.loader.internal={version:'v2',async import(name){assert.ok(map.has(name));return map.get(name);}};await ctx.loader.create({name:'cordis:include',config:{path:pathToFileURL(join(dir,'cordis.yml')).href}});await ctx.loader.await();assert.ok(ctx.get('suiteEnhancements'));if(prework)assert.equal(ctx.get('sepPluginGroup')?.preworkProtocol,1);
 ctx.on('session/event',(session,event)=>events.push({sessionId:session.id,event}));ctx.on('agent/error',x=>errors.push({code:x.error?.code,message:x.error?.message}));ctx.on('subagent/start',x=>children.push({id:x.id,parentId:x.parentId}));
 agent=await ctx.agentLoop.create(SessionId(name),{provider:'deepseek-official',model:'deepseek-flash',maxTokens:128},{cwd:workspace});
 t.after(async()=>{await ctx.fiber.dispose();await writeFile(join(dir,'observed.json'),JSON.stringify({sourceBinding,requests,events,errors,children,preworkCount},null,2)+'\n');const reader=new Context();try{const backend=await load('dsh-session-persistence-jsonl');await reader.plugin(backend.default,{root:join(dir,'sessions'),compression:'none'});const h=await reader.sessionPersistence.open(agent.id,'read');try{const durable=await h.read();assert.deepEqual(durable.events,events.filter(x=>x.sessionId===agent.id).map(x=>x.event));assert.doesNotThrow(()=>Session.create(agent.id,durable.events,durable.header));}finally{await h.close();}}finally{await reader.fiber.dispose();}});
 const rootEvents=()=>events.filter(x=>x.sessionId===agent.id).map(x=>x.event);
 const results=()=>rootEvents().filter(e=>e.type==='tool/result').map(e=>({isError:e.data.message.isError,value:e.data.message.isError?null:JSON.parse(e.data.message.content.filter(b=>b.type==='text').map(b=>b.text).join(''))}));
 async function send(text){action=text;emitted=false;agent.followup(createUserMessage({source:{kind:'user'},content:[{type:'text',text}]}));await agent.whenIdle();return rootEvents().findLast(e=>e.type==='turn/end');}
 async function workflow(){const units=[];async function scan(p){for(const e of await readdir(p,{withFileTypes:true})){const f=join(p,e.name);if(e.isDirectory())await scan(f);else if(e.name.endsWith('.json')){const v=JSON.parse(await readFile(f,'utf8'));units.push(v);}}}await scan(join(dir,'storage'));const text=JSON.stringify(units);return {units,text};}
 return {agent,ctx,dir,send,results,rootEvents,workflow,preworkEntered,children,errors,preworkCount:()=>preworkCount};
}
test('real Loader and AgentLoop complete 205 turns, persist explicit review, accept native tasks pagination schema',{timeout:180000},async t=>{
 const r=await setup(t,'history-205');for(let i=0;i<205;i++)assert.equal((await r.send('ordinary-'+i)).data.reason.kind,'completed');
 assert.equal((await r.send('EXPLICIT_REVIEW')).data.reason.kind,'completed');const review=r.results().at(-1);assert.equal(review.isError,false);assert.equal(review.value.status,'not_run');
 assert.equal((await r.send('TASK_PAGE')).data.reason.kind,'completed');const page=r.results().at(-1);assert.equal(page.isError,false);assert.deepEqual(page.value,{runs:[],offset:0,total:0,nextOffset:null});
 const state=await r.workflow();assert.ok(state.text.includes(review.value.id));assert.equal((state.text.match(/standardSha256/g)??[]).length,1,'automatic empty standards must not append permanent not_run rows');assert.equal(r.rootEvents().filter(e=>e.type==='turn/end').length,207);assert.equal(r.errors.length,0);
});
test('real Agent cancellation during SEP group prework allows same binding to reassess and start a native child',{timeout:60000},async t=>{
 const r=await setup(t,'prework-cancel',{prework:true}),first=r.send('DELEGATE_FIXED');await Promise.race([r.preworkEntered,first.then(end=>{throw Error('turn ended before prework: '+JSON.stringify(end))})]);r.agent.cancel({kind:'user'});assert.notEqual((await first).data.reason.kind,'completed');assert.equal(r.preworkCount(),1);assert.equal(r.children.length,0);
 const next=await r.send('DELEGATE_FIXED');assert.equal(next.data.reason.kind,'completed',JSON.stringify(next));assert.equal(r.preworkCount(),4,'cancelled sample must not become cached blocked assessment');assert.equal(r.children.length,1);const result=r.results().findLast(x=>x.value?.runs);assert.equal(result.isError,false);assert.equal(result.value.publicationPersisted,true);assert.equal(result.value.runs[0].status,'completed');assert.equal(result.value.runs[0].prework.status,'pass');assert.equal(result.value.runs[0].prework.samples.length,3);
});
