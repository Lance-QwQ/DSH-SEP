// Trusted build/test binding. Only committed, independently reviewed pins admit
// a new payload or installer. A same-job unreviewed RESULT is never authority.
import {readFile,lstat,realpath,open} from 'node:fs/promises';
import {constants} from 'node:fs';import {join,resolve,isAbsolute,sep} from 'node:path';
import {createHash} from 'node:crypto';import {isDeepStrictEqual} from 'node:util';
const fail=code=>{throw Object.assign(Error(code),{code});};
export const hash=b=>createHash('sha256').update(b).digest('hex');
const digest=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x),positive=x=>Number.isSafeInteger(x)&&x>0;
const relative=p=>typeof p==='string'&&p.length<1024&&!/[\\:%?#\x00-\x20\x7f]/.test(p)&&p.split('/').every(x=>x&&x!=='.'&&x!=='..'&&!/[. ]$/.test(x));
const rows=(a,n,withSource=false)=>Array.isArray(a)&&a.length===n&&new Set(a.map(r=>r.path)).size===n&&a.every(r=>relative(r.path)&&digest(r.sha256)&&(!withSource||relative(r.source)));
export function validateStagePins(all,stage){
 if(!['payload','installer'].includes(stage)||all?.schema!==1)fail('SEP_NATIVE_INSTALLER_PINS_INVALID');
 const p=all[stage];if(p?.status!=='ready')fail('SEP_NATIVE_INSTALLER_PINS_PENDING');
 const fields=stage==='payload'?['programSha256','bootstrapSha256']:['manifestSha256'];
 if(!/^[a-f0-9]{40}$/.test(p.commit??'')||p.artifact!==(stage==='payload'?'DSH-SEP-macOS-Alpha2-project-preview.zip':'DSH-SEP-macOS-Alpha2-installer-preview.zip')||!['assemblySha256','archiveSha256','inventorySha256','treeSha256',...fields].every(k=>digest(p[k]))||!['assemblyBytes','archiveBytes','inventoryBytes'].every(k=>positive(p[k]))||p.assemblyBytes>1048576||p.inventoryBytes>67108864||p.archiveBytes>2147483648)fail('SEP_NATIVE_INSTALLER_PINS_INVALID');
 if(stage==='payload'){
  if(!positive(p.entries)||!positive(p.totalBytes)||!rows(p.runtime,84,true)||!digest(p.sourceTreeSha256)||!Array.isArray(p.verification)||p.verification.length!==2||p.verification.some((r,i)=>r.name!==['APP-BUILD-REVALIDATION.json','APP-POST-VERIFICATION.json'][i]||!digest(r.sha256)||!positive(r.bytes)||r.bytes>1048576))fail('SEP_NATIVE_INSTALLER_PINS_INVALID');
 }else{
  const payload=validateStagePins(all,'payload');
  if(!p.payload||p.payload.sourceAssemblySha256!==payload.assemblySha256||!['programSha256','bootstrapSha256','archiveSha256','treeSha256','entries','totalBytes'].every(k=>p.payload[k]===payload[k])||!rows(p.nativeInputs,11)||!rows(p.runtimeInputs,16)||!rows(p.helperInputs,2))fail('SEP_NATIVE_INSTALLER_PINS_INVALID');
 }
 return p;
}
export function parseBoundJson(bytes,p){
 if(!Buffer.isBuffer(bytes)||bytes.length!==p.assemblyBytes||hash(bytes)!==p.assemblySha256)fail('SEP_NATIVE_INSTALLER_RESULT');
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{fail('SEP_NATIVE_INSTALLER_RESULT');}
}
export function validateAssemblyFacts(r,all,stage){
 const p=validateStagePins(all,stage);
 if(r?.schema!==1||r.status!=='pass'||r.sourceCommit!==p.commit||r.artifact!==p.artifact||r.artifactSha256!==p.archiveSha256||r.artifactBytes!==p.archiveBytes||r.treeSha256!==p.treeSha256)fail('SEP_NATIVE_INSTALLER_CANDIDATE');
 if(stage==='payload'){
  if(r.originalUnchanged!==true||r.programSha256!==p.programSha256||r.bootstrapSha256!==p.bootstrapSha256||!isDeepStrictEqual(r.runtime,p.runtime))fail('SEP_NATIVE_INSTALLER_CANDIDATE');
 }else{
  if(r.manifestSha256!==p.manifestSha256||r.payloadUnchanged!==true||r.nativeSourceUnchanged!==true||!p.payload||!Object.keys(p.payload).every(k=>r.payload?.[k]===p.payload[k])||!isDeepStrictEqual(r.nativeInputs,p.nativeInputs)||!isDeepStrictEqual(r.resources?.source?.runtime,p.runtimeInputs)||!isDeepStrictEqual(r.resources?.source?.native,p.helperInputs))fail('SEP_NATIVE_INSTALLER_CANDIDATE');
 }
 return r;
}
export function validatePayloadVerification(build,post,p){
 const common=r=>r?.schema===1&&r.status==='pass'&&r.sourceCommit===p.commit&&r.sourceTreeSha256===p.sourceTreeSha256&&r.programSha256===p.programSha256&&r.sourceUnchanged===true;
 if(!common(build)||!common(post)||build.assemblyResultSha256!==p.assemblySha256||!digest(build.verificationSha256)||build.runtimeFiles!==84||build.originalUnchanged!==true||build.bootstrapSha256!==p.bootstrapSha256||build.treeSha256!==p.treeSha256||build.artifact!==p.artifact||build.artifactSha256!==p.archiveSha256||build.artifactBytes!==p.archiveBytes||post.mode!=='built'||post.applicationResultSha256!==p.assemblySha256||post.applicationUnchanged!==true||post.paidProviderCalls!==0||!isDeepStrictEqual(post.counts,{tests:41,pass:41,fail:0,skipped:0,cancelled:0}))fail('SEP_NATIVE_INSTALLER_VERIFICATION');
 return {status:'pass',sourceTreeSha256:p.sourceTreeSha256};
}
export async function readPayloadVerification(root,p){
 const proofs=[];
 for(const row of p.verification){const bytes=await fileBytes(join(root,row.name),row.bytes);if(bytes.length!==row.bytes||hash(bytes)!==row.sha256)fail('SEP_NATIVE_INSTALLER_VERIFICATION');let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{fail('SEP_NATIVE_INSTALLER_VERIFICATION');}proofs.push({...row,bytes,value});}
 validatePayloadVerification(proofs[0].value,proofs[1].value,p);return proofs;
}
const identity=s=>[s.dev,s.ino,s.size,s.mode,s.nlink,s.mtimeNs,s.ctimeNs].join(':');
export async function boundFile(path,maxBytes,consume){
 if(typeof path!=='string'||!isAbsolute(path)||resolve(path)!==path||await realpath(path)!==path)fail('SEP_NATIVE_INSTALLER_PATH');
 const before=await lstat(path,{bigint:true});if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1n||before.size>BigInt(maxBytes))fail('SEP_NATIVE_INSTALLER_FILE');
 const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{if(identity(await handle.stat({bigint:true}))!==identity(before))fail('SEP_NATIVE_INSTALLER_FILE');const value=await consume(handle,before);if(identity(await handle.stat({bigint:true}))!==identity(before)||identity(await lstat(path,{bigint:true}))!==identity(before)||await realpath(path)!==path)fail('SEP_NATIVE_INSTALLER_FILE');return value;}finally{await handle.close();}
}
export const fileBytes=(path,maxBytes)=>boundFile(path,maxBytes,h=>h.readFile());
export async function verifyArchive(path,p){return boundFile(path,p.archiveBytes,async(h,s)=>{if(s.size!==BigInt(p.archiveBytes))fail('SEP_NATIVE_INSTALLER_ARCHIVE');const digest=createHash('sha256');let size=0;for await(const b of h.createReadStream({autoClose:false})){size+=b.length;if(size>p.archiveBytes)fail('SEP_NATIVE_INSTALLER_ARCHIVE');digest.update(b);}if(size!==p.archiveBytes||digest.digest('hex')!==p.archiveSha256)fail('SEP_NATIVE_INSTALLER_ARCHIVE');return p.archiveSha256;});}
export async function loadPins(){return JSON.parse(await readFile(new URL('./installer-pins.json',import.meta.url),'utf8'));}
export async function payloadPins(){return validateStagePins(await loadPins(),'payload');}
export async function installerPins(){return validateStagePins(await loadPins(),'installer');}
export async function readCandidate({resultPath,resultSha256,restoredRoot,runnerTemp}){
 const all=await loadPins(),p=validateStagePins(all,'payload');if(resultSha256!==p.assemblySha256)fail('SEP_NATIVE_INSTALLER_RESULT');
 for(const path of [resultPath,restoredRoot,runnerTemp])if(typeof path!=='string'||!isAbsolute(path)||resolve(path)!==path||await realpath(path)!==path)fail('SEP_NATIVE_INSTALLER_PATH');
 if(!resultPath.startsWith(runnerTemp+sep)||!restoredRoot.startsWith(runnerTemp+sep))fail('SEP_NATIVE_INSTALLER_PATH');
 const r=validateAssemblyFacts(parseBoundJson(await fileBytes(resultPath,p.assemblyBytes),p),all,'payload'),inventoryBytes=await fileBytes(join(restoredRoot,'PACKAGE-INVENTORY.json'),p.inventoryBytes);
 if(inventoryBytes.length!==p.inventoryBytes||hash(inventoryBytes)!==p.inventorySha256)fail('SEP_NATIVE_INSTALLER_INVENTORY');
 const inventory=JSON.parse(inventoryBytes);if(inventory.treeSha256!==p.treeSha256||inventory.entries?.length!==p.entries||inventory.totalBytes!==p.totalBytes)fail('SEP_NATIVE_INSTALLER_INVENTORY');
 const application=join(restoredRoot,'restored/DSH SEP.app');if(await realpath(application)!==application)fail('SEP_NATIVE_INSTALLER_PATH');
 for(const [name,want]of [['PROGRAM.json',p.programSha256],['BOOTSTRAP.json',p.bootstrapSha256]])if(hash(await fileBytes(join(application,'Contents/Resources',name),1048576))!==want)fail('SEP_NATIVE_INSTALLER_MANIFEST');
 await verifyArchive(join(restoredRoot,p.artifact),p);await readPayloadVerification(restoredRoot,p);return {...r,restoredApplication:application,sourceAssemblyPath:resultPath,sourceAssemblySha256:p.assemblySha256,restorationRoot:restoredRoot};
}