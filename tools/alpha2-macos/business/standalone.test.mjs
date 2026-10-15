import test from 'node:test';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {hash} from './bounded-read.mjs';
test('real native macOS official web profile boots, releases all resources and reopens its own ledger',{skip:process.platform!=='darwin'?'native Darwin run required':false,timeout:120000},async()=>{
 assert(process.env.SEP_MAC_BUSINESS_TEST_ROOT);assert(process.env.SEP_MAC_TREE_HELPER);
 const root=resolve(process.env.SEP_MAC_BUSINESS_TEST_ROOT);await mkdir(root,{recursive:true,mode:0o700});const base=await mkdtemp(join(root,'standalone-'));
 const input={programRoot:process.env.SEP_MAC_PROGRAM_ROOT??fileURLToPath(new URL('..',import.meta.url)).replace(/\/$/,''),hostRoot:process.env.SEP_OFFICIAL_HARNESS,bundleRoot:process.env.SEP_MAC_BUNDLE_ROOT,dataRoot:join(base,'data'),projectRoot:join(base,'project'),helperPath:process.env.SEP_MAC_TREE_HELPER,helperSha256:hash(await readFile(process.env.SEP_MAC_TREE_HELPER)),initialize:true,shutdownMs:5000};
 const env=Object.fromEntries(['PATH','HOME','TMPDIR','LANG','LC_ALL','TZ','NODE_EXTRA_CA_CERTS'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
 async function run(round){
  const child=fork(fileURLToPath(new URL('./standalone-probe.mjs',import.meta.url)),[],{env,stdio:['ignore','pipe','pipe','ipc']});let output='',failure,timer;const messages=[],waiters=[];
  for(const stream of[child.stdout,child.stderr])stream.on('data',b=>{output+=b.toString();if(output.length>2*1024*1024){failure=Error('OUTPUT_LIMIT');child.kill('SIGKILL');}});
  child.on('message',message=>{const waiter=waiters.shift();if(waiter)waiter(message);else messages.push(message);});
  const exit=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));child.on('error',e=>{failure=e;});
  const next=()=>Promise.race([messages.length?Promise.resolve(messages.shift()):new Promise(r=>waiters.push(r)),exit.then(result=>{throw Error('EARLY_EXIT '+JSON.stringify(result)+' '+output);}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('START_DEADLINE '+output)),45000);})]).finally(()=>clearTimeout(timer));
  try{child.send({type:'open',input:{...input,initialize:round===1}});const ready=await next();assert.equal(ready.phase,'ready',JSON.stringify(ready)+' '+output);assert([200,302,303,307].includes(ready.status));assert.deepEqual(ready.inspected,{activeTasks:false,scheduledTasks:false});assert.equal(ready.authenticatedUrlPresent,true);child.send({type:'close'});const closed=await next();assert.equal(closed.phase,'closed',JSON.stringify(closed)+' '+output);assert.equal(closed.receipt.status,'pass',JSON.stringify(closed));assert.equal(closed.receipt.resourcesConfirmedReleased,true);
   const ended=await Promise.race([exit,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('EXIT_DEADLINE '+output)),15000);})]);clearTimeout(timer);assert.deepEqual(ended,{code:0,signal:null});assert.equal(failure,undefined);
  }finally{clearTimeout(timer);if(child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await exit;}await writeFile(join(base,'round-'+round+'.log'),output);}
 }
 await run(1);const ledger=await readFile(join(input.dataRoot,'budget/ledger.json'));await run(2);assert.equal((await readFile(join(input.dataRoot,'budget/ledger.json'))).equals(ledger),true,'empty restart cannot reset or rewrite the ledger');
});
