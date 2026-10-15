import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {setup,agent,model,deferred,owned,load} from './native-settings-fixture.mjs';
const input=JSON.parse(process.env.SEP_APPLICATION_CASE);
const source=await readFile(process.env.SEP_OFFICIAL_SHUTDOWN_SOURCE);
const contract=JSON.parse(await readFile(new URL('../../../bundle/contracts/application-shutdown.json',import.meta.url)));
assert.equal(process.env.SEP_OFFICIAL_SHUTDOWN_SHA256,contract.officialControllerSha256);
assert.equal(createHash('sha256').update(source).digest('hex'),contract.officialControllerSha256);
const {createProcessShutdown,PROCESS_SHUTDOWN_TIMEOUT_MS}=await import(pathToFileURL(process.env.SEP_OFFICIAL_SHUTDOWN_SOURCE));
assert.equal(PROCESS_SHUTDOWN_TIMEOUT_MS,5000);
const {createApplicationShutdown}=await owned('lib/application-shutdown.js');
const f=await setup({shutdownMs:100});
const result={schema:1,case:input.case,base:f.base,memory:f.dirs.memory,budgetPath:f.budgetPath,pid:process.pid,requests:0};
const entered=deferred(),release=deferred();let running,keepalive=setInterval(()=>{},1000),controller;
async function publish(){result.elapsedMs=Date.now()-result.startedAt;result.requests=f.requests.length;result.ledger=JSON.parse(await readFile(f.budgetPath));result.root=f.api.status();result.application=controller.status();await writeFile(input.result,JSON.stringify(result,null,2)+'\n');}
const forceExit=code=>{result.exitPath='official-controller-forced';result.exitCode=code;void publish().then(()=>process.exit(code),()=>process.exit(99));};
controller=createApplicationShutdown({dedicatedHost:true,installation:f.api,dispose:async()=>{await f.ctx.fiber.dispose();clearInterval(keepalive);},createProcessShutdown,forceExit,complete:code=>{result.exitPath='normal-disposal';result.exitCode=code;process.exitCode=code;},timeoutMs:input.timeoutMs});
if(input.case.includes('model')){
 const a=await agent(f);f.behavior=async options=>{entered.resolve();if(input.case==='cooperative-model')await new Promise(resolve=>{if(options.signal.aborted)resolve();else options.signal.addEventListener('abort',resolve,{once:true});});else await release.promise;};
 running=model(f,{sessionId:a.id}).catch(error=>{result.operationError=error.code??'ABORTED';});await entered.promise;
}else if(input.case.includes('tool')){
 const a=await agent(f);let offered=false;
 f.ctx.tools.register({name:'synthetic_shutdown_wait',description:'Synthetic owned wait',parameters:{type:'object'},output:{schema:{type:'object'},render:()=>[]},async execute(_args,exec){entered.resolve();if(input.case==='cooperative-tool')await new Promise(resolve=>{if(exec.signal.aborted)resolve();else exec.signal.addEventListener('abort',resolve,{once:true});});else await release.promise;return {done:true};}});
 f.customStream=()=>{if(offered)return false;offered=true;const block={type:'tool-call',id:'shutdown-tool-1',name:'synthetic_shutdown_wait',arguments:'{}'};f.customChunks=[{type:'block-start',index:0,blockType:'tool-call'},{type:'tool-call-delta',index:0,id:block.id,name:block.name,argumentsDelta:'{}'},{type:'block-end',index:0,block},{type:'usage',usage:{inputTokens:10,outputTokens:2}},{type:'finish',reason:{kind:'tool-calls'}}];return true;};
 const {createUserMessage}=await load('@deepseek-ai/dsh-llm');a.followup(createUserMessage({content:[{type:'text',text:'Run the synthetic shutdown tool'}],source:{kind:'user'}}));running=a.whenIdle().catch(()=>{});await entered.promise;
}else if(input.case==='pending-intent'){
 running=f.ctx.sepGovernedStorage.withAccess(()=>f.ctx.sepStorageControl.business({operation:'synthetic-interrupted-write'},async()=>{entered.resolve();await release.promise;}));await entered.promise;
}
result.beforeRequests=f.requests.length;result.startedAt=Date.now();
const stopping=controller.shutdown(0);
if(input.case==='coalesced-idle')assert.equal(controller.shutdown(1),stopping);
assert.throws(()=>f.api.stream({}),error=>error.code==='SEP_P1_CLOSED');result.newAdmissionRejected=true;
process.send?.({kind:'stopping',memory:f.dirs.memory,budgetPath:f.budgetPath,base:f.base});
if(input.case==='interrupt-model')setTimeout(()=>controller.interrupt(130),30);
await stopping;await running;result.elapsedMs=Date.now()-result.startedAt;await publish();process.disconnect?.();
