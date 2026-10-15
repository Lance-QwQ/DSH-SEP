// Candidate test operator only. Never part of the shipped runtime closure.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile,realpath,readdir} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {resolve,join,dirname,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {sha} from './rules.mjs';
const here=dirname(fileURLToPath(import.meta.url)),sourceRoot=resolve(here,'../..');
const output=process.argv[2],portable=process.argv[3]==='--portable';
assert(output&&isAbsolute(output));assert(process.argv.length===(portable?4:3));
if(!portable)assert(process.platform==='darwin'&&process.arch==='arm64');
await mkdir(output,{mode:0o700});assert.equal(await realpath(output),output);
const evidence={schema:1,status:'not_run',scope:portable?'portable-contracts':'macos-candidate-ui-bridge',platform:process.platform,arch:process.arch,node:process.version,nativeConfirmationUi:'not_run',actualAppIntegration:'not_run',physicalFinder:'not_run',inputs:[],groups:[]};
for(const name of (await readdir(here)).sort()){
 if(!/\.(mjs|json|md|yml)$/.test(name))continue;
 const bytes=await readFile(join(here,name));evidence.inputs.push({path:`desktop/project-workflow-ui/${name}`,bytes:bytes.length,sha256:sha(bytes)});
}
for(const path of ['project-workflow/workflow-adapter.mjs','project-workflow/project-factory.mjs','project-workflow/derived-transaction-store.mjs','project-workflow/derived-lifecycle.mjs','project-workflow/derive-sources.mjs','project-workflow/READONLY-ORIGIN.json','project-workflow/native-fixture.mjs','project-workflow/SOURCE_INPUTS.json']){
 const bytes=await readFile(join(sourceRoot,path));evidence.inputs.push({path,bytes:bytes.length,sha256:sha(bytes)});
}
const fixed=JSON.parse(await readFile(join(sourceRoot,'project-workflow/SOURCE_INPUTS.json'),'utf8'));
for(const input of fixed.inputs){const bytes=await readFile(join(sourceRoot,input.path));assert.equal(sha(bytes),input.sha256);evidence.inputs.push(input);}
await writeFile(join(output,'INPUTS.json'),JSON.stringify(evidence.inputs,null,2)+'\n',{flag:'wx'});
async function group(name,files,expected){
 const fixtures=join(output,name+'-fixtures');await mkdir(fixtures,{mode:0o700});
 const log=join(output,name+'.tap'),stderrPath=join(output,name+'.stderr'),stdout=createWriteStream(log,{flags:'wx'}),stderr=createWriteStream(stderrPath,{flags:'wx'});
 const env={...process.env,SEP_UI_TEST_ROOT:fixtures,SEP_MAC_WORKFLOW_TEST_ROOT:fixtures,TMPDIR:output};delete env.NODE_OPTIONS;delete env.ELECTRON_RUN_AS_NODE;
 const child=spawn(process.execPath,['--test','--test-concurrency=1','--test-reporter=tap',...files.map(f=>join(here,f))],{env,stdio:['ignore','pipe','pipe']});child.stdout.pipe(stdout);child.stderr.pipe(stderr);
 const exit=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}));});
 await Promise.all([new Promise(r=>stdout.closed?r():stdout.once('close',r)),new Promise(r=>stderr.closed?r():stderr.once('close',r))]);
 const text=await readFile(log,'utf8'),count=key=>Number(text.match(new RegExp(`^# ${key} (\\d+)$`,'m'))?.[1]??-1),counts={tests:count('tests'),pass:count('pass'),fail:count('fail'),skipped:count('skipped'),cancelled:count('cancelled')};
 const value={name,expected,exit,counts,logSha256:sha(Buffer.from(text)),stderrSha256:sha(await readFile(stderrPath)),status:exit.code===0&&exit.signal===null&&counts.tests===expected&&counts.pass===expected&&counts.fail===0&&counts.skipped===0&&counts.cancelled===0?'pass':'fail'};evidence.groups.push(value);await writeFile(join(output,'RESULT.json'),JSON.stringify(evidence,null,2)+'\n');assert.equal(value.status,'pass');
}
try{
 await group('contracts',['bridge.test.mjs','transport.test.mjs','native-confirmation.test.mjs','electron-adapter.test.mjs','child.test.mjs'],26);
 if(!portable)await group('native',['native.test.mjs'],3);
 evidence.status='pass';evidence.native=portable?'not_run':'pass';
}catch(e){evidence.status='fail';evidence.code=/^[A-Z0-9_]+$/.test(e.code??'')?e.code:'SEP_PROJECT_UI_TEST_FAILED';process.exitCode=1;}
await writeFile(join(output,'RESULT.json'),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({status:evidence.status,groups:evidence.groups.map(x=>({name:x.name,status:x.status,counts:x.counts})),native:evidence.native??'not_run'}));
