import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {openService} from '../core/test-runtime/p0500/src/server.mjs';
import {recoveryClient} from '../core/test-runtime/p0500/src/client.mjs';
const dir=fileURLToPath(new URL('.',import.meta.url));
const script=`process.on('message',m=>{if(m.type==='crash')process.exit(1);if(m.type==='dsh-daily-shutdown')process.disconnect();});process.send({type:'dsh-guardian-ready'});`;
async function wait(g,fn){for(let i=0;i<200;i++){const s=g.status();if(fn(s))return s;await delay(20);}throw Error('RPC_MANUAL_TEST_TIMEOUT '+JSON.stringify(g.status()));}
for(let iteration=1;iteration<=2;iteration++)test(`round ${iteration}: real startHost RPC preserves manual budget reset through server`,async()=>{
 const root=await mkdtemp(join(dir,'rpc-manual-'));let child;
 const service=await openService({controlRoot:root,host:{command:{file:process.execPath,args:['-e',script],cwd:root},beforeStart:async()=>true,restartLimit:1,restartDelayMs:0,readinessTimeoutMs:3000,onSpawn:e=>{child=e.child;}}});
 const client=recoveryClient({...service.connection,timeoutMs:10000});
 try{
  await client.call('startHost');child.send({type:'crash'});const auto=await wait(service.guardian,s=>s.phase==='running'&&s.generation===2);assert.equal(auto.restartCount,1);
  const running=await client.call('startHost',{manual:true});assert.equal(running.pid,auto.pid);assert.equal(running.restartCount,1);
  child.send({type:'crash'});await wait(service.guardian,s=>s.phase==='exhausted');const refused=await client.call('startHost');assert.equal(refused.phase,'exhausted');
  const manual=await client.call('startHost',{manual:true});assert.equal(manual.phase,'running');assert.equal(manual.generation,3);assert.equal(manual.restartCount,0);
  await assert.rejects(client.call('startHost',{manual:'true'}),/GUARDIAN_OPTIONS_INVALID/);
  const rows=(await readFile(join(root,'guardian/guardian/journal.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);assert.equal(rows.filter(r=>r.event==='manual-start-requested').length,1);
 }finally{await service.close();}
});
