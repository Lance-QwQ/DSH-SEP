import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {load,modules,plugin,evidence,hash,sourceBinding} from './host.mjs';
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC','base64');
const {createUserMessage,resolveImageAttachmentAccess}=await load('dsh-llm');
const {SessionId}=await load('dsh-session');
const {DeepSeekAdapter,resolveAdapterOptions}=await load('dsh-llm-deepseek');
const sse=events=>events.map(event=>`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('');
function reply(step,tool){
 const start={type:'message_start',message:{id:'recorded-'+step,type:'message',role:'assistant',model:'deepseek-flash',usage:{input_tokens:100,output_tokens:1}}};
 const content=tool?[
  {type:'content_block_start',index:0,content_block:{type:'tool_use',id:'read-native-image',name:'read_image',input:{}}},
  {type:'content_block_delta',index:0,delta:{type:'input_json_delta',partial_json:'{"file_path":"red.png"}'}},
 ]:[{type:'content_block_start',index:0,content_block:{type:'text',text:''}},{type:'content_block_delta',index:0,delta:{type:'text_delta',text:step===2?'IMAGE_STEP_COMPLETED':'HISTORY_CONTINUED'}}];
 return sse([start,...content,{type:'content_block_stop',index:0},{type:'message_delta',delta:{stop_reason:tool?'tool_use':'end_turn'},usage:{output_tokens:12}},{type:'message_stop'}]);
}
const imageBlocks=value=>{const found=[];function visit(v){if(!v||typeof v!=='object')return;if(v.type==='image')found.push(v);for(const item of Object.values(v))if(item&&typeof item==='object'){if(Array.isArray(item))item.forEach(visit);else visit(item);}}visit(value);return found;};
async function setup(t,name,{textOnly=false}={}){
 const dir=join(evidence,name);await mkdir(dir);const workspace=join(dir,'workspace');await mkdir(workspace);await writeFile(join(workspace,'red.png'),PNG);
 const wire=[],transport=[],events=[],requests=[],errors=[],budgetBeforeTransport=[];
 const server=createServer((req,res)=>{void(async()=>{const parts=[];for await(const part of req)parts.push(part);const body=Buffer.concat(parts);const budget=JSON.parse(await readFile(join(dir,'budget.json'),'utf8'));const reserved=budget.entries.filter(e=>e.status==='reserved');assert.equal(reserved.length,1,'P1 must reserve budget before Messages or Files traffic');budgetBeforeTransport.push({path:req.url,reservation:reserved[0]});transport.push({method:req.method,path:req.url,bytes:body.length});if(req.url.endsWith('/messages')){const parsed=JSON.parse(body);wire.push(parsed);res.setHeader('content-type','text/event-stream');res.end(reply(wire.length,wire.length===1));}else{res.writeHead(404,{'content-type':'application/json'});res.end('{"error":{"type":"not_found_error","message":"Synthetic endpoint uses inline images"}}');}})().catch(error=>res.destroy(error));});
 server.listen(0,'127.0.0.1');await once(server,'listening');const baseURL=`http://127.0.0.1:${server.address().port}/anthropic`;
 const {Context}=await load('cordis'),ctx=new Context();let agent;
 t.after(async()=>{try{await ctx.fiber.dispose();}finally{const closed=new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));server.closeAllConnections();await closed;}
  await writeFile(join(dir,'observed.json'),JSON.stringify({host:sourceBinding,wire,transport,budgetBeforeTransport,events,requests,errors,agentStatus:agent?.status,serverListening:server.listening},null,2)+'\n');
  if(agent){const reader=new Context();try{const backend=await load('dsh-session-persistence-jsonl');await reader.plugin(backend.default,{root:join(dir,'sessions')});const handle=await reader.sessionPersistence.open(agent.id,'read');try{const durable=await handle.read();assert.deepEqual(durable.events,events,'Fresh JSONL reader must recover every recorded tool result and turn outcome');await writeFile(join(dir,'durable-events.json'),JSON.stringify(durable,null,2)+'\n');}finally{await handle.close();}}finally{await reader.fiber.dispose();}}
 });
 const map=new Map(modules);const connection=resolveAdapterOptions({baseURL,maxTokens:128,reasoningEffort:'off',streamIdleTimeoutMs:3000,filesApiTimeoutMs:3000,...textOnly?{models:[{id:'deepseek-flash',inputModalities:['text']}]}:{}});
 map.set('recorded-deepseek-endpoint',{name:'recorded-deepseek-endpoint',inject:['llm','attachments','fs'],apply(c){
  const adapter=new DeepSeekAdapter({options:()=>connection,resolveAuth:async()=>({headers:{}}),resolveUserId:()=> 'synthetic-native-image-test',resolveAttachments:()=>c.get('attachments'),resolveImageAccess:(attachments,ref)=>resolveImageAttachmentAccess(attachments,p=>c.get('fs').processPathFromHostPath(p),ref),prepareExtensions:async()=>({fields:{},accept:async()=>{}})});
  c.llm.registerAdapter(['deepseek-official'],adapter);
 }});map.set('sep-under-test',plugin);
 const names=['dsh-llm','dsh-session','dsh-session-projection','dsh-system-prompt','dsh-tools','dsh-agent','dsh-agent-loop','dsh-fs-local','dsh-fs-observation-policy','dsh-tool-fs','dsh-attachment-local','dsh-storage','dsh-storage-json','dsh-storage-domain','dsh-subagent','dsh-subagent-spawn-in-process','dsh-user-approval','dsh-session-persistence-jsonl','recorded-deepseek-endpoint','sep-under-test'];
 const config={
  'dsh-tools':{mode:'native'},'dsh-agent-loop':{agents:[]},'dsh-fs-local':{cwd:workspace},'dsh-attachment-local':{dshHome:join(dir,'home')},
  'dsh-storage-json':{root:join(dir,'storage')},'dsh-storage-domain':{backend:'json'},'dsh-session-persistence-jsonl':{root:join(dir,'sessions')},
  'sep-under-test':{enabled:true,lockDirectory:join(dir,'locks'),projects:[{root:workspace,sources:['.']}],modules:{rag:false,memory:false,media:false},p1:{enabled:true,budgetPath:join(dir,'budget.json'),limitCny:1,profileLimits:{maxInputBytes:250000,maxOutputTokens:128}}},
 };
 await writeFile(join(dir,'cordis.yml'),JSON.stringify(names.map(name=>({name,...config[name]?{config:config[name]}:{}})),null,2)+'\n');
 const loader=await load('cordis-plugin-loader'),include=await load('cordis-plugin-include');ctx.baseUrl=pathToFileURL(dir).href+'/';await ctx.plugin(loader.default);ctx.loader.builtins.include=include.default;
 ctx.loader.internal={version:'v2',async import(name){assert.ok(map.has(name),'Unmapped module: '+name);return map.get(name);}};
 await ctx.loader.create({name:'cordis:include',config:{path:pathToFileURL(join(dir,'cordis.yml')).href}});await ctx.loader.await();
 assert.ok(ctx.get('suiteEnhancements'),'SEP did not activate');assert.ok(ctx.tools.get('read_image'),'Native image tool missing');
 ctx.on('session/event',(_session,event)=>events.push(event));ctx.on('agent/error',payload=>errors.push({message:payload.error?.message,code:payload.error?.code}));
 ctx.on('llm/stream',async function*(options,next){requests.push(JSON.parse(JSON.stringify(options)));yield*next();});
 agent=await ctx.agentLoop.create(SessionId(name),{provider:'deepseek-official',model:'deepseek-flash',maxTokens:128},{cwd:workspace});
 async function send(text){const previous=events.filter(e=>e.type==='turn/start').length;agent.followup(createUserMessage({content:[{type:'text',text}],source:{kind:'user'}}));await agent.whenIdle();assert.equal(events.filter(e=>e.type==='turn/start').length,previous+1,'Followup must create a new durable turn');return events.filter(e=>e.type==='turn/end').at(-1);}
 return {ctx,agent,dir,wire,events,requests,errors,send};
}

