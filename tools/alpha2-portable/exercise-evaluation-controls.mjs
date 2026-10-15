// Full controlled Linux SEP consumer factory + actual native Docker judge.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {setup,ok} from './sep-fixture.mjs';
const [root]=process.argv.slice(2),input=JSON.parse(await readFile(join(root,'INPUTS.json'))),rows=[];
const f=await setup({business:{evaluation:input.config},runtimeOptions:{evaluationRuntime:input.runtime}});
try{
 assert.equal(f.api.status().evaluation,'native-linux-owned-backend');
 ok(await f.call('suite_index'));assert.equal(ok(await f.call('suite_search',{query:'original'})).status,'found');
 ok(await f.call('read',{file_path:'data.txt'}));ok(await f.call('write',{file_path:'data.txt',content:'controlled-evaluation'}));const plan=await f.ctx.sepLinuxProfile.review();await f.ctx.sepLinuxProfile.commit(plan);
 assert.equal(await readFile(join(f.source,'data.txt'),'utf8'),'original');
 for(const round of [1,2])for(const [artifactId,want]of [['positive','pass'],['negative','fail']]){
  const jobId=`native-${artifactId}-${round}`;ok(await f.call('suite_eval_submit',{jobId,assessmentId:'official-swebench',artifactId}));let result;
  for(let i=0;i<950;i++){result=ok(await f.call('suite_eval_result',{jobId}));if(result.phase==='terminal')break;await delay(200);}
  assert.equal(result.outcome,'completed',JSON.stringify(result));assert.equal(result.status,want);assert.equal(result.resolved,want==='pass');assert.equal(result.exitCode,0);assert.match(result.officialReportSha256,/^[a-f0-9]{64}$/);
  rows.push({round,artifactId,status:'pass',receipt:result});console.log(JSON.stringify({round,artifactId,verdict:want}));
 }
 assert.equal(f.providerCalls(),0);
 const closing=await f.api.close();assert.equal(closing.status,'pass');assert.equal(f.ctx.sepEvaluationEntry?.status()?.status??'pass','pass');
 await writeFile(join(root,'RESULT.json'),JSON.stringify({status:'pass',scope:'same-host controlled Linux SEP runtime + native Docker official fixed Flask gold-derived positive/negative; two rounds; root only in dedicated evaluation distro; no model solving, no paid calls, no default desktop claim',inputBinding:input.inputBinding,rows,close:closing,providerCalls:f.providerCalls()},null,2)+'\n',{flag:'wx'});
}finally{await f.close();}
