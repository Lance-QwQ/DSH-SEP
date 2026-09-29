import {lstat,realpath,open} from 'node:fs/promises';
import {resolve,isAbsolute} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {Budget,parseBudgetLedger,summarizeBudget} from './budget-ledger.js';

const SHA=/^[a-f0-9]{64}$/;
const MAX_BYTES=16*1024*1024;
const fail=code=>{throw Object.assign(new Error(code),{code});};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
const canonical=value=>JSON.stringify(stable(value));
const samePath=(a,b)=>process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b;
const sameFile=(a,b)=>a.dev===b.dev&&a.ino===b.ino&&a.size===b.size&&a.mtimeNs===b.mtimeNs&&a.ctimeNs===b.ctimeNs&&b.nlink===1n;

// One reviewed historical price interval, not a general retroactive pricing engine.
// This module is an explicit maintenance API; no plugin startup imports it.
export const LEGACY_FLASH_RULE=Object.freeze({
 version:'flash-v1-3-9-to-2-8-20260927-r1',
 effectiveAt:'2026-09-10T04:00:00.000Z',
 verifiedThrough:'2026-09-27T05:08:24.579Z',
 model:'deepseek-flash',
 oldRates:Object.freeze({input:3,output:9}),
 newRates:Object.freeze({input:2,output:8}),
 currency:'CNY',unit:'per-million-tokens',
 cacheAssumption:'all-input-cache-miss',
 pricingPeriod:'peak-upper-bound',
 officialAnnouncement:'https://api-docs.deepseek.com/zh-cn/news/news260910/',
 officialImage:'https://api-docs.deepseek.com/zh-cn/img/v4.1_260910_price_cn.jpeg',
 officialImageSha256:'701177bc7d46edd0faf9a761123f89196ae0d2bbd70e69ba272028c641f1582c',
 isInvoice:false,
});

