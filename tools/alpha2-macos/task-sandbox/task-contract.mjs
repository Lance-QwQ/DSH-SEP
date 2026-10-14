import {constants} from 'node:fs';
import {lstat,open,realpath} from 'node:fs/promises';
import {posix} from 'node:path';
import {createHash} from 'node:crypto';
const fail=code=>{throw Object.assign(Error(code),{code});};
const identity=s=>[s.dev,s.ino,s.size,s.mtimeNs,s.ctimeNs,s.nlink,s.mode].join(':');
function path(value){if(typeof value!=='string'||value.length>2048||value==='/'||!posix.isAbsolute(value)||posix.normalize(value)!==value||/[\x00-\x1f\x7f"\\]/u.test(value))fail('SEP_MAC_TASK_PATH');return value;}
const inside=(a,b)=>a===b||b.startsWith(a+'/');
async function directory(value,kind){
 path(value);const s=await lstat(value,{bigint:true});if(!s.isDirectory()||s.isSymbolicLink()||await realpath(value)!==value||s.uid!==BigInt(process.getuid()))fail('SEP_MAC_TASK_PATH');
 if(kind==='runtime'&&(s.mode&0o222n))fail('SEP_MAC_TASK_RUNTIME_WRITABLE');
 if(kind!=='runtime'&&(s.mode&0o077n))fail('SEP_MAC_TASK_PATH');return [s.dev,s.ino].join(':');
}
async function binary(value,expected,maxBytes){
 path(value);if(!/^[a-f0-9]{64}$/u.test(expected??''))fail('SEP_MAC_TASK_BINARY');
 const before=await lstat(value,{bigint:true});if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1n||before.uid!==BigInt(process.getuid())||(before.mode&0o6222n)||before.size<4n||before.size>BigInt(maxBytes)||await realpath(value)!==value)fail('SEP_MAC_TASK_BINARY');
 const f=await open(value,constants.O_RDONLY|constants.O_NOFOLLOW);try{
  const held=await f.stat({bigint:true});if(identity(before)!==identity(held))fail('SEP_MAC_TASK_BINARY');
  const bytes=Buffer.alloc(65536),hash=createHash('sha256');let count=0;
  // Include one extra byte in the bounded read budget so growth is refused.
  while(count<=Number(before.size)){
   const r=await f.read(bytes,0,Math.min(bytes.length,Number(before.size)+1-count),count);
   if(!r.bytesRead)break;count+=r.bytesRead;hash.update(bytes.subarray(0,r.bytesRead));
  }
  if(count!==Number(before.size)||hash.digest('hex')!==expected||identity(held)!==identity(await f.stat({bigint:true}))||identity(held)!==identity(await lstat(value,{bigint:true})))fail('SEP_MAC_TASK_BINARY');
 }finally{await f.close();}
}
export async function prepareTask(config){
 if(!config||Object.keys(config).sort().join(',')!==['workRoot','runtimeRoot','authorityRoot','executable','executableSha256','ownerPath','ownerSha256'].sort().join(','))fail('SEP_MAC_TASK_CONFIG');
 const {workRoot,runtimeRoot,authorityRoot,executable,executableSha256,ownerPath,ownerSha256}=config;
 for(const p of [workRoot,runtimeRoot,authorityRoot,executable,ownerPath])path(p);
 const roots=[workRoot,runtimeRoot,authorityRoot];for(let i=0;i<3;i++)for(let j=i+1;j<3;j++)if(inside(roots[i],roots[j])||inside(roots[j],roots[i]))fail('SEP_MAC_TASK_SCOPE');
 if(!inside(runtimeRoot,executable)||inside(workRoot,ownerPath))fail('SEP_MAC_TASK_SCOPE');
 const workIdentity=await directory(workRoot,'work'),authorityIdentity=await directory(authorityRoot,'authority'),runtimeIdentity=await directory(runtimeRoot,'runtime');await binary(executable,executableSha256,536870912);await binary(ownerPath,ownerSha256,4194304);
 return Object.freeze({...config,workIdentity,authorityIdentity,runtimeIdentity});
}
export function validateInput(input={}){
 if(!input||Object.getPrototypeOf(input)!==Object.prototype||Object.keys(input).some(k=>!['args','stdin','timeoutMs','graceMs','maxOutputBytes','mode','signal'].includes(k)))fail('SEP_MAC_TASK_INPUT');
 const {args=[],stdin='',timeoutMs=30000,graceMs=200,maxOutputBytes=131072,mode='single',signal}=input;
 if(!Array.isArray(args)||args.length>256||args.some(v=>typeof v!=='string'||!v.isWellFormed()||v.includes('\0')||Buffer.byteLength(v)>8192)||args.reduce((n,v)=>n+Buffer.byteLength(v),0)>65536||typeof stdin!=='string'||!stdin.isWellFormed()||Buffer.byteLength(stdin)>65536||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>300000||!Number.isSafeInteger(graceMs)||graceMs<1||graceMs>2000||!Number.isSafeInteger(maxOutputBytes)||maxOutputBytes<1||maxOutputBytes>1048576||!['single','family'].includes(mode)||signal!==undefined&&!(signal instanceof AbortSignal))fail('SEP_MAC_TASK_INPUT');
 return Object.freeze({args:[...args],stdin,timeoutMs,graceMs,maxOutputBytes,mode,signal});
}
export const platformSupported=({platform,arch,version,build,darwin})=>platform==='darwin'&&arch==='arm64'&&version==='15.7.9'&&build==='24G830'&&darwin==='24.6.0';
export function buildPolicy({workRoot,runtimeRoot,executable},mode){
 for(const p of [workRoot,runtimeRoot,executable])path(p);if(!['single','family'].includes(mode))fail('SEP_MAC_TASK_INPUT');
 const quoted=p=>'"'+p+'"';
 return `(version 1)\n(deny default)\n${mode==='single'?'(deny process-fork)\n(allow process-exec (literal '+quoted(executable)+'))':'(allow process-fork)\n(allow process-exec)'}\n(allow sysctl-read)\n(allow file-read* (literal "/") (subpath "/usr/lib") (subpath "/System/Library") (subpath ${quoted(runtimeRoot)}) (subpath ${quoted(workRoot)}))\n(allow file-write* (subpath ${quoted(workRoot)}) (literal "/dev/null"))\n`;
}
