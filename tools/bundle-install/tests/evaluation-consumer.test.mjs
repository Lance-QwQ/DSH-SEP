import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {setup,close,agent,call,owned,exec} from './native-settings-fixture.mjs';
const binding=JSON.parse(await readFile(join(process.env.SEP_EVAL_FIXTURE,'binding.json')));
function config(){return {enabled:true,backend:{entry:'/opt/dsh-sep-eval/sep-bundle22/package/lifecycle.py',configPath:'/opt/dsh-sep-eval/sep-bundle22/config.json',configSha256:binding.configSha256,stateIdentity:binding.stateIdentity},shutdownMs:30000};}
test('controlled evaluation consumer starts the actual backend, retires the connection and reconnects', {timeout:90000},async()=>{
 const {businessConfig}=await owned('lib/settings-consumers.js');assert.doesNotThrow(()=>businessConfig.parse({sources:['资料'],evaluation:{...config(),projectId:binding.projectId,catalogSha256:binding.catalogSha256}}));
 let previous;
 for(let round=0;round<2;round++){
  const f=await setup({business:{evaluation:{...config(),projectId:binding.projectId,catalogSha256:binding.catalogSha256}},shutdownMs:40000});try{
   const a=await agent(f),status=await call(f,a,'eval_status',{});assert.equal(status.evaluator,'swebench-official-v1');assert.equal(status.projectId,binding.projectId);assert(status.artifacts.some(row=>row.artifactId==='negative'));
   const service=f.ctx.sepEvaluationEntry,ready=service.status();assert.equal(ready.status,'pass',JSON.stringify(ready));if(previous)assert.notEqual(ready.generationId,previous);previous=ready.generationId;
   const retained=f.ctx.tools.get('suite_eval_status',a);assert.equal((await f.api.close()).status,'pass');await assert.rejects(retained.execute({},exec(a)),/SEP_P1_CLOSED/);assert.equal(service.status().status,'pass');assert.equal(service.status().cleanup.quiescent,true);assert.equal(service.status().phase,'stopped');assert.equal(f.requests.length,0);
   assert.deepEqual(await readFile(f.budgetPath),f.bytes);
  }finally{await close(f);}
 }
});
