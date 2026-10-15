// Build-only, synthetic fixture app. No captured product main is transformed.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,realpath,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {runOwnedCommand} from '../run-command.mjs';
import {updateAsarPlist} from '../managed-overlay/asar-plist.mjs';

assert.equal(process.platform,'darwin');assert.equal(process.arch,'arm64');
const [appArg,downloadArg,outArg,asarArg]=process.argv.slice(2),temp=await realpath(process.env.RUNNER_TEMP),app=await realpath(appArg),download=await realpath(downloadArg),out=resolve(outArg),asarPath=await realpath(asarArg);
for(const path of [app,download,out,asarPath])assert(path.startsWith(temp+'/'));assert.equal(await realpath(dirname(out)),dirname(out));await mkdir(out,{mode:0o700});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),commands=[],inputs=[];
const result={schema:1,status:'fail',scope:'Test-only packaged Electron fd3 fixture',commands,inputs,productIntegration:'not_run'};
async function run(label,file,args,timeoutMs=120000){const receipt=await runOwnedCommand({file,args,cwd:out,env:{PATH:'/usr/bin:/bin:/usr/sbin:/sbin',HOME:process.env.HOME,TMPDIR:process.env.TMPDIR},logPath:join(out,label+'.log'),timeoutMs});commands.push({label,...receipt,tail:undefined});assert.equal(receipt.status,'pass','SEP_CONTROL_PREPARE_'+label.toUpperCase());}
try{
  const receiptBytes=await readFile(join(download,'DOWNLOAD-RECEIPT.json')),receipt=JSON.parse(receiptBytes);
  assert.equal(receipt.status,'pass');assert.equal(receipt.artifactId,11871124360);assert.equal(receipt.outerSha256,'63cc8bd74c5750911b668ce5a41aa15239db1a59911204355ec334d4fa4bc0b8');result.carrier={...receipt,receiptSha256:sha(receiptBytes)};
  const tool=JSON.parse(await readFile(join(dirname(asarPath),'../package.json'),'utf8'));assert.equal(tool.name,'@electron/asar');assert.equal(tool.version,'3.4.1');
  await run('original-signature','codesign',['--verify','--deep','--strict','--verbose=2',app]);
  const asar=await import(pathToFileURL(asarPath)),target=join(out,'FD3 Fixture.app');await run('copy-carrier','ditto',[app,target],300000);
  const archive=join(target,'Contents/Resources/app.asar'),original=await readFile(archive),oldHeader=asar.getRawHeader(archive).headerString;
  result.originalAsarSha256=sha(original);const tree=join(out,'fixture-source');await mkdir(tree);
  for(const file of ['fixture-main.cjs','channel.mjs']){const source=fileURLToPath(new URL(file,import.meta.url)),bytes=await readFile(source);await copyFile(source,join(tree,file));inputs.push({file,bytes:bytes.length,sha256:sha(bytes)});}
  const manifest=JSON.stringify({name:'sep-fd3-fixture',version:'0.0.0',main:'fixture-main.cjs'},null,2)+'\n';await writeFile(join(tree,'package.json'),manifest,{flag:'wx'});inputs.push({file:'package.json',bytes:Buffer.byteLength(manifest),sha256:sha(manifest)});
  await asar.createPackage(tree,archive);
  const plist=join(target,'Contents/Info.plist');await run('read-info','plutil',['-convert','json','-o',join(out,'original-info.json'),plist]);
  const nextInfo=updateAsarPlist(JSON.parse(await readFile(join(out,'original-info.json'),'utf8')),oldHeader,asar.getRawHeader(archive).headerString);await writeFile(join(out,'fixture-info.json'),JSON.stringify(nextInfo));
  await run('write-info','plutil',['-convert','xml1','-o',plist,join(out,'fixture-info.json')]);
  await run('fixture-sign','codesign',['--force','--deep','--sign','-','--preserve-metadata=entitlements,requirements,flags,runtime',target],300000);
  await run('fixture-verify','codesign',['--verify','--deep','--strict','--verbose=2',target]);
  result.app=target;result.resultAsarSha256=sha(await readFile(archive));result.executableSha256=sha(await readFile(join(target,'Contents/MacOS/DSH SEP')));result.status='pass';result.signature='ad-hoc test fixture only';
}catch(error){result.code=/^SEP_CONTROL_[A-Z_]+$/.test(error.message)?error.message:'SEP_CONTROL_PREPARE_FAILED';result.errorType=error.name;process.exitCode=1;}
await writeFile(join(out,'PREPARED.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({status:result.status,code:result.code}));
