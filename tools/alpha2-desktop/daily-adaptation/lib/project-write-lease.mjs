import {randomUUID} from 'node:crypto';
import {ChildProcess} from 'node:child_process';
const fail=code=>{throw Object.assign(Error(code),{code});};
/** Recovery-center owned fence for the daily host's protected file callbacks.
 * IDs are capabilities held only by the authenticated host. There is no timer
 * that turns an uncertain writer into an idle writer. After a lost host, only
 * its observed ChildProcess close and exact generation can retire its fence. */
export function createProjectWriteLeases(controller){
 const leases=new Map(),settled=new Map();let tail=Promise.resolve(),owner;
 const serialized=work=>{const result=tail.then(work);tail=result.catch(()=>{});return result;};
 return {
  observeChild({child,generation}){
   if(owner||!(child instanceof ChildProcess)||!Number.isSafeInteger(generation)||generation<1)fail('RECOVERY_WRITE_OWNER_UNPROVEN');
   const current=owner={child,generation,exit:null};child.once('close',(code,signal)=>{current.exit={code,signal};});
  },
  acquire({projectId}){return serialized(async()=>{
   if(!owner||owner.exit)fail('RECOVERY_WRITE_OWNER_UNPROVEN');
   if(leases.size)fail('RECOVERY_PROJECT_BUSY');
   await controller.assertBusinessOpen();const project=await controller.inspectProject(projectId);
   if(project.state!=='ready')fail('RECOVERY_PROJECT_PAUSED');
   const leaseId=randomUUID(),operationId='fs-'+leaseId;
   const operation=await controller.beginOperation({projectId,taskId:'sep-protected-files',operationId,effect:'write'});
   leases.set(leaseId,{project,operationId,generation:operation.generation});
   return {leaseId,project};
  });},
  release({leaseId,outcome}){return serialized(async()=>{
   if(!['succeeded','unknown'].includes(outcome))fail('RECOVERY_WRITE_LEASE_INVALID');
   if(settled.has(leaseId)){const prior=settled.get(leaseId);if(prior.outcome!==outcome)fail('RECOVERY_WRITE_LEASE_INVALID');return prior.receipt;}
   const lease=leases.get(leaseId);if(!lease)fail('RECOVERY_WRITE_LEASE_INVALID');
   const receipt=await controller.finishOperation({operationId:lease.operationId,generation:lease.generation,outcome});
   if(!receipt.accepted)fail('RECOVERY_STALE_RESULT');
   leases.delete(leaseId);settled.set(leaseId,{outcome,receipt});if(settled.size>128)settled.delete(settled.keys().next().value);return receipt;
  });},
  assertMutable(){if(leases.size)fail('RECOVERY_PROJECT_BUSY');},
  mutate(work){return serialized(()=>{if(leases.size)fail('RECOVERY_PROJECT_BUSY');return work();});},
  async afterExit(exit){return serialized(async()=>{
   if(!owner?.exit||exit?.generation!==owner.generation||exit.code!==owner.exit.code||exit.signal!==owner.exit.signal)fail('RECOVERY_WRITE_EXIT_UNPROVEN');
   if(leases.size)await controller.interruptOperations({operationIds:[...leases.values()].map(row=>row.operationId),reason:'host-exit'});
   leases.clear();settled.clear();owner=undefined;
  });},
  status:()=>({active:leases.size,ownerObserved:!!owner}),
 };
}
