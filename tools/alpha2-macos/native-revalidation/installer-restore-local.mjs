// Restore only the independently pinned previous CI artifact. No download,
// caller-chosen executable, original-data mutation or platform override.
import assert from 'node:assert/strict';import {readFile,writeFile,mkdir,realpath,open,chmod} from 'node:fs/promises';
import {constants} from 'node:fs';import {join,resolve,dirname,sep} from 'node:path';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {loadPins,validateStagePins,parseBoundJson,validateAssemblyFacts,fileBytes,boundFile,hash,verifyArchive,readPayloadVerification} from './installer-binding.mjs';
import {verifyPackage} from '../package/package-inventory.mjs';import {verifyCandidate} from '../installer-entry/candidate.mjs';import {loadInstallerConfiguration} from '../installer-ui/bundle-config.mjs';
const exec=promisify(execFile),fail=code=>{throw Object.assign(Error(code),{code});};
assert.equal(process.platform,'darwin');assert.equal(process.arch,'arm64');assert.equal(process.argv.length,5);
const [stage,inputArg,outArg]=process.argv.slice(2),all=await loadPins(),pin=validateStagePins(all,stage),temp=await realpath(process.env.RUNNER_TEMP),input=await realpath(inputArg),out=resolve(outArg);
for(const path of [input,out])assert(path.startsWith(temp+sep));assert.equal(input,inputArg);assert.equal(await realpath(dirname(out)),dirname(out));
const bytes=await fileBytes(join(input,'RESULT.json'),pin.assemblyBytes),assembly=validateAssemblyFacts(parseBoundJson(bytes,pin),all,stage),inventoryBytes=await fileBytes(join(input,'PACKAGE-INVENTORY.json'),pin.inventoryBytes);
if(inventoryBytes.length!==pin.inventoryBytes||hash(inventoryBytes)!==pin.inventorySha256)fail('SEP_NATIVE_INSTALLER_INVENTORY');const inventory=JSON.parse(inventoryBytes);assert.equal(inventory.treeSha256,pin.treeSha256);
const proofs=stage==='payload'?await readPayloadVerification(input,pin):[];await verifyArchive(join(input,pin.artifact),pin);await mkdir(out,{mode:0o700});process.umask(0o077);
const result={schema:1,status:'fail',scope:'Restore exact independently reviewed native revalidation artifact',source:pin,sourceAssemblySha256:pin.assemblySha256,sourceCommit:process.env.GITHUB_SHA??null,commands:[]};
async function command(name,args){let r;try{r=await exec(args[0],args.slice(1),{cwd:out,env:{PATH:'/usr/bin:/bin:/usr/sbin:/sbin',LANG:'en_US.UTF-8'},timeout:600000,maxBuffer:2097152});}catch(e){r=e;}const log=Buffer.from(String(r.stdout??'')+'\n'+String(r.stderr??''));await writeFile(join(out,name+'.log'),log,{flag:'wx',mode:0o600});result.commands.push({name,exitCode:r instanceof Error?r.code:0,signal:r.signal??null,logSha256:hash(log),...r instanceof Error?{processFamilyCleanup:'not_verified'}:{}});if(r instanceof Error)fail('SEP_NATIVE_INSTALLER_RESTORE_COMMAND');}
try{
 for(const row of proofs)await writeFile(join(out,row.name),row.bytes,{flag:'wx',mode:0o444});
 await writeFile(join(out,'SOURCE-ASSEMBLY.json'),bytes,{flag:'wx',mode:0o444});await writeFile(join(out,'PACKAGE-INVENTORY.json'),inventoryBytes,{flag:'wx',mode:0o444});
 const archive=join(out,pin.artifact);await boundFile(join(input,pin.artifact),pin.archiveBytes,async(handle)=>{const target=await open(archive,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);try{for await(const b of handle.createReadStream({autoClose:false})){let offset=0;while(offset<b.length){const r=await target.write(b,offset,b.length-offset);if(!r.bytesWritten)fail('SEP_NATIVE_INSTALLER_COPY');offset+=r.bytesWritten;}}await target.sync();}finally{await target.close();}});await verifyArchive(archive,pin);await chmod(archive,0o444);
 const restored=join(out,'restored');await mkdir(restored,{mode:0o700});await command('extract',['/usr/bin/ditto','-x','-k',archive,restored]);
 const app=join(restored,stage==='payload'?'DSH SEP.app':'DSH SEP Installer.app');assert.equal(await realpath(app),app);await verifyPackage(app,inventory);await command('signature',['/usr/bin/codesign','--verify','--deep','--strict','--verbose=2',app]);
 if(stage==='payload'){assert.equal(inventory.entries.length,pin.entries);assert.equal(inventory.totalBytes,pin.totalBytes);await verifyCandidate(app,{inventory,programSha256:pin.programSha256,bootstrapSha256:pin.bootstrapSha256});}
 else await loadInstallerConfiguration(join(app,'Contents'),pin.manifestSha256);
 if(stage==='payload'){await readPayloadVerification(input,pin);await readPayloadVerification(out,pin);}
 assert.equal(hash(await fileBytes(join(input,'RESULT.json'),pin.assemblyBytes)),pin.assemblySha256);await verifyArchive(join(input,pin.artifact),pin);
 Object.assign(result,{status:'pass',restoredApplication:app,treeSha256:pin.treeSha256,...stage==='payload'?{programSha256:pin.programSha256,bootstrapSha256:pin.bootstrapSha256}:{manifestSha256:pin.manifestSha256},originalUnchanged:true});
}catch(e){result.code=/^SEP_[A-Z0-9_]{1,100}$/.test(e.code??'')?e.code:'SEP_NATIVE_INSTALLER_RESTORE';result.errorType=e.name;process.exitCode=1;}
finally{await writeFile(join(out,'RESULT.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({status:result.status,code:result.code,stage}));}