// Require an explicit UTC spelling and reject Date.parse calendar rollover.
function verifiedUtc(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value))return null;
 const time=Date.parse(value),normalized=value.includes('.')?value:value.slice(0,-1)+'.000Z';
 return Number.isFinite(time)&&new Date(time).toISOString()===normalized?time:null;
}
async function snapshot(budgetPath){
 if(typeof budgetPath!=='string'||!isAbsolute(budgetPath))fail('LEGACY_RECONCILE_PATH');
 const path=resolve(budgetPath);
 try{
  const before=await lstat(path,{bigint:true});
  if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1n||before.ino===0n||before.size>BigInt(MAX_BYTES)||!samePath(await realpath(path),path))fail('LEGACY_RECONCILE_PATH');
  const handle=await open(path,'r');let bytes;
  try{
   if(!sameFile(before,await handle.stat({bigint:true})))fail('LEGACY_RECONCILE_SOURCE_CHANGED');
   bytes=await handle.readFile();
   if(!sameFile(before,await handle.stat({bigint:true}))||!sameFile(before,await lstat(path,{bigint:true})))fail('LEGACY_RECONCILE_SOURCE_CHANGED');
  }finally{await handle.close();}
  let value;
  try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{fail('LEGACY_RECONCILE_INVALID');}
  if(value?.version!==1)fail('LEGACY_RECONCILE_VERSION');
  let ledger;try{ledger=parseBudgetLedger(value);}catch{fail('LEGACY_RECONCILE_INVALID');}
  return {path,bytes,ledger,source:{path,sha256:hash(bytes),size:bytes.length,device:String(before.dev),inode:String(before.ino),entries:ledger.entries.length}};
 }catch(error){
  if(error.code?.startsWith('LEGACY_RECONCILE_'))throw error;
  fail(error.code==='ENOENT'?'LEGACY_RECONCILE_MISSING':'LEGACY_RECONCILE_IO');
 }
}
function eligible(entry){
 if(entry.status!=='settled')return {reason:'unsettled'};
 if(entry.model!==LEGACY_FLASH_RULE.model)return {reason:'model-outside-rule'};
 const from=verifiedUtc(entry.createdAt),to=verifiedUtc(entry.finishedAt);
 if(from===null||to===null||from<Date.parse(LEGACY_FLASH_RULE.effectiveAt)||to<from||to>Date.parse(LEGACY_FLASH_RULE.verifiedThrough))return {reason:'time-outside-verified-window'};
 const usage=entry.usage;
 if(!usage||!['prompt_tokens','completion_tokens'].every(key=>Number.isSafeInteger(usage[key])&&usage[key]>=0))return {reason:'usage-unverified'};
 // Integer CNY-per-million rates yield exact micro-CNY. The integer result is
 // already rounded upward to the micro-CNY boundary; no float under-rounding.
 const input=BigInt(usage.prompt_tokens),output=BigInt(usage.completion_tokens);
 const oldMicro=input*3n+output*9n,newMicro=input*2n+output*8n;
 if(oldMicro>BigInt(Number.MAX_SAFE_INTEGER)||newMicro>BigInt(Number.MAX_SAFE_INTEGER))return {reason:'amount-outside-safe-range'};
 const oldChargeCny=Number(oldMicro)/1000000,newChargeCny=Number(newMicro)/1000000;
 if(entry.chargeCeilingCny!==oldChargeCny)return {reason:'old-formula-mismatch'};
 if(newChargeCny>=oldChargeCny)return {reason:'no-bounded-reduction'};
 return {newChargeCny};
}
function exactMicro(amount){
 // This one-time rule cannot revise unknown precision. Historical Budget
 // entries normally already have at most six fractional CNY digits.
 const rounded=Math.round(amount*1000000);
 if(!Number.isSafeInteger(rounded)||rounded<0||rounded/1000000!==amount)fail('LEGACY_RECONCILE_INVALID');
 return BigInt(rounded);
}
const cny=micro=>{
 if(micro>BigInt(Number.MAX_SAFE_INTEGER)||micro<BigInt(-Number.MAX_SAFE_INTEGER))fail('LEGACY_RECONCILE_INVALID');
 return Number(micro)/1000000;
};
function buildPlan(view){
 const corrections=[],retainedReasons={};
 for(const [entryIndex,entry]of view.ledger.entries.entries()){
  const candidate=eligible(entry);
  if(candidate.reason)retainedReasons[candidate.reason]=(retainedReasons[candidate.reason]??0)+1;
  else corrections.push({entryIndex,before:structuredClone(entry),newChargeCny:candidate.newChargeCny});
 }
 const initialMicro=exactMicro(view.ledger.initialSpent),limitMicro=exactMicro(view.ledger.limit);
 let accountedMicro=initialMicro,reservedMicro=0n;
 for(const entry of view.ledger.entries){
  exactMicro(entry.reservedCny);
  const charge=exactMicro(entry.status==='settled'?entry.chargeCeilingCny:entry.reservedCny);
  accountedMicro+=charge;if(entry.status==='reserved')reservedMicro+=charge;
 }
 const discountMicro=corrections.reduce((sum,c)=>sum+exactMicro(c.before.chargeCeilingCny)-exactMicro(c.newChargeCny),0n);
 const afterMicro=accountedMicro-discountMicro;
 const reductionCny=cny(discountMicro);
 const body={
  version:1,kind:'sep-legacy-flash-price-reconciliation',isInvoice:false,
  rule:structuredClone(LEGACY_FLASH_RULE),source:view.source,
  summary:{entries:view.ledger.entries.length,eligibleEntries:corrections.length,retainedEntries:view.ledger.entries.length-corrections.length,retainedReasons,
   limitCny:view.ledger.limit,initialSpentCny:view.ledger.initialSpent,reservedCny:cny(reservedMicro),
   beforeAccountedCny:cny(accountedMicro),afterAccountedUpperBoundCny:cny(afterMicro),reductionCny,
   remainingAfterCny:cny(limitMicro-afterMicro)},
  corrections,
 };
 return {...body,planHash:hash(canonical(body))};
}
function confirm(plan,expectedPlanHash){
 if(!SHA.test(expectedPlanHash??''))fail('LEGACY_RECONCILE_CONFIRMATION');
 if(!plan||typeof plan!=='object'||Array.isArray(plan)||!SHA.test(plan.planHash??''))fail('LEGACY_RECONCILE_PLAN_INVALID');
 const {planHash,...body}=plan;
 if(planHash!==expectedPlanHash)fail('LEGACY_RECONCILE_CONFIRMATION');
 if(hash(canonical(body))!==planHash)fail('LEGACY_RECONCILE_PLAN_INVALID');
}
function verifyCurrent(plan,view){
 if(canonical(plan.source)!==canonical(view.source))fail('LEGACY_RECONCILE_SOURCE_CHANGED');
 const fresh=buildPlan(view);
 if(canonical(plan)!==canonical(fresh))fail('LEGACY_RECONCILE_PLAN_MISMATCH');
 return fresh;
}

