import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {openGuardian} from '../core/test-runtime/p0500/src/guardian.mjs';
const dir=fileURLToPath(new URL('.',import.meta.url));
const script=`process.on('message',m=>{if(m.type==='crash')process.exit(1);if(m.type==='dsh-daily-shutdown')process.disconnect();});process.send({type:'dsh-guardian-ready'});`;
async function setup(){
 const root=await mkdtemp(join(dir,'manual-'));let child;
 const g=await openGuardian({controlRoot:root,command:{file:process.execPath,args:['-e',script],cwd:root},beforeStart:async()=>true,restartLimit:1,restartDelayMs:0,readinessTimeoutMs:3000,onSpawn:e=>{child=e.child;}});
 return {g,root,get child(){return child;}};
}
async function wait(g,fn){for(let i=0;i<150;i++){const s=g.status();if(fn(s))return s;await delay(20);}throw Error('MANUAL_FIXTURE_TIMEOUT '+JSON.stringify(g.status()));}
test('explicit user start reopens an exhausted budget; defaults and running reuse do not reset it',async()=>{
 const f=await setup(),g=f.g;
 try{
  await g.start();f.child.send({type:'crash'});const automatic=await wait(g,s=>s.phase==='running'&&s.generation===2);assert.equal(automatic.restartCount,1);
  const reused=await g.start({manual:true});assert.equal(reused.pid,automatic.pid);assert.equal(reused.generation,2);assert.equal(reused.restartCount,1);
  f.child.send({type:'crash'});await wait(g,s=>s.phase==='exhausted');const refused=await g.start();assert.equal(refused.phase,'exhausted');assert.equal(refused.generation,2);
  const next=await g.start({manual:true});assert.equal(next.phase,'running');assert.equal(next.generation,3);assert.equal(next.restartCount,0);
  const rows=(await readFile(join(f.root,'guardian/journal.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);assert.equal(rows.filter(r=>r.event==='manual-start-requested').length,1);
 }finally{await g.close();}
});
test('invalid manual-start types are refused before creating a child',async()=>{
 const f=await setup();
 try{for(const manual of [null,'true',1,{},[]])await assert.rejects(f.g.start({manual}),/GUARDIAN_OPTIONS_INVALID/);assert.equal(f.g.status().generation,0);}
 finally{await f.g.close();}
});
