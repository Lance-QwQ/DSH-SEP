import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
const exec=promisify(execFile),hash=b=>createHash('sha256').update(b).digest('hex');
const options={skip:process.platform!=='darwin'?'native AppKit required':false,timeout:40000};
for(const scenario of ['clean','cancel-then-quit','exit-without-proof','wrong-nonce','quit-no-reply'])test('AppKit private synthetic controller: '+scenario,options,async()=>{
 const binary=process.env.SEP_BOOTSTRAP_BINARY,root=process.env.SEP_BOOTSTRAP_TEST_ROOT;assert(binary?.startsWith('/'));assert(root?.startsWith('/'));
 const output=join(resolve(root),scenario);await mkdir(output,{mode:0o700});
 const controller=fileURLToPath(new URL('./fixture-controller.mjs',import.meta.url));
 const descriptor={schema:1,scope:'synthetic-bootstrap-contract',node:process.execPath,nodeSha256:hash(await readFile(process.execPath)),controller,controllerSha256:hash(await readFile(controller)),programSha256:'b'.repeat(64),scenario,deadlineMs:scenario==='quit-no-reply'?500:5000};
 const config=join(output,'fixture.json');await writeFile(config,JSON.stringify(descriptor)+'\n',{flag:'wx',mode:0o600});
 const started=Date.now();let run;try{run=await exec(binary,['--synthetic-contract',config],{timeout:15000,maxBuffer:65536,env:{PATH:'/usr/bin:/bin',HOME:process.env.HOME,TMPDIR:process.env.TMPDIR}});}catch(error){run=error;}
 await writeFile(join(output,'native.stdout.log'),String(run.stdout??''),{flag:'wx'});await writeFile(join(output,'native.stderr.log'),String(run.stderr??''),{flag:'wx'});
 const receipt=JSON.parse(String(run.stdout).trim());
 const expected=['clean','cancel-then-quit'].includes(scenario)?'pass':'blocked';assert.equal(receipt.status,expected,receipt.code);assert.equal(receipt.resourcesConfirmedReleased,expected==='pass');
 if(expected==='pass'){assert.equal(receipt.desktopReady,true);assert.equal(receipt.activated,true);assert.equal(receipt.cleanControllerExit,true);assert.equal(receipt.quitCancelled,scenario==='cancel-then-quit');assert.equal(run.code,undefined);}
 else{assert.notEqual(run.code,undefined);assert.equal(receipt.fixtureCleanup,'separate-test-cleanup');}
 if(scenario==='quit-no-reply'){assert.equal(receipt.code,'SEP_BOOTSTRAP_DEADLINE');assert.equal(receipt.activated,true);assert.equal(receipt.fixtureChildReaped,true);assert(Date.now()-started<7000,'modal deadline did not complete within the fixture cleanup bound');}
});
