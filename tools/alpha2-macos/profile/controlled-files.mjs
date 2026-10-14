import {constants} from 'node:fs';
import {lstat,open,realpath} from 'node:fs/promises';
import {isAbsolute,resolve,join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
const fail=code=>{throw Object.assign(Error(code),{code});};
const hash=value=>createHash('sha256').update(value).digest('hex');
const identity=s=>[s.dev,s.ino,s.size,s.mtimeNs,s.ctimeNs,s.mode,s.nlink].join(':');
const birth=s=>[s.dev,s.ino].join(':');
const MAX_READ=32768,MAX_WRITE=4194304;
function filename(value){
 if(typeof value!=='string'||!value||value.length>2048||value.startsWith('/')||/[\\:\x00-\x1f\x7f]/u.test(value)||value.split('/').some(p=>!p||p==='.'||p==='..'||/[. ]$/u.test(p)))fail('FS_PATH_OUTSIDE');return value;
}
function record(value,keys){
 if(!value||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k)))fail('SEP_MAC_TOOL_INPUT');return value;
}
function text(value,limit){if(typeof value!=='string'||!value.isWellFormed()||Buffer.byteLength(value)>limit)fail('SEP_MAC_TOOL_INPUT');return value;}
const safeCode=(e,fallback)=>/^(?:SEP|FS)_[A-Z0-9_]{1,90}$/u.test(e?.code??'')?e.code:fallback;

/** Trusted composition creates this object and retains controller privately.
 * Model wiring receives execute only. authorize derives registered agent and
 * session identity from the host, never from the model's JSON arguments. */
