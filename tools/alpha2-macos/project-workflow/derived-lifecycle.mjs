import {openMacManagedProject} from '../transactions/mac-managed-project.mjs';
const error=code=>Object.assign(Error(code),{code});
const readMethods=new Set(['current','plans','view','review','reviewCleanup','reviewDocument','listGenerations','inspectPlan']);
const publicCode=(failure,fallback)=>typeof failure?.code==='string'&&/^SEP_[A-Z0-9_]{1,90}$/u.test(failure.code)?failure.code:fallback;
function deadline(options={}){
 const value=options.closeDeadlineMs??5000;
 if(Object.keys(options).some(key=>key!=='closeDeadlineMs')||!Number.isSafeInteger(value)||value<1||value>30000)throw error('SEP_MAC_LIFECYCLE_CONFIG');return value;
}
/** Owns admission and every accepted API invocation. A response deadline does
 * not cancel or dispose an invocation still running below this boundary. */
export function wrapManagedProject(core,options={}){
 const closeDeadlineMs=deadline(options);
 if(!core||typeof core.close!=='function')throw error('SEP_MAC_LIFECYCLE_CONFIG');
 const pending=new Map();let phase='open',drainResolve,flow,attempt,terminal,terminalPromise,uncertainty,closedResolve;
 const closed=new Promise(resolve=>{closedResolve=resolve;});
 const counts=()=>{let read=0,write=0;for(const kind of pending.values())kind==='read'?read++:write++;return Object.freeze({total:pending.size,read,write});};
 const blocked=code=>Object.freeze({status:'blocked',code,pending:counts(),resourcesConfirmedReleased:false});
 const status=()=>Object.freeze({phase,admissionOpen:phase==='open',pending:counts(),resourcesConfirmedReleased:phase==='closed',...(uncertainty?{code:uncertainty}:{})});
 function rememberUncertainty(failure){
  const code=publicCode(failure,'');if(/(?:CLEANUP_UNCONFIRMED|CLEANUP_BLOCKED)$/u.test(code)){uncertainty??=code;if(phase==='open')phase='quarantined';}
 }
 function settle(token,failure){
  rememberUncertainty(failure);
  pending.delete(token);if(!pending.size&&drainResolve){const resolve=drainResolve;drainResolve=undefined;resolve();}
 }
 async function dispose(){
  if(pending.size)await new Promise(resolve=>{drainResolve=resolve;});
  phase='closing-resources';let result;
  try{result=await core.close();}
  catch(failure){rememberUncertainty(failure);phase='blocked';return blocked(publicCode(failure,'SEP_MAC_CLOSE_FAILED'));}
  rememberUncertainty(result);
  if(uncertainty){phase='blocked';return blocked(uncertainty);}
  if(result?.status!=='pass'){phase='blocked';return blocked(publicCode(result,'SEP_MAC_CLOSE_BLOCKED'));}
  phase='closed';const receipt=Object.freeze({status:'pass',pending:counts(),resourcesConfirmedReleased:true});closedResolve(receipt);return receipt;
 }
 function close(){
  if(terminal)return terminalPromise;
  if(attempt)return attempt;
  if(!flow){phase='draining';flow=Promise.resolve().then(dispose).catch(failure=>{rememberUncertainty(failure);phase='blocked';return blocked(publicCode(failure,'SEP_MAC_CLOSE_FAILED'));}).then(receipt=>{if(receipt.status==='pass'){terminal=receipt;terminalPromise=Promise.resolve(receipt);}flow=undefined;return receipt;});}
  let timer;const request=new Promise(resolve=>{
   timer=setTimeout(()=>resolve(blocked('SEP_MAC_CLOSE_DEADLINE')),closeDeadlineMs);
   flow.then(receipt=>{clearTimeout(timer);resolve(receipt);});
  });attempt=request;request.then(()=>{if(attempt===request)attempt=undefined;});return request;
 }
 const facade={};
 for(const [name,descriptor] of Object.entries(Object.getOwnPropertyDescriptors(core))){
  if(name==='close')continue;
  if(!('value'in descriptor)||typeof descriptor.value!=='function')throw error('SEP_MAC_LIFECYCLE_CONFIG');
  const invoke=descriptor.value,kind=readMethods.has(name)?'read':'write';
  facade[name]=(...args)=>{
   if(phase!=='open')return Promise.reject(error('SEP_MAC_PROJECT_CLOSED'));
   const token={};pending.set(token,kind);
   return Promise.resolve().then(()=>invoke.apply(core,args)).then(value=>{settle(token);return value;},failure=>{settle(token,failure);throw failure;});
  };
 }
 return Object.freeze({...facade,close,whenClosed:()=>closed,status});
}
export async function openGovernedMacManagedProject(input,options={}){
 deadline(options);const core=await openMacManagedProject(input);
 try{return wrapManagedProject(core,options);}catch(failure){try{await core.close();}catch{}throw failure;}
}
