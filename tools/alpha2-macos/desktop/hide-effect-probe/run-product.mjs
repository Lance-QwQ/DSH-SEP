// Test operator only. The original r44 app is restored and verified separately.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,realpath,open} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {release,userInfo} from 'node:os';
import {deriveExercise} from './derive.mjs';
const digest=b=>createHash('sha256').update(b).digest('hex'),here=dirname(fileURLToPath(import.meta.url)),exec=promisify(execFile);
assert.equal(process.platform,'darwin');assert.equal(process.arch,'arm64');assert.equal(process.argv.length,4);
const restored=await realpath(process.argv[2]),out=resolve(process.argv[3]),temp=await realpath(process.env.RUNNER_TEMP);
assert(restored.startsWith(temp+'/')&&out.startsWith(temp+'/'));assert.equal(await realpath(dirname(out)),dirname(out));await mkdir(out,{mode:0o700});
const json=async path=>JSON.parse(await readFile(path,'utf8'));
const result={schema:1,status:'fail',scope:'new test-only r44 three-cycle hide-effect/reopen operator; raw BOOL and observed effect remain separate',productModified:false,productSourceCommit:'569b4bdf6fd1ab2ebc7ec3aa5821b21cad3f2e4a',platform:process.platform,arch:process.arch,release:release(),node:process.version,paidProviderCalls:0};
let child,stdout,stderr;
try{
 const receipt=await json(join(restored,'RESULT.json'));assert.equal(receipt.status,'pass');assert.equal(receipt.source.commit,result.productSourceCommit);
 for(const[k,v]of Object.entries({archiveSha256:'6d0705c190bc56b3028cfa26a287ca04eba9ab39822e2edae1177a1033ccbf67',treeSha256:'128885968401b628b2c21974d045a70a04233bc04a0bfd3aa943eba1ce4e5ebd',programSha256:'fbe989745254464885c390b7d6e55fd3883674faa26b705ea74833240c07d713',bootstrapSha256:'ef6c6054a9affd6895639fe5c0a0fda746c0ecf8a9f33b1f6e3b48612077b009'}))assert.equal(receipt.source[k],v);
 result.restoreResultSha256=digest(await readFile(join(restored,'RESULT.json')));
 result.macBuild=(await exec('/usr/bin/sw_vers',['-buildVersion'],{env:{PATH:'/usr/bin:/bin'},timeout:5000})).stdout.trim();
 const generated=join(out,'generated');await mkdir(generated,{mode:0o700});
 const source=await readFile(join(here,'../../package/exercise-application.mjs')),derived=deriveExercise(source);
 const dependencies=[
  {file:'package-inventory.mjs',path:'../../package/package-inventory.mjs',sha256:'b72983c13528b2cf8f85d53c06c5440ca6bac583a593bafeaf12ef95c60c901a'},
  {file:'application-observer.m',path:'../../package/application-observer.m',sha256:'bb37b6fae94465da6646609f48d444fc16957f884dfb265c0044b7fce1d99995'}
 ];
 const inputs=[];
 for(const f of ['observation.mjs','observation.test.mjs','r48-cases.json','derive.mjs','derive.test.mjs','run-product.mjs','ci-job.yml','README.md']){
  const bytes=await readFile(join(here,f));inputs.push({file:'desktop/hide-effect-probe/'+f,bytes:bytes.length,sha256:digest(bytes)});
  if(f==='observation.mjs')await writeFile(join(generated,f),bytes,{flag:'wx',mode:0o600});
 }
 inputs.push({file:'package/exercise-application.mjs',bytes:source.length,sha256:digest(source)});
 for(const row of dependencies){const bytes=await readFile(join(here,row.path));assert.equal(digest(bytes),row.sha256);inputs.push({file:'package/'+row.file,bytes:bytes.length,sha256:digest(bytes)});await writeFile(join(generated,row.file),bytes,{flag:'wx',mode:0o600});}
 await writeFile(join(out,'INPUTS.json'),JSON.stringify(inputs,null,2)+'\n',{flag:'wx',mode:0o600});
 await writeFile(join(out,'ORIGIN.json'),JSON.stringify(derived.origin,null,2)+'\n',{flag:'wx',mode:0o600});
 result.inputManifestSha256=digest(await readFile(join(out,'INPUTS.json')));
 const script=join(generated,'exercise.mjs');await writeFile(script,derived.source,{flag:'wx',mode:0o600});
 stdout=await open(join(out,'runner.stdout'),'wx',0o600);stderr=await open(join(out,'runner.stderr'),'wx',0o600);
 const env={PATH:'/usr/bin:/bin:/usr/sbin:/sbin',HOME:userInfo().homedir,TMPDIR:temp+'/',RUNNER_TEMP:temp,LANG:'en_US.UTF-8'};
 child=spawn(process.execPath,[script,restored,join(out,'lifecycle')],{cwd:out,env,stdio:['ignore',stdout.fd,stderr.fd]});
 let timer;const closed=new Promise((resolveClose,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolveClose({code,signal}));});
 try{result.childExit=await Promise.race([closed,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(Error('SEP_HIDE_OPERATOR_DEADLINE'),{code:'SEP_HIDE_OPERATOR_DEADLINE'})),900000);})]);}finally{clearTimeout(timer);}
 const native=await json(join(out,'lifecycle/RESULT.json'));result.nativeResultSha256=digest(await readFile(join(out,'lifecycle/RESULT.json')));result.cycles=native.cycles;result.cleanup=native.cleanup;
 assert.deepEqual(result.childExit,{code:0,signal:null});assert.equal(native.status,'pass');assert.equal(native.cycles.length,3);
 for(const c of native.cycles){assert.equal(c.status,'pass');assert.equal(c.hide.status,'pass');assert.equal(c.hide.observedHidden,true);assert.equal(c.hide.beforeHidden,false);assert.equal(c.reopen.sameGeneration,true);assert.equal(c.closed.resourcesConfirmedReleased,true);assert.deepEqual(c.closed.normalLaunchServicesWaitExit,{code:0,signal:null});}
 result.status='pass';
}catch(e){
 result.code=/^SEP_[A-Z0-9_]{1,90}$/.test(e.code??'')?e.code:'SEP_HIDE_PRODUCT_PROBE_FAILED';result.errorType=e.name;
 result.diagnostic=String(e.message??'').slice(0,250);result.cleanupUnknown=!!child&&!result.childExit;
 try{const n=await json(join(out,'lifecycle/RESULT.json'));result.cycles=n.cycles;result.cleanup=n.cleanup;}catch{}
 if(result.cleanupUnknown)result.status='blocked';process.exitCode=1;
}finally{
 child?.unref();await stdout?.close();await stderr?.close();
 await writeFile(join(out,'RESULT.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
 console.log(JSON.stringify({status:result.status,code:result.code,cycles:result.cycles?.map(c=>c.status),cleanupUnknown:result.cleanupUnknown}));
}
