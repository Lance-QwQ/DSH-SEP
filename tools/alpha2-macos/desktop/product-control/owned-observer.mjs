import {readGeneration} from '../managed-broker/launch-state.mjs';
import {assertLaunchControl} from './launch-control.mjs';
export async function observeOwned({lease,statePath,generation,programSha256,control}){
 assertLaunchControl(control);await lease.assertOwned();const state=await readGeneration(statePath);
 if(!state||state.schema!==1||state.phase!=='starting'||state.generation!==generation||state.programSha256!==programSha256||state.launcherPid!==process.pid||state.resourcesConfirmedReleased!==false)throw Object.assign(Error('SEP_PRODUCT_OWNERSHIP'),{code:'SEP_PRODUCT_OWNERSHIP'});
 await lease.assertOwned();control.owned({generation,programSha256});
}
