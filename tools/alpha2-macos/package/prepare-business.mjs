// CI operator: use actual native packaged Host dependencies; no Windows copy.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,realpath,rename} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {captureRuntime} from '../business/capture-runtime.mjs';
assert.equal(process.platform,'darwin');assert.equal(process.arch,'arm64');
const [appArg,asarArg,repoArg,outArg]=process.argv.slice(2),temp=await realpath(process.env.RUNNER_TEMP);
assert(outArg);const app=await realpath(appArg),asarPath=await realpath(asarArg),repo=await realpath(repoArg),out=resolve(outArg);
for(const p of [app,asarPath,out])assert(p.startsWith(temp+'/'));assert.equal(await realpath(dirname(out)),dirname(out));
await mkdir(out,{mode:0o700});const asar=await import(pathToFileURL(asarPath));asar.extractAll(join(app,'Contents/Resources/app.asar'),join(out,'extracted'));
const host=join(out,'host');await rename(join(out,'extracted/dsh'),host);assert.equal(JSON.parse(await readFile(join(host,'node_modules/@deepseek-ai/dsh/package.json'),'utf8')).version,'0.2.1-alpha.2');
const bundle=join(host,'sep-capture');await captureRuntime(repo,bundle);const capture=await readFile(join(bundle,'CAPTURE.json')),sha=createHash('sha256').update(capture).digest('hex');
assert.match(process.env.SEP_MAC_BUSINESS_CAPTURE_SHA256??'',/^[a-f0-9]{64}$/);assert.equal(sha,process.env.SEP_MAC_BUSINESS_CAPTURE_SHA256);
await writeFile(join(out,'PREPARED.json'),JSON.stringify({schema:1,status:'pass',scope:'native Host dependency extraction and exact SEP source capture',host,bundle,captureSha256:sha},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:'pass',captureSha256:sha}));
