// Diagnostic only: fresh installation of the same bound Full ZIP payload,
// unchanged runtime/launcher, capturing the exact owned Host's startup output.
import {mkdir,readFile,writeFile,lstat} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {auditBundle,stableFile} from './bundle-audit.mjs';
const P='D:\\AIData\\ProjectWork\\DSH\\alpha2-windows-packages-20261015-r1';
const output=join(P,'headless-start-diagnostic-r1'),source=join(P,'fresh-install-verification-r2/RESULT.json');
const input=await stableFile(source,{capture:true,maxBytes:16777216});assert.equal(input.sha256,'ff37f95cdfdf51d7754a6782b948fc79e80a7bf5362729015d1d7076a39be6a4');
const previous=JSON.parse(input.bytes);assert.equal(previous.status,'pass');
const archive=previous.archives.find(x=>x.kind==='full');const meta=await auditBundle(archive.unpacked,previous.expected);assert.equal(meta.graphSha256,archive.graphSha256);assert.equal(meta.manifestSha256,archive.manifestSha256);
await mkdir(output);await mkdir(join(output,'installations'));
const report={schema:1,status:'not_run',scope:'Fresh unchanged Full installation diagnostic, no GUI/model; original failed installation retained.',inputSha256:input.sha256,children:[],cleanup:{status:'not_run'}};
let runtime,settled=true,phase='install';
const tick=value=>{phase=value;console.log(JSON.stringify({phase,at:new Date().toISOString()}));};
const load=path=>import(pathToFileURL(path));
const bound=async(promise,ms)=>{let timer;try{return await Promise.race([promise,new Promise((_,no)=>timer=setTimeout(()=>no(Object.assign(Error('DIAGNOSTIC_DEADLINE'),{code:'DIAGNOSTIC_DEADLINE'})),ms))]);}finally{clearTimeout(timer);}};
for(const key of Object.keys(process.env))if(/KEY|TOKEN|SECRET|PASSWORD/i.test(key))delete process.env[key];
try{
 const {install}=await load(join(archive.unpacked,'installer.mjs'));tick('install-fresh-comparable-depth');
 const receipt=await install({bundle:archive.unpacked,destination:join(output,'installations/full')});report.receipt=receipt;
 const config=JSON.parse(await readFile(receipt.configPath,'utf8'));report.rootCharacters=config.dailyRoot.length;report.previousRootCharacters=previous.installations[0].root.length;
 assert(Math.abs(report.rootCharacters-report.previousRootCharacters)<=3);
 const launcher=await load(receipt.managedLauncherPath),{startCoordinated}=await load(join(dirname(receipt.managedLauncherPath),'startup-coordinator.mjs'));
 settled=false;tick('start-captured-host');
 const opening=startCoordinated(receipt.configPath,{loadDeployment:launcher.loadDeployment,readCredential:false,openDaily:async(path,options)=>{
  runtime=await launcher.openDaily(path,{...options,onHostSpawn:({child,generation})=>{
   const row={pid:child.pid,generation,out:[],err:[],bytes:0,fatal:[],exit:null};report.children.push(row);
   const capture=(target,chunk)=>{row.bytes+=chunk.length;if(row.bytes<=4*1024*1024)target.push(chunk);else row.outputOverflow=true;};
   child.stdout.on('data',chunk=>capture(row.out,chunk));child.stderr.on('data',chunk=>capture(row.err,chunk));
   child.on('message',message=>{if(message?.type==='fatal')row.fatal.push({type:'fatal',code:typeof message.code==='string'?message.code.slice(0,128):null});});
   child.once('close',(code,signal)=>{row.exit={code,signal};});
  }});return runtime;
 }}).finally(()=>{settled=true;});
 await bound(opening,180000);report.status='pass';report.observedStatus=await runtime.client.call('status');
}catch(error){report.status='fail';report.error={code:error.code??error.name,message:String(error.message).slice(0,1500)};report.failedPhase=phase;process.exitCode=1;}
finally{
 try{
  if(!settled)throw Error('DIAGNOSTIC_START_STILL_PENDING');
  if(runtime)await bound(runtime.close(),60000);
  for(const row of report.children){assert(row.exit,'DIAGNOSTIC_CHILD_EXIT_UNCONFIRMED');assert.throws(()=>process.kill(row.pid,0),{code:'ESRCH'});}
  if(report.receipt){const config=JSON.parse(await readFile(report.receipt.configPath,'utf8'));await assert.rejects(lstat(join(config.storageRoot,'.suite-memory/p2/owner.lock')),{code:'ENOENT'});}
  report.cleanup={status:'pass',path:'Exact observed child close(s), subsequent runtime.close completion, tracked PID absence and P2 owner-lock absence. Failed startup remains fail; no kill was used.'};
 }catch(error){report.cleanup={status:'blocked',code:error.code??error.message};process.exitCode=1;}
 for(const row of report.children){const prefix='host-'+row.generation+'-'+row.pid;await writeFile(join(output,prefix+'.stdout.log'),Buffer.concat(row.out),{flag:'wx'});await writeFile(join(output,prefix+'.stderr.log'),Buffer.concat(row.err),{flag:'wx'});delete row.out;delete row.err;}
 if(runtime?.service)report.finalGuardian=runtime.service.guardian.status();
 await writeFile(join(output,'RESULT.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({status:report.status,error:report.error,children:report.children,cleanup:report.cleanup,result:join(output,'RESULT.json')}));
}