// Before this fix, the production P1 stream guard rejects the native tool's
// already-durable image and rejects a later text-only followup carrying it.
for(let round=1;round<=3;round++)test(`native read_image reaches the next model request and remains usable in later text followup (round ${round})`,{timeout:30000},async t=>{
 const r=await setup(t,'native-round-'+round);
 const first=await r.send('Read red.png using read_image, then finish this step.');
 const result=r.events.find(e=>e.type==='tool/result');assert.ok(result,'The real native tool must finish before assessing the P1 gate');
 const savedImages=imageBlocks(result);assert.equal(savedImages.length,1);assert.equal(savedImages[0].attachment.mediaType,'image/png');assert.equal(savedImages[0].attachment.width,1);assert.equal(savedImages[0].attachment.height,1);
 const stored=await r.ctx.attachments.readImage(savedImages[0].attachment);assert.equal(hash(stored.data),String(savedImages[0].attachment.attachmentId).slice('sha256:'.length));
 // Drive the second turn even when the first is red, preserving both historical-image failures.
 const second=await r.send('Continue using the preceding image; this followup has only text.');
 await writeFile(join(r.dir,'turn-checkpoints.json'),JSON.stringify({first,second,errors:r.errors},null,2)+'\n');
 assert.equal(first.data.reason.kind,'completed',JSON.stringify(first.data.reason));
 assert.equal(second.data.reason.kind,'completed',JSON.stringify(second.data.reason));
 assert.equal(r.wire.length,3,'One tool request plus two completed image-bearing requests');
 for(const body of r.wire.slice(1)){const images=imageBlocks(body);assert.equal(images.length,1);assert.equal(images[0].source.type,'base64');assert.equal(images[0].source.media_type,'image/png');assert.ok(Buffer.from(images[0].source.data,'base64').length>0);}
 const ledger=JSON.parse(await readFile(join(r.dir,'budget.json'),'utf8'));assert.equal(ledger.entries.length,3);assert.ok(ledger.entries.every(e=>e.status==='settled'&&e.usage.prompt_tokens===100&&e.usage.completion_tokens===12));
 const historicalImage=r.agent.session.deriveMessages().flatMap(m=>m.content).find(b=>b.type==='image');assert.ok(historicalImage);assert.equal(historicalImage.attachment.attachmentId,savedImages[0].attachment.attachmentId);
 assert.equal(r.errors.length,0);assert.equal(r.agent.status,'idle');
});

test('text-only route refuses native read_image without creating or transmitting image content',{timeout:30000},async t=>{
 const r=await setup(t,'text-only',{textOnly:true});const end=await r.send('Try read_image red.png once and report the tool refusal.');
 const result=r.events.find(e=>e.type==='tool/result');assert.ok(result);assert.equal(imageBlocks(result).length,0);assert.equal(result.data.message.isError,true);assert.match(result.data.message.content[0].text,/does not declare image input/);assert.equal(r.wire.length,2);assert.equal(imageBlocks(r.wire).length,0);assert.equal(end.data.reason.kind,'completed');
});
