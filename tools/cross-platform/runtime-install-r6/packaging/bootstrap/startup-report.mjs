import {mkdir,lstat,realpath,open,link,unlink} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {safeHostCode} from './startup-diagnostic.mjs';
const credentialCodes=['DAILY_CREDENTIAL_MISSING','DAILY_CREDENTIAL_UNREADABLE','DAILY_CREDENTIAL_BUSY','DAILY_CREDENTIAL_INVALID','DAILY_CREDENTIAL_UNSAFE','DAILY_CREDENTIAL_TOO_LARGE','DAILY_CREDENTIAL_CHANGED','DAILY_CREDENTIAL_IO'];
const allowed=new Set([...credentialCodes,'DAILY_START_FAILED','DAILY_CONFIG','DAILY_FILE_INVALID','DAILY_MAINTENANCE','DAILY_DIRECTORY_CHANGED','DAILY_RELEASE_CHANGED','DAILY_CENTER_MISMATCH','DAILY_START_IN_PROGRESS','DAILY_DEPLOYMENT_CHANGED','DAILY_LEASE_INVALID','DAILY_LEASE_PATH','DAILY_LEASE_LOST','DAILY_RESTART_BUDGET_EXHAUSTED','DAILY_HOST_NOT_READY','GUARDIAN_NOT_READY','ERR_MODULE_NOT_FOUND','SQLITE_ERROR']);
const hints={
 DAILY_CREDENTIAL_MISSING:'The configured credential file is missing. Restore that file or explicitly configure its new location.',
 DAILY_CREDENTIAL_UNREADABLE:'The configured credential file cannot be read. Check its permissions; they were not changed.',
 DAILY_CREDENTIAL_BUSY:'The configured credential file remains busy after bounded retries. Close its writer and try again.',
 DAILY_CREDENTIAL_INVALID:'The configured credential file has invalid contents. Use one DEEPSEEK_API_KEY assignment; an explicitly empty value opens setup.',
 DAILY_CREDENTIAL_UNSAFE:'The configured credential source failed local file identity validation. Links and multiple hardlinks are not accepted.',
 DAILY_CREDENTIAL_TOO_LARGE:'The configured credential file exceeds 64 KiB.',
 DAILY_CREDENTIAL_CHANGED:'The configured credential file changed while it was being read. Finish editing it, then retry.',
 DAILY_CREDENTIAL_IO:'Reading the configured credential file failed. Check local storage availability.',
};
export function startupFailure(error,attempt){
 const code=allowed.has(error?.code)||safeHostCode(error?.code)?error.code:'DAILY_START_FAILED';
 const host=safeHostCode(error?.hostCode),index=credentialCodes.indexOf(code);
 return {code,exitCode:index<0?1:20+index,text:'DSH SEP startup failed: '+code+(host?' ('+host+')':'')+'\r\n'+(hints[code]??'Inspect this startup code. This error alone does not establish a missing or invalid API key.')+'\r\nAttempt: '+attempt+'\r\nTime: '+new Date().toISOString()+'\r\n'};
}
const same=(a,b)=>process.platform==='win32'?resolve(a).toLowerCase()===resolve(b).toLowerCase():resolve(a)===resolve(b);
async function directory(path){const s=await lstat(path,{bigint:true});if(!s.isDirectory()||s.isSymbolicLink()||!same(await realpath(path),path))throw Error('DIAGNOSTIC_PATH');return s;}
export async function reportStartupFailure(root,error,args=process.argv.slice(2)){
 const supplied=args.find(v=>v.startsWith('--startup-attempt='))?.slice(18);
 const attempt=/^[a-zA-Z0-9_-]{1,80}$/.test(supplied??'')?supplied:randomUUID();
 const result=startupFailure(error,attempt);console.error(result.text.trim());
 const state=join(root,'state'),file=join(state,'startup-'+attempt+'.txt'),temp=file+'.'+randomUUID()+'.tmp';let created=false;
 try{
  await directory(root);await mkdir(state).catch(e=>{if(e.code!=='EEXIST')throw e;});const before=await directory(state);
  const handle=await open(temp,'wx',0o600);created=true;
  try{await handle.writeFile(result.text);await handle.sync();}finally{await handle.close();}
  const after=await directory(state);if(before.dev!==after.dev||before.ino!==after.ino)throw Error('DIAGNOSTIC_CHANGED');
  // Atomic publication without overwriting a pre-existing attempt or symlink.
  await link(temp,file);
 }catch{console.error('DAILY_DIAGNOSTIC_UNAVAILABLE: diagnostic could not be saved; the startup code above remains valid.');}
 finally{if(created)await unlink(temp).catch(()=>{});}
 return result.exitCode;
}
