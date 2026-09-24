import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,realpath,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {startCoordinated} from './bootstrap/startup-coordinator.mjs';
async function fixture(){const root=await realpath(await mkdtemp(join(import.meta.dirname,'synthetic/bootstrap-')));await mkdir(join(root,'state'));return {dailyRoot:root};}
test('competing startup attempts serialize then reuse a live service',async()=>{
 const config=await fixture();let created=false,active=0,max=0,centers=0;
 const deps={loadDeployment:async()=>config,openDaily:async()=>{active++;max=Math.max(max,active);const owner=!created;created=true;if(owner)centers++;return {service:owner?{}:null,start:async()=>{await delay(80);active--;},client:{call:async()=>({guardian:{phase:'running'}})}};}};
 await Promise.all([startCoordinated('x',deps),startCoordinated('x',deps),startCoordinated('x',deps)]);assert.equal(centers,1);assert.equal(max,1);
});
test('failed readiness closes owned service and preserves the actual refusal code',async()=>{
 const config=await fixture();let closed=0;
 await assert.rejects(startCoordinated('x',{loadDeployment:async()=>config,openDaily:async()=>({service:{},start:async()=>{},client:{call:async()=>({guardian:{phase:'blocked'},managedRecovery:{lastPrerequisite:'P2_RECOVERY_REQUIRED'}})},close:async()=>{closed++;}})}),{code:'P2_RECOVERY_REQUIRED'});assert.equal(closed,1);
});
test('secondary startup failure does not stop the primary service',async()=>{
 const config=await fixture();let stopped=0;
 await assert.rejects(startCoordinated('x',{loadDeployment:async()=>config,openDaily:async()=>({service:null,start:async()=>{throw Object.assign(Error('transport'),{code:'RECOVERY_TIMEOUT'});},close:async()=>{stopped++;}})}),{code:'RECOVERY_TIMEOUT'});assert.equal(stopped,0);
});
test('configuration drift after admission refuses before creating a service',async()=>{
 const config=await fixture();let read=0,opened=0;
 await assert.rejects(startCoordinated('x',{loadDeployment:async()=>({...config,revision:++read}),openDaily:async()=>{opened++;}}),{code:'DAILY_DEPLOYMENT_CHANGED'});assert.equal(opened,0);
});
