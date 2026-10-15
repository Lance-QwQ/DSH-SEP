import {openManagedProject} from './managed-project.mjs';
const config=JSON.parse(process.argv[2]);
const project=await openManagedProject({...config,onEvent:event=>{if(event===config.phase)process.kill(process.pid,'SIGKILL');}});
if(config.operation==='running'){
 await project.run({command:['/usr/bin/python3','-c',"import time;open('/work/started','w').write('started');time.sleep(1);open('/work/late','w').write('late');time.sleep(10)"],timeoutMs:10000});
 throw Error('EXPECTED_PARENT_DEATH');
}
const plan=config.operation==='restore'?await project.planRestore(1):await project.run({command:['/usr/bin/python3','-c',"open('/work/data.txt','w').write('child-candidate')"]});
await project.commit({planHash:plan.planHash});
await project.close();
throw Error('EXPECTED_CRASH_NOT_REACHED');
