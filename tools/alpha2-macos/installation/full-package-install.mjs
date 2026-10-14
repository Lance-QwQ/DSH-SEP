// CI operator only. Installs an independently pinned r44 app before first boot.
// This is not a public installer and does not execute the application.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,realpath,lstat,copyFile} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {userInfo} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {prepareFirstInstall,executeFirstInstall} from './first-install.mjs';
import {verifyPackage} from '../package/package-inventory.mjs';
const exec=promisify(execFile),sha=b=>createHash('sha256').update(b).digest('hex');
assert.equal(process.platform,'darwin');assert.equal(process.arch,'arm64');
assert.equal(process.env.GITHUB_ACTIONS,'true');
assert.equal(process.env.GITHUB_REPOSITORY,'Lance-QwQ/DSH-SEP');
assert.equal(process.env.GITHUB_REF,'refs/heads/codex/sep-alpha2-macos-20261014');
assert.equal(process.argv.length,4);
const temp=await realpath(process.env.RUNNER_TEMP),restored=await realpath(process.argv[2]),out=resolve(process.argv[3]);
assert(restored.startsWith(temp+'/')&&out.startsWith(temp+'/'));assert.equal(await realpath(dirname(out)),dirname(out));
await mkdir(out,{mode:0o700});
const result={schema:1,status:'fail',scope:'test-only first installation of exact r44 complete application to a fresh native account target; no application execution',applicationStarted:false,privateDataAdopted:false};
const json=async(path,value)=>writeFile(path,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
async function absent(path){await assert.rejects(lstat(path),{code:'ENOENT'});}
async function fixedCommand(label,file,args){
 let value,failure;try{value=await exec(file,args,{timeout:60000,maxBuffer:1048576});}catch(e){value=e;failure=e;}
 await writeFile(join(out,label+'.log'),String(value.stdout??'').slice(0,1048576)+'\n'+String(value.stderr??'').slice(0,1048576),{flag:'wx',mode:0o600});
 await json(join(out,label+'.json'),{file,args,exitCode:failure?.code??0,signal:failure?.signal??null,killed:failure?.killed??false});if(failure)throw failure;return value;
}
try{
 const input=await readFile(join(restored,'RESULT.json')),receipt=JSON.parse(input),inventoryBytes=await readFile(join(restored,'PACKAGE-INVENTORY.json')),inventory=JSON.parse(inventoryBytes);
 assert.equal(receipt.status,'pass');assert.equal(receipt.source?.commit,'569b4bdf6fd1ab2ebc7ec3aa5821b21cad3f2e4a');
 assert.equal(receipt.source?.archiveSha256,'6d0705c190bc56b3028cfa26a287ca04eba9ab39822e2edae1177a1033ccbf67');
 assert.equal(inventory.treeSha256,'128885968401b628b2c21974d045a70a04233bc04a0bfd3aa943eba1ce4e5ebd');
 assert.equal(sha(inventoryBytes),'5c6b9b4baba36de89cebb9e15ff7e2d7ffce7c46f385ecfa15d4ce231f4de5fb');
 assert.equal(receipt.programSha256,'fbe989745254464885c390b7d6e55fd3883674faa26b705ea74833240c07d713');
 assert.equal(receipt.bootstrapSha256,'ef6c6054a9affd6895639fe5c0a0fda746c0ecf8a9f33b1f6e3b48612077b009');
 const sourceApp=join(restored,'restored/DSH SEP.app');assert.equal(receipt.restoredApplication,sourceApp);await verifyPackage(sourceApp,inventory);
 const account=userInfo();assert.equal(account.uid,process.getuid());assert.equal(await realpath(account.homedir),account.homedir);
 const homeStat=await lstat(account.homedir);assert(homeStat.isDirectory()&&!homeStat.isSymbolicLink());assert.equal(homeStat.uid,account.uid);
 const parent=join(account.homedir,'Applications'),target=join(parent,'DSH SEP.app'),dataRoot=join(account.homedir,'Library/Application Support/DSH SEP/alpha2-mac-finder-preview');
 await absent(target);await absent(dataRoot);
 try{await mkdir(parent,{mode:0o700});result.parentCreated=true;}catch(e){if(e.code!=='EEXIST')throw e;result.parentCreated=false;}
 assert.equal(await realpath(parent),parent);const parentStat=await lstat(parent);assert(parentStat.isDirectory()&&!parentStat.isSymbolicLink());assert.equal(parentStat.uid,account.uid);assert.equal(parentStat.mode&0o022,0);
 const helperPath=join(out,'install-native'),nativeSource=fileURLToPath(new URL('./install-native.c',import.meta.url));
 await fixedCommand('compile','/usr/bin/clang',['-std=c11','-Wall','-Wextra','-Werror',nativeSource,'-o',helperPath]);const helperSha256=sha(await readFile(helperPath));
 const plan=await prepareFirstInstall({sourceApp,parent,dataRoot,receipt:{inventory,programSha256:receipt.programSha256,bootstrapSha256:receipt.bootstrapSha256},helperPath,helperSha256});
 await json(join(out,'PLAN.json'),plan);
 const execution=await executeFirstInstall({plan,helperPath,helperSha256});await json(join(out,'EXECUTION.json'),execution);
 assert.equal(execution.status,'pass');assert.equal(execution.phase,'committed');assert.equal(execution.target,target);
 result.verification=await verifyPackage(target,inventory);await verifyPackage(sourceApp,inventory);await absent(dataRoot);
 await fixedCommand('signature','/usr/bin/codesign',['--verify','--deep','--strict','--verbose=2',target]);
 await copyFile(join(restored,'PACKAGE-INVENTORY.json'),join(out,'PACKAGE-INVENTORY.json'));
 Object.assign(result,{status:'pass',phase:'committed',restoredApplication:target,sourceApplication:sourceApp,source:receipt.source,sourceReceiptSha256:sha(input),programSha256:receipt.programSha256,bootstrapSha256:receipt.bootstrapSha256,treeSha256:inventory.treeSha256,helperSha256,planHash:plan.planHash??null,transactionId:plan.transactionId,notVerified:['first launch from installed path','system hide and reopen','private data continuation','public installer UX','Developer ID / notarization / Gatekeeper / translocation','updates / uninstall']});
}catch(e){result.code=/^[A-Z][A-Z0-9_]{0,100}$/.test(e.code??'')?e.code:'SEP_INSTALL_FULL_PROBE_FAILED';result.errorType=e.name;process.exitCode=1;}
await json(join(out,'RESULT.json'),result);console.log(JSON.stringify({status:result.status,code:result.code,scope:result.scope}));