export async function createControlledFileProfile({project,source,authorize,closeDeadlineMs=5000}){
 if(!project||['view','current','plans','planWrite','review','commit','discard','planRestore','recover','bindDocumentAuthority','reviewDocument','deleteDocument','close','whenClosed','status'].some(k=>typeof project[k]!=='function')||typeof authorize!=='function'||typeof source!=='string'||!isAbsolute(source)||resolve(source)!==source||!Number.isSafeInteger(closeDeadlineMs)||closeDeadlineMs<1||closeDeadlineMs>30000)fail('SEP_MAC_PROFILE_CONFIG');
 const initial=await lstat(source,{bigint:true});if(!initial.isDirectory()||initial.isSymbolicLink()||await realpath(source)!==source)fail('SEP_MAC_PROFILE_CONFIG');const sourceIdentity=birth(initial);
 let tail=Promise.resolve(),pending=0,pendingPlan,reviewedPlan,needsSelection=(await project.plans()).length>0,phase='open',closeFlow,closeAttempt,terminal,closedResolve,watchingClose=false;
 const observations=new Map(),lifetime=new AbortController(),closed=new Promise(resolve=>{closedResolve=resolve;});
 const clear=()=>{observations.clear();reviewedPlan=undefined;};
 const available=()=>{if(phase!=='open'||project.status().phase!=='open')fail('SEP_MAC_PROFILE_CLOSED');};
 const selected=()=>{if(needsSelection)fail('SEP_MAC_RESTART_REVIEW_REQUIRED');};
 const cancelled=signal=>{if(lifetime.signal.aborted||signal?.aborted)fail('SEP_MAC_CANCELLED');};
 const serial=work=>{
  try{available();}catch(e){return Promise.reject(e);}
  pending++;const next=tail.then(()=>{available();return work();}).finally(()=>{pending--;});tail=next.catch(()=>{});return next;
 };
 async function caller(exec){
  cancelled(exec?.signal);const value=await authorize(exec);
  if(!value||typeof value.sessionId!=='string'||!value.sessionId||value.sessionId.length>256||value.cwd!==source||!Number.isSafeInteger(value.depth)||value.depth<0)fail('SEP_MAC_AGENT_SCOPE');
  if(value.depth>1)fail('SEP_MAC_CHILD_DEPTH');
  try{if(await realpath(source)!==source||birth(await lstat(source,{bigint:true}))!==sourceIdentity)fail('SEP_MAC_AGENT_SCOPE');}catch{fail('SEP_MAC_AGENT_SCOPE');}
  cancelled(exec?.signal);return value;
 }
 async function reauthorize(exec,first){const now=await caller(exec);if(now.sessionId!==first.sessionId||now.depth!==first.depth)fail('SEP_MAC_AGENT_SCOPE');available();}
 const combined=signal=>AbortSignal.any([lifetime.signal,...signal?[signal]:[]]);
 async function fresh(view){const now=await project.view(pendingPlan);if(now.version!==view.version||now.path!==view.path)fail('FS_STALE_VERSION');}
 async function read(view,path,signal){
  cancelled(signal);const row=view.entries.find(e=>e.path===path),physical=join(view.path,path);
  if(!row){
   const parent=dirname(path);if(parent!=='.'&&view.entries.find(e=>e.path===parent)?.kind!=='directory')fail('FS_NOT_DIRECTORY');
   try{await lstat(physical);fail('FS_STALE_VERSION');}catch(e){if(e.code!=='ENOENT')throw e;}
   await fresh(view);cancelled(signal);return {path,exists:false,version:'absent'};
  }
  if(row.kind!=='file')fail('FS_NOT_REGULAR_FILE');if(!Number.isSafeInteger(row.size)||row.size<0||row.size>MAX_READ)fail('FS_TOO_LARGE');
  const before=await lstat(physical,{bigint:true});
  if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1n||before.size!==BigInt(row.size)||await realpath(physical)!==physical)fail('FS_STALE_VERSION');
  const file=await open(physical,constants.O_RDONLY|constants.O_NOFOLLOW);let bytes;
  try{
   const held=await file.stat({bigint:true});if(identity(before)!==identity(held))fail('FS_STALE_VERSION');
   // Reserve only the observed bounded bytes plus one overflow byte. A
   // concurrently growing file can never make readFile allocate its new size.
   const buffer=Buffer.alloc(row.size+1);let count=0;
   while(count<buffer.length){const result=await file.read(buffer,count,buffer.length-count,count);if(!result.bytesRead)break;count+=result.bytesRead;cancelled(signal);}
   if(count!==row.size||identity(held)!==identity(await file.stat({bigint:true}))||identity(held)!==identity(await lstat(physical,{bigint:true})))fail('FS_STALE_VERSION');
   bytes=buffer.subarray(0,count);if(hash(bytes)!==row.sha256)fail('FS_STALE_VERSION');
  }finally{await file.close();}
  await fresh(view);cancelled(signal);let value;try{if(bytes.includes(0))throw Error();value=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{fail('FS_NOT_TEXT');}
  return {path,exists:true,text:value,version:row.sha256};
 }
 async function execute(kind,args,exec){return serial(async()=>{
  if(['bash','mcp_call','context_prepare'].includes(kind))fail('SEP_MAC_EXECUTION_UNAVAILABLE');
  if(!['read','write','edit'].includes(kind))fail('SEP_MAC_TOOL_UNAVAILABLE');
  record(args,kind==='read'?['file_path']:kind==='write'?['file_path','content']:['file_path','old_string','new_string']);
  const path=filename(args.file_path),who=await caller(exec);selected();if(who.depth>0&&kind!=='read')fail('SEP_MAC_CHILD_READONLY');
  const view=await project.view(pendingPlan),session=observations.get(who.sessionId);
  if(kind==='read'){
   const result=await read(view,path,exec?.signal);await reauthorize(exec,who);
   const rows=session??new Map();if(!session)observations.set(who.sessionId,rows);rows.set(path,{version:result.version,viewVersion:view.version});return result;
  }
  const observed=session?.get(path);if(!observed)fail('FS_NOT_OBSERVED');if(observed.viewVersion!==view.version)fail('FS_STALE_VERSION');
  let content;
  if(kind==='write')content=text(args.content,MAX_WRITE);
  else{
   if(observed.version==='absent')fail('FS_NOT_FOUND');
   const old=text(args.old_string,MAX_READ),replacement=text(args.new_string,MAX_WRITE);if(!old)fail('SEP_MAC_TOOL_INPUT');
   const current=await read(view,path,exec?.signal);if(current.version!==observed.version)fail('FS_STALE_VERSION');
   const offset=current.text.indexOf(old);if(offset<0)fail('FS_EDIT_NOT_FOUND');if(current.text.indexOf(old,offset+1)>=0)fail('FS_EDIT_AMBIGUOUS');
   content=current.text.slice(0,offset)+replacement+current.text.slice(offset+old.length);text(content,MAX_WRITE);
  }
  await reauthorize(exec,who);cancelled(exec?.signal);
  const previous=pendingPlan,result=await project.planWrite({path,expectedSha256:observed.version,text:content,basePlanHash:previous,signal:combined(exec?.signal)});
  pendingPlan=result.planHash;clear();
  try{if(previous)await project.discard(previous);}catch(e){pendingPlan=undefined;needsSelection=true;throw e;}
  cancelled(exec?.signal);return {path,updated:true,staged:true};
 });}
 function status(){const admissionOpen=phase==='open'&&project.status().admissionOpen;return Object.freeze({phase:phase==='open'&&!admissionOpen?'blocked':phase,admissionOpen,pending,needsSelection,hasPendingPlan:!!pendingPlan,resourcesConfirmedReleased:phase==='closed'});}
 function completed(receipt){
  if(receipt?.status!=='pass'||receipt.resourcesConfirmedReleased!==true)return false;
  phase='closed';terminal=Object.freeze({...receipt});closedResolve(terminal);return true;
 }
 function close(){
  if(terminal)return Promise.resolve(terminal);if(closeAttempt)return closeAttempt;
  if(!closeFlow){phase='draining';lifetime.abort();clear();closeFlow=(async()=>{
   await tail;let receipt;
   // An inner deadline can return blocked while its already accepted work
   // still drains. Observe actual completion separately; never promote that
   // early receipt or remember it as permanent failure.
   if(!watchingClose){watchingClose=true;project.whenClosed().then(completed,()=>{});}
   try{receipt=await project.close();}catch(e){receipt={status:'blocked',code:safeCode(e,'SEP_MAC_PROFILE_CLOSE_FAILED'),resourcesConfirmedReleased:false};}
   if(terminal||completed(receipt))return terminal;
   phase='blocked';return {...receipt,status:'blocked',resourcesConfirmedReleased:false};
  })().finally(()=>{closeFlow=undefined;});}
  let timer;const request=new Promise(resolve=>{timer=setTimeout(()=>resolve({status:'blocked',code:'SEP_MAC_PROFILE_CLOSE_DEADLINE',pending,resourcesConfirmedReleased:false}),closeDeadlineMs);closeFlow.then(value=>{clearTimeout(timer);resolve(value);});});
  closeAttempt=request;request.then(()=>{if(closeAttempt===request)closeAttempt=undefined;});return request;
 }
 const controller=Object.freeze({
  status,close,whenClosed:()=>closed,
  current:()=>serial(()=>project.current()),plans:()=>serial(()=>project.plans()),
  withView:work=>serial(async()=>{selected();if(typeof work!=='function')fail('SEP_MAC_PROFILE_INPUT');return work(await project.view(pendingPlan),lifetime.signal);}),
  bindDocumentAuthority:authority=>serial(async()=>{const result=await project.bindDocumentAuthority(authority);pendingPlan=undefined;clear();needsSelection=(await project.plans()).length>0;return result;}),
  withDocumentView:work=>serial(async()=>{
   selected();if(typeof work!=='function')fail('SEP_MAC_PROFILE_INPUT');const view=await project.view(pendingPlan);let live=true,operations=Promise.resolve();
   const scoped=operation=>{if(!live)return Promise.reject(Object.assign(Error('SEP_MAC_DOCUMENT_SCOPE_CLOSED'),{code:'SEP_MAC_DOCUMENT_SCOPE_CLOSED'}));const result=operations.then(operation);operations=result.catch(()=>{});return result;};
   const documents=Object.freeze({review:path=>scoped(()=>project.reviewDocument(filename(path))),delete:input=>scoped(async()=>{clear();const result=await project.deleteDocument(input);pendingPlan=undefined;needsSelection=true;needsSelection=(await project.plans()).length>0;return result;})});
   try{return await work(view,documents,lifetime.signal);}finally{live=false;await operations;}
  }),
  resume:input=>serial(async()=>{record(input,['planHash']);if(pendingPlan)fail('SEP_PROJECT_BUSY');if(typeof input.planHash!=='string')fail('SEP_PROJECT_PLAN_INVALID');await project.view(input.planHash);pendingPlan=input.planHash;needsSelection=false;clear();return {status:'pass',planHash:pendingPlan};}),
  review:()=>serial(async()=>{selected();if(!pendingPlan)fail('SEP_PROJECT_PLAN_INVALID');await project.view(pendingPlan);const result=await project.review(pendingPlan);reviewedPlan=pendingPlan;return result;}),
  commit:input=>serial(async()=>{record(input,['planHash']);selected();if(!pendingPlan||input.planHash!==pendingPlan)fail('SEP_PROJECT_STALE_PLAN');if(reviewedPlan!==pendingPlan)fail('SEP_MAC_REVIEW_REQUIRED');const result=await project.commit({planHash:pendingPlan,signal:lifetime.signal});pendingPlan=undefined;clear();needsSelection=(await project.plans()).length>0;return result;}),
  discard:planHash=>serial(async()=>{await project.discard(planHash);if(planHash===pendingPlan)pendingPlan=undefined;clear();needsSelection=!pendingPlan&&(await project.plans()).length>0;return {status:'pass'};}),
  restore:generation=>serial(async()=>{selected();if(pendingPlan)fail('SEP_PROJECT_BUSY');const result=await project.planRestore(generation);pendingPlan=result.planHash;clear();return result;}),
  recover:()=>serial(async()=>{const result=await project.recover();pendingPlan=undefined;clear();needsSelection=(await project.plans()).length>0;return result;}),
 });
 return Object.freeze({source,execute,controller});
}
