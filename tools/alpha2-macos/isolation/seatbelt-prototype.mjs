// Experimental compatibility probe ONLY. sandbox-exec is deprecated by Apple.
// This is not wired into the production Profile or used as cleanup evidence.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,realpath,readdir,copyFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createServer} from 'node:net';
import {createHash} from 'node:crypto';
const exec=promisify(execFile),pause=ms=>new Promise(r=>setTimeout(r,ms));
const output=resolve(process.argv[2]??'');
assert.equal(process.platform,'darwin');assert.equal(process.arch,'arm64');assert(process.argv[2]);
await mkdir(output,{recursive:false,mode:0o700});assert.equal(await realpath(output),output);
const receipts=[];let stage='compile',server;
async function command(exe,args,phase){
 let r,error;try{r=await exec(exe,args,{timeout:20000,maxBuffer:1048576});}catch(e){r=e;error=e;}
 await writeFile(join(output,phase+'.log'),'stdout:\n'+String(r.stdout??'').slice(0,65536)+'\nstderr:\n'+String(r.stderr??'').slice(0,65536),{flag:'wx'});
 if(error)throw error;return r;
}
const literal=p=>{assert(p.startsWith('/'));assert(!/[\x00-\x1f\x7f"\\]/.test(p));return '"'+p+'"';};
try{
 const binary=join(output,'late-writer');await command('/usr/bin/clang',['-Wall','-Wextra','-Werror','-O2',fileURLToPath(new URL('./late-writer.c',import.meta.url)),'-o',binary],'compile');
 const original=join(output,'original'),next=join(output,'next'),committed=join(output,'committed');
 for(const p of [original,next,committed])await writeFile(p,'untouched',{flag:'wx'});
 server=createServer(s=>s.end());server.listen(0,'127.0.0.1');await new Promise((r,j)=>{server.once('listening',r);server.once('error',j);});const port=String(server.address().port);
 stage='control';await command(binary,['control','unused',original,next,committed,port],'control');assert.equal(await readFile(original,'utf8'),'changed');await writeFile(original,'untouched');
 receipts.push({name:'unconfined-write-positive-control',status:'pass'});
 for(let round=1;round<=3;round++){
  stage='sandbox-round-'+round;const work=join(output,'work-'+round);await mkdir(work,{mode:0o700});const own=join(work,'own'),receipt=own+'.receipt';
  const profile=`(version 1)\n(deny default)\n(allow process-exec)\n(allow process-fork)\n(allow sysctl-read)\n(allow file-read-metadata)\n(allow file-read* (literal "/") (subpath "/usr") (subpath "/System") (subpath "/bin") (subpath "/sbin") (literal ${literal(binary)}) (subpath ${literal(work)}))\n(allow file-write* (subpath ${literal(work)}) (literal "/dev/null"))\n(allow mach-lookup (global-name "com.apple.system.logger"))\n`;
  const policy=join(output,'round-'+round+'.sb');await writeFile(policy,profile,{flag:'wx'});
  const result=await command('/usr/bin/sandbox-exec',['-f',policy,binary,'sandbox',own,original,next,committed,port],'round-'+round);
  const parent=JSON.parse(result.stdout);assert(Number.isSafeInteger(parent.pid));
  const end=Date.now()+10000;let sample;while(Date.now()<end){try{sample=JSON.parse(await readFile(receipt,'utf8'));break;}catch(e){if(e.code!=='ENOENT')throw e;await pause(50);}}
  assert(sample,'bounded child did not produce receipt');assert.equal(sample.pid,parent.pid);assert.equal(sample.own,0);
  for(const k of ['original','next','committed','read','network'])assert([1,13].includes(sample[k]),k+' did not deny with EPERM/EACCES');
  for(const p of [original,next,committed])assert.equal(await readFile(p,'utf8'),'untouched');
  assert.equal(await readFile(own,'utf8'),'changed');
  receipts.push({name:stage,status:'pass',leaderAlreadyExited:true,escapedChildIssuedLateWrites:true,policySha256:createHash('sha256').update(profile).digest('hex'),sample,resourceCleanup:'not-certified; bounded synthetic fixture self-exits'});
 }
 await writeFile(join(output,'RESULT.json'),JSON.stringify({status:'pass',platform:process.platform,arch:process.arch,receipts,scope:'deprecated Seatbelt per-task boundary feasibility ONLY',productionEnabled:false,allDescendantsReleased:'not_verified'},null,2)+'\n',{flag:'wx'});
}catch(e){
 await command('/usr/bin/log',['show','--style','compact','--last','2m','--predicate','process == "late-writer" OR process == "sandbox-exec"'],'crash-diagnostic').catch(()=>{});
 const reports=join(process.env.HOME,'Library/Logs/DiagnosticReports');
 for(const name of await readdir(reports).catch(()=>[]))if(/^late-writer-[A-Za-z0-9_.-]+\.(ips|crash)$/.test(name))await copyFile(join(reports,name),join(output,name));
 await writeFile(join(output,'FAILURE.json'),JSON.stringify({status:'fail',stage,receipts,errorType:e.name,code:e.code??'ASSERTION',signal:e.signal??null,message:e.message},null,2)+'\n',{flag:'wx'});throw e;
}finally{if(server)await new Promise(r=>server.close(r));}
