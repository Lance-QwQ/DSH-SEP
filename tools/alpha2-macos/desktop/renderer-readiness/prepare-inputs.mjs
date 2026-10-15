// Native origin verification only; does not start or alter Electron.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,realpath,lstat} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {SOURCE_INPUTS} from './derive.mjs';import {runOwnedCommand} from '../run-command.mjs';
assert.equal(process.platform,'darwin');assert.equal(process.arch,'arm64');
const [appArg,captureArg,downloadArg,outArg,asarArg]=process.argv.slice(2);assert.equal(process.argv.length,7);
const temp=await realpath(process.env.RUNNER_TEMP),workspace=await realpath(process.env.GITHUB_WORKSPACE),app=await realpath(appArg),capture=await realpath(captureArg),download=await realpath(downloadArg),out=resolve(outArg),asarPath=await realpath(asarArg);
for(const p of [app,download,out,asarPath])assert(p.startsWith(temp+'/'));assert(capture.startsWith(workspace+'/'));assert.equal(await realpath(dirname(out)),dirname(out));await mkdir(out,{mode:0o700});
const sha=b=>createHash('sha256').update(b).digest('hex'),result={schema:1,status:'fail',scope:'Mac carrier exact-byte input verification only',rows:[],actualRendererCommit:'not_run',productChanged:false};
try{
 const receiptBytes=await readFile(join(download,'DOWNLOAD-RECEIPT.json')),receipt=JSON.parse(receiptBytes);assert.equal(receipt.status,'pass');assert.equal(receipt.artifactId,11871124360);assert.equal(receipt.outerSha256,'63cc8bd74c5750911b668ce5a41aa15239db1a59911204355ec334d4fa4bc0b8');result.carrier={artifactId:receipt.artifactId,outerSha256:receipt.outerSha256,receiptSha256:sha(receiptBytes)};
 const signature=await runOwnedCommand({file:'/usr/bin/codesign',args:['--verify','--deep','--strict','--verbose=2',app],cwd:out,env:{PATH:'/usr/bin:/bin:/usr/sbin:/sbin',HOME:process.env.HOME,TMPDIR:process.env.TMPDIR},logPath:join(out,'signature.log'),timeoutMs:120000});result.signature={...signature,tail:undefined};assert.equal(signature.status,'pass');
 const tool=JSON.parse(await readFile(join(dirname(asarPath),'../package.json'),'utf8'));assert.equal(tool.name,'@electron/asar');assert.equal(tool.version,'3.4.1');const asar=await import(pathToFileURL(asarPath)),archive=join(app,'Contents/Resources/app.asar');result.originalAsarSha256=sha(await readFile(archive));assert.equal(JSON.parse(asar.extractFile(archive,'package.json',false).toString()).version,'0.2.1-alpha.2');
 const cap=await readFile(join(capture,'CAPTURE.json'));result.captureManifestSha256=sha(cap);assert.equal(JSON.parse(cap).upstreamVersion,'0.2.1-alpha.2');
 const plan=[{kind:'main',capturePath:'derived/lib/main.js'},{kind:'preload',capturePath:'derived/lib/preload-app.cjs'},{kind:'frontend',asarPath:'dsh/node_modules/@deepseek-ai/dsh-web-frontend/dist/assets/index-C5TXjxs_.js'},{kind:'ui-renderer',asarPath:'dsh/node_modules/@deepseek-ai/dsh-client-ui-renderer/lib/client.js'}];
 for(const row of plan){let bytes;if(row.capturePath){const file=join(capture,row.capturePath),st=await lstat(file);assert(st.isFile()&&!st.isSymbolicLink());assert.equal(await realpath(file),file);bytes=await readFile(file);}else{const st=asar.statFile(archive,row.asarPath,false);assert.equal(st.link,undefined);assert.equal(st.files,undefined);bytes=asar.extractFile(archive,row.asarPath,false);}const definition=SOURCE_INPUTS[row.kind];assert.equal(sha(bytes),definition.sha256,'SEP_MAC_READINESS_SOURCE_'+row.kind.toUpperCase());await writeFile(join(out,definition.file),bytes,{flag:'wx',mode:0o600});result.rows.push({...row,file:definition.file,bytes:bytes.length,sha256:sha(bytes)});}
 result.status='pass';
}catch(error){result.code='SEP_MAC_READINESS_INPUTS_FAILED';result.errorType=error.name;process.exitCode=1;}
await writeFile(join(out,'INPUTS.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({status:result.status,scope:result.scope,rows:result.rows.length}));
