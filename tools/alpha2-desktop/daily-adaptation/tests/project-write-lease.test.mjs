import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {createProjectWriteLeases} from '../lib/project-write-lease.mjs';
const {openRecovery}=await import(pathToFileURL(join(process.env.SEP_SOURCE_REPO,'bundle/modules/recovery/src/controller.mjs')));
test('a file write fence rejects forged exits and permits only observed-owner retirement',async()=>{
 const base=await mkdtemp(join(process.env.SEP_BUNDLE_TEST_ROOT,'write-lease-')),root=join(base,'project');await mkdir(root);
 const controller=await openRecovery({controlRoot:join(base,'control')});let child;
 try{
  await controller.addProject({id:'project',root});const fences=createProjectWriteLeases(controller);
  await assert.rejects(fences.acquire({projectId:'project'}),{code:'RECOVERY_WRITE_OWNER_UNPROVEN'});
  child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',windowsHide:true});
  fences.observeChild({child,generation:1});const lease=await fences.acquire({projectId:'project'});
  assert.throws(()=>fences.assertMutable(),{code:'RECOVERY_PROJECT_BUSY'});
  await assert.rejects(fences.mutate(()=>controller.planRebind({projectId:'project',newRoot:root})),{code:'RECOVERY_PROJECT_BUSY'});
  await assert.rejects(fences.afterExit({generation:1,code:0,signal:null}),{code:'RECOVERY_WRITE_EXIT_UNPROVEN'});
  const release=await fences.release({leaseId:lease.leaseId,outcome:'succeeded'});assert.equal(release.accepted,true);fences.assertMutable();
  assert.deepEqual(await fences.release({leaseId:lease.leaseId,outcome:'succeeded'}),release);
  const interrupted=await fences.acquire({projectId:'project'});assert.ok(interrupted.leaseId);
  const closed=new Promise(resolve=>child.once('close',(code,signal)=>resolve({code,signal})));child.kill();const exit=await closed;
  await assert.rejects(fences.afterExit({...exit,generation:2}),{code:'RECOVERY_WRITE_EXIT_UNPROVEN'});
  assert.throws(()=>fences.assertMutable(),{code:'RECOVERY_PROJECT_BUSY'});
  await fences.afterExit({...exit,generation:1});fences.assertMutable();
  assert.equal(fences.status().active,0);assert.equal(controller.status().operations.at(-1).status,'unknown');
 }finally{if(child?.exitCode===null&&child?.signalCode===null)child.kill();await controller.close();}
});
