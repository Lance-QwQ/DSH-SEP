// Runs only the separately compiled synthetic test binary, never an installer.
import{mkdir,writeFile,readFile}from'node:fs/promises';import{join,resolve}from'node:path';import{spawn}from'node:child_process';import{createHash}from'node:crypto';import assert from'node:assert/strict';
const[binary,node,fixture,output]=process.argv.slice(2);assert.equal(process.platform,'darwin');const root=resolve(output);await mkdir(root,{recursive:false});const rows=[];
for(const mode of['fifo','hardlink','writable','parent-alias','non-executable','pending-boolean']){
 const child=spawn(binary,[mode,node,fixture,join(root,mode)],{stdio:['ignore','pipe','pipe'],env:{PATH:'/usr/bin:/bin',LANG:'en_US.UTF-8'}}),stdout=[],stderr=[];let timedOut=false;
 // A stopped test child owns no real payload. This exact-child termination is
 // fixture cleanup only and cannot be recorded as production owner recovery.
 const timer=setTimeout(()=>{timedOut=true;child.kill('SIGTERM');},7000);
 child.stdout.on('data',c=>stdout.push(c));child.stderr.on('data',c=>stderr.push(c));const end=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}));});clearTimeout(timer);
 const out=Buffer.concat(stdout),err=Buffer.concat(stderr);await writeFile(join(root,mode+'.stdout'),out);await writeFile(join(root,mode+'.stderr'),err);let receipt;try{receipt=JSON.parse(out);}catch{}
 rows.push({mode,status:!timedOut&&end.code===0&&receipt?.status==='pass'?'pass':'fail',...end,timedOut,fixtureTermination:timedOut?'exact synthetic test child SIGTERM after deadline':'none',receipt:receipt??null,stdoutSha256:createHash('sha256').update(out).digest('hex'),stderrSha256:createHash('sha256').update(err).digest('hex')});
}
const result={schema:1,status:rows.every(r=>r.status==='pass')?'pass':'fail',scope:'six additional native role/snapshot definitions; test-only exact child cleanup, no real installation',definitions:6,passed:rows.filter(r=>r.status==='pass').length,failed:rows.filter(r=>r.status==='fail').length,rows,sourceInputs:await Promise.all([binary,fixture].map(async path=>({name:path.split('/').at(-1),sha256:createHash('sha256').update(await readFile(path)).digest('hex')})))};await writeFile(join(root,'RESULT.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));process.exitCode=result.status==='pass'?0:1;
