import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,realpath} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
const exec=promisify(execFile),here=fileURLToPath(new URL('.',import.meta.url)),sha=b=>createHash('sha256').update(b).digest('hex');
assert.equal(process.platform,'darwin');assert.equal(process.arch,'arm64');assert(process.argv[2]);
const out=resolve(process.argv[2]);assert.equal(await realpath(dirname(out)),dirname(out));await mkdir(out,{mode:0o700});
const result={schema:1,status:'fail',scope:'Native fixed NSBundle installer admission only; no child execution or full payload inventory',definitions:29,inputs:[],groups:[],notVerified:['Production UI/controller connection','Full payload inventory from native admission','Installer signing and notarization','Complete package installation','Protection against same-user re-signing or arbitrary same-user code']};
try{
 const files=['installer-admission.h','installer-admission.m','admission-probe.m','native.test.mjs','run-native.mjs','CONTRACT.json','ORIGIN.json','../manifest.mjs'];
 result.inputs=await Promise.all(files.map(async file=>({file,sha256:sha(await readFile(join(here,file)))})));
 const system=await exec('/usr/bin/sw_vers',[],{timeout:10000,maxBuffer:65536}),uname=await exec('/usr/bin/uname',['-a'],{timeout:10000,maxBuffer:65536});
 await writeFile(join(out,'system.txt'),system.stdout+uname.stdout+process.version+'\n',{flag:'wx'});
 const cases=join(out,'cases');await mkdir(cases,{mode:0o700});let run;
 try{run=await exec(process.execPath,['--test','--test-reporter=tap','--test-concurrency=1','--test-timeout=900000',join(here,'native.test.mjs')],{env:{...process.env,SEP_INSTALLER_ADMISSION_ROOT:cases},timeout:960000,maxBuffer:8*1024*1024});}catch(e){run=e;}
 const log=String(run.stdout??'')+'\n'+String(run.stderr??'');await writeFile(join(out,'native.tap'),log,{flag:'wx'});
 const count=name=>{const match=log.match(new RegExp('# '+name+' (\\d+)'));return match?Number(match[1]):null;};
 const group={name:'native-admission',definitions:29,tests:count('tests'),pass:count('pass'),fail:count('fail'),cancelled:count('cancelled'),skipped:count('skipped'),exitCode:run.code??0,signal:run.signal??null,logSha256:sha(log),notImplementedMentions:(log.match(/SEP_INSTALLER_ADMISSION_NOT_IMPLEMENTED/g)??[]).length};
 result.groups.push(group);
 if(group.tests===29&&group.pass===29&&group.fail===0&&group.cancelled===0&&group.skipped===0&&group.exitCode===0)result.status='pass';
}catch(e){result.setupFailure={code:/^[A-Z0-9_]+$/.test(e.code??'')?e.code:'SEP_INSTALLER_ADMISSION_SETUP_FAILED',errorType:e.name};}
await writeFile(join(out,'RESULT.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({status:result.status,groups:result.groups,setupFailure:result.setupFailure}));if(result.status!=='pass')process.exitCode=1;
