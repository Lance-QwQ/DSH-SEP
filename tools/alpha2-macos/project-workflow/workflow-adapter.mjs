// Trusted user control plane only. This module installs no tool or JSON route.
import {createHash,randomUUID} from 'node:crypto';
import {lstat,realpath} from 'node:fs/promises';
import {isAbsolute} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
const error=code=>Object.assign(new Error(code),{code});
const fail=code=>{throw error(code);};
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const copy=value=>structuredClone(value);
const exact=(value,keys)=>value&&Object.getPrototypeOf(value)===Object.prototype&&Object.keys(value).sort().join('\0')===[...keys].sort().join('\0');
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const opaque=value=>typeof value==='string'&&value.length>0&&value.length<=256&&!/[\x00-\x1f\x7f]/u.test(value);
const birth=stat=>`${stat.dev}:${stat.ino}`;
const safeFailure=failure=>error(/^(?:SEP|FS)_[A-Z0-9_]{1,90}$/.test(failure?.code??'')?failure.code:'SEP_MAC_WORKFLOW_FAILED');
function shape(value,keys){if(!exact(value,keys))fail('SEP_MAC_WORKFLOW_INPUT');}
function planInput(value){shape(value,['planHash']);if(!digest(value.planHash))fail('SEP_MAC_WORKFLOW_INPUT');}
function boundedPlans(plans){
 if(!Array.isArray(plans)||plans.length>256)fail('SEP_MAC_WORKFLOW_REVIEW_LIMIT');
 const result=[];let bytes=2;
 for(const plan of plans){
  if(!Array.isArray(plan.changes)||plan.changes.length>256)fail('SEP_MAC_WORKFLOW_REVIEW_LIMIT');
  const changes=plan.changes.map(change=>{
   if(typeof change.path!=='string'||change.path.length>2048||!['created','deleted','modified'].includes(change.kind))fail('SEP_MAC_WORKFLOW_REVIEW_LIMIT');
   return {path:change.path,kind:change.kind};
  });
  const value={planHash:plan.planHash,kind:plan.kind,createdAt:plan.createdAt,expired:plan.expired,changes};
  bytes+=Buffer.byteLength(JSON.stringify(value))+(result.length?1:0);
  if(bytes>262144)fail('SEP_MAC_WORKFLOW_REVIEW_LIMIT');result.push(value);
 }
 return result;
}

