import {join} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {acquireStartupLease} from './startup-lease.mjs';
export {inspectColdCheckpoint} from './checkpoint-inspection.mjs';
const fail=code=>{throw Object.assign(Error(code),{code});};

// Serializes competing shortcuts and the repair installer. Data ownership is
// held by the core's process-bound leases, independently of this short gate.
export async function startCoordinated(configPath,{loadDeployment,openDaily,readCredential=true}={}){
 const config=await loadDeployment(configPath);
 const lease=await acquireStartupLease(join(config.dailyRoot,'state/startup.sqlite3'));
 let runtime;
 try{
  if(!isDeepStrictEqual(await loadDeployment(configPath),config))fail('DAILY_DEPLOYMENT_CHANGED');
  await lease.assertOwned();runtime=await openDaily(configPath,{readCredential});
  await runtime.start();
  const state=await runtime.client.call('status');
  if(state.guardian?.phase!=='running')fail(state.managedRecovery?.lastPrerequisite??(state.guardian?.reason==='restart-budget-exhausted'?'DAILY_RESTART_BUDGET_EXHAUSTED':state.guardian?.reason)??'DAILY_HOST_NOT_READY');
  await lease.assertOwned();return runtime;
 }catch(error){if(runtime?.service)await runtime.close().catch(()=>{});throw error;}
 finally{lease.close();}
}
