import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,mkdir,lstat,symlink} from 'node:fs/promises';
import {join} from 'node:path';
import {userInfo} from 'node:os';
import {inventoryPackage} from '../package/package-inventory.mjs';
const exec=promisify(execFile),base=process.env.SEP_INSTALLER_TEST_ROOT;
async function run(file,args,env={}) {
  let result;try{result=await exec(file,args,{env:{PATH:'/usr/bin:/bin',...env},timeout:5000,maxBuffer:65536});}
  catch(error){result=error;}
  console.log(JSON.stringify({args,stdout:String(result.stdout??''),exitCode:result.code??0}));
  return result;
}
test('production account inspection derives the actual account despite a hostile HOME',async()=>{
  const unrelated=await mkdtemp(join(base,'home-override-'));
  const r=await run(process.env.SEP_INSTALLER_PRODUCTION_HELPER,['inspect'],{HOME:unrelated});
  assert.equal(r.code??0,0,String(r.stdout));const value=JSON.parse(r.stdout);
  assert.equal(value.account.home,userInfo().homedir);assert.equal(value.account.uid,process.getuid());
  assert.equal(value.target,join(userInfo().homedir,'Applications/DSH SEP.app'));
  assert.equal(value.dataRoot,join(userInfo().homedir,'Library/Application Support/DSH SEP/alpha2-mac-finder-preview'));
});
test('production native helper rejects the test-home argument before touching either account',async()=>{
  const home=await mkdtemp(join(base,'unaccepted-home-')),before=await inventoryPackage(home);
  const r=await run(process.env.SEP_INSTALLER_PRODUCTION_HELPER,['--test-home',home,'inspect']);
  assert.equal(r.code,70);assert.equal(r.stdout.trim(),'ERR\tSEP_INSTALLER_ARGUMENT');
  assert.deepEqual(await inventoryPackage(home),before);
});
test('native test-account inspection is fd-bound and read-only for absent fixed directories',async()=>{
  const home=await mkdtemp(join(base,'native-home-')),s=await lstat(home,{bigint:true}),before=await inventoryPackage(home);
  const r=await run(process.env.SEP_INSTALLER_TEST_HELPER,['--test-home',home,'inspect']);
  assert.equal(r.code??0,0,String(r.stdout));const value=JSON.parse(r.stdout);
  assert.equal(value.account.home,home);assert.equal(value.account.identity,s.dev+':'+s.ino);
  assert.equal(value.parent.exists,false);assert.equal(value.dataExists,false);assert.equal(value.governanceExists,false);
  assert.deepEqual(await inventoryPackage(home),before);
});
test('native account alias is refused instead of following its destination',async()=>{
  const root=await mkdtemp(join(base,'alias-')),home=join(root,'home'),alias=join(root,'alias');
  await mkdir(home,{mode:0o700});await symlink(home,alias);const before=await inventoryPackage(home);
  const r=await run(process.env.SEP_INSTALLER_TEST_HELPER,['--test-home',alias,'inspect']);
  assert.equal(r.code,70);assert.equal(r.stdout.trim(),'ERR\tSEP_INSTALLER_PATH');
  assert.deepEqual(await inventoryPackage(home),before);
});
