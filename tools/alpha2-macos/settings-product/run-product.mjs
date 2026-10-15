// Test operator. Three predefined rounds share only fresh synthetic data.
import assert from'node:assert/strict';import{readFile,writeFile,mkdir,realpath,open}from'node:fs/promises';import{join,dirname,resolve}from'node:path';import{fileURLToPath}from'node:url';import{createHash}from'node:crypto';import{spawn}from'node:child_process';import{userInfo}from'node:os';import{setTimeout as delay}from'node:timers/promises';
import{verifyPackage}from'../package/package-inventory.mjs';import{loadProgram}from'../desktop/managed-broker/program-manifest.mjs';import{runSeries}from'./series.mjs';import{verifyInputs}from'./verify-inputs.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex'),here=dirname(fileURLToPath(import.meta.url));
assert.equal(process.platform,'darwin');assert.equal(process.arch,'arm64');assert.equal(process.argv.length,4);
const restored=await realpath(process.argv[2]),out=resolve(process.argv[3]),temp=await realpath(process.env.RUNNER_TEMP);assert(restored.startsWith(temp+'/')&&out.startsWith(temp+'/'));assert.equal(await realpath(dirname(out)),dirname(out));await mkdir(out,{mode:0o700});
const result={schema:1,status:'fail',scope:'unchanged r44 app, three Inspector-assisted settings persistence rounds; not physical input or historical issue attribution',plannedRounds:3,rounds:[],productModified:false,forcedTermination:false},json=async p=>JSON.parse(await readFile(p,'utf8'));
let application,inventory;
try{
 const source=await verifyInputs();await writeFile(join(out,'SOURCE-VERIFIED.json'),JSON.stringify(source,null,2)+'\n',{flag:'wx',mode:0o600});
 const assemblyPath=join(restored,'RESULT.json'),assemblyBytes=await readFile(assemblyPath),assembly=JSON.parse(assemblyBytes);assert.equal(assembly.status,'pass');assert.equal(assembly.source.commit,'569b4bdf6fd1ab2ebc7ec3aa5821b21cad3f2e4a');assert.equal(assembly.source.archiveSha256,'6d0705c190bc56b3028cfa26a287ca04eba9ab39822e2edae1177a1033ccbf67');assert.equal(assembly.programSha256,'fbe989745254464885c390b7d6e55fd3883674faa26b705ea74833240c07d713');
 application=assembly.restoredApplication;assert.equal(await realpath(application),application);assert(application.startsWith(restored+'/'));inventory=await json(join(restored,'PACKAGE-INVENTORY.json'));assert.equal(inventory.treeSha256,'128885968401b628b2c21974d045a70a04233bc04a0bfd3aa943eba1ce4e5ebd');result.before=await verifyPackage(application,inventory);
 const programPath=join(application,'Contents/Resources/PROGRAM.json'),program=await loadProgram(programPath,assembly.programSha256);assert.equal(program.schema.schema,4);
 Object.assign(result,{assemblyResultSha256:hash(assemblyBytes),programSha256:assembly.programSha256,treeSha256:inventory.treeSha256,sourceCommit:assembly.source.commit});
 const sharedDataRoot=join(out,'data'),generations=new Set();
 const sequence=await runSeries(async index=>{
  const roundRoot=join(out,'round-'+index),stdout=await open(join(out,'round-'+index+'.stdout.log'),'wx',0o600),stderr=await open(join(out,'round-'+index+'.stderr.log'),'wx',0o600);let child,exit=null,spawnError=null;
  try{
   child=spawn(program.entries.node.path,[join(here,'operator.mjs'),assemblyPath,hash(assemblyBytes),roundRoot,sharedDataRoot,String(index)],{cwd:out,env:{PATH:'/usr/bin:/bin',HOME:userInfo().homedir,LANG:'en_US.UTF-8',RUNNER_TEMP:temp,TMPDIR:temp+'/'},stdio:['ignore',stdout.fd,stderr.fd]});
   child.once('close',(code,signal)=>{exit={code,signal};});child.once('error',e=>{spawnError=e.code??'SPAWN_ERROR';});
   const deadline=Date.now()+400000;while(!exit&&!spawnError&&Date.now()<deadline)await delay(100);
   let receipt=null;try{receipt=await json(join(roundRoot,'RESULT.json'));}catch{}
   let binding={status:'not_run'};
   if(receipt?.status==='pass'){
    const inputBytes=await readFile(join(roundRoot,'INPUTS.json')),input=JSON.parse(inputBytes);
    assert.equal(hash(inputBytes),receipt.inputsSha256);assert.equal(input.dataRoot,sharedDataRoot);assert.equal(input.round,index);assert.equal(input.programSha256,assembly.programSha256);assert.equal(receipt.programSha256,assembly.programSha256);assert.equal(receipt.assemblyResultSha256,hash(assemblyBytes));
    assert.match(receipt.round.generation,/^[a-f0-9]{32}$/);assert(!generations.has(receipt.round.generation));generations.add(receipt.round.generation);
    assert.equal(receipt.round.cleanup.generation.generation,receipt.round.generation);assert.equal(receipt.round.cleanup.generation.phase,'closed');assert.equal(receipt.round.cleanup.generation.resourcesConfirmedReleased,true);
    binding={status:'pass',sameSharedDataRoot:true,newOwnerGeneration:true,inputsSha256:hash(inputBytes)};
   }
   return {receipt,exit,binding,operatorPid:child.pid??null,spawnError,deadlineExpired:!exit&&!spawnError};
  }finally{if(child&&!exit)child.unref();await stdout.close();await stderr.close();}
 });
 Object.assign(result,sequence);result.notVerified=['physical input/AX/TCC','no-Inspector Finder lifecycle','historical r29-r32 settings close cause or fix','private data/credentials','paid model behavior'];
}catch(e){result.code=/^SEP_[A-Z0-9_]{1,90}$/.test(e.code??'')?e.code:'SEP_SETTINGS_PRODUCT_PROBE_FAILED';result.errorType=e.name;}
finally{
 if(application&&inventory){try{result.after=await verifyPackage(application,inventory);}catch(e){result.after={status:'fail',code:e.code??'SEP_SETTINGS_PRODUCT_CHANGED'};if(result.status==='pass')result.status='fail';}}
 while(result.rounds.length<3)result.rounds.push({index:result.rounds.length+1,status:'not_run',reason:'setup or an earlier predefined round did not pass'});
 await writeFile(join(out,'RESULT.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({status:result.status,rounds:result.rounds.map(r=>r.status),code:result.code,productModified:false}));if(result.status!=='pass')process.exitCode=1;
}
