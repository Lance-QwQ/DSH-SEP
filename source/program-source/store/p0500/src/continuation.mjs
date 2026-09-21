import {createHash} from 'node:crypto';
import {SessionPersistenceNotFoundError} from '@deepseek-ai/dsh-session-persistence';

const pendingByContext=new WeakMap();
const fail=code=>{throw Object.assign(Error(code),{code});};
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function linkage(receipt) {
 return {recoveryFromTaskId:receipt.taskId,recoveryPlanHash:receipt.confirmationHash,recoveryRequestId:receipt.requestId,recoveryProjectId:receipt.projectId,recoveryProjectGeneration:receipt.projectGeneration};
}
function verify(meta,events,inheritedEventCount,receipt) {
 if(meta.id!==receipt.sessionId||meta.cwd!==receipt.root||meta.parentSession!==receipt.taskId||meta.isSeeded!==false||inheritedEventCount!==0||meta.agentPreset!=='standard')fail('CONTINUATION_SESSION_MISMATCH');
 const links=events.filter(event=>event.type==='recovery/continuation');
 if(links.length!==1||links[0].ignorable!==true||hash(links[0].data)!==hash(linkage(receipt)))fail('CONTINUATION_SESSION_MISMATCH');
 return hash({id:meta.id,createdAt:meta.createdAt,cwd:meta.cwd,parentSession:meta.parentSession,isSeeded:meta.isSeeded,inheritedEventCount,agentPreset:meta.agentPreset,link:links[0].data});
}
async function readStored(persistence,id) {
 let handle;
 try {handle=await persistence.open(id,'read');}
 catch(error){if(error instanceof SessionPersistenceNotFoundError)return undefined;throw error;}
 try{return {meta:handle.header,inheritedEventCount:handle.inheritedEventCount,...await handle.read()};}
 finally{await handle.close();}
}

/** Create a fresh native execution context only for a durable admin reservation.
 * Native headers whitelist fields, so parentSession carries the source identity;
 * the append-only recovery event carries the exact reviewed plan and project binding.
 * Only a new ignorable metadata event is seeded; no original history, model
 * request, followup(), or tool replay is performed here.
 */
export function createContinuation(ctx,{taskId,confirmationHash,requestId}={}) {
 const request={taskId,confirmationHash,requestId};
 if(typeof requestId!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(requestId))return Promise.reject(Object.assign(Error('INVALID_ID'),{code:'INVALID_ID'}));
 let pending=pendingByContext.get(ctx);if(!pending){pending=new Map();pendingByContext.set(ctx,pending);}
 const prior=pending.get(requestId);
 if(prior){if(prior.requestHash!==hash(request))return Promise.reject(Object.assign(Error('CONTINUATION_REQUEST_CONFLICT'),{code:'CONTINUATION_REQUEST_CONFLICT'}));return prior.work;}
 if(pending.size>=16)return Promise.reject(Object.assign(Error('CONTINUATION_ACTIVE_LIMIT'),{code:'CONTINUATION_ACTIVE_LIMIT'}));
 const work=Promise.resolve().then(async()=>{
  if(!ctx.recoveryHost||!ctx.agents||!ctx.sessions||typeof ctx.sessionPersistence?.open!=='function')fail('CONTINUATION_NATIVE_UNAVAILABLE');
  const receipt=await ctx.recoveryHost.checkContinuation(request);
  if(receipt.status==='completed')return {status:'native-persisted',sessionId:receipt.sessionId,headerHash:receipt.headerHash};
  // Lookup only the preallocated new identity, never the original task's body.
  const raw=await readStored(ctx.sessionPersistence,receipt.sessionId);
  let session=ctx.sessions.get(receipt.sessionId);
  if(!raw&&!session) {
   await ctx.recoveryHost.checkContinuation(request);
   const handle=await ctx.agents.create({sessionId:receipt.sessionId,meta:{cwd:receipt.root,parentSession:receipt.taskId,isSeeded:false,agentPreset:'standard'},inheritedEventCount:0,seed:[{type:'recovery/continuation',seq:0,time:Date.now(),ignorable:true,data:linkage(receipt)}],setup:c=>ctx.agentPresets.mount(c,'standard').then(()=>undefined)});
   session=handle.agent.session;
  } else if(session&&!session.snapshotEvents().some(event=>event.type==='recovery/continuation')) {
   // A failed creation callback may have published an incomplete session. Do not
   // retrofit arbitrary existing sessions or allocate another identity.
   fail('CONTINUATION_SESSION_UNCERTAIN');
  }
  if(session) {
   verify(session.header,session.snapshotEvents(),session.inheritedEventCount,receipt);
   if(await ctx.sessions.flush(session)!==true)fail('CONTINUATION_DURABILITY_UNAVAILABLE');
  }
  const stored=await readStored(ctx.sessionPersistence,receipt.sessionId);
  if(!stored)fail('CONTINUATION_DURABILITY_UNAVAILABLE');
  const headerHash=verify(stored.meta,stored.events,stored.inheritedEventCount,receipt);
  await ctx.recoveryHost.checkContinuation(request);
  // The parent alone commits after checking the exact owned child/dispatch.
  return {status:'native-persisted',sessionId:receipt.sessionId,headerHash};
 });
 pending.set(requestId,{requestHash:hash(request),work});
 return work.finally(()=>pending.delete(requestId));
}