export async function openProjectWorkflow({projectId,ownerGeneration,source,controller,project,authority,closeDeadlineMs=5000}={}){
 if(!opaque(projectId)||!opaque(ownerGeneration)||typeof source!=='string'||!isAbsolute(source)||!controller||['status','current','plans','resume','review','commit','discard','restore','recover','close','whenClosed'].some(k=>typeof controller[k]!=='function')||!project||['inspectPlan','listGenerations'].some(k=>typeof project[k]!=='function')||!authority||typeof authority.assertDocument!=='function'||typeof authority.consumeConfirmation!=='function'||!Number.isSafeInteger(closeDeadlineMs)||closeDeadlineMs<1||closeDeadlineMs>30000)fail('SEP_MAC_WORKFLOW_CONFIG');
 const initial=await lstat(source,{bigint:true});if(!initial.isDirectory()||initial.isSymbolicLink()||await realpath(source)!==source)fail('SEP_MAC_WORKFLOW_SOURCE_INVALID');const sourceIdentity=birth(initial);
 let phase='open',tail=Promise.resolve(),pending=0,reviewed,dispatched=false,closeAttempt,terminal,watching=false,closedResolve;
 const lifetime=new AbortController(),closed=new Promise(resolve=>{closedResolve=resolve;});
 const available=()=>{if(phase!=='open')fail('SEP_MAC_WORKFLOW_CLOSED');};
 const invalidate=()=>{if(reviewed){reviewed.valid=false;reviewed.abort.abort();reviewed=undefined;}};
 async function currentDocument(context){
  available();const document=await authority.assertDocument(context);available();
  if(!document||document.ownerGeneration!==ownerGeneration||!(opaque(document.windowId)||Number.isSafeInteger(document.windowId)&&document.windowId>0)||!opaque(document.documentGeneration))fail('SEP_MAC_WORKFLOW_CALLER_INVALID');
  try{if(await realpath(source)!==source||birth(await lstat(source,{bigint:true}))!==sourceIdentity)fail('SEP_MAC_WORKFLOW_SOURCE_INVALID');}catch{fail('SEP_MAC_WORKFLOW_SOURCE_INVALID');}
  available();return {windowId:document.windowId,documentGeneration:document.documentGeneration,ownerGeneration};
 }
 async function recheck(context,document){if(!isDeepStrictEqual(await currentDocument(context),document))fail('SEP_MAC_WORKFLOW_CALLER_INVALID');}
 function serial(context,work){
  try{available();}catch(e){return Promise.reject(e);}
  pending++;
  const result=tail.then(async()=>{const document=await currentDocument(context);return work(document);}).catch(e=>{throw safeFailure(e);}).finally(()=>{pending--;});
  tail=result.catch(()=>{});return result;
 }
 function validReview(record){
  available();
  if(!record||!record.valid||record!==reviewed||record.abort.signal.aborted||Date.now()>=record.value.binding.expiresAt)fail('SEP_MAC_WORKFLOW_APPROVAL_STALE');
 }
 async function inspect(planHash,signal){return project.inspectPlan({planHash,signal});}
 function rememberClosed(receipt){
  if(receipt?.status!=='pass'||receipt.resourcesConfirmedReleased!==true||pending!==0)return false;
  phase='closed';terminal=Object.freeze({status:'pass',resourcesConfirmedReleased:true,pending:0});closedResolve(terminal);return true;
 }
 function close(){
  if(terminal)return Promise.resolve(terminal);if(closeAttempt)return closeAttempt;
  phase='draining';lifetime.abort();invalidate();
  let inner;try{inner=Promise.resolve(controller.close());}catch(e){inner=Promise.reject(e);}
  if(!watching){watching=true;Promise.all([tail,controller.whenClosed()]).then(([,receipt])=>rememberClosed(receipt),()=>{});}
  const flow=Promise.all([tail,inner]).then(([,receipt])=>{
   if(terminal||rememberClosed(receipt))return terminal;
   phase='blocked';return {status:'blocked',code:/^(?:SEP|FS)_[A-Z0-9_]{1,90}$/.test(receipt?.code??'')?receipt.code:'SEP_MAC_WORKFLOW_CLOSE_BLOCKED',resourcesConfirmedReleased:false,pending};
  }).catch(e=>{phase='blocked';return {status:'blocked',code:safeFailure(e).code,resourcesConfirmedReleased:false,pending};});
  let timer;const attempt=new Promise(resolve=>{timer=setTimeout(()=>resolve({status:'blocked',code:'SEP_MAC_WORKFLOW_CLOSE_DEADLINE',resourcesConfirmedReleased:false,pending}),closeDeadlineMs);flow.then(receipt=>{clearTimeout(timer);resolve(receipt);});});
  closeAttempt=attempt;attempt.finally(()=>{if(closeAttempt===attempt)closeAttempt=undefined;});return attempt;
 }
 return Object.freeze({
  status:(input,context)=>serial(context,async document=>{
   shape(input,[]);let current,recoveryRequired=false;
   try{const value=await controller.current();current={generation:value.generation,sequence:value.sequence};}catch(e){if(e.code!=='SEP_PROJECT_RECOVERY_REQUIRED')throw e;recoveryRequired=true;current=null;}
   const state=controller.status();await recheck(context,document);
   return {projectId,phase,admissionOpen:phase==='open',current,recoveryRequired,needsSelection:state.needsSelection,hasPendingPlan:state.hasPendingPlan};
  }),
  plans:(input,context)=>serial(context,async document=>{
   shape(input,[]);const plans=boundedPlans(await controller.plans());await recheck(context,document);return plans;
  }),
  select:(input,context)=>serial(context,async document=>{
   planInput(input);invalidate();const state=controller.status();
   if(state.hasPendingPlan&&!state.needsSelection){const current=await controller.review();if(current.planHash!==input.planHash)fail('SEP_PROJECT_BUSY');await recheck(context,document);return {status:'pass',planHash:input.planHash};}
   await recheck(context,document);return controller.resume(input);
  }),
  review:(input,context)=>serial(context,async document=>{
   planInput(input);invalidate();const selected=await controller.review();if(selected.planHash!==input.planHash)fail('SEP_PROJECT_STALE_PLAN');
   const inspection=await inspect(input.planHash,lifetime.signal);await recheck(context,document);
   const binding={projectId,ownerGeneration,windowId:document.windowId,documentGeneration:document.documentGeneration,...inspection.plan,expiresAt:Date.now()+300000};
   const value={reviewId:randomUUID(),binding,changes:inspection.changes,diff:inspection.diff,coverage:inspection.coverage};value.reviewSha256=hash(value);
   reviewed={valid:true,abort:new AbortController(),value:copy(value),inspectionSha256:hash(inspection),document};return copy(value);
  }),
  commit:(input,context)=>serial(context,async document=>{
   shape(input,['reviewId','planHash','approval']);if(!opaque(input.reviewId)||!digest(input.planHash)||!input.approval||typeof input.approval!=='object')fail('SEP_MAC_WORKFLOW_APPROVAL_INVALID');
   const record=reviewed;validReview(record);
   if(input.reviewId!==record.value.reviewId||input.planHash!==record.value.binding.planHash||!isDeepStrictEqual(document,record.document))fail('SEP_MAC_WORKFLOW_APPROVAL_STALE');
   const signal=AbortSignal.any([lifetime.signal,record.abort.signal]);let inspection;
   try{inspection=await inspect(input.planHash,signal);}catch(e){invalidate();if(['SEP_PROJECT_PLAN_INVALID','SEP_PROJECT_STALE_PLAN'].includes(e.code))fail('SEP_MAC_WORKFLOW_APPROVAL_STALE');throw e;}
   validReview(record);if(hash(inspection)!==record.inspectionSha256){invalidate();fail('SEP_MAC_WORKFLOW_APPROVAL_STALE');}
   await recheck(context,document);validReview(record);
   const accepted=await authority.consumeConfirmation(input.approval,{...record.value.binding,reviewId:record.value.reviewId,reviewSha256:record.value.reviewSha256},context);
   await recheck(context,document);validReview(record);
   if(accepted?.accepted!==true)fail('SEP_MAC_WORKFLOW_APPROVAL_INVALID');
   const omitted=record.value.coverage.omitted.length>0;invalidate();
   if(omitted&&accepted.omissionsAcknowledged!==true)fail('SEP_MAC_WORKFLOW_OMISSIONS_UNACKNOWLEDGED');
   dispatched=true;try{return await controller.commit({planHash:input.planHash});}finally{dispatched=false;}
  }),
  discard:(input,context)=>serial(context,async document=>{planInput(input);invalidate();await recheck(context,document);return controller.discard(input.planHash);}),
  restore:(input,context)=>serial(context,async document=>{shape(input,['generation']);if(!Number.isSafeInteger(input.generation)||input.generation<1)fail('SEP_MAC_WORKFLOW_INPUT');invalidate();await recheck(context,document);return controller.restore(input.generation);}),
  recover:(input,context)=>serial(context,async document=>{shape(input,[]);invalidate();await recheck(context,document);return controller.recover();}),
  generations:(input,context)=>serial(context,async document=>{shape(input,['after','limit']);if(!Number.isSafeInteger(input.after)||input.after<0||!Number.isSafeInteger(input.limit)||input.limit<1||input.limit>32)fail('SEP_MAC_WORKFLOW_INPUT');const value=await project.listGenerations(input);await recheck(context,document);return value;}),
  async cancel(input,context){try{shape(input,['reviewId']);if(!opaque(input.reviewId))fail('SEP_MAC_WORKFLOW_INPUT');await currentDocument(context);if(dispatched)fail('SEP_MAC_WORKFLOW_COMMIT_IN_FLIGHT');if(!reviewed||reviewed.value.reviewId!==input.reviewId)fail('SEP_MAC_WORKFLOW_APPROVAL_STALE');invalidate();return {status:'pass'};}catch(e){throw safeFailure(e);}},
  close,whenClosed:()=>closed,
 });
}
