import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,realpath} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
const exec=promisify(execFile),here=fileURLToPath(new URL('.',import.meta.url)),sha=b=>createHash('sha256').update(b).digest('hex');
assert.equal(process.platform,'darwin');assert.equal(process.arch,'arm64');
const out=resolve(process.argv[2]);assert.equal(await realpath(dirname(out)),dirname(out));await mkdir(out,{mode:0o700});
const result={schema:1,status:'fail',scope:'Trusted first-install controller/native account journal; signed synthetic payload, no application execution',definitions:22,groups:[],inputs:[],notVerified:['production NSBundle entry','AppKit installer UI','complete-package install through this controller','Gatekeeper/notarization','application launch','all crash windows']};
const files=['controller.mjs','controller-core.mjs','candidate.mjs','native-client.mjs','boundaries.mjs','testing.mjs','account-native.c','CONTRACT.json','fixture.mjs','native-account.test.mjs','crash-worker.mjs','controller.test.mjs','run-native.mjs'];
async function compile(label,args){
  let value,error;try{value=await exec('/usr/bin/clang',args,{timeout:30000,maxBuffer:1048576});}catch(e){value=e;error=e;}
  await writeFile(join(out,label+'.log'),String(value.stdout??'')+'\n'+String(value.stderr??''),{flag:'wx'});
  if(error)throw error;
}
try{
  result.inputs=await Promise.all(files.map(async file=>({file,sha256:sha(await readFile(join(here,file)))})));
  const core=join(out,'install-native'),production=join(out,'entry-production'),testing=join(out,'entry-testing'),cases=join(out,'cases');await mkdir(cases,{mode:0o700});
  await compile('compile-core',['-std=c11','-Wall','-Wextra','-Werror',join(here,'../installation/install-native.c'),'-o',core]);
  await compile('compile-production',['-std=c11','-Wall','-Wextra','-Werror',join(here,'account-native.c'),'-o',production]);
  await compile('compile-testing',['-std=c11','-Wall','-Wextra','-Werror','-DSEP_INSTALLER_ENTRY_TESTING=1',join(here,'account-native.c'),'-o',testing]);
  result.binaries=await Promise.all([['core',core],['production',production],['testing',testing]].map(async([name,path])=>({name,sha256:sha(await readFile(path))})));
  for(const [name,file,definitions]of[['native-account','native-account.test.mjs',4],['controller','controller.test.mjs',18]]){
    let r;try{r=await exec(process.execPath,['--test','--test-reporter=tap','--test-timeout=120000',join(here,file)],{env:{...process.env,SEP_INSTALLER_TEST_ROOT:cases,SEP_INSTALL_HELPER:core,SEP_INSTALLER_PRODUCTION_HELPER:production,SEP_INSTALLER_TEST_HELPER:testing},timeout:600000,maxBuffer:8*1024*1024});}catch(e){r=e;}
    const log=String(r.stdout??'')+'\n'+String(r.stderr??'');await writeFile(join(out,name+'.tap'),log,{flag:'wx'});
    result.groups.push({name,definitions,tests:Number(log.match(/# tests (\d+)/)?.[1]),pass:Number(log.match(/# pass (\d+)/)?.[1]),fail:Number(log.match(/# fail (\d+)/)?.[1]),cancelled:Number(log.match(/# cancelled (\d+)/)?.[1]),skipped:Number(log.match(/# skipped (\d+)/)?.[1]),exitCode:r.code??0,logSha256:sha(log),notImplementedMentions:(log.match(/SEP_INSTALLER_NOT_IMPLEMENTED/g)??[]).length});
  }
  if(result.groups.every(g=>g.tests===g.definitions&&g.pass===g.definitions&&g.fail===0&&g.cancelled===0&&g.skipped===0&&g.exitCode===0))result.status='pass';
}catch(e){result.setupFailure={code:/^[A-Z0-9_]+$/.test(e.code??'')?e.code:'SEP_INSTALLER_SETUP_FAILED',errorType:e.name};}
await writeFile(join(out,'RESULT.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:result.status,groups:result.groups,setupFailure:result.setupFailure}));if(result.status!=='pass')process.exitCode=1;
