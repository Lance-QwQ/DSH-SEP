import {randomUUID} from 'node:crypto';
import {assessment,admit,configurationHash,digest} from './policies.mjs';

// A deliberately small, local adaptation of task_sanity, task_csv_cities_filter
// and task_summary at PinchBench commit 819384ae830492365b8363fc26bc2602e73f216d.
// The full upstream graders, file actions and leaderboard upload are not run.
export const PREWORK_PROMPT=`SEP local PinchBench adaptation v1. This is synthetic evaluation data, not a user task. Do not call tools. Return only a JSON object with exactly these keys: ready, california, californiaTotal, southern, constraints.
1. ready: say "Hello, I'm ready!".
2. Analyze this synthetic CSV (City,State,Population,lat):
Alpha,California,200000,34
Beta,California,199999,32
Gamma,California,300000,32
Delta,Texas,100000,31
Epsilon,Florida,75000,32
Zeta,Washington,125000,45
california: city names in California with Population >= 200000, sorted by Population descending.
californiaTotal: sum of that filtered population, as a number.
southern: city names with lat < 33 and Population >= 100000, sorted alphabetically.
3. Summarize the binding constraints of this synthetic note: "Review only. Windows compatibility is required. No editing is permitted. Tests are still pending." constraints must be an array containing the two exact labels Windows and read-only, in that order. Do not treat the pending test as a completed result.`;
const TASKS_HASH=digest({prompt:PREWORK_PROMPT,grader:scorePrework.toString(),rounds:3,minimumPerRound:0.8,failedScore:0,ttlMs:86400000,upstream:'819384ae830492365b8363fc26bc2602e73f216d'});
const fail=code=>{throw Object.assign(Error(code),{code});};
export function scorePrework(output){
 if(typeof output!=='string'||Buffer.byteLength(output)>16384)return {score:0,checks:[false,false,false,false,false]};
 let value;try{value=JSON.parse(output);}catch{return {score:0,checks:[false,false,false,false,false]};}
 if(!value||typeof value!=='object'||Array.isArray(value))return {score:0,checks:[false,false,false,false,false]};
 const same=(x,y)=>JSON.stringify(x)===JSON.stringify(y);
 const checks=[value.ready==="Hello, I'm ready!",same(value.california,['Gamma','Alpha']),value.californiaTotal===500000,same(value.southern,['Beta','Delta','Gamma']),same(value.constraints,['Windows','read-only'])];
 return {score:checks.filter(Boolean).length/5,checks};
}
export function createPreworkRegistry({authorize,signal,now=Date.now}){
 const receipts=new Map(),owners=new Map(),pending=new Map();
 const bound=binding=>({...binding,tasksHash:TASKS_HASH});
 const prune=()=>{for(const [key,r] of receipts)if(r.expiresAt<=now()){receipts.delete(key);owners.delete(key);}};
 return {
  protocol:1,
  async ensure(exec,binding,run){
   const owner=await authorize(exec);signal.throwIfAborted();exec.signal?.throwIfAborted();
   const actual=bound(binding),key=configurationHash(actual);prune();
   if(receipts.has(key))return structuredClone(receipts.get(key));
   if(pending.has(key))fail('GROUP_PREWORK_BUSY');if(receipts.size+pending.size>=64)fail('GROUP_PREWORK_RECEIPT_LIMIT');
   pending.set(key,owner);const samples=[];
   try{
    for(let round=1;round<=3;round++){
     if(samples.some(s=>s.status==='blocked')){samples.push({round,status:'not_run',score:0});continue;}
     const started=now();
     try{
      signal.throwIfAborted();exec.signal?.throwIfAborted();
      const output=await run(PREWORK_PROMPT);signal.throwIfAborted();exec.signal?.throwIfAborted();
      const result=scorePrework(output);samples.push({round,status:result.score>=0.8?'pass':'fail',score:result.score,checks:result.checks,outputSha256:digest(output),durationMs:Math.max(0,now()-started)});
     }catch{samples.push({round,status:'blocked',score:0,durationMs:Math.max(0,now()-started),code:'PREWORK_EXECUTION_BLOCKED'});}
    }
    const receipt={...assessment(actual,samples,now()),id:randomUUID(),scope:'synthetic-model-readiness-only',rubric:'five deterministic checks; each of three rounds must reach 0.8',rawBodiesStored:false};
    signal.throwIfAborted();receipts.set(key,receipt);owners.set(key,owner);exec.signal?.throwIfAborted();return structuredClone(receipt);
   }finally{pending.delete(key);}
  },
  async admit(exec,binding,id){await authorize(exec);signal.throwIfAborted();exec.signal?.throwIfAborted();const actual=bound(binding),receipt=receipts.get(configurationHash(actual));return receipt?.id===id&&admit(actual,receipt,now()).allowed;},
  async reset(exec){const owner=await authorize(exec);signal.throwIfAborted();exec.signal?.throwIfAborted();if([...pending.values()].includes(owner))fail('GROUP_PREWORK_BUSY');let count=0;for(const [key,value] of owners)if(value===owner){owners.delete(key);receipts.delete(key);count++;}return count;},
  clear(){receipts.clear();owners.clear();},
 };
}
