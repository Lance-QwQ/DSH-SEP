import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {access,readFile} from 'node:fs/promises';
const root=resolve(process.argv[2]),layout=process.argv[3]??'managed';
let name='deployment.json';try{await access(join(root,name));}catch{name='deployment-rc2.json';}
const launcher=await import(pathToFileURL(join(root,layout,'launcher.mjs')));
let runtime;
try{
 let coordinated;try{await access(join(root,layout,'startup-coordinator.mjs'));coordinated=await import(pathToFileURL(join(root,layout,'startup-coordinator.mjs')));}catch(error){if(error.code!=='ENOENT')throw error;}
 runtime=coordinated?await coordinated.startCoordinated(join(root,name),launcher):await launcher.openDaily(join(root,name));
 if(!coordinated)await runtime.start();
 const status=await runtime.client.call('status');
 if(status.guardian.phase!=='running')throw Object.assign(Error('TEST_HOST_NOT_READY'),{code:status.managedRecovery?.lastPrerequisite??'TEST_HOST_NOT_READY'});
 const desktopReady=await runtime.client.call('desktopReady');
 const connection=JSON.parse(await readFile(runtime.connectionFile,'utf8'));
 process.send({type:'ready',center:process.pid,host:status.guardian.pid,generation:status.guardian.generation,reused:!runtime.service,centerPort:Number(new URL(connection.endpoint).port),hostPort:Number(new URL(desktopReady.url).port)});
 process.on('message',message=>{
  if(message.type==='status')void runtime.client.call('status').then(value=>process.send({type:'status',value}));
  if(message.type==='crash-owned')void(async()=>{
   if(!runtime.service)throw Error('test cannot terminate unowned host');
   const fresh=await runtime.client.call('status');
   if(fresh.guardian.phase!=='running'||fresh.guardian.pid!==status.guardian.pid||fresh.guardian.pid!==message.expectedHost||fresh.guardian.ownerPid!==process.pid)throw Object.assign(Error('TEST_HOST_GENERATION_CHANGED'),{code:'TEST_HOST_GENERATION_CHANGED'});
   // The PID is bound to this synthetic center and freshly rechecked generation.
   process.kill(fresh.guardian.pid);process.exit(31);
  })().catch(error=>process.send?.({type:'failed',code:error.code??'TEST_CRASH_REFUSED'}));
  if(message.type==='stop')void(async()=>{if(runtime.service)await runtime.close();process.send({type:'stopped'});process.disconnect();})().catch(error=>{console.error(error.code??'TEST_CLOSE_FAILED');process.exit(1);});
 });
}catch(error){
 console.error(error.stack??String(error)); // Synthetic blank-credential harness only; retain fixture failures.
 process.send?.({type:'failed',code:error.code??'TEST_START_FAILED'});
 if(runtime?.service)await runtime.close().catch(()=>{});process.exitCode=1;process.disconnect?.();
}
