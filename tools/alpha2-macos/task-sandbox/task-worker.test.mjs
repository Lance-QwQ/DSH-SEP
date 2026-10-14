import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile,copyFile,chmod,readdir,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createServer} from 'node:net';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createProjectTree} from '../apfs-tree/project-tree.mjs';
import {createTaskWorker} from './task-worker.mjs';
assert.equal(process.platform,'darwin');assert.equal(process.arch,'arm64');
const env=process.env,root=env.SEP_MAC_TASK_TEST_ROOT,ownerPath=env.SEP_MAC_TASK_OWNER,probe=env.SEP_MAC_TASK_PROBE,helperPath=env.SEP_MAC_TREE_HELPER;assert(root&&ownerPath&&probe&&helperPath);await mkdir(root,{mode:0o700});
const hash=x=>createHash('sha256').update(x).digest('hex'),exec=promisify(execFile),pause=ms=>new Promise(r=>setTimeout(r,ms));
const ownerSha256=hash(await readFile(ownerPath)),helperSha256=hash(await readFile(helperPath));
async function fixture(){const parent=await mkdtemp(join(root,'case-'));for(const n of ['work','runtime','authority'])await mkdir(join(parent,n),{mode:0o700});const executable=join(parent,'runtime/probe');await copyFile(probe,executable);await chmod(executable,0o555);await chmod(join(parent,'runtime'),0o555);const config={workRoot:join(parent,'work'),runtimeRoot:join(parent,'runtime'),authorityRoot:join(parent,'authority'),executable,executableSha256:hash(await readFile(executable)),ownerPath,ownerSha256};const io=createProjectTree({helperPath,helperSha256,lockPath:join(config.authorityRoot,'.native.lock')});return {parent,config,io,worker:await createTaskWorker(config,io)};}
const bounded=async p=>{let timer;try{return await Promise.race([p,new Promise((_,j)=>{timer=setTimeout(()=>j(Error('TEST_DEADLINE')),10000);})]);}finally{clearTimeout(timer);}};
test('single native task consumes bounded stdin and only reports waited completion',async()=>{const {worker}=await fixture(),r=await bounded(worker.run({args:['echo'],stdin:'hello'}));assert.equal(r.status,'pass');assert.equal(r.stdout,'hello');assert.equal(r.resourcesConfirmedReleased,true);assert.equal((await worker.whenClosed()).resourcesConfirmedReleased,true);});
for(const method of ['fork','vfork','spawn'])test('kernel denies '+method+' in single mode',async()=>{const {worker}=await fixture(),r=await bounded(worker.run({args:[method]}));assert.equal(r.status,'pass');const outcome=JSON.parse(r.stdout);assert.equal(outcome.denied,true);assert([1,13].includes(outcome.errno));assert.equal(r.resourcesConfirmedReleased,true);});
test('work writes succeed while original controller other transaction runtime and loopback deny',async()=>{
 const {worker,parent,config}=await fixture(),original=join(parent,'original'),next=join(parent,'next'),controller=join(config.authorityRoot,'secret'),own=join(config.workRoot,'own');for(const f of [original,next,controller])await writeFile(f,'untouched',{mode:0o600});
 const server=createServer(s=>s.end());server.listen(0,'127.0.0.1');await new Promise((r,j)=>{server.once('listening',r);server.once('error',j);});try{
  const args=['boundaries',own,original,controller,next,String(server.address().port),config.executable];
  // Real unconfined positive control establishes the original is writable.
  await exec(probe,args,{timeout:3000,maxBuffer:65536});assert.equal(await readFile(original,'utf8'),'changed');for(const f of [original,next,controller])await writeFile(f,'untouched');
  const r=await bounded(worker.run({args}));assert.equal(r.status,'pass');const row=JSON.parse(r.stdout);assert.equal(row.own,0);for(const key of ['original','controller','next','read','network','runtime'])assert([1,13].includes(row[key]),key);for(const f of [original,next,controller])assert.equal(await readFile(f,'utf8'),'untouched');
 }finally{await new Promise(r=>server.close(r));}
});
test('normal timeout kills and waits the sole process before marking cleanup confirmed',async()=>{const {worker}=await fixture(),r=await bounded(worker.run({args:['sleep'],timeoutMs:150,graceMs:100}));assert.equal(r.status,'fail');assert.equal(r.code,'SEP_MAC_TASK_TIMEOUT');assert.equal(r.resourcesConfirmedReleased,true);});
test('caller cancellation requests native cleanup and waits actual receipt',async()=>{const {worker}=await fixture(),controller=new AbortController(),p=worker.run({args:['sleep'],signal:controller.signal});const timer=setTimeout(()=>controller.abort(),100);try{const r=await bounded(p);assert.equal(r.status,'fail');assert.equal(r.code,'SEP_MAC_TASK_CANCELLED');assert.equal(r.resourcesConfirmedReleased,true);}finally{clearTimeout(timer);}});
test('output overflow consumes pipes while bounding retained bytes',async()=>{const {worker}=await fixture(),r=await bounded(worker.run({args:['flood'],maxOutputBytes:1024}));assert.equal(r.status,'fail');assert.equal(r.code,'SEP_MAC_TASK_OUTPUT_LIMIT');assert(Buffer.byteLength(r.stdout)+Buffer.byteLength(r.stderr)<=1024);assert.equal(r.resourcesConfirmedReleased,true);});
test('escaped family child remains isolated and leader exit cannot certify cleanup or permit reuse',async()=>{
 const {worker,config,io}=await fixture(),late=join(config.workRoot,'late'),r=await bounded(worker.run({mode:'family',args:['family',late]}));assert.equal(r.status,'blocked');assert.equal(r.code,'SEP_MAC_TASK_FAMILY_CLEANUP_UNCONFIRMED');assert.equal(r.resourcesConfirmedReleased,false);assert.equal(r.workRetentionRequired,true);
 const until=Date.now()+3000;let wrote=false;while(Date.now()<until){try{wrote=await readFile(late,'utf8')==='changed';if(wrote)break;}catch(e){if(e.code!=='ENOENT')throw e;}await pause(25);}assert.equal(wrote,true);
 let closed=false;worker.whenClosed().then(()=>closed=true);await pause(10);assert.equal(closed,false);const restarted=await createTaskWorker(config,io);await assert.rejects(restarted.run({args:['echo']}),{code:'SEP_MAC_TASK_ALREADY_USED'});
});
test('missing trusted-owner receipt cannot become cleanup pass and leaves durable blocker',async()=>{const {config,io}=await fixture(),bad={...config,ownerPath:probe,ownerSha256:hash(await readFile(probe))},worker=await createTaskWorker(bad,io);const r=await bounded(worker.run({args:['echo']}));assert.equal(r.status,'blocked');assert.equal(r.resourcesConfirmedReleased,false);assert((await readdir(config.authorityRoot)).some(n=>n.endsWith('.task.jsonl')));});
test('completion-record delay cannot disable response deadline or prematurely resolve whenClosed',async()=>{
 const {config,io}=await fixture();let releaseRecord,recordEntered=false;const gate=new Promise(r=>{releaseRecord=r;});
 // The storage operation is real; delay only its completion notification.
 const heldIO={...io,async applyFile(root,options){const r=await io.applyFile(root,options);if(options.text.includes('"state":"closed"')){recordEntered=true;await gate;}return r;}};
 const worker=await createTaskWorker(config,heldIO);try{
  const r=await bounded(worker.run({args:['echo'],timeoutMs:500,graceMs:50}));assert.equal(recordEntered,true);assert.equal(r.status,'blocked');assert.equal(r.code,'SEP_MAC_TASK_CLEANUP_DEADLINE');
  let closed=false;worker.whenClosed().then(()=>closed=true);await pause(10);assert.equal(closed,false);releaseRecord();assert.equal((await bounded(worker.whenClosed())).resourcesConfirmedReleased,true);assert.equal(r.status,'blocked');
 }finally{releaseRecord();}
});
test('aliases created during execution cannot grant original-file read write or hard-link mutation',async()=>{
 const {worker,parent,config}=await fixture(),original=join(parent,'original'),control=join(parent,'unconfined'),controlWork=join(control,'work'),controlOriginal=join(control,'original');
 await mkdir(control,{mode:0o700});await mkdir(controlWork,{mode:0o700});await writeFile(controlOriginal,'untouched',{mode:0o600});await writeFile(original,'untouched',{mode:0o600});
 const positive=JSON.parse((await exec(probe,['aliases',controlWork,controlOriginal],{timeout:3000,maxBuffer:65536})).stdout);for(const n of Object.keys(positive))assert.equal(positive[n],0,n);assert.equal(await readFile(controlOriginal,'utf8'),'changed');
 const r=await bounded(worker.run({args:['aliases',config.workRoot,original]}));assert.equal(r.status,'pass');const row=JSON.parse(r.stdout);
 assert([0,1,13].includes(row.symlink));for(const k of ['symlinkRead','symlinkWrite','hardlinkRead','hardlinkWrite'])assert([1,2,13].includes(row[k]),k);assert([1,13].includes(row.hardlink));assert.equal(await readFile(original,'utf8'),'untouched');assert.equal((await lstat(original)).nlink,1);
});
