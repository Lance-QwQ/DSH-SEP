/** Trusted in-process P2 bridge; deliberately absent from HTTP/RPC methods.
 * 受信任的本地维护接口，不向模型、桌面令牌或 JSON RPC 暴露发布能力。 */
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
const fail=code=>{throw Object.assign(Error(code),{code});};
export function createRecoveryMaintenance({service,storageRoot,openControl}){
 const controller=service.controller;
 async function assert({id}={}){
  const gate=await controller.assertMaintenance({id}),state=service.guardian.status();
  if(state.pid!==null||!['idle','stopped','blocked','exhausted'].includes(state.phase)||state.phase==='blocked'&&state.reason!=='prerequisite-failed')fail('RECOVERY_MAINTENANCE_HOST_ACTIVE');
  if(gate.boundProjects&&!isDeepStrictEqual(gate.boundProjects,gate.projects))fail('RECOVERY_MAINTENANCE_SCOPE_CHANGED');
  if(gate.projects.some(p=>p.state!=='ready'))fail('RECOVERY_MAINTENANCE_SCOPE_CHANGED');
  return {...gate,storageRoot};
 }
 return {
  async begin({id}={}){await controller.beginMaintenance({id});const stopped=await service.guardian.stop();return {...await assert({id}),stopped};},
  async bind(input){await assert(input);return controller.bindMaintenance(input);},
  assert,
  async finish({id,verifyPublication}={}){
   await assert({id});if(typeof verifyPublication!=='function')fail('RECOVERY_MAINTENANCE_DECISION_REQUIRED');
   const control=await openControl({storageRoot,mode:'maintenance',initialize:false});
   try{return await controller.finishMaintenance({id},async gate=>{
    const cp=await control.checkpoint(),decision=cp.events.findLast(e=>['committed','rolled_back','switching'].includes(e.type));
    if(cp.barrier.closed||cp.pending.length||!['committed','rolled_back'].includes(decision?.type)||decision.payload.transactionId!==gate.transactionId||decision.payload.planHash!==gate.planHash||decision.payload.legacyReadOnly===true||decision.payload.health?.status!=='pass')fail('RECOVERY_MAINTENANCE_DECISION_REQUIRED');
    for(const [name,expected]of Object.entries(cp.dataFingerprints)){let actual=null;try{actual=createHash('sha256').update(await readFile(join(storageRoot,name+'.json'))).digest('hex');}catch(e){if(e.code!=='ENOENT')throw e;}if(actual!==expected)fail('RECOVERY_MAINTENANCE_DATA_CHANGED');}
    if(await verifyPublication({status:decision.type,transactionId:gate.transactionId,planHash:gate.planHash,checkpoint:cp})!==true)fail('RECOVERY_MAINTENANCE_PUBLICATION_CHANGED');
    await control.assertOwned();return {status:decision.type,transactionId:gate.transactionId,planHash:gate.planHash};
   });}finally{await control.close();}
  },
 };
}
