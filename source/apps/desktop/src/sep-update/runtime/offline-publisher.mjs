/** Trusted offline operator owns the recovery controller, exposes no RPC/Host,
 * and acquires the native/P2 locks before publishing. Preparation does not
 * persist a maintenance gate while the user reviews compatibility risks. */
import {createProfilePublisher} from './profile-transaction.mjs';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
const fail=code=>{throw Object.assign(Error(code),{code});};
export function createOfflinePublisher({controller,openControl,assertQuiescent,adapters}){
 let activePlan;
 async function ready(plan){
  await assertQuiescent();
  const state=controller.status();if(state.writerState!=='open')fail('RECOVERY_OWNER_UNAVAILABLE');
  for(const project of state.projects)if((await controller.inspectProject(project.id)).state!=='ready')fail('RECOVERY_MAINTENANCE_SCOPE_CHANGED');
  if(plan?.recoveryProjects&&!isDeepStrictEqual(plan.recoveryProjects,controller.status().projects))fail('RECOVERY_MAINTENANCE_SCOPE_CHANGED');
  if(state.maintenance){
   if(!plan?.id)fail('RECOVERY_MAINTENANCE_CONFLICT');
   const gate=await controller.assertMaintenance({id:plan.id});
   if(gate.planHash&&(gate.planHash!==plan.hash||gate.transactionId!==plan.id))fail('RECOVERY_MAINTENANCE_CONFLICT');
   if(gate.boundProjects&&!isDeepStrictEqual(gate.boundProjects,gate.projects))fail('RECOVERY_MAINTENANCE_SCOPE_CHANGED');
  }
 }
 async function closeMaintenance(plan){
  await ready(plan);await controller.beginMaintenance({id:plan.id});
  await controller.bindMaintenance({id:plan.id,transactionId:plan.id,planHash:plan.hash});await ready(plan);
 }
 const base=createProfilePublisher({...adapters,openControl,
  verifyInputs:async p=>{await ready(p);await adapters.verifyInputs(p);},
  native:{...adapters.native,acquire:async args=>{await ready(args.plan);const release=await adapters.native.acquire(args);try{await ready(args.plan);return release;}catch(e){await release();throw e;}}},
  onProgress:async e=>{if(e.phase==='maintenance-closed')await closeMaintenance(activePlan);await adapters.onProgress?.(e);},
 });
 async function finish(plan,result){
  await ready(plan);
  if(!controller.status().maintenance){if(result.alreadyFinalized)return result;fail('RECOVERY_MAINTENANCE_CONFLICT');}
  const c=await openControl({storageRoot:plan.storageRoot,mode:'maintenance',initialize:false});
  try{
   const cp=await c.checkpoint(),decision=cp.events.findLast(e=>['committed','rolled_back','switching'].includes(e.type));
   if(cp.barrier.closed||cp.pending.length||decision?.type!==result.status||decision.payload.transactionId!==plan.id||decision.payload.planHash!==plan.hash||decision.payload.legacyReadOnly||decision.payload.health?.status!=='pass')fail('RECOVERY_MAINTENANCE_DECISION_REQUIRED');
   for(const [name,expected]of Object.entries(cp.dataFingerprints)){
    let actual=null;try{actual=createHash('sha256').update(await readFile(join(plan.storageRoot,name+'.json'))).digest('hex');}catch(e){if(e.code!=='ENOENT')throw e;}
    if(actual!==expected)fail('RECOVERY_MAINTENANCE_DATA_CHANGED');
   }
   await adapters.verifyInputs(plan);await adapters.verifyInstalled({plan,direction:result.direction});await adapters.program.verify({plan,direction:result.direction});await adapters.native.verify({plan});await c.assertOwned();
   const proof={status:result.status,transactionId:plan.id,planHash:plan.hash};
   const opened=await controller.finishMaintenance({id:plan.id},async gate=>{if(gate.transactionId!==plan.id||gate.planHash!==plan.hash)fail('RECOVERY_MAINTENANCE_CONFLICT');await c.assertOwned();return proof;});
   return {...result,recoveryAdmission:opened.status};
  }finally{await c.close();}
 }
 return {
  async prepare(input){await ready();return base.prepare({...input,recoveryProjects:controller.status().projects});},
  async apply(plan){activePlan=plan;await ready(plan);return finish(plan,await base.apply(plan));},
  async recover(plan){
   activePlan=plan;await ready(plan);
   const transaction=JSON.parse(await readFile(plan.transactionPath));
   if(transaction.planHash!==plan.hash||transaction.planPath!==plan.planPath)fail('PGR_TRANSACTION_CHANGED');
   // Existing transaction is recoverable. No new gate for an unstarted plan.
   if(controller.status().maintenance)await closeMaintenance(plan);
   const result=await base.recover(plan);
   if(!controller.status().maintenance&&!result.alreadyFinalized)await closeMaintenance(plan);
   return finish(plan,result);
  },
 };
}
