import {resolve} from 'node:path';
export const CRITICAL_SERVICES=['desktop-host','recovery-control','governed-storage'];
export function healthy(proof,target){return !!(typeof proof?.root==='string'&&typeof target?.root==='string'&&resolve(proof.root).toLowerCase()===resolve(target.root).toLowerCase()&&proof.version===target.version&&proof.graphHash===target.graphHash&&Number.isFinite(proof.checkedAt)&&Math.abs(Date.now()-proof.checkedAt)<30000&&CRITICAL_SERVICES.every(name=>proof.services?.[name]===true));}
/** Effects are supplied by the local P2/desktop adapter, never by plugin tools. */
export async function reconcileUpdate({id,target,io}){
 let state=await io.readState();if(state&&state.id!==id)throw Error('UPDATE_STATE_IDENTITY');
 if(state?.phase==='verified'||state?.phase==='rolled_back'||state?.phase==='runtime_failed')return state;
 state??={schema:2,id,phase:'queued',attempted:false,recoveryAttempts:0};
 const save=async patch=>{state={...state,...patch,updatedAt:new Date().toISOString()};await io.writeState(state);return state;};
 const blocked=(message,extra={})=>save({status:'blocked',message,...extra});
 const hold=async message=>{let maintenanceHeld=false;try{maintenanceHeld=await io.hold();}catch{}return blocked(message,{phase:'runtime_failed',maintenanceHeld});};
 try{
  if(state.child&&await io.isProcessAlive(state.child))return blocked('UPDATE_PUBLISHER_STILL_RUNNING');
  let p2=await io.readDecision();
  if(!p2||!['none','committed','rolled_back'].includes(p2.decision))return blocked('UPDATE_P2_DECISION_UNKNOWN');
  if(p2.decision==='rolled_back')return save({phase:'rolled_back',status:'fail',message:'旧版本已恢复；本次更新未完成'});
  if(p2.decision==='none'&&!state.attempted){
   await save({phase:'publishing',status:'blocked',attempted:true,message:'正在发布，尚未验证成功'});
   await io.execute('apply',child=>save({child}));
   p2=await io.readDecision();
   if(p2.decision==='none')return blocked('UPDATE_COMMIT_MISSING');
  }
  if(p2.decision==='none'||p2.closed){
   if((state.recoveryAttempts??0)>=2)return blocked('UPDATE_RECOVERY_LIMIT');
   await save({phase:'recovering',status:'blocked',attempted:true,recoveryAttempts:(state.recoveryAttempts??0)+1});
   await io.execute('recover',child=>save({child}));p2=await io.readDecision();
  }
  if(p2.decision==='rolled_back')return save({phase:'rolled_back',status:'fail',message:'旧版本已恢复；本次更新未完成'});
  if(p2.decision!=='committed'||p2.closed||p2.pending>0)return blocked('UPDATE_P2_NOT_FINALIZED');
  if(!state.attempted)await save({attempted:true,status:'blocked'});
  const uncertainLaunch=['launching','launched','verifying'].includes(state.phase);
  let proof=await io.probe({wait:uncertainLaunch});
  if(!healthy(proof,target)){
   if(uncertainLaunch)return hold('UPDATE_LAUNCH_OUTCOME_UNKNOWN');
   await save({phase:'launching',status:'blocked',message:'版本已提交，等待启动验证'});
   try{const launched=await io.launch();await save({phase:'verifying',launchIdentity:launched});proof=await io.probe({wait:true});}catch(e){return hold('UPDATE_LAUNCH_FAILED: '+String(e.code??e.message).slice(0,160));}
   if(!healthy(proof,target))return hold('UPDATE_CRITICAL_HEALTH_FAILED');
  }
  return save({phase:'verified',status:'pass',health:proof,message:'目标版本启动及关键服务已验证'});
 }catch(e){return blocked(String(e.code??e.message).slice(0,200));}
}
