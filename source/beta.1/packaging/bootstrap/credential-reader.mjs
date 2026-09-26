import {open,lstat,realpath} from 'node:fs/promises';
import {isAbsolute,resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
const limit=65536;
const fail=code=>{throw Object.assign(Error(code),{code});};
const canonical=p=>resolve(p).toLowerCase();
const sameIdentity=(a,b)=>['dev','ino','size','mtimeNs','ctimeNs','nlink'].every(k=>a[k]===b[k]);
function check(s){
 if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1n||s.ino===0n)fail('DAILY_CREDENTIAL_UNSAFE');
 if(s.size>BigInt(limit))fail('DAILY_CREDENTIAL_TOO_LARGE');
}
async function readStable(path){
 if(!isAbsolute(path))fail('DAILY_CREDENTIAL_UNSAFE');
 const before=await lstat(path,{bigint:true});check(before);
 if(canonical(await realpath(path))!==canonical(path))fail('DAILY_CREDENTIAL_UNSAFE');
 const handle=await open(path,'r');
 try{
  const opened=await handle.stat({bigint:true});check(opened);
  if(!sameIdentity(before,opened))fail('DAILY_CREDENTIAL_CHANGED');
  // Fixed allocation also bounds a file that grows after the initial lstat.
  const buffer=Buffer.alloc(limit+1);let used=0;
  while(used<buffer.length){const {bytesRead}=await handle.read(buffer,used,buffer.length-used,used);if(bytesRead===0)break;used+=bytesRead;}
  if(used>limit)fail('DAILY_CREDENTIAL_TOO_LARGE');
  const after=await handle.stat({bigint:true}),named=await lstat(path,{bigint:true});check(after);check(named);
  if(!sameIdentity(before,after)||!sameIdentity(after,named)||BigInt(used)!==after.size||canonical(await realpath(path))!==canonical(path))fail('DAILY_CREDENTIAL_CHANGED');
  try{return new TextDecoder('utf-8',{fatal:true}).decode(buffer.subarray(0,used));}catch{fail('DAILY_CREDENTIAL_INVALID');}
 }finally{await handle.close();}
}
function parse(text){
 const rows=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(s=>/^\s*(?:export\s+)?DEEPSEEK_API_KEY\s*=/.test(s));
 if(rows.length!==1)fail('DAILY_CREDENTIAL_INVALID');
 let value=rows[0].replace(/^\s*(?:export\s+)?DEEPSEEK_API_KEY\s*=\s*/,'').trim();
 if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'")))value=value.slice(1,-1);
 if(value==='')return undefined;
 if(!/^[A-Za-z0-9_-]{11,256}$/.test(value))fail('DAILY_CREDENTIAL_INVALID');
 return value;
}
export async function readCredential(path){
 for(let attempt=0;attempt<3;attempt++){
  try{return parse(await readStable(path));}catch(error){
   if(['ENOENT','EBUSY','ETXTBSY','EPERM','EACCES'].includes(error.code)&&attempt<2){await delay(attempt===0?150:350);continue;}
   if(error.code==='ENOENT')fail('DAILY_CREDENTIAL_MISSING');
   if(['EBUSY','ETXTBSY'].includes(error.code))fail('DAILY_CREDENTIAL_BUSY');
   if(['EPERM','EACCES'].includes(error.code))fail('DAILY_CREDENTIAL_UNREADABLE');
   if(['DAILY_CREDENTIAL_INVALID','DAILY_CREDENTIAL_UNSAFE','DAILY_CREDENTIAL_TOO_LARGE','DAILY_CREDENTIAL_CHANGED'].includes(error.code))throw error;
   fail('DAILY_CREDENTIAL_IO');
  }
 }
}
