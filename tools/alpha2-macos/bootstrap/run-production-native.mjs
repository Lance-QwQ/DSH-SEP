import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,realpath} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
const exec=promisify(execFile),hash=b=>createHash('sha256').update(b).digest('hex'),here=fileURLToPath(new URL('.',import.meta.url));
assert.equal(process.platform,'darwin');assert.equal(process.arch,'arm64');assert(process.argv[2]);const out=resolve(process.argv[2]);assert.equal(await realpath(dirname(out)),dirname(out));await mkdir(out,{mode:0o700});const cases=join(out,'cases');await mkdir(cases,{mode:0o700});
let run;try{run=await exec(process.execPath,['--test',join(here,'production-native.test.mjs')],{env:{...process.env,SEP_BOOTSTRAP_PRODUCTION_NATIVE_ROOT:cases},timeout:360000,maxBuffer:4*1024*1024});}catch(error){run=error;}
await writeFile(join(out,'native.log'),String(run.stdout??'')+'\n'+String(run.stderr??''),{flag:'wx'});
const files=['appkit-bootstrap.m','production-manifest.mjs','production-manifest.test.mjs','production-native.test.mjs','run-production-native.mjs'];
const result={schema:1,status:run.code===undefined?'pass':'fail',scope:'non-test NSBundle manifest admission only; controller remains unconnected',definitions:13,inputs:await Promise.all(files.map(async file=>({file,sha256:hash(await readFile(join(here,file)))}))),logSha256:hash(await readFile(join(out,'native.log'))),notVerified:['Actual product controller launch','Finder ready/reopen/quit','Lease acquisition','Developer ID or notarization']};await writeFile(join(out,'RESULT.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));if(run.code!==undefined)throw Error('SEP_BOOTSTRAP_PRODUCTION_NATIVE_FAILED');
