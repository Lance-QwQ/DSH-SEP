import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const [root,installation,manifestSha256]=process.argv.slice(2);process.umask(0o077);assert(root.endsWith('finalization-archive-r33'));assert(installation.endsWith('finalization-installed-r34'));assert.match(manifestSha256,/^[a-f0-9]{64}$/);await mkdir(installation,{mode:0o700});
const pack=JSON.parse(await readFile(join(root,'PACKAGE.json')));assert.equal(pack.manifestSha256,manifestSha256);assert.equal(JSON.parse(await readFile(join(root,'payload/BUILD.json'))).buildId,'alpha2-linux-closeout.10');
const {reviewInstallation,install}=await import(pathToFileURL(join(root,'payload/src/linux-install.mjs'))),request={payload:join(root,'payload'),destination:join(installation,'program'),dataRoot:join(installation,'data'),manifestSha256},plan=await reviewInstallation(request);
await writeFile(join(installation,'PLAN.json'),JSON.stringify(plan,null,2)+'\n',{flag:'wx'});const result=await install({...request,planHash:plan.planHash});assert.equal(result.status,'pass');
await writeFile(join(installation,'INSTALL-RESULT.json'),JSON.stringify({status:'pass',manifestSha256,scope:'actual .10 archive, shipped installer, fresh independent program/data roots',result},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({status:'pass',installation}));
