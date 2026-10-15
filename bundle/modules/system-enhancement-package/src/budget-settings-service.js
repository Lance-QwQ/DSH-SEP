import {z} from 'zod';
import {fail} from './errors.js';

const limit=z.number().finite().min(.01).max(1000000).refine(n=>Math.round(n*100)/100===n);
const revision=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const sessionId=z.string().min(1).max(1000);
const schemas={
 list:z.object({}).strict(),
 get:z.object({sessionId}).strict(),
 update:z.object({sessionId,limitCny:limit,expectedRevision:revision}).strict(),
 updateDefault:z.object({limitCny:limit,expectedRevision:revision}).strict(),
};

/** Local native-settings controls only. Never registered as an Agent tool.
 * Session IDs come from this Profile's logical session corpus, not caller paths.
 * Listing uses headers and already-live title projections, without loading persisted message bodies.
 */
export function createBudgetSettingsService({ctx,budget,signal,track=work=>work,runAccess=fn=>fn(),prepareBudget,taskLimitCny=5}){
 const available=()=>Boolean(budget&&(ctx.get('sessionQuery')?.listSessions||ctx.get('sessions')?.list));
 const check=request=>{if(signal?.aborted)fail('DISPOSED');if(request?.aborted)fail('ABORTED');};
 const sessions=async request=>{
  const query=ctx.get('sessionQuery'),live=ctx.get('sessions');
  const records=query?.listSessions?await query.listSessions(request):(live?.list?.()??[]).map(s=>({header:s.header}));
  check(request);
  return records.filter(r=>r.header?.origin!=='subagent'&&typeof r.header?.id==='string')
   .map(r=>{const id=r.header.id,live=ctx.get('sessions')?.get?.(id);const title=live?ctx.get('sessionTitle')?.get?.(live)?.title:undefined;return {id,label:typeof title==='string'&&title.trim()?title.trim().slice(0,200)+' · '+id:id};});
 };
 const operation=(name,raw,options={})=>track(Promise.resolve().then(()=>runAccess(async()=>{
  check(options.signal);
  const result=schemas[name].safeParse(raw);if(!result.success)fail('BUDGET_SETTINGS_INPUT');
  if(!available()){
   if(name==='list')return {version:1,available:false,reason:'BUDGET_SETTINGS_UNAVAILABLE',sessions:[]};
   fail('BUDGET_SETTINGS_UNAVAILABLE');
  }
  await prepareBudget?.();check(options.signal);
   const input=result.data,beforeCommit=()=>check(options.signal);
  if(name==='list'){
   const rows=await sessions(options.signal),defaults=await budget.sessionDefaultsSnapshot(),state=await budget.snapshot();
   check(options.signal);
   return {version:1,available:true,reason:null,defaults,shared:{limitCny:state.limit,accountedUpperBoundCny:state.accountedCny,remainingCny:state.remainingCny},taskLimitCny,sessions:rows};
  }
  if(name==='updateDefault')return budget.setSessionDefaultLimit(input.limitCny,{expectedRevision:input.expectedRevision,beforeCommit});
  if(!(await sessions(options.signal)).some(s=>s.id===input.sessionId))fail('BUDGET_SETTINGS_SESSION');
  beforeCommit();
  if(name==='update')return budget.setSessionLimit(input.sessionId,input.limitCny,{expectedRevision:input.expectedRevision,beforeCommit});
  return budget.sessionSnapshot(input.sessionId);
 })).catch(error=>{
  if(error?.code==='BUDGET_SESSION_CONFLICT'||error?.code==='SESSION_BUDGET_CONFLICT')fail('BUDGET_SETTINGS_CONFLICT');
  throw error;
 }));
 return Object.fromEntries(Object.keys(schemas).map(name=>[name,(raw={},options)=>operation(name,raw,options)]));
}
