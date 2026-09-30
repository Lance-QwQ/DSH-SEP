import {randomUUID} from 'node:crypto';
import {sessionEvents} from '../session-events.js';

const error=code=>Object.assign(new Error(code),{code});
const fail=code=>{throw error(code);};
const abortCode=signal=>typeof signal?.reason?.code==='string'&&signal.reason.code.startsWith('SC_')?signal.reason.code:'SC_ABORTED';

/** Preserve exact current-turn direct text; only this module's own question may add a button grant.
 * @param exec - Trusted tool invocation carrying the caller and cancellation lifetime.
 * @param planHash - Engine-issued hash for this candidate revision.
 * @param options - Optional host-owned plan snapshot and user-question service.
 * @returns The confirmed hash, or a promise resolving to that hash after a matching answer.
 */
export function confirmation(exec,planHash,options){
 const session=exec.agent?.session;if(!session||session.header?.origin==='subagent')fail('SC_DIRECT_USER_REQUIRED');
 const events=sessionEvents(session),start=events.findLastIndex(e=>e.type==='turn/start');if(start<0)fail('SC_DIRECT_USER_REQUIRED');
 const msg=events.slice(start+1).findLast(e=>e.type==='user/message'&&e.data?.role==='user'&&e.data.source?.kind==='user')?.data;
 const body=msg?.content?.filter(c=>c.type==='text').map(c=>c.text).join('\n');
 if(options){
  const p=options.plan;
  if(p.planHash!==planHash)fail('SC_PLAN_CHANGED');
  if(Date.now()>=p.expiresAt)fail('SC_PLAN_GONE');
  if(p.status!=='verified'||p.validation?.publishEligible!==true)fail('SC_NOT_VERIFIED');
  if((options.signal??exec.signal)?.aborted)fail(abortCode(options.signal??exec.signal));
 }
 if(body?.trim()===`确认发布文件修改 ${planHash}`)return planHash;
 if(!options)fail('SC_CONFIRMATION_REQUIRED');
 return askConfirmation(exec,planHash,options);
}

/** Await one host-service answer, independently withdrawing on cancellation or plan expiry. */
async function askConfirmation(exec,planHash,{plan,userQuestions,signal=exec.signal}){
 if(typeof userQuestions?.ask!=='function')fail('SC_CONFIRMATION_UNAVAILABLE');
 const controller=new AbortController(),lifetime=signal?AbortSignal.any([signal,controller.signal]):controller.signal;
 const expiresAt=plan.expiresAt,questionId=randomUUID(),approve='确认发布此文件修改';
 const summary={id:plan.id,path:plan.path,revision:plan.revision,planHash,expiresAt,baselineSha256:plan.baselineSha256,candidateSha256:plan.candidateSha256,validation:plan.validation};
 const timer=setTimeout(()=>controller.abort(error('SC_PLAN_GONE')),Math.max(1,expiresAt-Date.now()));timer.unref();
 let onAbort;
 try{
  const cancelled=new Promise((_,reject)=>{onAbort=()=>reject(error(abortCode(lifetime)));lifetime.addEventListener('abort',onAbort,{once:true});if(lifetime.aborted)onAbort();});
  const request=Promise.resolve().then(()=>{
   if(lifetime.aborted)fail(abortCode(lifetime));
   return userQuestions.ask({agent:exec.agent,signal:lifetime,questions:[{id:questionId,question:'确认发布已经 review 的这一版文件修改？',header:'文件发布确认',detail:'请先通过 suite_change review 检查实际修改。此摘要仅列出文件、指纹和验证覆盖范围，不表示全文已经审阅。确认仅允许这一次文件发布，不包含部署或 GitHub 发布。\n\n```json\n'+JSON.stringify(summary,null,2)+'\n```',options:[{label:approve},{label:'取消'}],intent:{kind:'plan-review',approve}}]});
  });
  let reply;
  try{reply=await Promise.race([request,cancelled]);}
  catch(reason){
   if(lifetime.aborted)fail(abortCode(lifetime));
   if(reason?.code==='ASK_CANCELLED')fail('SC_CONFIRMATION_CANCELLED');
   if(reason?.code==='ASK_ABORTED')fail('SC_ABORTED');
   fail('SC_CONFIRMATION_UNAVAILABLE');
  }
  if(lifetime.aborted)fail(abortCode(lifetime));
  if(Date.now()>=expiresAt)fail('SC_PLAN_GONE');
  const answers=reply?.answers,item=Array.isArray(answers)&&answers.length===1?answers[0]:undefined;
  if(item?.id!==questionId||!Array.isArray(item.selected)||item.selected.length!==1||item.selected[0]!==approve||item.custom!==undefined)fail('SC_CONFIRMATION_REJECTED');
  return planHash;
 }finally{clearTimeout(timer);lifetime.removeEventListener('abort',onAbort);}
}

/** Own process-local waits; no returned tool text or persisted record can recreate a grant.
 * @param options.getQuestions - Read the optional host user-question service for each request.
 * @returns Wait registration, invalidation and teardown methods for this plugin instance.
 */
export function createConfirmations({getQuestions}){
 const pending=new Map();let closed=false;
 return {
  request(exec,plan){
   if(closed)return Promise.reject(error('SC_CLOSED'));
   if(pending.has(plan.id))return Promise.reject(error('SC_CONFIRMATION_PENDING'));
   const controller=new AbortController(),signal=exec.signal?AbortSignal.any([exec.signal,controller.signal]):controller.signal;
   const entry={controller};pending.set(plan.id,entry);
   entry.done=Promise.resolve().then(()=>confirmation(exec,plan.planHash,{plan,userQuestions:getQuestions(),signal})).finally(()=>{if(pending.get(plan.id)===entry)pending.delete(plan.id);});
   return entry.done;
  },
  invalidate(id,code='SC_PLAN_CHANGED'){pending.get(id)?.controller.abort(error(code));},
  close(){closed=true;for(const entry of pending.values())entry.controller.abort(error('SC_CLOSED'));},
  async idle(){await Promise.allSettled([...pending.values()].map(entry=>entry.done));},
 };
}