/** No writes, locks, migration, model calls, or inferred cache discounts. */
export async function planLegacyBudgetReconciliation({budgetPath}={}){
 return buildPlan(await snapshot(budgetPath));
}

/** Explicit one-time apply. Recomputes under the real Budget writer mutex,
 * then appends all corrections in one Budget.change atomic replacement.
 * Only original settled usage is repriced. Original rows and unknown reserves
 * survive; the existing Budget migration creates the exact-byte v1 checkpoint.
 */
export async function applyLegacyBudgetReconciliation({budgetPath,plan,expectedPlanHash}={}){
 confirm(plan,expectedPlanHash);
 const before=await snapshot(budgetPath),reviewed=verifyCurrent(plan,before);
 if(!reviewed.corrections.length)fail('LEGACY_RECONCILE_NO_ELIGIBLE_ENTRIES');
 const budget=new Budget(before.path,{limit:before.ledger.limit,initialSpent:before.ledger.initialSpent});
 return budget.change(async state=>{
  // Budget.change has only migrated its in-memory state here. The on-disk
  // source must still be the reviewed v1 bytes, not a pre-existing v2 or v3 ledger.
  const locked=await snapshot(before.path);verifyCurrent(reviewed,locked);
  const migrated={...locked.ledger,version:3,
   entries:locked.ledger.entries.map(e=>({...e,legacy:true,...(e.status==='reserved'?{phase:'unknown'}:{})})),
   taskLimits:{},childBindings:{},reconciliations:[],legacyInitialSpent:locked.ledger.initialSpent>0,
   migration:{sourceVersion:1,sourceSha256:locked.source.sha256,createdAt:state.migration?.createdAt},
   sessionDefault:{limitCny:100,revision:0},sessionLimits:{},
   sessionMigration:{sourceVersion:1,sourceSha256:locked.source.sha256,createdAt:state.sessionMigration?.createdAt}};
  if(!state.migration?.createdAt||!state.sessionMigration?.createdAt||canonical(state)!==canonical(migrated))fail('LEGACY_RECONCILE_STATE_CHANGED');
  const createdAt=new Date().toISOString(),reference='plan-sha256:'+reviewed.planHash+';image-sha256:'+LEGACY_FLASH_RULE.officialImageSha256;
  for(const correction of reviewed.corrections){
   // The full recomputation above is authoritative, never a caller-supplied fee.
   state.reconciliations.push({id:randomUUID(),entryId:correction.before.id,chargeCny:correction.newChargeCny,evidence:{kind:'verified-usage',reference},createdAt});
  }
  parseBudgetLedger(state);
  const finalTotals=summarizeBudget(state);
  if(finalTotals.accountedCny!==reviewed.summary.afterAccountedUpperBoundCny)fail('LEGACY_RECONCILE_TOTAL_MISMATCH');
  verifyCurrent(reviewed,await snapshot(before.path));
  return {status:'applied',isInvoice:false,planHash:reviewed.planHash,sourceSha256:locked.source.sha256,appliedCorrections:reviewed.corrections.length,
   beforeAccountedCny:reviewed.summary.beforeAccountedCny,afterAccountedUpperBoundCny:finalTotals.accountedCny,reductionCny:reviewed.summary.reductionCny,
   checkpointPath:before.path+'.v1-'+locked.source.sha256+'.checkpoint'};
 });
}
