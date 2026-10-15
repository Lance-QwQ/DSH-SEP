import {randomUUID} from 'node:crypto';
import {sessionEvents} from '../session-events.js';

const categories=['text','syntax','runtime'];
const outcome=status=>status==='pass'?'pass':status==='fail'?'fail':status==='blocked'||status==='skipped'?'skipped':'not_covered';
const codeOf=error=>typeof error?.code==='string'&&/^SC_[A-Z_]+$/.test(error.code)?error.code:'SC_OPERATION_FAILED';

/** Summarize only engine-produced candidate metadata; ordinary tool results and model prose are not evidence.
 * @param options.clock - Clock used to invalidate expired in-memory plans.
 * @returns A recorder for suite_change and a non-waking turn-stop notice listener.
 */
export function createSafeChangeCloseout({clock=Date.now}={}){
 const sessions=new WeakMap();
 function stateOf(agent,turn){
  const session=agent?.session;if(!session)return null;
  const currentTurn=turn??sessionEvents(session).findLast(event=>event.type==='turn/start')?.data.turn??0;
  let state=sessions.get(session);
  if(!state){state={turn:currentTurn,plans:new Map(),history:[],dirty:false,notice:null};sessions.set(session,state);}
  if(state.turn!==currentTurn){state.turn=currentTurn;state.history=[];state.dirty=false;state.notice=null;}
  return state;
 }
 function history(state,item){
  if(!state.history.some(prior=>JSON.stringify(prior)===JSON.stringify(item)))state.history.push(item);
 }
 function capture(result,prior){
  const receiptOnly=result.status==='committed'&&result.revision===undefined;
  const sameCandidate=prior?.candidateSha256===result.candidateSha256;
  const validation=receiptOnly&&sameCandidate?prior.validation:result.validation;
  return {
   id:result.id,path:result.path,status:result.status,
   revision:receiptOnly&&sameCandidate?prior.revision:result.revision??null,
   candidateSha256:result.candidateSha256??null,
   expiresAt:receiptOnly&&sameCandidate?prior.expiresAt:result.expiresAt??null,
   publication:result.status==='committed'?'committed':result.status==='uncertain'?'uncertain':'not_published',
   validation:validation?{revision:validation.revision,candidateSha256:validation.candidateSha256,publishEligible:validation.publishEligible===true,results:(validation.results??[]).map(row=>({kind:row.kind,category:row.category,status:row.status,...row.reason?{reason:row.reason}:{}}))}:null,
  };
 }
 function summarize(state){
  for(const [id,plan] of state.plans){
   if(plan.expiresAt!==null&&clock()>=plan.expiresAt){state.plans.delete(id);history(state,{id,action:'expire',status:'not_run',disposition:'skipped',code:'SC_PLAN_GONE',revision:plan.revision});}
  }
  const counts={pass:0,fail:0,skipped:0,not_covered:0};
  const candidates=[...state.plans.values()].map(plan=>{
   const validation=plan.validation,evidenceCurrent=!!validation&&validation.candidateSha256===plan.candidateSha256&&validation.revision===plan.revision&&Number.isInteger(plan.revision);
   const checks=evidenceCurrent?validation.results.filter(row=>categories.includes(row.category)).map(row=>({...row,disposition:outcome(row.status)})):[];
   for(const category of categories)if(!checks.some(row=>row.category===category))checks.push({kind:category,category,status:'not_run',disposition:'not_covered',reason:evidenceCurrent?'SC_EVIDENCE_NOT_AVAILABLE':'SC_CURRENT_CANDIDATE_NOT_VERIFIED'});
   for(const check of checks)counts[check.disposition]++;
   return {id:plan.id,path:plan.path,status:plan.status,revision:plan.revision,candidateSha256:plan.candidateSha256,publication:plan.publication,evidenceCurrent,publishEligible:evidenceCurrent&&validation.publishEligible,checks};
  });
  return {version:1,turn:state.turn,acceptance:'not_established',counts,candidates,history:structuredClone(state.history),scope:'suite_change candidate checks only; no runtime tests; publication and turn completion are not task acceptance'};
 }
 function record({agent,args,result}){
  const state=stateOf(agent);if(!state)return null;state.dirty=true;
  if(args.action==='cancel'){
   state.plans.delete(args.id);history(state,{id:args.id,action:'cancel',status:'not_run',disposition:'skipped',code:'SC_CANCELLED'});
  }else{
   const plans=args.action==='list'?result.plans:result.id?[result]:[];
   for(const result of plans??[]){
    const plan=capture(result,state.plans.get(result.id));state.plans.set(plan.id,plan);
    if(args.action==='verify'&&plan.validation?.candidateSha256===plan.candidateSha256&&plan.validation.revision===plan.revision){
     for(const check of plan.validation.results){const disposition=outcome(check.status);if(disposition==='fail'||disposition==='skipped')history(state,{id:plan.id,action:'verify',revision:plan.revision,kind:check.kind,status:check.status,disposition,...check.reason?{code:check.reason}:{}});}
    }
   }
  }
  return summarize(state);
 }
 function recordError({agent,args,error}){
  const state=stateOf(agent);if(!state)return null;state.dirty=true;const code=codeOf(error);
  if(code==='SC_PLAN_GONE'&&args?.id)state.plans.delete(args.id);
  const plan=state.plans.get(args?.id);
  if(plan&&args.action==='verify')plan.validation=null;
  if(plan&&args.action==='publish')plan.publication='unknown';
  history(state,{...args?.id?{id:args.id}:{},action:args?.action??'unknown',status:code==='SC_ABORTED'?'blocked':code==='SC_RUNTIME_NOT_CONFIGURED'?'not_run':'fail',disposition:['SC_ABORTED','SC_RUNTIME_NOT_CONFIGURED'].includes(code)?'skipped':'fail',code});
  return summarize(state);
 }
 function stop({agent,turn,signal}){
  const state=stateOf(agent,turn);if(!state?.dirty||signal?.aborted)return;
  const summary=summarize(state),fingerprint=JSON.stringify(summary);if(state.notice===fingerprint)return;
  const {pass,fail,skipped,not_covered}=summary.counts;
  agent.session.append('user/message',{id:randomUUID(),role:'user',content:[{type:'text',text:JSON.stringify({safeChangeCloseout:summary})}],source:{kind:'plugin:sep-safe-change',form:'notice',summary:`SEP 验证：通过 ${pass} / 失败 ${fail} / 跳过 ${skipped} / 未覆盖 ${not_covered}；本轮历史：失败 ${summary.history.filter(item=>item.disposition==='fail').length} / 跳过 ${summary.history.filter(item=>item.disposition==='skipped').length}；未确立任务验收通过`}}, {surfaceOp:'append'});
  state.notice=fingerprint;
 }
 return {record,recordError,stop};
}
