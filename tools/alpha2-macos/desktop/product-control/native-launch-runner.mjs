// Test operator only. Never included in the installed runtime closure.
import {readFile,lstat,realpath,mkdir,writeFile,open} from 'node:fs/promises';
import {join,resolve,isAbsolute,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {userInfo} from 'node:os';
import {setTimeout as delay} from 'node:timers/promises';
const hash=b=>createHash('sha256').update(b).digest('hex');
const fail=code=>{throw Object.assign(Error(code),{code});};
const code=e=>/^SEP_[A-Z0-9_]{1,90}$/.test(e?.code??'')?e.code:'SEP_PRODUCT_NATIVE_RUNNER';
export async function readAssemblyReceipt(path,expectedSha256){
 if(!isAbsolute(path)||resolve(path)!==path||!/^[a-f0-9]{64}$/.test(expectedSha256??''))fail('SEP_PRODUCT_ASSEMBLY_CHANGED');
 const st=await lstat(path);if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||st.size>1048576||await realpath(path)!==path)fail('SEP_PRODUCT_ASSEMBLY_CHANGED');
 const bytes=await readFile(path);if(hash(bytes)!==expectedSha256)fail('SEP_PRODUCT_ASSEMBLY_CHANGED');
 let r;try{r=JSON.parse(bytes);}catch{fail('SEP_PRODUCT_ASSEMBLY_RESULT');}
 if(r.status!=='pass'||!/^[a-f0-9]{64}$/.test(r.programSha256??'')||typeof r.restoredApplication!=='string'||!isAbsolute(r.restoredApplication)||resolve(r.restoredApplication)!==r.restoredApplication||!r.restoredApplication.endsWith('.app'))fail('SEP_PRODUCT_ASSEMBLY_RESULT');
 return Object.freeze({application:r.restoredApplication,programSha256:r.programSha256,assemblyResultPath:path,assemblyResultSha256:expectedSha256});
}
async function optionalJson(path){try{return JSON.parse(await readFile(path,'utf8'));}catch{return null;}}
function classify(receipt,exit){
 const cases=Array.isArray(receipt?.cases)?receipt.cases:[],complete=cases.length===2&&cases.every((r,i)=>r.index===i+1&&['pass','fail','blocked','not_run'].includes(r.status));
 const counts=Object.fromEntries(['pass','fail','blocked','not_run'].map(k=>[k,cases.filter(r=>r.status===k).length]));
 const confirmed=complete&&cases.every(r=>r.cleanup?.status==='pass'&&r.cleanup.resourcesConfirmedReleased===true);
 const normalExit=exit!==null&&exit.signal===null&&Number.isInteger(exit.code);
 const status=!confirmed||!normalExit?'blocked':receipt.status==='pass'&&counts.pass===2&&exit.code===0?'pass':'fail';
 return {status,cases,counts,cleanup:{status:confirmed&&normalExit?'pass':'blocked',resourcesConfirmedReleased:confirmed&&normalExit}};
}
export async function superviseNativeWorker({child,outputRoot,deadlineMs=180000,cleanupMs=20000}){
 let exit=child.exitCode!==null||child.signalCode!==null?{code:child.exitCode,signal:child.signalCode}:null,normalCleanupRequested=false;
 child.once('close',(code,signal)=>{exit={code,signal};});child.once('error',()=>{exit={code:null,signal:null};});
 const file=join(outputRoot,'WORKER-RESULT.json'),deadline=Date.now()+deadlineMs;let receipt;
 while(Date.now()<deadline){receipt=await optionalJson(file);if(exit||receipt?.status==='blocked')break;await delay(25);}
 if(!exit&&receipt?.status!=='blocked'){
  normalCleanupRequested=true;
  if(child.connected)try{child.send({kind:'requestCleanup'},()=>{});}catch{}
  const end=Date.now()+cleanupMs;while(Date.now()<end){receipt=await optionalJson(file);if(exit||receipt?.status==='blocked')break;await delay(25);}
 }
 receipt=await optionalJson(file);const result={schema:1,...classify(receipt,exit),workerPid:child.pid??null,workerExit:exit,normalCleanupRequested,workerReceiptPresent:receipt!==null,forcedTermination:false};
 // Unknown resources stay owned by the exact worker. The operator stops waiting;
 // it does not signal the worker, unlock it, or count CI teardown as cleanup.
 if(!exit){if(child.connected)child.disconnect();child.unref();}
 return result;
}
async function main(){
 if(process.platform!=='darwin'||process.arch!=='arm64')fail('SEP_PRODUCT_NATIVE_PLATFORM');
 if(process.argv.length!==5)fail('SEP_PRODUCT_NATIVE_ARGUMENT');
 const [assemblyPath,expectedSha,outputRoot]=process.argv.slice(2);
 if(!process.env.RUNNER_TEMP)fail('SEP_PRODUCT_NATIVE_OUTPUT');const runnerTemp=await realpath(process.env.RUNNER_TEMP);
 if(!isAbsolute(outputRoot)||resolve(outputRoot)!==outputRoot||!outputRoot.startsWith(runnerTemp+sep))fail('SEP_PRODUCT_NATIVE_OUTPUT');
 await mkdir(outputRoot,{mode:0o700});if(await realpath(outputRoot)!==outputRoot)fail('SEP_PRODUCT_NATIVE_OUTPUT');
 let result;
 try{
  const assembly=await readAssemblyReceipt(assemblyPath,expectedSha);
  if(!assembly.application.startsWith(runnerTemp+sep)||await realpath(assembly.application)!==assembly.application)fail('SEP_PRODUCT_NATIVE_APPLICATION');
  const programPath=join(assembly.application,'Contents/Resources/PROGRAM.json');
  const {loadProgram}=await import('../managed-broker/program-manifest.mjs');
  const p=await loadProgram(programPath,assembly.programSha256);if(p.schema.schema!==4)fail('SEP_PRODUCT_LAYOUT');
  const worker=fileURLToPath(new URL('./native-launch-worker.mjs',import.meta.url)),input={schema:1,...assembly,programPath,nodeExecutable:p.entries.node.path,nodeSha256:p.entries.node.sha256,outputRoot,testRoot:join(outputRoot,'testdata'),tmpRoot:join(outputRoot,'tmp')};
  await mkdir(input.testRoot,{mode:0o700});await mkdir(input.tmpRoot,{mode:0o700});
  const inputs=['native-launch-runner.mjs','native-launch-worker.mjs','native-launch-cases.mjs','../managed-broker/program-manifest.mjs'];
  input.sourceInputs=await Promise.all(inputs.map(async name=>{const bytes=await readFile(new URL(name,import.meta.url));return{path:name,bytes:bytes.length,sha256:hash(bytes)};}));
  input.platform={platform:process.platform,arch:process.arch,operatorNode:process.version,macOSVersion:execFileSync('/usr/bin/sw_vers',['-productVersion'],{encoding:'utf8'}).trim(),macOSBuild:execFileSync('/usr/bin/sw_vers',['-buildVersion'],{encoding:'utf8'}).trim()};
  const inputPath=join(outputRoot,'INPUTS.json'),inputBytes=JSON.stringify(input,null,2)+'\n';await writeFile(inputPath,inputBytes,{flag:'wx',mode:0o600});
  const stdout=await open(join(outputRoot,'worker.stdout.log'),'wx',0o600),stderr=await open(join(outputRoot,'worker.stderr.log'),'wx',0o600);
  try{
   // Fresh environment object only; the calling shell's environment is unchanged.
   const env={PATH:'/usr/bin:/bin',HOME:userInfo().homedir,LANG:'en_US.UTF-8',TMPDIR:input.tmpRoot,TMP:input.tmpRoot,TEMP:input.tmpRoot};
   const child=spawn(p.entries.node.path,[worker,inputPath],{cwd:outputRoot,env,stdio:['ignore',stdout.fd,stderr.fd,'ipc']});
   result={...(await superviseNativeWorker({child,outputRoot})),scope:'two direct assembled product launch definitions; separate testdata, not Finder launch',expectedDefinitions:2,assemblyResultSha256:expectedSha,programSha256:assembly.programSha256,inputsSha256:hash(inputBytes),platform:input.platform,finderDataRootUsed:false};
  }finally{await stdout.close();await stderr.close();}
 }catch(e){result={schema:1,status:'fail',code:code(e),scope:'native launch operator preparation',expectedDefinitions:2,cases:[],counts:{pass:0,fail:0,blocked:0,not_run:2},forcedTermination:false};}
 await writeFile(join(outputRoot,'RESULT.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({status:result.status,counts:result.counts,workerPid:result.workerPid??null,outputRoot}));if(result.status!=='pass')process.exitCode=1;
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)main().catch(e=>{console.error(JSON.stringify({status:'fail',code:code(e)}));process.exitCode=1;});
