import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
const exec=promisify(execFile),hash=b=>createHash('sha256').update(b).digest('hex');
test('non-test AppKit executable refuses an external descriptor without starting it',{skip:process.platform!=='darwin'?'native non-test build required':false,timeout:20000},async()=>{
 const binary=process.env.SEP_BOOTSTRAP_PRODUCTION_BINARY,root=process.env.SEP_BOOTSTRAP_PRODUCTION_ROOT;
 assert(binary?.startsWith('/'));assert(root?.startsWith('/'));
 const controller=join(root,'must-not-start.mjs'),marker=join(root,'unexpected-started');
 await writeFile(controller,"import {writeFileSync} from 'node:fs'; writeFileSync(new URL('./unexpected-started',import.meta.url),'spawned');\n",{flag:'wx',mode:0o600});
 const descriptor={schema:1,scope:'synthetic-bootstrap-contract',node:process.execPath,nodeSha256:hash(await readFile(process.execPath)),controller,controllerSha256:hash(await readFile(controller)),programSha256:'b'.repeat(64),scenario:'clean',deadlineMs:5000};
 const path=join(root,'fixture.json');await writeFile(path,JSON.stringify(descriptor)+'\n',{flag:'wx',mode:0o600});
 for(const [index,args]of[[],['--synthetic-contract',path]].entries()){
  let run;try{run=await exec(binary,args,{timeout:5000,maxBuffer:16384,env:{PATH:'/usr/bin:/bin',HOME:process.env.HOME,TMPDIR:process.env.TMPDIR}});}catch(error){run=error;}
  await writeFile(join(root,'production-'+index+'.stdout.log'),String(run.stdout??''),{flag:'wx'});
  await writeFile(join(root,'production-'+index+'.stderr.log'),String(run.stderr??''),{flag:'wx'});
  assert.equal(run.code,78);
  assert.deepEqual(JSON.parse(String(run.stdout).trim()),{status:'blocked',code:'SEP_BOOTSTRAP_PRODUCTION_NOT_CONNECTED',resourcesConfirmedReleased:false});
  await assert.rejects(lstat(marker),{code:'ENOENT'});
 }
});
