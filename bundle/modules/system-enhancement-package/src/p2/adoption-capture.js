/** A bounded local NTFS capture lease. This never grants business-write authority.
 * reserveCopy must durably register the intended body before returning {copyId}.
 * Failed/partial copies remain registered for the caller's copy ledger to govern.
 */
import {lstat,realpath,readFile,readdir} from 'node:fs/promises';
import {resolve,join,dirname,relative,isAbsolute,sep,parse} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {createHash} from 'node:crypto';

const helperPath=fileURLToPath(new URL('./adoption-capture-win32.ps1',import.meta.url));
const names=['dsh_enhancement_suite_v1.json','dsh_four_layer_memory_v1.json','dsh_four_layer_archive_v1.json'];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=(code,details={})=>Object.assign(new Error(code),{code,...details});
const inside=(parent,path)=>{const r=relative(parent,path);return r===''||r!=='..'&&!r.startsWith('..'+sep)&&!isAbsolute(r);};
const identity=({path,finalPath,volume,fileId})=>({path,finalPath,volume,fileId});
const sourceFile=file=>({...identity(file),name:file.name,size:file.size,sha256:file.sha256});
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
const frozen=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))frozen(child);Object.freeze(value);}return value;};
function sourceSnapshot(acquired,sourceRoot,trustedAncestor,retirement=null){return {version:1,sourceRoot,trustedAncestor,writerSid:acquired.writerSid,sourceDirectories:acquired.directories.filter(d=>inside(trustedAncestor,d.path)).map(identity),files:acquired.files.map(sourceFile),retirement};}
function checkExpected(expected,actual){if(!expected||expected.version!==1||!Array.isArray(expected.files)||expected.files.length!==3||!Array.isArray(expected.sourceDirectories))throw fail('P2_ADOPTION_CAPTURE_EXPECTED_REQUIRED');const {retirement:ignored,...expectedSource}=expected,{retirement:unused,...actualSource}=actual;if(JSON.stringify(stable(expectedSource))!==JSON.stringify(stable(actualSource)))throw fail('P2_ADOPTION_CAPTURE_CHANGED');}
async function checkedDirectory(path){
  if(typeof path!=='string'||!isAbsolute(path)||!/^\w:[\\/]/.test(path)||/[\0]/.test(path)||path.slice(2).includes(':'))throw fail('P2_ADOPTION_CAPTURE_PATH');
  path=resolve(path);for(let p=path;;p=dirname(p)){const info=await lstat(p);if(info.isSymbolicLink())throw fail('P2_ADOPTION_CAPTURE_LINK');if(!info.isDirectory())throw fail('P2_ADOPTION_CAPTURE_PATH');if(dirname(p)===p)break;}
  if((await realpath(path)).toLowerCase()!==path.toLowerCase())throw fail('P2_ADOPTION_CAPTURE_PATH');return path;
}
function startHelper(executable,timeoutMs){
  const env={};for(const name of ['SystemRoot','WINDIR','PATH','Path','PATHEXT','TEMP','TMP','USERPROFILE'])if(process.env[name]!==undefined)env[name]=process.env[name];
  const child=spawn(executable,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',helperPath],{windowsHide:true,env,stdio:['pipe','pipe','pipe']});
  let pending=null,ended=false,closed=false,stderrBytes=0;const reader=createInterface({input:child.stdout});
  const settle=(error,value)=>{if(!pending)return;const p=pending;pending=null;clearTimeout(p.timer);if(error)p.reject(error);else p.resolve(value);};
  child.stdin.on('error',()=>settle(fail('P2_ADOPTION_CAPTURE_HELPER_EXIT')));
  child.stderr.on('data',bytes=>{stderrBytes+=bytes.length;});
  reader.on('line',line=>{if(!pending)return;if(line.length>131072){settle(fail('P2_ADOPTION_CAPTURE_PROTOCOL'));child.kill();return;}try{const response=JSON.parse(line);if(response.ok===true)settle(null,response);else settle(fail(response.code??'P2_ADOPTION_CAPTURE_HELPER',{win32:response.win32??null,...(response.missing?{missing:response.missing}:{}),...(response.retirementAppliedPaths?{retirementMayBePartial:response.retirementAppliedPaths.length>0,retirementAppliedPaths:response.retirementAppliedPaths}:{}),...(response.restorationAppliedPaths?{restorationMayBePartial:response.restorationAppliedPaths.length>0,restorationAppliedPaths:response.restorationAppliedPaths}:{})}));}catch(error){settle(fail('P2_ADOPTION_CAPTURE_PROTOCOL'));}});
  const exit=new Promise(done=>{child.once('error',()=>{ended=true;settle(fail('P2_ADOPTION_CAPTURE_HELPER_START'));done({exitCode:null});});child.once('exit',(exitCode,signal)=>{ended=true;settle(fail('P2_ADOPTION_CAPTURE_HELPER_EXIT',{exitCode,signal,stderrBytes}));done({exitCode,signal});});});
  return {pid:child.pid,executable,
    send(command){if(ended||closed)return Promise.reject(fail('P2_ADOPTION_CAPTURE_CLOSED'));if(pending)return Promise.reject(fail('P2_ADOPTION_CAPTURE_CONCURRENT'));return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{settle(fail('P2_ADOPTION_CAPTURE_TIMEOUT'));child.kill();},timeoutMs);pending={resolve,reject,timer};child.stdin.write(JSON.stringify(command)+'\n',error=>{if(error)settle(fail('P2_ADOPTION_CAPTURE_HELPER_EXIT'));});});},
    async close(){if(!closed){closed=true;child.stdin.end();}if(ended)return exit;const timer=setTimeout(()=>child.kill(),5000);try{return await exit;}finally{clearTimeout(timer);}},
  };
}

