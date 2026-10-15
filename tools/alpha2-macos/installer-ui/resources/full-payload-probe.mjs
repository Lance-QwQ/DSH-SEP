// TEST OPERATOR ONLY. Build resources and exercise the real fixed child entry.
// No confirm/resume request, application launch, outer shell, or signing.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,lstat,realpath} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {userInfo} from 'node:os';
import {createHash,randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {setImmediate as yieldToLoop} from 'node:timers/promises';
import {readCandidate} from '../../desktop/project-workflow-product/candidate-binding.mjs';
import {verifyCandidate} from '../../installer-entry/candidate.mjs';
import {encodeRequest,createResponseReader} from '../protocol.mjs';
import {INSTALLER_PATHS as paths} from '../manifest.mjs';
import {assembleInstallerResources} from './assemble-resources.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
const fail=code=>{throw Object.assign(Error(code),{code});};
const code=e=>/^SEP_[A-Z0-9_]{1,100}$/.test(e?.code??'')?e.code:'SEP_INSTALLER_FULL_PROBE';
const bounded=async(work,ms,label)=>{let timer;try{return await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(Error(label),{code:label})),ms);})]);}finally{clearTimeout(timer);}};
assert.equal(process.platform,'darwin');assert.equal(process.arch,'arm64');assert.equal(process.argv.length,6);
const [resultPath,resultSha256,restoredArg,outArg]=process.argv.slice(2),temp=await realpath(process.env.RUNNER_TEMP),workspace=await realpath(process.env.GITHUB_WORKSPACE);
const restored=await realpath(restoredArg),out=resolve(outArg),sourceRoot=await realpath(fileURLToPath(new URL('../../',import.meta.url)));
assert.equal(restoredArg,restored);assert(out.startsWith(temp+'/'));assert(sourceRoot.startsWith(workspace+'/'));assert.equal(await realpath(dirname(out)),dirname(out));await mkdir(out,{mode:0o700});
const result={schema:1,status:'fail',scope:'Actual fixed r61 payload resource assembly and real private controller preview/cancel/list/close only',sourceCommit:process.env.GITHUB_SHA??null,operations:[],applicationStarted:false,installConfirmationSent:false,outerSignatureCreated:false,notVerified:['AppKit installer UI','Installation confirmation and data mutation','LaunchServices startup','Developer ID/notarization','arbitrary user environments']};
const save=(name,value)=>writeFile(join(out,name),JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
async function accountState(){
 const home=await realpath(userInfo().homedir),names={applications:join(home,'Applications'),target:join(home,'Applications/DSH SEP.app'),dataRoot:join(home,'Library/Application Support/DSH SEP/alpha2-mac-finder-preview'),governanceRoot:join(home,'Library/Application Support/DSH SEP Installer')},state={home};
 for(const [key,path]of Object.entries(names)){try{const s=await lstat(path,{bigint:true});assert(s.isDirectory()&&!s.isSymbolicLink());assert.equal(await realpath(path),path);state[key]={path,identity:[s.dev,s.ino,s.mode,s.uid,s.nlink,s.mtimeNs,s.ctimeNs].join(':')};}catch(e){if(e.code!=='ENOENT')throw e;state[key]={path,absent:true};}}
 return state;
}
function channel(node,controller,contents,manifestSha256){
 const nonce=randomBytes(32).toString('hex'),child=spawn(node,[controller,nonce,manifestSha256],{cwd:contents,env:{PATH:'/usr/bin:/bin',LANG:'en_US.UTF-8'},stdio:['pipe','pipe','pipe']});
 let sequence=0,pending=null,fault,stdoutEOF=false,exit,stderrBytes=0,stdoutBytes=0,closedReceipt=false;
 const stderrHash=createHash('sha256');child.stdin.on('error',()=>{});
 function reject(e){fault??=e;if(pending){const p=pending;pending=null;p.reject(e);}}
 child.on('error',()=>reject(Object.assign(Error('SEP_INSTALLER_FULL_CHILD_START'),{code:'SEP_INSTALLER_FULL_CHILD_START'})));
 child.stdout.on('data',bytes=>{
  stdoutBytes+=bytes.length;if(stdoutBytes>131072){reject(Object.assign(Error('SEP_INSTALLER_FULL_OUTPUT_LIMIT'),{code:'SEP_INSTALLER_FULL_OUTPUT_LIMIT'}));return;}
  if(!pending){reject(Object.assign(Error('SEP_INSTALLER_FULL_UNSOLICITED'),{code:'SEP_INSTALLER_FULL_UNSOLICITED'}));return;}
  try{const r=pending.reader.push(bytes);if(r){pending.reader.finish();const p=pending;pending=null;if(r.phase==='closed'&&r.status==='pass'&&r.resourcesReleased===true)closedReceipt=true;p.resolve(r);}}catch(e){reject(e);}
 });
 child.stdout.on('end',()=>{stdoutEOF=true;if(pending)reject(Object.assign(Error('SEP_INSTALLER_FULL_EARLY_EOF'),{code:'SEP_INSTALLER_FULL_EARLY_EOF'}));});
 child.stderr.on('data',bytes=>{stderrBytes+=bytes.length;stderrHash.update(bytes);if(stderrBytes>65536)reject(Object.assign(Error('SEP_INSTALLER_FULL_STDERR_LIMIT'),{code:'SEP_INSTALLER_FULL_STDERR_LIMIT'}));});
 const closed=new Promise(resolve=>child.once('close',(exitCode,signal)=>{exit={exitCode,signal};resolve(exit);if(pending)reject(Object.assign(Error('SEP_INSTALLER_FULL_CHILD_EXIT'),{code:'SEP_INSTALLER_FULL_CHILD_EXIT'}));}));
 async function request(operation,input={}){
  if(fault)throw fault;if(pending||exit)fail('SEP_INSTALLER_FULL_CHANNEL');if(!['listRecovery','preview','cancel','close'].includes(operation))fail('SEP_INSTALLER_FULL_OPERATION');
  sequence++;const frame=encodeRequest({protocol:1,nonce,sequence,operation,input});
  const work=new Promise((resolve,reject)=>{pending={reader:createResponseReader({nonce,sequence}),resolve,reject};child.stdin.write(frame,e=>{if(e)reject(e);});});
  const response=await bounded(work,180000,'SEP_INSTALLER_FULL_RESPONSE_DEADLINE');await yieldToLoop();assert.equal(response.status,'pass');return response;
 }
 async function finish(){
  if(!closedReceipt){if(fault||pending)fail('SEP_INSTALLER_FULL_CLEANUP_UNCONFIRMED');await request('close');}
  child.stdin.end();const r=await bounded(closed,30000,'SEP_INSTALLER_FULL_CLEANUP_UNCONFIRMED');
  if(fault||!closedReceipt||!stdoutEOF||r.exitCode!==0||r.signal)fail('SEP_INSTALLER_FULL_CLEANUP_UNCONFIRMED');
  return{status:'pass',resourcesReleased:true,closedReceipt:true,stdoutEOF,childPid:child.pid,exactChildExit:r,forcedTermination:false,stdoutBytes,stderrBytes,stderrSha256:stderrHash.copy().digest('hex')};
 }
 function leaveUnknown(){
  // Parent EOF asks the fixed controller to drain its accepted work. It is not
  // cancellation proof and does not authorize killing retained native owners.
  child.stdin.end();child.unref();for(const stream of [child.stdin,child.stdout,child.stderr])stream.unref?.();
  return{status:'blocked',resourcesReleased:false,closedReceipt,stdoutEOF,childPid:child.pid??null,exactChildExit:exit??null,forcedTermination:false,cleanupPath:'private-input EOF requested; unresolved work left to CI teardown',stdoutBytes,stderrBytes};
 }
 return{request,finish,leaveUnknown};
}
let control,cleanup,before;
try{
 const binding=await readCandidate({resultPath,resultSha256,restoredRoot:restored,runnerTemp:temp}),inventory=JSON.parse(await readFile(join(restored,'PACKAGE-INVENTORY.json'),'utf8'));
 const receipt={inventory,programSha256:binding.programSha256,bootstrapSha256:binding.bootstrapSha256};await verifyCandidate(binding.restoredApplication,receipt);
 result.binding={sourceAssemblySha256:binding.sourceAssemblySha256,archiveSha256:binding.artifactSha256,treeSha256:binding.treeSha256,programSha256:binding.programSha256,bootstrapSha256:binding.bootstrapSha256,entries:inventory.entries.length,totalBytes:inventory.totalBytes};
 before=await accountState();for(const key of ['target','dataRoot','governanceRoot'])assert.equal(before[key].absent,true,'fresh CI account required: '+key);await save('ACCOUNT-BEFORE.json',before);
 const app=join(out,'Installer.app');await mkdir(app,{mode:0o700});const assembly=await assembleInstallerResources({sourceApp:binding.restoredApplication,receipt,sourceRoot,contents:join(app,'Contents')});assert.equal(assembly.status,'pass');await save('ASSEMBLY.json',assembly);result.assembly={manifestSha256:assembly.manifestSha256,payload:assembly.payload,source:assembly.source,compilers:assembly.compilers};
 control=channel(join(assembly.contents,paths.node),join(assembly.contents,paths.controller),assembly.contents,assembly.manifestSha256);
 const listed=await control.request('listRecovery');assert.equal(listed.phase,'recovery-list');assert.deepEqual(listed.recoveries,[]);result.operations.push({operation:'listRecovery',status:'pass',entries:0});
 const preview=await control.request('preview');assert.equal(preview.phase,'preview');assert.equal(preview.preview.target,before.target.path);assert.equal(preview.preview.dataRoot,before.dataRoot.path);assert.equal(preview.preview.entries,inventory.entries.length);assert.equal(preview.preview.totalBytes,inventory.totalBytes);result.operations.push({operation:'preview',status:'pass',planHash:preview.preview.planHash,transactionId:preview.preview.transactionId,entries:preview.preview.entries,totalBytes:preview.preview.totalBytes});
 const cancelled=await control.request('cancel',{planHash:preview.preview.planHash});assert.equal(cancelled.phase,'cancelled');result.operations.push({operation:'cancel',status:'pass'});
 const empty=await control.request('listRecovery');assert.equal(empty.phase,'recovery-list');assert.deepEqual(empty.recoveries,[]);result.operations.push({operation:'listRecovery',status:'pass',entries:0});
 cleanup=await control.finish();result.operations.push({operation:'close',status:'pass'});result.cleanup=cleanup;
 const after=await accountState();await save('ACCOUNT-AFTER.json',after);assert.deepEqual(after,before);await verifyCandidate(binding.restoredApplication,receipt);result.accountUnchanged=true;result.sourceUnchanged=true;result.status='pass';
}catch(e){result.code=code(e);result.errorType=e.name;process.exitCode=1;}
finally{
 if(control&&!cleanup){try{cleanup=await control.finish();}catch{cleanup=control.leaveUnknown();}result.cleanup=cleanup;}
 if(before&&!result.accountUnchanged){try{const after=await accountState();result.accountUnchanged=JSON.stringify(after)===JSON.stringify(before);}catch{result.accountUnchanged=false;}}
 const files=['installer-ui/resources/full-payload-probe.mjs','installer-ui/resources/assemble-resources.mjs','installer-ui/controller-main.mjs','installer-ui/controller-session.mjs','installer-ui/entry-options.mjs','installer-ui/protocol.mjs','desktop/project-workflow-product/candidate-binding.mjs','desktop/project-workflow-product/candidate-pins.json'];
 result.inputs=await Promise.all(files.map(async path=>({path,sha256:sha(await readFile(join(sourceRoot,path)))})));
 await save('RESULT.json',result);console.log(JSON.stringify({status:result.status,code:result.code,payload:result.binding,operations:result.operations.map(x=>x.operation),cleanup:result.cleanup}));
}
