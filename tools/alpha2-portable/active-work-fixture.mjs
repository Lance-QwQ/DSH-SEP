import {createHash} from 'node:crypto';
// Test-only real Agent -> bash -> COW sandbox. No model/API network calls.
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {setTimeout as delay} from 'node:timers/promises';
import {load} from './host-modules.mjs';
export const name='sep-active-work-fixture',inject=['agents','llm','workingDirectory','sepLinuxRuntime'];
export function apply(ctx,{root,source,managed,round}){
 const lifetime=new AbortController();ctx.effect(()=>()=>lifetime.abort());
 ctx.on('llm/stream',options=>(async function*(){
  const result=options.messages.find(m=>m.role==='tool');
  if(!result){const id='active-owned-work-'+round,args=JSON.stringify({command:'printf partial > interrupted.txt; sleep 8; printf late > late.txt'});yield {type:'block-start',index:0,blockType:'tool-call'};yield {type:'tool-call-delta',index:0,id,name:'bash',argumentsDelta:args};yield {type:'block-end',index:0,block:{type:'tool-call',id,name:'bash',arguments:args}};}
  else{yield {type:'block-start',index:0,blockType:'text'};yield {type:'text-delta',index:0,text:'synthetic done'};yield {type:'block-end',index:0,block:{type:'text',text:'synthetic done'}};}
  yield {type:'usage',usage:{inputTokens:10,outputTokens:2}};yield {type:'finish',reason:{kind:result?'stop':'tool-calls'}};
 })());
 const run=async()=>{
  for(let n=0;n<800;n++){lifetime.signal.throwIfAborted();try{await readFile(join(root,'begin'));if(ctx.sepLinuxRuntime.status().phase==='active')break;}catch(e){if(e.code!=='ENOENT')throw e;}await delay(50);}
  const {SessionId}=await load('@deepseek-ai/dsh-session'),{createUserMessage}=await load('@deepseek-ai/dsh-llm');
  const {agent}=await ctx.agents.create({sessionId:SessionId('active-work-'+createHash('sha256').update(root).digest('hex').slice(0,10)+'-'+round),meta:{cwd:source,delegationDepth:0},agentOptions:{provider:'deepseek-official',model:'deepseek-v4-flash',maxTokens:64}});
  agent.followup(createUserMessage({content:[{type:'text',text:'Synthetic owned bash fault test.'}],source:{kind:'user'}}));
  const db=new DatabaseSync(join(managed,'state.sqlite'),{readOnly:true});try{
   for(let n=0;n<400;n++){lifetime.signal.throwIfAborted();const row=db.prepare("SELECT value FROM transactions WHERE json_extract(value,'$.state')='running' AND json_extract(value,'$.sandbox') IS NOT NULL").get();if(row){const t=JSON.parse(row.value);try{await readFile(join(managed,'transactions',t.id,'work','interrupted.txt'));await writeFile(join(root,'entered.json'),JSON.stringify({agentId:agent.id,transaction:t}));break;}catch(e){if(e.code!=='ENOENT')throw e;}}await delay(25);}
  }finally{db.close();}
  await agent.whenIdle();await writeFile(join(root,'idle.json'),JSON.stringify({status:agent.status}));
 };
 run().catch(async e=>{try{await writeFile(join(root,'error.json'),JSON.stringify({code:e.code??e.name}));}catch{}});
}
