// Operator only; starts one worker with the package's verified Node binary.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,realpath,open} from 'node:fs/promises';
import {join,resolve,isAbsolute,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {userInfo} from 'node:os';
import {setTimeout as delay} from 'node:timers/promises';
import {readAssemblyReceipt} from '../product-control/native-launch-runner.mjs';
import {loadProgram} from '../managed-broker/program-manifest.mjs';
import {classifyProjectRound as classifyDiagnostic} from './native-contract.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const fail=code=>{throw Object.assign(Error(code),{code});};
export {classifyDiagnostic};
async function main(){
 if(process.platform!=='darwin'||process.arch!=='arm64'||process.argv.length!==7)fail('SEP_WORKSPACE_ARGUMENT');
 const [assemblyPath,assemblySha,outputRoot,sharedDataRoot,roundArg]=process.argv.slice(2),round=Number(roundArg),temp=await realpath(process.env.RUNNER_TEMP);
 if(![1,2].includes(round)||!isAbsolute(sharedDataRoot)||resolve(sharedDataRoot)!==sharedDataRoot||!sharedDataRoot.startsWith(temp+sep)||resolve(outputRoot,'..')!==resolve(sharedDataRoot,'..'))fail('SEP_SETTINGS_ROUND_INPUT');
 if(!isAbsolute(outputRoot)||resolve(outputRoot)!==outputRoot||!outputRoot.startsWith(temp+sep))fail('SEP_WORKSPACE_OUTPUT');
 await mkdir(outputRoot,{mode:0o700});assert.equal(await realpath(outputRoot),outputRoot);
 let result,child,exit=null;
 try{
  const assembly=await readAssemblyReceipt(assemblyPath,assemblySha);assert(assembly.application.startsWith(temp+sep));assert.equal(await realpath(assembly.application),assembly.application);
  const programPath=join(assembly.application,'Contents/Resources/PROGRAM.json'),p=await loadProgram(programPath,assembly.programSha256);assert.equal(p.schema.schema,4);
  const brand=await readFile(join(p.hostRoot,'node_modules/@deepseek-ai/dsh-client-ui-brand-official/lib/client.js'));assert.equal(hash(brand),'0cf7ab11be691dd53a6724c6dd0517b3d734e9e88f044f73ace569869d5504a1');
  const input={schema:1,...assembly,programPath,nodeExecutable:p.entries.node.path,nodeSha256:p.entries.node.sha256,brandSha256:hash(brand),outputRoot,round,dataRoot:sharedDataRoot,tmpRoot:join(outputRoot,'tmp'),sourceInputs:[]};
  if(round===1)await mkdir(input.dataRoot,{mode:0o700});else assert.equal(await realpath(input.dataRoot),input.dataRoot);await mkdir(input.tmpRoot,{mode:0o700});
  for(const name of ['native-operator-r2.mjs','native-worker-r2.mjs','native-contract.mjs','NATIVE-ORIGIN.json','NATIVE-AUTHORITY-ORIGIN.json','derive-native-authority.mjs','native-dom.mjs','native-data-r2.mjs','native-p2-authority.mjs','../../settings-ui/desktop-onboarding.mjs','../smoke-inspector.mjs','../workspace-diagnostic.mjs','../product-control/native-launch-runner.mjs','../managed-broker/program-manifest.mjs']){const bytes=await readFile(new URL(name,import.meta.url));input.sourceInputs.push({path:name,sha256:hash(bytes),bytes:bytes.length});}
  const inputBytes=JSON.stringify(input,null,2)+'\n',inputPath=join(outputRoot,'INPUTS.json');await writeFile(inputPath,inputBytes,{flag:'wx',mode:0o600});
  const stdout=await open(join(outputRoot,'worker.stdout.log'),'wx',0o600),stderr=await open(join(outputRoot,'worker.stderr.log'),'wx',0o600);let receipt=null,normalCleanupRequested=false;
  const readReceipt=async()=>{try{return JSON.parse(await readFile(join(outputRoot,'WORKER-RESULT.json'),'utf8'));}catch{return null;}};
  try{
   child=spawn(p.entries.node.path,[fileURLToPath(new URL('./native-worker-r2.mjs',import.meta.url)),inputPath,hash(inputBytes)],{cwd:outputRoot,env:{PATH:'/usr/bin:/bin',HOME:userInfo().homedir,LANG:'en_US.UTF-8',RUNNER_TEMP:temp,TMPDIR:input.tmpRoot,TMP:input.tmpRoot,TEMP:input.tmpRoot},stdio:['ignore',stdout.fd,stderr.fd,'ipc']});
   child.once('close',(code,signal)=>{exit={code,signal};});child.once('error',()=>{exit={code:null,signal:null};});
   const deadline=Date.now()+330000;while(Date.now()<deadline){receipt=await readReceipt();if(exit||receipt?.status==='blocked')break;await delay(50);}
   if(!exit&&receipt?.status!=='blocked'){normalCleanupRequested=true;if(child.connected)try{child.send({kind:'requestCleanup'},()=>{});}catch{}const end=Date.now()+20000;while(Date.now()<end){receipt=await readReceipt();if(exit||receipt?.status==='blocked')break;await delay(50);}}
   receipt=await readReceipt();const outcome=classifyDiagnostic(receipt,exit);
   result={schema:1,...outcome,scope:'one actual derived-product current-project DOM round; distinct from Finder/physical input',roundNumber:round,expectedRounds:1,assemblyResultSha256:assemblySha,programSha256:assembly.programSha256,brandSha256:input.brandSha256,inputsSha256:hash(inputBytes),workerPid:child.pid??null,workerExit:exit,normalCleanupRequested,forcedTermination:false,round:receipt,notVerified:['native confirmation selection and accepted result','physical current-project interaction','physical AX/mouse input','Finder chain in this diagnostic','production data or paid model requests','TCC permissions','all platform certification']};
   if(!exit){if(child.connected)child.disconnect();child.unref();}
  }finally{await stdout.close();await stderr.close();}
 }catch(e){result={schema:1,status:child?'blocked':'fail',scope:child?'diagnostic operator failed after worker creation; ownership unconfirmed':'diagnostic preparation; no worker created',code:/^SEP_[A-Z0-9_]{1,90}$/.test(e?.code??'')?e.code:'SEP_WORKSPACE_PREPARATION',errorType:e.name,expectedRounds:1,round:{status:child?'blocked':'not_run'},workerPid:child?.pid??null,workerExit:exit,resourcesConfirmedReleased:false,forcedTermination:false};if(child&&!exit){if(child.connected)child.disconnect();child.unref();}}
 await writeFile(join(outputRoot,'RESULT.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({status:result.status,code:result.round?.code??result.code,stage:result.round?.stage,workerPid:result.workerPid??null}));if(result.status!=='pass')process.exitCode=1;
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)main().catch(e=>{console.error(JSON.stringify({status:'fail',code:'SEP_WORKSPACE_OPERATOR',errorType:e.name}));process.exitCode=1;});
