import {mkdir,open,readFile,rename,unlink} from 'node:fs/promises';
import {dirname,isAbsolute} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {setTimeout as pause} from 'node:timers/promises';
import {z} from 'zod';
import {fail} from './errors.js';
import {acquireBudgetLock} from './budget-lock.js';
import {hasBudgetHistory,missingLedger,assertLedgerUnchanged} from './budget-continuity.js';

export const money=v=>Math.ceil(v*1e6-1e-9)/1e6||0;
const amount=z.number().finite().nonnegative(),cap=z.number().finite().positive().max(100),id=z.string().min(1).max(1000);
const tokens=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const sessionCap=z.number().finite().min(.01).max(1000000).refine(value=>Math.round(value*100)/100===value);
const revision=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const sessionPolicy=z.object({limitCny:sessionCap,revision}).strict();
const defaultSessionPolicy=()=>({limitCny:100,revision:0});
function settingInput(rootSessionId,limitCny,options,session=true){
 const {beforeCommit,...input}=options??{};
 if((session&&!id.safeParse(rootSessionId).success)||!sessionCap.safeParse(limitCny).success||!z.object({expectedRevision:revision}).strict().safeParse(input).success||(beforeCommit!==undefined&&typeof beforeCommit!=='function'))fail('BUDGET_SETTINGS_INPUT');
 return {...input,beforeCommit};
}
const ownValue=(record,key)=>record&&Object.hasOwn(record,key)?record[key]:undefined;
const nextRevision=value=>{if(value>=Number.MAX_SAFE_INTEGER)fail('BUDGET_SETTINGS_REVISION_LIMIT');return value+1;};
const usage=z.object({prompt_tokens:tokens,completion_tokens:tokens}).strict();
const detail=z.object({inputTokens:tokens,cacheReadTokens:tokens,cacheWriteTokens:tokens,outputTokens:tokens}).strict();
const scope=z.union([z.object({kind:z.literal('task'),taskId:id,rootSessionId:id,rootTurn:z.number().int().nonnegative()}).strict(),z.object({kind:z.literal('background'),taskId:id,category:id,rootSessionId:id.optional()}).strict()]);
const accounting=z.object({usageDetail:detail,priceVersion:id,basis:id,estimateCny:amount}).strict();
const timestamp=z.string().refine(v=>Number.isFinite(Date.parse(v)));
const legacyEntry=z.object({id,status:z.enum(['reserved','settled']),reservedCny:amount.positive(),createdAt:timestamp,chargeCeilingCny:amount.optional(),finishedAt:timestamp.optional(),model:id.optional(),inputSha256:z.string().regex(/^[a-f0-9]{64}$/).optional(),usage:usage.optional()}).strict();
const common={currency:z.literal('CNY'),limit:cap,initialSpent:amount};
const v1=z.object({version:z.literal(1),...common,entries:z.array(legacyEntry)}).strict();
const entry=legacyEntry.extend({status:z.enum(['reserved','settled','released']),taskId:id.optional(),scope:scope.optional(),phase:z.enum(['prepared','dispatched','unknown']).optional(),dispatchedAt:timestamp.optional(),releaseReason:id.optional(),legacy:z.boolean().optional(),accounting:accounting.optional()}).strict();
const evidence=z.object({kind:z.enum(['provider-receipt','verified-usage']),reference:id}).strict();
const reconciliation=z.object({id,entryId:id,chargeCny:amount,evidence,createdAt:timestamp}).strict();
const schema=z.object({version:z.literal(2),...common,entries:z.array(entry),taskLimits:z.record(id,cap),childBindings:z.record(id,scope),reconciliations:z.array(reconciliation),legacyInitialSpent:z.boolean().default(false),migration:z.object({sourceVersion:z.literal(1),sourceSha256:z.string().regex(/^[a-f0-9]{64}$/),createdAt:timestamp}).strict().optional()}).strict();
const sha=b=>createHash('sha256').update(b).digest('hex');
const v3=schema.extend({version:z.literal(3),sessionDefault:sessionPolicy,sessionLimits:z.record(id,sessionPolicy),sessionMigration:z.object({sourceVersion:z.union([z.literal(1),z.literal(2)]),sourceSha256:z.string().regex(/^[a-f0-9]{64}$/),createdAt:timestamp}).strict().optional()}).strict();
export function parseBudgetLedger(value){
 const state=value?.version===1?v1.parse(value):value?.version===3?v3.parse(value):schema.parse(value);
 const seen=new Set();for(const e of state.entries){
  if(seen.has(e.id))fail('BUDGET_CORRUPT');seen.add(e.id);
  if(e.finishedAt&&Date.parse(e.finishedAt)<Date.parse(e.createdAt))fail('BUDGET_CORRUPT');
  if(e.status==='settled'&&(!Number.isFinite(e.chargeCeilingCny)||e.chargeCeilingCny>e.reservedCny||!e.finishedAt))fail('BUDGET_CORRUPT');
  if(e.scope&&e.scope.taskId!==e.taskId)fail('BUDGET_CORRUPT');
  if(e.dispatchedAt&&Date.parse(e.dispatchedAt)<Date.parse(e.createdAt))fail('BUDGET_CORRUPT');
  if(e.status!=='released'&&e.releaseReason!==undefined)fail('BUDGET_CORRUPT');
  if(e.status==='reserved'&&(e.chargeCeilingCny!==undefined||e.finishedAt!==undefined||e.usage!==undefined||e.accounting!==undefined))fail('BUDGET_CORRUPT');
  if(e.status==='released'&&(!e.finishedAt||!e.releaseReason||e.phase!=='prepared'||e.legacy||e.chargeCeilingCny!==undefined||e.usage!==undefined||e.accounting!==undefined))fail('BUDGET_CORRUPT');
  if(e.accounting){const d=e.accounting.usageDetail;if(!e.usage||d.inputTokens+d.cacheReadTokens+d.cacheWriteTokens!==e.usage.prompt_tokens||d.outputTokens!==e.usage.completion_tokens||e.accounting.estimateCny>e.chargeCeilingCny)fail('BUDGET_CORRUPT');}
 }
 if(state.version>=2){const corrected=new Set();for(const r of state.reconciliations){const e=state.entries.find(x=>x.id===r.entryId);if(!e||corrected.has(r.entryId)||r.chargeCny>originalCharge(e)||e.status!=='settled')fail('BUDGET_CORRUPT');corrected.add(r.entryId);}}
 return state;
}
const originalCharge=e=>e.status==='released'?0:e.status==='settled'?e.chargeCeilingCny:e.reservedCny;
const maxMicro=BigInt(Number.MAX_SAFE_INTEGER);
// Read each persisted decimal separately. Rounding a binary floating-point sum
// can invent a micro-CNY and reject an otherwise exact-at-limit reservation.
function toMicro(value,roundUp=true){
 if(!Number.isFinite(value)||value<0)fail('BUDGET_AMOUNT_OVERFLOW');
 const [mantissa,exponent='0']=value.toString().split('e'),[whole,fraction='']=mantissa.split('.');
 const digits=BigInt(whole+fraction),scale=6+Number(exponent)-fraction.length;
 const divisor=scale<0?10n**BigInt(-scale):1n;
 const result=scale>=0?digits*10n**BigInt(scale):(digits+(roundUp?divisor-1n:0n))/divisor;
 if(result>maxMicro)fail('BUDGET_AMOUNT_OVERFLOW');return result;
}
function fromMicro(value){if(value<0n||value>maxMicro)fail('BUDGET_AMOUNT_OVERFLOW');return Number(value)/1e6;}
export function summarizeBudget(state,taskId){
 const corrections=new Map((state.reconciliations??[]).map(x=>[x.entryId,x.chargeCny]));
 const charge=e=>corrections.get(e.id)??originalCharge(e);
 const sum=es=>es.reduce((n,e)=>n+toMicro(charge(e)),0n);
 const accounted=toMicro(state.initialSpent)+sum(state.entries),remaining=toMicro(state.limit,false)-accounted;
 return {accountedCny:fromMicro(accounted),remainingCny:fromMicro(remaining>0n?remaining:0n),settledCny:fromMicro(sum(state.entries.filter(e=>e.status==='settled'))),reservedCny:fromMicro(sum(state.entries.filter(e=>e.status==='reserved'))),legacyUnverifiedCny:fromMicro((state.version===1||state.legacyInitialSpent?toMicro(state.initialSpent):0n)+sum(state.entries.filter(e=>(state.version===1||e.legacy)&&!corrections.has(e.id)))),...(taskId?{taskId,taskAccountedCny:fromMicro(sum(state.entries.filter(e=>e.taskId===taskId))),taskLimitCny:state.taskLimits?.[taskId]??null}:{})};
}
function sessionView(state,rootSessionId){
 const policy=ownValue(state.sessionLimits,rootSessionId)??state.sessionDefault??defaultSessionPolicy();
 const corrections=new Map((state.reconciliations??[]).map(row=>[row.entryId,row.chargeCny]));
 const sum=rows=>rows.reduce((total,row)=>total+toMicro(corrections.get(row.id)??originalCharge(row)),0n);
 const rows=state.entries.filter(row=>row.scope?.rootSessionId===rootSessionId),accounted=sum(rows);
 const remaining=toMicro(policy.limitCny,false)-accounted;
 return {version:1,rootSessionId,limitCny:policy.limitCny,revision:policy.revision,usesDefault:!ownValue(state.sessionLimits,rootSessionId),accountedUpperBoundCny:fromMicro(accounted),settledCny:fromMicro(sum(rows.filter(row=>row.status==='settled'))),reservedCny:fromMicro(sum(rows.filter(row=>row.status==='reserved'))),remainingCny:fromMicro(remaining>0n?remaining:0n),unattributedSharedCny:fromMicro(toMicro(state.initialSpent)+sum(state.entries.filter(row=>!row.scope?.rootSessionId))),isProviderInvoice:false};
}
export async function replaceLedgerFile(from,to,replace=rename){for(let attempt=0;;attempt++){try{return await replace(from,to);}catch(error){if(attempt>=3||!['EPERM','EBUSY'].includes(error.code))throw error;await pause(25*(attempt+1));}}}
export class Budget {
 constructor(path,{limit,initialSpent=0,taskLimitCny=5}){if(!isAbsolute(path)||!cap.safeParse(limit).success||!amount.safeParse(initialSpent).success||!cap.safeParse(taskLimitCny).success)fail('BUDGET_CONFIG');this.path=path;this.limit=limit;this.initialSpent=initialSpent;this.taskLimitCny=taskLimitCny;}
 empty(){return {version:3,currency:'CNY',limit:this.limit,initialSpent:this.initialSpent,entries:[],taskLimits:{},childBindings:{},reconciliations:[],legacyInitialSpent:this.initialSpent>0,sessionDefault:defaultSessionPolicy(),sessionLimits:{}};}
 async #load(fresh){
  let bytes;try{bytes=await readFile(this.path);}catch(error){
   if(error.code!=='ENOENT')fail('BUDGET_CORRUPT','Budget ledger cannot be read; no budget reset was performed');
   if(this.observedLedger||fresh===false||fresh!==true&&await hasBudgetHistory(this.path))missingLedger();
   return {state:this.empty(),bytes:null};
  }
  this.observedLedger=true;
  try{return {state:parseBudgetLedger(JSON.parse(bytes)),bytes};}
  catch{fail('BUDGET_CORRUPT','Budget ledger cannot be read; no budget reset was performed');}
 }
 async read(){return (await this.#load()).state;}
 async change(fn,{beforeCommit}={}){
  await mkdir(dirname(this.path),{recursive:true});let primaryFailure=false,published=false;const lock=await acquireBudgetLock(this.path),temp=`${this.path}.${randomUUID()}.tmp`;
  try{
   await lock.assertOwned();const observed=await this.#load(lock.fresh);let state=observed.state;
   if(state.version<3){
    const sourceVersion=state.version;const bytes=observed.bytes,hash=sha(bytes),backup=`${this.path}.v${sourceVersion}-${hash}.checkpoint`;
    let f;try{f=await open(backup,'wx');await f.writeFile(bytes);await f.sync();}catch(e){if(e.code!=='EEXIST')throw e;if(sha(await readFile(backup))!==hash)fail('BUDGET_CHECKPOINT_MISMATCH');}finally{await f?.close();}
    if(sourceVersion===1)state={...state,version:2,entries:state.entries.map(e=>({...e,legacy:true,...e.status==='reserved'?{phase:'unknown'}:{}})),taskLimits:{},childBindings:{},reconciliations:[],legacyInitialSpent:state.initialSpent>0,migration:{sourceVersion:1,sourceSha256:hash,createdAt:new Date().toISOString()}};
    state={...state,version:3,sessionDefault:defaultSessionPolicy(),sessionLimits:{},sessionMigration:{sourceVersion,sourceSha256:hash,createdAt:new Date().toISOString()}};
   }
   state.limit=Math.min(state.limit,this.limit);state.initialSpent=Math.max(state.initialSpent,this.initialSpent);
   const result=await fn(state);parseBudgetLedger(state);await lock.assertOwned();
   const f=await open(temp,'wx');try{await f.writeFile(JSON.stringify(state,null,2)+'\n');await f.sync();}finally{await f.close();}
   await lock.assertOwned();await replaceLedgerFile(temp,this.path,async(from,to)=>{await lock.assertOwned();await assertLedgerUnchanged(this.path,observed.bytes);beforeCommit?.();return rename(from,to);});published=true;this.observedLedger=true;return structuredClone(result);
  }catch(error){primaryFailure=true;throw error;}
  finally{
   const errors=[];
   try{await unlink(temp);}catch(error){if(error.code!=='ENOENT')errors.push(error);}
   try{await lock.release();}catch(error){errors.push(error);}
   if(errors.length){
    // Keep one bounded in-memory diagnostic; never mutate the original thrown
    // value, which may be frozen or a primitive. Published data stays published.
    this.lastCleanupFailure=Object.freeze({published,primaryFailure,errors:Object.freeze(errors)});
    if(!primaryFailure)throw errors[0];
   }
  }
 }
 async init(){await this.change(()=>null);}
 async snapshot(taskId){const state=await this.read();state.limit=Math.min(state.limit,this.limit);state.initialSpent=Math.max(state.initialSpent,this.initialSpent);return {...state,...summarizeBudget(state,taskId)};}
 async sessionSnapshot(rootSessionId){if(!id.safeParse(rootSessionId).success)fail('BUDGET_SETTINGS_INPUT');const state=await this.read();state.initialSpent=Math.max(state.initialSpent,this.initialSpent);return sessionView(state,rootSessionId);}
 async sessionDefaultsSnapshot(){const state=await this.read();return structuredClone(state.sessionDefault??defaultSessionPolicy());}
 async setSessionLimit(rootSessionId,limitCny,options){
  const {expectedRevision,beforeCommit}=settingInput(rootSessionId,limitCny,options);
  return this.change(state=>{beforeCommit?.();const current=sessionView(state,rootSessionId);if(current.revision!==expectedRevision)fail('BUDGET_SETTINGS_CONFLICT');const policy={limitCny,revision:nextRevision(current.revision)};Object.defineProperty(state.sessionLimits,rootSessionId,{value:policy,writable:true,enumerable:true,configurable:true});return sessionView(state,rootSessionId);},{beforeCommit});
 }
 async setSessionDefaultLimit(limitCny,options){
  const {expectedRevision,beforeCommit}=settingInput(null,limitCny,options,false);
  return this.change(state=>{beforeCommit?.();if(state.sessionDefault.revision!==expectedRevision)fail('BUDGET_SETTINGS_CONFLICT');state.sessionDefault={limitCny,revision:nextRevision(state.sessionDefault.revision)};return state.sessionDefault;},{beforeCommit});
 }
 /** Explicitly cap one task without changing the default policy for other background work. */
 async bindTaskLimit(taskId,limitCny,options={}){
  if(!id.safeParse(taskId).success||!cap.safeParse(limitCny).success||!options||typeof options!=='object'||Object.keys(options).some(k=>k!=='beforeCommit')||(options.beforeCommit!==undefined&&typeof options.beforeCommit!=='function'))fail('BUDGET_TASK_LIMIT_INPUT');
  const {beforeCommit}=options;
  return this.change(state=>{beforeCommit?.();const effective=Math.min(ownValue(state.taskLimits,taskId)??limitCny,limitCny,state.limit);Object.defineProperty(state.taskLimits,taskId,{value:effective,writable:true,enumerable:true,configurable:true});return {taskId,limitCny:effective};},{beforeCommit});
 }
 async reserve(requestId,reservedCny,meta={}){return this.change(state=>{
  if(!id.safeParse(requestId).success||!(reservedCny>0&&Number.isFinite(reservedCny)))fail('BUDGET_ESTIMATE');
  const allowed=new Set(['model','inputSha256','taskId','scope']);if(Object.keys(meta).some(k=>!allowed.has(k)))fail('BUDGET_METADATA');
  if(state.entries.some(e=>e.id===requestId))fail('DUPLICATE_REQUEST');
  const taskId=meta.taskId??meta.scope?.taskId??'background:unattributed';if(!id.safeParse(taskId).success||(meta.scope&&meta.scope.taskId!==taskId))fail('BUDGET_SCOPE_CONFLICT');
  const configuredTaskLimit=meta.scope?.kind==='background'||(!meta.scope&&!meta.taskId)?state.limit:this.taskLimitCny;
  const taskLimit=Math.min(Object.hasOwn(state.taskLimits,taskId)?state.taskLimits[taskId]:configuredTaskLimit,configuredTaskLimit),totals=summarizeBudget(state,taskId),reserved=money(reservedCny);
  if(toMicro(totals.accountedCny)+toMicro(reserved)>toMicro(state.limit,false))fail('BUDGET_EXCEEDED',`cumulative budget: limit ${state.limit.toFixed(6)} CNY; accounted upper bound ${totals.accountedCny.toFixed(6)}; legacy unverified ${totals.legacyUnverifiedCny.toFixed(6)}; remaining ${totals.remainingCny.toFixed(6)}; requested reservation ${reserved.toFixed(6)}. This is local accounting, not your provider invoice. No model request was dispatched.`);
  if(toMicro(totals.taskAccountedCny)+toMicro(reserved)>toMicro(taskLimit,false))fail('TASK_BUDGET_EXCEEDED',`task budget: limit ${taskLimit.toFixed(6)} CNY; accounted ${totals.taskAccountedCny.toFixed(6)}; requested reservation ${reserved.toFixed(6)}. Other tasks retain their own allowance; cumulative protection remains active.`);
  if(meta.scope?.rootSessionId){const session=sessionView(state,meta.scope.rootSessionId);if(toMicro(session.accountedUpperBoundCny)+toMicro(reserved)>toMicro(session.limitCny,false))fail('SESSION_BUDGET_EXCEEDED',`session budget: limit ${session.limitCny.toFixed(6)} CNY; accounted upper bound ${session.accountedUpperBoundCny.toFixed(6)}; remaining ${session.remainingCny.toFixed(6)}; requested reservation ${reserved.toFixed(6)}. Adjust this session's monetary guard in settings if intended. Prior spending and the shared/task guards remain in force; no model request was dispatched.`);}
  Object.defineProperty(state.taskLimits,taskId,{value:taskLimit,writable:true,enumerable:true,configurable:true});const row=entry.parse({id:requestId,reservedCny:reserved,status:'reserved',phase:'prepared',createdAt:new Date().toISOString(),...meta,taskId});state.entries.push(row);return row;
 });}
 async markDispatched(requestId){return this.change(state=>{const e=state.entries.find(e=>e.id===requestId);if(!e||e.status!=='reserved'||e.phase!=='prepared')fail('UNKNOWN_RESERVATION');e.phase='dispatched';e.dispatchedAt=new Date().toISOString();});}
 async markUnknown(requestId){return this.change(state=>{const e=state.entries.find(e=>e.id===requestId);if(e?.status==='reserved'&&e.phase!=='prepared')e.phase='unknown';});}
 async releasePrepared(requestId,reason){return this.change(state=>{const e=state.entries.find(e=>e.id===requestId);if(!e||e.status!=='reserved')fail('UNKNOWN_RESERVATION');if(e.phase!=='prepared'||e.legacy)fail('BUDGET_OUTCOME_UNKNOWN','A dispatched or legacy request requires reconciliation; cancellation alone does not prove no charge');Object.assign(e,{status:'released',releaseReason:id.parse(reason),finishedAt:new Date().toISOString()});});}
 async settle(requestId,chargeCny,usageValue,accountingValue){return this.change(state=>{const e=state.entries.find(e=>e.id===requestId);if(!e||e.status!=='reserved')fail('UNKNOWN_RESERVATION');if(!amount.safeParse(chargeCny).success)fail('BUDGET_USAGE_INVALID');const rounded=money(chargeCny);if(rounded>e.reservedCny)fail('BUDGET_ESTIMATE_EXCEEDED');const parsed=usage.parse(usageValue);Object.assign(e,{status:'settled',chargeCeilingCny:rounded,usage:parsed,finishedAt:new Date().toISOString(),...(accountingValue?{accounting:accounting.parse(accountingValue)}:{})});return e;});}
 async getChildBinding(sessionId){const state=await this.read();return structuredClone(state.childBindings&&Object.hasOwn(state.childBindings,sessionId)?state.childBindings[sessionId]:null);}
 async bindChild(sessionId,value){return this.change(state=>{id.parse(sessionId);const parsed=scope.parse(value),prior=Object.hasOwn(state.childBindings,sessionId)?state.childBindings[sessionId]:null;if(prior&&JSON.stringify(prior)!==JSON.stringify(parsed))fail('BUDGET_SCOPE_CONFLICT');Object.defineProperty(state.childBindings,sessionId,{value:parsed,writable:true,enumerable:true,configurable:true});return parsed;});}
 async reconcile(entryId,input){return this.change(state=>{const e=state.entries.find(e=>e.id===entryId);const parsed=z.object({chargeCny:amount,evidence}).strict().parse(input);if(!e||e.status!=='settled'||state.reconciliations.some(r=>r.entryId===entryId)||parsed.chargeCny>originalCharge(e))fail('BUDGET_RECONCILIATION_INVALID');const record={id:randomUUID(),entryId,...parsed,createdAt:new Date().toISOString()};state.reconciliations.push(record);return record;});}
}
