import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,unlink,rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {load,plugin} from './host.mjs';
const {LlmAdapter,createUserMessage}=await load('dsh-llm');
const {SessionId,Session}=await load('dsh-session');
const action={requestId:'recorded-action',windowHandle:'123456',target:{name:'Confirm'}};
const blocks=[
 [{type:'block-start',index:0,blockType:'tool-call'},{type:'block-end',index:0,block:{type:'tool-call',id:'click-recording',name:'suite_computer_click',arguments:JSON.stringify(action)}},{type:'finish',reason:{kind:'tool-calls'}}],
 [{type:'block-start',index:0,blockType:'text'},{type:'block-end',index:0,block:{type:'text',text:'RECORDED_CLICK_DONE'}},{type:'finish',reason:{kind:'stop'}}],
];
for(let round=1;round<=3;round++)test(`Loader and Agent recorded-session round ${round}: window text never enters the next model request`,{timeout:10000},async t=>{
 const dir=await mkdtemp(join(tmpdir(),'sep-click-composition-')),{Context}=await load('cordis'),ctx=new Context(),events=[],requests=[],calls=[];
 t.after(async()=>{await ctx.fiber.dispose();for(const f of ['cordis.yml','session.jsonl']){try{await unlink(join(dir,f));}catch(e){if(e.code!=='ENOENT')throw e;}}await rmdir(dir);});
 class Replay extends LlmAdapter {
  async resolveModel(provider,id){return {provider,id,name:'Recorded synthetic model'};}
  async *stream(options){const step=requests.length;requests.push(options);assert.ok(blocks[step],'unexpected extra model request');yield* blocks[step];}
 }
 const {createMcpToolDefinition}=await load('dsh-mcp-client'),modules=new Map();
 for(const n of ['dsh-llm','dsh-session','dsh-session-projection','dsh-system-prompt','dsh-tools','dsh-agent','dsh-agent-loop']){const m=await load(n);modules.set(n,m.default??m);}
 modules.set('fixture',{inject:['llm','tools'],apply(c){
  c.llm.registerAdapter(['fixture'],new Replay());
  for(const n of ['ui_find','ui_click']){
   const definition=createMcpToolDefinition(c,{name:'mcp__sep_windows__'+n,rawName:n,description:'Synthetic provider; never sends input',inputSchema:{type:'object'},async call(){calls.push(n);return {content:[{type:'text',text:JSON.stringify(n==='ui_find'?{success:true,action:'find',elementCount:1,items:[{id:'19',name:'Confirm',enabled:true}]}:{success:true,action:'click',postActionTree:[{name:'SYNTHETIC_PRIVATE_WINDOW_TEXT'}]})}]};}});
   c.tools.register({...definition,finalizeContent:()=>[{type:'text',text:'[REDACTED]'}]});
  }
 }});modules.set('candidate',plugin);
 const rows=[...modules.keys()].map(name=>({name,...name==='candidate'?{config:{enabled:true}}:name==='dsh-agent-loop'?{config:{agents:[]}}:{}}));
 await writeFile(join(dir,'cordis.yml'),JSON.stringify(rows));
 const loader=await load('cordis-plugin-loader'),include=await load('cordis-plugin-include');ctx.baseUrl=pathToFileURL(dir).href+'/';await ctx.plugin(loader.default);ctx.loader.builtins.include=include.default;
 ctx.loader.internal={version:'v2',async import(name){assert.ok(modules.has(name));return modules.get(name);}};
 await ctx.loader.create({name:'cordis:include',config:{path:pathToFileURL(join(dir,'cordis.yml')).href}});await ctx.loader.await();
 ctx.on('session/event',(_session,event)=>events.push(event));
 const agent=await ctx.agentLoop.create(SessionId('recorded-'+round),{provider:'fixture',model:'fixture'},{cwd:dir});
 const idle=Promise.withResolvers();ctx.on('agent/status',e=>{if(e.agent===agent&&e.status==='idle')idle.resolve();});
 agent.followup(createUserMessage({content:[{type:'text',text:'Run the recorded semantic click'}],source:{kind:'user'}}));await idle.promise;
 assert.equal(requests.length,2);assert.deepEqual(calls,['ui_find','ui_click']);
 const message=requests[1].messages.find(m=>m.role==='tool');assert.ok(message);assert.doesNotMatch(JSON.stringify(message),/SYNTHETIC_PRIVATE_WINDOW_TEXT/);
 const expected=JSON.parse(await readFile(new URL('./expected-result.json',import.meta.url)));
 assert.deepEqual(JSON.parse(message.content[0].text),expected);
 await writeFile(join(dir,'session.jsonl'),events.map(e=>JSON.stringify(e)).join('\n')+'\n');
 const recorded=(await readFile(join(dir,'session.jsonl'),'utf8')).trim().split('\n').map(line=>JSON.parse(line));
 assert.doesNotMatch(JSON.stringify(recorded.filter(e=>e.type==='tool/result')),/SYNTHETIC_PRIVATE_WINDOW_TEXT/);
 assert.ok(recorded.some(e=>e.type==='tool/result'));assert.ok(recorded.some(e=>e.type==='turn/end'));
 assert.doesNotThrow(()=>Session.create(agent.session.id,recorded,agent.session.header));
});
