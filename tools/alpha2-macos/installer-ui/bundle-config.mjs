// Fixed bundle admission after the native parent has verified its compile-bound
// manifest. No account mutation, subprocess Node execution or configurable path.
import{lstat,realpath,open}from'node:fs/promises';import{constants}from'node:fs';import{join,basename,resolve,isAbsolute}from'node:path';import{createHash}from'node:crypto';
import{INSTALLER_PATHS as paths,validateInstallerManifest}from'./manifest.mjs';
import{inventoryPackage}from'../package/package-inventory.mjs';import{verifyCandidate}from'../installer-entry/candidate.mjs';
const fail=()=>{throw Object.assign(Error('SEP_INSTALLER_CONFIG'),{code:'SEP_INSTALLER_CONFIG'});};
const hash=b=>createHash('sha256').update(b).digest('hex');
const identity=s=>[s.dev,s.ino,s.mode,s.uid,s.gid,s.nlink,s.size,s.mtimeNs,s.ctimeNs].join(':');
const safe=s=>(s.uid===BigInt(process.getuid())||s.uid===0n)&&(s.mode&0o022n)===0n;
const freeze=v=>{if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;};
async function rootIdentity(contents){if(typeof contents!=='string'||!isAbsolute(contents)||resolve(contents)!==contents||basename(contents)!=='Contents'||await realpath(contents)!==contents)fail();const s=await lstat(contents,{bigint:true});if(!s.isDirectory()||s.isSymbolicLink()||!safe(s))fail();return identity(s);}
async function capture(path,max,executable=false,body=false){
 const before=await lstat(path,{bigint:true});if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1n||before.size<0n||before.size>BigInt(max)||!safe(before)||(executable&&(before.mode&0o111n)===0n)||await realpath(path)!==path)fail();
 const h=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW),digest=createHash('sha256'),chunks=[];let size=0;
 try{if(identity(await h.stat({bigint:true}))!==identity(before))fail();for await(const b of h.createReadStream({autoClose:false})){size+=b.length;if(size>max||size>Number(before.size))fail();digest.update(b);if(body)chunks.push(b);}if(size!==Number(before.size)||identity(await h.stat({bigint:true}))!==identity(before)||identity(await lstat(path,{bigint:true}))!==identity(before)||await realpath(path)!==path)fail();}finally{await h.close();}
 return{sha256:digest.digest('hex'),bytes:body?Buffer.concat(chunks,size):null};
}
async function build(contents){
 const initial=await rootIdentity(contents),runtime=join(contents,'Resources/runtime');
 const inventory=await inventoryPackage(runtime);if(inventory.totalBytes>67108864||inventory.entries.length>2048)fail();const closure=[];
 for(const row of inventory.entries){if(row.kind==='directory'){const s=await lstat(join(runtime,row.path),{bigint:true});if(!safe(s))fail();continue;}if(row.kind!=='file'||row.size>4194304)fail();const path='Resources/runtime/'+row.path,c=await capture(join(contents,path),4194304);if(c.sha256!==row.sha256)fail();closure.push({path,sha256:c.sha256});}
 closure.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
 const runtimeStat=await lstat(runtime,{bigint:true});if(!safe(runtimeStat))fail();
 const receiptCapture=await capture(join(contents,paths.receipt),33554432,false,true),receipt=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(receiptCapture.bytes));
 const roles={};for(const role of ['node','entryHelper','coreHelper'])roles[role]={path:paths[role],sha256:(await capture(join(contents,paths[role]),role==='node'?268435456:16777216,true)).sha256};
 const controller=closure.find(r=>r.path===paths.controller);if(!controller)fail();
 const manifest=validateInstallerManifest({schema:1,layout:'macos-installer-v1',payload:{path:paths.payload,receipt:{path:paths.receipt,sha256:receiptCapture.sha256},programSha256:receipt.programSha256,bootstrapSha256:receipt.bootstrapSha256},...roles,controller,closure});
 await verifyCandidate(join(contents,paths.payload),receipt);
 const program=JSON.parse((await capture(join(contents,paths.payload,'Contents/Resources/PROGRAM.json'),262144,false,true)).bytes);if(program.entries.node.sha256!==roles.node.sha256)fail();
 if(await rootIdentity(contents)!==initial)fail();return{manifest,receipt};
}
export async function buildInstallerManifest(contents){try{return(await build(contents)).manifest;}catch{fail();}}
export async function loadInstallerConfiguration(contents,expectedSha256){
 try{
  if(typeof expectedSha256!=='string'||!/^[a-f0-9]{64}$/.test(expectedSha256))fail();await rootIdentity(contents);
  const sealed=await capture(join(contents,'Resources/INSTALLER.json'),262144,false,true);if(sealed.sha256!==expectedSha256)fail();const manifest=validateInstallerManifest(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(sealed.bytes)));
  const verified=await build(contents);if(JSON.stringify(verified.manifest)!==JSON.stringify(manifest))fail();
  const after=await capture(join(contents,'Resources/INSTALLER.json'),262144);if(after.sha256!==expectedSha256)fail();
  return freeze({sourceApp:join(contents,paths.payload),receipt:verified.receipt,coreHelper:{path:join(contents,paths.coreHelper),sha256:manifest.coreHelper.sha256},entryHelper:{path:join(contents,paths.entryHelper),sha256:manifest.entryHelper.sha256}});
 }catch{fail();}
}
