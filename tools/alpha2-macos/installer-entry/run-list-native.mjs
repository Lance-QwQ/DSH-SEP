import {mkdir,readFile,writeFile,realpath} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const exec=promisify(execFile),here=fileURLToPath(new URL('.',import.meta.url)),sha=b=>createHash('sha256').update(b).digest('hex');
assert.equal(process.platform,'darwin');const out=resolve(process.argv[2]);assert.equal(await realpath(dirname(out)),dirname(out));await mkdir(out,{mode:0o700});
const result={schema:1,status:'fail',scope:'Separate recovery-list extension; signed synthetic fixtures, no app launch',definitions:4,inputs:[]};
try{
 for(const f of ['account-native.c','controller-core.mjs','controller.mjs','testing.mjs','candidate.mjs','native-client.mjs','boundaries.mjs','fixture.mjs','recovery-list.test.mjs','run-list-native.mjs'])result.inputs.push({file:f,sha256:sha(await readFile(join(here,f)))});
 const core=join(out,'install-native'),testing=join(out,'entry-testing'),cases=join(out,'cases');await mkdir(cases,{mode:0o700});
 for(const [label,source,extra,target]of [['core','../installation/install-native.c',[],core],['testing','account-native.c',['-DSEP_INSTALLER_ENTRY_TESTING=1'],testing]]){const r=await exec('/usr/bin/clang',['-std=c11','-Wall','-Wextra','-Werror',...extra,join(here,source),'-o',target],{timeout:30000,maxBuffer:1048576});await writeFile(join(out,'compile-'+label+'.log'),r.stdout+'\n'+r.stderr,{flag:'wx'});}
 let r;try{r=await exec(process.execPath,['--test','--test-reporter=tap','--test-timeout=120000',join(here,'recovery-list.test.mjs')],{env:{...process.env,SEP_INSTALLER_TEST_ROOT:cases,SEP_INSTALL_HELPER:core,SEP_INSTALLER_TEST_HELPER:testing},timeout:600000,maxBuffer:8388608});}catch(e){r=e;}
 const text=String(r.stdout??'')+'\n'+String(r.stderr??'');await writeFile(join(out,'recovery-list.tap'),text,{flag:'wx'});result.logSha256=sha(text);result.tests=Number(text.match(/# tests (\d+)/)?.[1]);result.pass=Number(text.match(/# pass (\d+)/)?.[1]);result.fail=Number(text.match(/# fail (\d+)/)?.[1]);result.skipped=Number(text.match(/# skipped (\d+)/)?.[1]);result.cancelled=Number(text.match(/# cancelled (\d+)/)?.[1]);result.exitCode=r.code??0;if(result.tests===4&&result.pass===4&&result.fail===0&&result.skipped===0&&result.cancelled===0&&result.exitCode===0)result.status='pass';
}catch(e){result.setupFailure={code:typeof e.code==='string'?e.code:'SETUP_FAILED',stdout:String(e.stdout??''),stderr:String(e.stderr??'')};}
await writeFile(join(out,'RESULT.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));if(result.status!=='pass')process.exitCode=1;
