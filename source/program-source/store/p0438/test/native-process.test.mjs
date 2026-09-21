import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runBridge } from '../native-process.js';
import { ConversionError } from '../errors.js';
import { spawn } from 'node:child_process';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
const here=dirname(fileURLToPath(import.meta.url));
async function setup(mode) {
  const root=await mkdtemp(join(tmpdir(),'sep-bridge-test-')), input=join(root,'中文 & 输入.doc'), output=join(root,'中文 & 输入.pdf'), audit=join(root,'audit');
  await writeFile(input,'FIXTURE:'+mode+'|'+audit);
  const requestPath=join(root,'request.json');
  await writeFile(requestPath,JSON.stringify({executablePath:process.execPath,arguments:[join(here,'fixture-engine.mjs'),'--outdir',root,input],workingDirectory:root}));
  return {root,output,audit,requestPath};
}
test('Windows Job bridge starts an owned process with exact Unicode arguments',async()=>{
  const f=await setup('ok'); await runBridge(f.requestPath,f.output,100000,new AbortController().signal); assert.match(await readFile(f.output,'utf8'),/ok/);
});
test('Windows Job bridge consumes both noisy pipes without deadlock',async()=>{
  const f=await setup('flood'); const signal=AbortSignal.timeout(15000); await runBridge(f.requestPath,f.output,100000,signal); assert.match(await readFile(f.output,'utf8'),/flood/);
});
test('nonzero exit preserves useful bounded stderr',async()=>{
  const f=await setup('fail'); await assert.rejects(runBridge(f.requestPath,f.output,100000,new AbortController().signal),error=>error.code==='failed'&&/fixture failure marker/.test(error.diagnostics.stderr)&&error.diagnostics.stderr.length<=32768);
});
test('cancellation kills native Job descendants before the promise settles',async()=>{
  const f=await setup('tree');const controller=new AbortController();const started=Date.now();
  const task=runBridge(f.requestPath,f.output,100000,controller.signal);const outcome=task.catch(error=>error);
  while(true){try{await access(f.audit+'.pid');break;}catch(error){if(Date.now()-started>10000)throw error;await new Promise(r=>setTimeout(r,50));}}
  const pid=Number(await readFile(f.audit+'.pid','utf8'));controller.abort();
  assert.equal((await outcome).name,'AbortError');assert.throws(()=>process.kill(pid,0),error=>error.code==='ESRCH');assert.ok(Date.now()-started<15000);
});
test('deadline cancellation retains timeout category and ends owned process',async()=>{
  const f=await setup('sleep60000');const controller=new AbortController();const timer=setTimeout(()=>controller.abort(new ConversionError('timeout','deadline')),2000);
  try{await assert.rejects(runBridge(f.requestPath,f.output,100000,controller.signal),error=>error.code==='timeout');}finally{clearTimeout(timer);}
});
test('pre-cancelled bridge does not launch the fixture',async()=>{
  const f=await setup('ok');const controller=new AbortController();controller.abort();await assert.rejects(runBridge(f.requestPath,f.output,100000,controller.signal),error=>error.name==='AbortError');await assert.rejects(access(f.audit),error=>error.code==='ENOENT');
});
test('unexpected owner exit revokes the stdin lease and stops the full owned Job',async()=>{
  const f=await setup('tree');const owner=spawn(process.execPath,[join(here,'bridge-owner.mjs'),f.requestPath,f.output],{stdio:['ignore','pipe','pipe'],windowsHide:true});
  let diagnostics='';owner.stdout.on('data',()=>{});owner.stderr.on('data',chunk=>{diagnostics+=chunk.toString();});
  const started=Date.now();while(true){try{await access(f.audit+'.pid');break;}catch(error){if(Date.now()-started>15000){owner.kill();throw new Error('child did not start: '+diagnostics);}await new Promise(r=>setTimeout(r,50));}}
  const pid=Number(await readFile(f.audit+'.pid','utf8'));owner.kill();
  let alive=true;for(let i=0;i<60;i++){try{process.kill(pid,0);}catch(error){if(error.code==='ESRCH'){alive=false;break;}throw error;}await new Promise(r=>setTimeout(r,50));}
  // Failure cleanup is bounded by the fixture's own 60 s timer, never a name-based kill.
  assert.equal(alive,false,'The owner died but its engine descendant remained alive.');
});
test('kill-operation error cannot be mistaken for confirmed process exit',async()=>{
  // Only the external child-process boundary is substituted: spawn succeeded,
  // kill emits an OS error, and the real state machine must still wait for close.
  const original=childProcess.spawn,fake=new EventEmitter();fake.pid=123456;fake.stdin=new PassThrough();fake.stdout=new PassThrough();fake.stderr=new PassThrough();
  fake.kill=()=>{queueMicrotask(()=>fake.emit('error',Object.assign(new Error('kill denied'),{code:'EPERM'})));return false;};
  childProcess.spawn=()=>fake;syncBuiltinESMExports();const controller=new AbortController();let settled=false;
  try{const task=runBridge('unused-request','unused-output',100000,controller.signal).catch(e=>e).finally(()=>{settled=true;});fake.emit('spawn');controller.abort();await new Promise(r=>setTimeout(r,30));assert.equal(settled,false);fake.emit('close',1);assert.equal((await task).name,'AbortError');}
  finally{childProcess.spawn=original;syncBuiltinESMExports();fake.emit('close',1);}
});
