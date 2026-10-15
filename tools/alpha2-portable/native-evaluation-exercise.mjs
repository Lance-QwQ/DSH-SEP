import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {loadNativeEntry,prepareNativeEvaluation} from './linux-evaluation.mjs';
import {load,prerequisites} from './host-modules.mjs';
const root=process.env.SEP_NATIVE_EVAL_ROOT,input=JSON.parse(await readFile(join(root,'INPUTS.json'))),{Entry}=await loadNativeEntry(),{Context}=await load('@deepseek-ai/cordis'),{ToolCallId}=await load('@deepseek-ai/dsh-llm');
const prepared=await prepareNativeEvaluation(input.config,input.runtime),ctx=new Context();await prerequisites(ctx);const ownership={signal:new AbortController().signal,enter:()=>()=>{},track:p=>p};
const config={...input.config,project:{projectId:input.config.projectId,catalogSha256:input.config.catalogSha256,root:input.source}},entry=new Entry(ctx,config,{ownership,spawnBackend:prepared.spawnBackend}),results=[];
try{
 assert.equal((await entry.start()).status,'pass');
 const agent=(await ctx.agents.create({sessionId:'linux-native-evaluation',meta:{cwd:input.source},agentOptions:{}})).agent;let n=0;
 const call=async(name,args)=>{const r=await ctx.tools.execute({name,arguments:args,agent,signal:new AbortController().signal,callId:ToolCallId('native-eval-'+ ++n)});assert.equal(r.isError,false,JSON.stringify(r.error));return r.value;};
 const health=await call('suite_eval_status',{});assert.equal(health.evaluator,'swebench-official-v1');
 const submitted=await call('suite_eval_submit',{jobId:'linux-native-negative',assessmentId:'official-swebench',artifactId:'negative'});assert.equal(submitted.jobId,'linux-native-negative');
 let result;for(let i=0;i<300;i++){result=await call('suite_eval_result',{jobId:'linux-native-negative'});if(result.phase==='terminal')break;await delay(200);}
 assert.equal(result.outcome,'completed',JSON.stringify(result));assert.equal(result.status,'fail');assert.equal(result.resolved,false);assert.equal(result.exitCode,0);assert.match(result.officialReportSha256,/^[a-f0-9]{64}$/);results.push({name:'native-launch-and-real-official-negative',status:'pass',receipt:result});
 const close=await entry.stop();assert.equal(close.status,'pass');results.push({name:'native-bounded-stop',status:'pass',receipt:close});
 const resumed=new Entry(ctx,config,{ownership,spawnBackend:prepared.spawnBackend});try{assert.equal((await resumed.start()).status,'pass');const stored=await call('suite_eval_result',{jobId:'linux-native-negative'});assert.deepEqual(stored,result);results.push({name:'same-state-reconnect-retains-receipt',status:'pass'});}finally{assert.equal((await resumed.stop()).status,'pass');}
 await writeFile(join(root,'RESULT.json'),JSON.stringify({status:'pass',scope:'native Linux launch, fixed public Flask negative official grading, stop/reconnect; no model generation',usesWsl:false,results},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({status:'pass',checks:results.length}));
}finally{const close=await entry.stop();await ctx.fiber.dispose();if(close.status!=='pass')throw Error('NATIVE_EVAL_CLEANUP_BLOCKED');}
