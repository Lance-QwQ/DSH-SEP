import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import {mkdtemp,cp,realpath,unlink} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const require=createRequire(join(resolve(process.env.SEP_OFFICIAL_HARNESS),'package.json'));
const source=await realpath(dirname(require.resolve('dsh-sep-bundle/package.json')));
const checker=join(resolve(process.env.SEP_SOURCE_REPO),'tools/bundle-install/review-imports.mjs');
for(const missing of ['bundle/lib/session-storage-validation.js','bundle/host/session-jsonl/worker.cjs','bundle/host/protected-files/index.js']){
  test('packed import review rejects absent '+missing,async()=>{
    const fixture=await mkdtemp(join(resolve(process.env.SEP_BUNDLE_TEST_ROOT),'missing-companion-'));
    await cp(source,fixture,{recursive:true});await unlink(join(fixture,missing));
    const result=spawnSync(process.execPath,[checker,fixture],{encoding:'utf8',timeout:15000,windowsHide:true});
    assert.equal(result.error,undefined);assert.notEqual(result.status,0,'checker silently accepted a broken installed package');
    assert.match(result.stderr,/active relative dependency missing|active companion file missing/);
  });
}