export async function acquireAdoptionCapture(options={}){
  if(process.platform!=='win32')throw fail('P2_ADOPTION_CAPTURE_PLATFORM');
  const copy=options.copy!==false;if(!copy&&!options.expectedCapture)throw fail('P2_ADOPTION_CAPTURE_EXPECTED_REQUIRED');
  if(copy&&(typeof options.reserveCopy!=='function'||typeof options.completeCopy!=='function'))throw fail('P2_ADOPTION_CAPTURE_LEDGER_REQUIRED');
  const sourceRoot=await checkedDirectory(options.sourceRoot),trustedAncestor=await checkedDirectory(options.trustedAncestor),captureDirectory=await checkedDirectory(options.captureDirectory);
  if(sourceRoot===trustedAncestor||!inside(trustedAncestor,sourceRoot)||inside(sourceRoot,captureDirectory)||inside(captureDirectory,sourceRoot))throw fail('P2_ADOPTION_CAPTURE_PATH');
  const parts=captureDirectory.split(sep),controlIndex=parts.findIndex(p=>p.toLowerCase()==='.suite-memory');if(controlIndex<1)throw fail('P2_ADOPTION_CAPTURE_UNGOVERNED_TARGET');
  const capturePerimeter=parts.slice(0,controlIndex+1).join(sep),entries=await readdir(captureDirectory);if(copy&&entries.length||!copy&&entries.some(name=>!names.includes(name)))throw fail('P2_ADOPTION_CAPTURE_TARGET_NOT_EMPTY');
  const timeoutMs=options.timeoutMs??20000;if(!Number.isInteger(timeoutMs)||timeoutMs<1000||timeoutMs>60000)throw fail('P2_ADOPTION_CAPTURE_TIMEOUT_CONFIG');
  const maxFileBytes=options.maxFileBytes??64*1024*1024;if(!Number.isInteger(maxFileBytes)||maxFileBytes<1||maxFileBytes>64*1024*1024)throw fail('P2_ADOPTION_CAPTURE_SIZE_CONFIG');
  const powershellPath=join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
  const runtime={powershellPath,helperPath,helperSha256:sha(await readFile(helperPath))};
  const rpc=startHelper(powershellPath,timeoutMs);let closed=false;
  try{
    const acquired=await rpc.send({op:'acquire',sourceRoot,trustedAncestor,captureDirectory,capturePerimeter,maxFileBytes,copy});
    if(acquired.assurance!=='known-writer-perimeter'||acquired.files.length!==3||acquired.missing.length)throw fail('P2_ADOPTION_CAPTURE_PROTOCOL');
    let retirement=null;
    if(options.expectedCapture){checkExpected(options.expectedCapture,sourceSnapshot(acquired,sourceRoot,trustedAncestor));if(options.expectedCapture.retirement){retirement=(await rpc.send({op:'verifyRetirement',expected:options.expectedCapture.retirement})).retirement;}}
    const files=[];
    for(const file of copy?acquired.files:[]){
      if(!names.includes(file.name)||!/^[a-f0-9]{64}$/.test(file.sha256))throw fail('P2_ADOPTION_CAPTURE_PROTOCOL');
      const relativePath=file.name,sourceRefs=[{path:file.path,sha256:file.sha256,volume:file.volume,fileId:file.fileId,size:file.size}];
      const reservation=await options.reserveCopy({relativePath,category:'adoption-source-capture',sourceRefs});
      if(!reservation||typeof reservation.copyId!=='string'||!reservation.copyId)throw fail('P2_ADOPTION_CAPTURE_RESERVATION');
      const copied=await rpc.send({op:'copy',name:file.name});
      if(copied.file.sha256!==file.sha256||copied.file.size!==file.size)throw fail('P2_ADOPTION_CAPTURE_CHANGED');
      await options.completeCopy({copyId:reservation.copyId,relativePath,path:join(captureDirectory,file.name),sha256:file.sha256,size:file.size});
      files.push(Object.freeze({...file,capturePath:join(captureDirectory,file.name),copyId:reservation.copyId}));
    }
    await rpc.send({op:'revalidate'});
    const lease={assurance:'known-writer-perimeter',writerSid:acquired.writerSid,sourceRoot,trustedAncestor,captureDirectory,files:frozen(copy?files:structuredClone(acquired.files)),missing:Object.freeze([]),directories:frozen(structuredClone(acquired.directories)),runtime:Object.freeze(runtime),helperPid:rpc.pid,
      limitations:Object.freeze(['The ancestor above the declared perimeter must remain trusted.','Only the examined writer identity and ordinary file operations are covered.','A stable byte set does not certify completed cross-domain business transactions.','No business-write authority, unknown-writer, administrator, writable-mapping or power-loss assurance.']),
      snapshot(){return frozen(structuredClone(sourceSnapshot(acquired,sourceRoot,trustedAncestor,retirement)));},
      async revalidate(){if(closed)throw fail('P2_ADOPTION_CAPTURE_CLOSED');const result=await rpc.send({op:'revalidate'});return {valid:true,assurance:'known-writer-perimeter',directories:result.directories,files:result.files,retirement};},
      async retirementPlan(){if(closed)throw fail('P2_ADOPTION_CAPTURE_CLOSED');return frozen((await rpc.send({op:'retirementPlan'})).plan);},
      async retireKnownWriters(expectedPlan,{expiresAt}={}){if(closed)throw fail('P2_ADOPTION_CAPTURE_CLOSED');if(!expectedPlan)throw fail('P2_ADOPTION_CAPTURE_RETIREMENT_PLAN_REQUIRED');if(expiresAt!==undefined&&!Number.isSafeInteger(expiresAt))throw fail('P2_ADOPTION_CAPTURE_DEADLINE');retirement=(await rpc.send({op:'retire',expectedPlan,expiresAt})).retirement;return frozen(structuredClone(retirement));},
      async inspectRestoration(originalRetirementPlan){if(closed)throw fail('P2_ADOPTION_CAPTURE_CLOSED');if(!originalRetirementPlan)throw fail('P2_ADOPTION_CAPTURE_RESTORATION_PLAN_REQUIRED');return frozen((await rpc.send({op:'inspectRestoration',originalPlan:originalRetirementPlan})).inspection);},
      // The controller must durably record a separately confirmed release intent first.
      // A crash can release transient handles after only some old rights were restored.
      async restoreKnownWriters(originalRetirementPlan,{expiresAt}={}){if(closed)throw fail('P2_ADOPTION_CAPTURE_CLOSED');if(!originalRetirementPlan)throw fail('P2_ADOPTION_CAPTURE_RESTORATION_PLAN_REQUIRED');if(!Number.isSafeInteger(expiresAt))throw fail('P2_ADOPTION_CAPTURE_DEADLINE');if(Date.now()>=expiresAt)throw fail('P2_ADOPTION_CAPTURE_EXPIRED');try{const result=(await rpc.send({op:'restore',originalPlan:originalRetirementPlan,expiresAt})).restoration;retirement=null;return frozen(result);}catch(error){retirement=null;throw Object.assign(error,{interruptedRestorationMayPermitWrites:true,...(error.restorationMayBePartial===undefined?{restorationMayBePartial:true}:{})});}},
      async close(){if(!closed){closed=true;await rpc.close();}return {closed:true};},
    };
    return Object.freeze(lease);
  }catch(error){closed=true;await rpc.close();throw error;}
}
