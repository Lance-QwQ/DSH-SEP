import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import {mkdtemp,cp,realpath,unlink,readFile,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const require=createRequire(join(resolve(process.env.SEP_OFFICIAL_HARNESS),'package.json'));
const source=await realpath(dirname(require.resolve('dsh-sep-bundle/package.json')));
const checker=join(resolve(process.env.SEP_SOURCE_REPO),'tools/bundle-install/review-imports.mjs');
async function fixture(){const dir=await mkdtemp(join(resolve(process.env.SEP_BUNDLE_TEST_ROOT),'business-closure-'));await cp(source,dir,{recursive:true});return dir;}
const check=dir=>spawnSync(process.execPath,[checker,dir],{encoding:'utf8',timeout:15000,windowsHide:true});
test('packed checker refuses a missing owned long-path document adapter',async()=>{const dir=await fixture();await unlink(join(dir,'bundle/host/document-source/index.js'));const result=check(dir);assert.equal(result.error,undefined);assert.notEqual(result.status,0);assert.match(result.stderr,/active relative dependency missing/);});
test('packed checker refuses a forged extra companion declaration',async()=>{const dir=await fixture(),path=join(dir,'bundle/contracts/business-runtime.json'),contract=JSON.parse(await readFile(path,'utf8'));contract.companionReferences[0]={file:'bundle/modules/system-enhancement-package/src/document-source.js',relative:'./document-source-win32.ps1'};await writeFile(path,JSON.stringify(contract));const result=check(dir);assert.equal(result.error,undefined);assert.notEqual(result.status,0);assert.match(result.stderr,/companion declarations differ from actual references/);});
