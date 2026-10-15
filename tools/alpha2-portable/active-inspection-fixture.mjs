import {createHash} from 'node:crypto';
// TEST ONLY: real Agent/LLM waterfall, synthetic provider, controlled file gates.
// Never shipped in the production payload. No network/provider requests.
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {load} from './host-modules.mjs';
export const name='sep-active-inspection-fixture',inject=['agents','llm','workingDirectory','sepLinuxRuntime'];
export function apply(ctx,{root,source,round}){
 const lifetime=new AbortController();ctx.effect(()=>()=>lifetime.abort());
 ctx.on('llm/stream',options=>(async function*(){
  await writeFile(join(root,'entered.json'),JSON.stringify({synthetic:true,signal:!!options.signal}));
  for(let n=0;n<600;n++){options.signal?.throwIfAborted();lifetime.signal.throwIfAborted();try{await readFile(join(root,'release'));break;}catch(e){if(e.code!=='ENOENT')throw e;}if(n===599)throw Error('FIXTURE_RELEASE_DEADLINE');await delay(50);}
  yield {type:'block-start',index:0,blockType:'text'};yield {type:'text-delta',index:0,text:'synthetic'};yield {type:'block-end',index:0,block:{type:'text',text:'synthetic'}};yield {type:'usage',usage:{inputTokens:10,outputTokens:2}};yield {type:'finish',reason:{kind:'stop'}};
 })());
 const run=async()=>{
  for(let n=0;n<800;n++){lifetime.signal.throwIfAborted();try{await readFile(join(root,'begin'));if(ctx.sepLinuxRuntime.status().phase==='active')break;}catch(e){if(e.code!=='ENOENT')throw e;}if(n===799)throw Error('FIXTURE_BEGIN_DEADLINE');await delay(50);}
  const {SessionId}=await load('@deepseek-ai/dsh-session'),{createUserMessage}=await load('@deepseek-ai/dsh-llm');
  const {agent}=await ctx.agents.create({sessionId:SessionId('inspection-synthetic-'+createHash('sha256').update(root).digest('hex').slice(0,10)+'-'+round),meta:{cwd:source,delegationDepth:0},agentOptions:{provider:'deepseek-official',model:'deepseek-v4-flash',maxTokens:64}});
  agent.followup(createUserMessage({content:[{type:'text',text:'Synthetic quit-inspection test; reply synthetic.'}],source:{kind:'user'}}));await agent.whenIdle();
  await writeFile(join(root,'idle.json'),JSON.stringify({id:agent.id,status:agent.status}));
 };
 run().catch(async e=>{try{await writeFile(join(root,'error.json'),JSON.stringify({code:e.code??e.name}));}catch{}});
}
