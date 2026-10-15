import test from 'node:test';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const hash=b=>createHash('sha256').update(b).digest('hex');
test('native settings route, CAS and reboot keep real memory controls and budget accounting',{skip:process.platform!=='darwin'?'native Darwin required':false,timeout:150000},async()=>{
 const root=process.env.SEP_MAC_SETTINGS_TEST_ROOT;assert(root);await mkdir(root,{recursive:true,mode:0o700});const base=await mkdtemp(join(resolve(root),'native-'));
 const input={programRoot:process.env.SEP_MAC_PROGRAM_ROOT??fileURLToPath(new URL('..',import.meta.url)).replace(/\/$/,''),hostRoot:process.env.SEP_OFFICIAL_HARNESS,bundleRoot:process.env.SEP_MAC_BUNDLE_ROOT,dataRoot:join(base,'data'),projectRoot:join(base,'project'),helperPath:process.env.SEP_MAC_TREE_HELPER,helperSha256:hash(await readFile(process.env.SEP_MAC_TREE_HELPER)),attachmentHelperPath:process.env.SEP_MAC_ATTACHMENT_HELPER,attachmentHelperSha256:hash(await readFile(process.env.SEP_MAC_ATTACHMENT_HELPER)),initialize:true,shutdownMs:5000};
 const env=Object.fromEntries(['PATH','HOME','TMPDIR','LANG','LC_ALL','TZ','NODE_EXTRA_CA_CERTS'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
 async function run(round){
  const child=fork(fileURLToPath(new URL('./native-probe.mjs',import.meta.url)),[],{env,stdio:['ignore','pipe','pipe','ipc']});let output='',timer;const messages=[],waiters=[];
  for(const stream of[child.stdout,child.stderr])stream.on('data',b=>{output+=b.toString();if(output.length>2097152)child.kill('SIGKILL');});
  child.on('message',m=>{const waiter=waiters.shift();if(waiter)waiter(m);else messages.push(m);});
  const exit=new Promise(r=>child.once('exit',(code,signal)=>r({code,signal}))),next=()=>Promise.race([messages.length?Promise.resolve(messages.shift()):new Promise(r=>waiters.push(r)),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('SETTINGS_DEADLINE '+output)),55000);}),exit.then(r=>{throw Error('SETTINGS_EARLY_EXIT '+JSON.stringify(r)+' '+output);})]).finally(()=>clearTimeout(timer));
  try{child.send({type:'open',round,input:{...input,initialize:round===1}});const ready=await next();assert.equal(ready.phase,'ready',JSON.stringify(ready)+' '+output);assert.deepEqual(ready.settings,{status:'pass',fiberActive:true,clientAdvertised:true,staticClientServed:true,memoryAvailable:true,budgetAvailable:true});assert.deepEqual(ready.checks,{unauthenticatedRefused:true,memoryAvailable:true,budgetAvailable:true,settingsPersisted:round===2,casRefused:round===1,ledgerPreserved:true});child.send({type:'close'});const closed=await next();assert.equal(closed.receipt?.status,'pass',JSON.stringify(closed));assert.equal(closed.receipt.resourcesConfirmedReleased,true);const ended=await Promise.race([exit,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('SETTINGS_EXIT_DEADLINE')),15000);})]);assert.deepEqual(ended,{code:0,signal:null});await writeFile(join(base,'round-'+round+'.json'),JSON.stringify({ready,closed,ended},null,2)+'\n');}
  finally{clearTimeout(timer);if(child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await Promise.race([exit,new Promise(r=>setTimeout(r,5000))]);output+='\nTEST_CLEANUP_SIGKILL\n';}await writeFile(join(base,'round-'+round+'.log'),output);}
 }
 await run(1);const ledger=await readFile(join(input.dataRoot,'budget/ledger.json'));await run(2);assert.deepEqual(await readFile(join(input.dataRoot,'budget/ledger.json')),ledger,'reboot/read cannot reset or rewrite the ledger');
});
