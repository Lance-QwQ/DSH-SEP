import {lstat,realpath,open,readFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join,resolve,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {release} from 'node:os';
import {verifyPackage} from '../package/package-inventory.mjs';
import {buildBootstrapManifest} from '../package/bootstrap-manifest-builder.mjs';
import {loadProgram} from '../desktop/managed-broker/program-manifest.mjs';
import {validateBootstrapManifest} from '../bootstrap/production-manifest.mjs';

export const error=code=>Object.assign(Error(code),{code});
export const fail=code=>{throw error(code);};
export const sha=b=>createHash('sha256').update(b).digest('hex');
export const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('\0')===[...keys].sort().join('\0');
export const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export const env=()=>({PATH:'/usr/bin:/bin:/usr/sbin:/sbin',LANG:'en_US.UTF-8'});
const exec=promisify(execFile),version=s=>[s.dev,s.ino,s.size,s.mode,s.nlink,s.mtimeNs,s.ctimeNs].join(':');
export async function platform(){
 if(process.platform!=='darwin'||process.arch!=='arm64'||release()!=='24.6.0')fail('SEP_INSTALLER_PLATFORM');
 const r=await exec('/usr/bin/sw_vers',['-buildVersion'],{env:env(),timeout:5000,maxBuffer:1024});
 if(r.stdout.trim()!=='24G830')fail('SEP_INSTALLER_PLATFORM');
}
export async function directory(path){
 if(typeof path!=='string'||!isAbsolute(path)||resolve(path)!==path||path==='/'||/[\x00-\x1f\x7f\\]/.test(path))fail('SEP_INSTALLER_PATH');
 const s=await lstat(path,{bigint:true});if(!s.isDirectory()||s.isSymbolicLink()||await realpath(path)!==path)fail('SEP_INSTALLER_PATH');return s.dev+':'+s.ino;
}
export async function fileHash(path){
 const before=await lstat(path,{bigint:true});
 if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1n||await realpath(path)!==path)fail('SEP_INSTALLER_FILE_CHANGED');
 const h=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW),d=createHash('sha256');
 try{if(version(before)!==version(await h.stat({bigint:true})))fail('SEP_INSTALLER_FILE_CHANGED');for await(const b of h.createReadStream({autoClose:false}))d.update(b);if(version(before)!==version(await h.stat({bigint:true}))||version(before)!==version(await lstat(path,{bigint:true})))fail('SEP_INSTALLER_FILE_CHANGED');return d.digest('hex');}
 finally{await h.close();}
}
export async function helperIdentity(helper){
 if(!exact(helper,['path','sha256'])||!digest(helper.sha256)||typeof helper.path!=='string'||!isAbsolute(helper.path)||resolve(helper.path)!==helper.path)fail('SEP_INSTALLER_HELPER');
 if(await fileHash(helper.path)!==helper.sha256)fail('SEP_INSTALLER_HELPER');const s=await lstat(helper.path);if(!(s.mode&0o111)||(s.mode&0o022)||s.uid!==process.getuid())fail('SEP_INSTALLER_HELPER');
}
// Same readonly acceptance checks as the frozen lower install core. No prepare,
// mkdir, lock, or journal operation is used while displaying the upper preview.
export async function verifyCandidate(path,receipt){
 if(!exact(receipt,['inventory','programSha256','bootstrapSha256'])||!digest(receipt.programSha256)||!digest(receipt.bootstrapSha256))fail('SEP_INSTALLER_MANIFEST');
 const identity=await directory(path);await verifyPackage(path,receipt.inventory).catch(()=>fail('SEP_INSTALLER_SOURCE_CHANGED'));
 try{
  const contents=join(path,'Contents'),programPath=join(contents,'Resources/PROGRAM.json'),bootstrapPath=join(contents,'Resources/BOOTSTRAP.json');
  if(await fileHash(programPath)!==receipt.programSha256||await fileHash(bootstrapPath)!==receipt.bootstrapSha256)fail('SEP_INSTALLER_MANIFEST');
  const program=await loadProgram(programPath,receipt.programSha256);if(program.schema.schema!==4)fail('SEP_INSTALLER_MANIFEST');
  const b=await readFile(bootstrapPath);if(b.length>1048576||sha(b)!==receipt.bootstrapSha256)fail('SEP_INSTALLER_MANIFEST');
  const actual=validateBootstrapManifest(JSON.parse(b)),built=await buildBootstrapManifest(contents);
  if(JSON.stringify(actual)!==JSON.stringify(built)||actual.program.sha256!==receipt.programSha256)fail('SEP_INSTALLER_MANIFEST');
 }catch{fail('SEP_INSTALLER_MANIFEST');}
 try{await exec('/usr/bin/codesign',['--verify','--deep','--strict',path],{env:env(),timeout:30000,maxBuffer:65536});}catch{fail('SEP_INSTALLER_SIGNATURE');}
 await verifyPackage(path,receipt.inventory).catch(()=>fail('SEP_INSTALLER_SOURCE_CHANGED'));
 if(await directory(path)!==identity)fail('SEP_INSTALLER_SOURCE_CHANGED');return identity;
}
