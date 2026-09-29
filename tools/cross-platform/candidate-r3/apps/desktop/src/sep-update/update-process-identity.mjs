import {execFile} from 'node:child_process';
import {promisify,isDeepStrictEqual} from 'node:util';
import {readFile,readlink} from 'node:fs/promises';
import {join} from 'node:path';
const exec=promisify(execFile);
const fail=code=>{throw Object.assign(Error(code),{code})};
const uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(x);
export const cleanEnv=()=>Object.fromEntries(Object.entries(process.env).filter(([k])=>process.platform==='win32'
 ? ['SYSTEMROOT','WINDIR','PATH','COMSPEC','PATHEXT','TEMP','TMP'].includes(k.toUpperCase())
 : ['PATH','HOME','USER','LOGNAME','SHELL','TMPDIR','TMP','TEMP','LANG','LC_ALL','TZ','DISPLAY','WAYLAND_DISPLAY','XAUTHORITY','DBUS_SESSION_BUS_ADDRESS','XDG_RUNTIME_DIR','XDG_CONFIG_HOME','XDG_DATA_HOME','XDG_CACHE_HOME','XDG_STATE_HOME'].includes(k)));
const options=()=>({windowsHide:true,timeout:5000,maxBuffer:32768,env:{...cleanEnv(),LC_ALL:'C',TZ:'UTC'}});
function zero(pid){try{process.kill(pid,0);return 'alive'}catch(e){return e.code==='ESRCH'?'absent':'unknown'}}
async function scope(){
 if(process.platform==='linux')return {identityVersion:2,platform:'linux',bootId:(await readFile('/proc/sys/kernel/random/boot_id','utf8')).trim().toLowerCase(),namespace:await readlink('/proc/self/ns/pid')};
 if(process.platform==='darwin')return {identityVersion:2,platform:'darwin',bootId:(await exec('/usr/sbin/sysctl',['-n','kern.bootsessionuuid'],options())).stdout.trim().toLowerCase(),namespace:'host'};
 fail('UPDATE_PROCESS_PLATFORM_UNSUPPORTED');
}
function validScope(s){return s?.identityVersion===2&&uuid(s.bootId)&&(s.platform==='linux'?/^pid:\[\d+\]$/.test(s.namespace):s.platform==='darwin'&&s.namespace==='host')}
function validBirth(s){return typeof s?.birth==='string'&&(s.platform==='linux'?/^\d{1,30}$/.test(s.birth):/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) [A-Z][a-z]{2} [ \d]\d \d{2}:\d{2}:\d{2} \d{4}$/.test(s.birth))}
async function sample(pid){
 if(process.platform==='win32'){
  const command=`$ErrorActionPreference='Stop'; $rows=@(Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}');if($rows.Count -eq 0){'null'}elseif($rows.Count -eq 1){$p=Get-Process -Id ${pid} -ErrorAction Stop;[pscustomobject]@{pid=$p.Id;birth=$p.StartTime.ToUniversalTime().ToString('o');exe=$p.Path}|ConvertTo-Json -Compress}else{throw 'ambiguous'}`;
  const {stdout}=await exec(join(process.env.SystemRoot??'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-Command',command],options());
  const p=JSON.parse(stdout.trim());if(p&&(p.pid!==pid||!p.birth||!p.exe))fail('UPDATE_PROCESS_IDENTITY_UNKNOWN');return p;
 }
 if(process.platform==='linux'){
  let raw;try{raw=await readFile(`/proc/${pid}/stat`,'utf8')}catch(e){if(e.code==='ENOENT')return null;throw e}
  const end=raw.lastIndexOf(')'),parts=raw.slice(end+2).trim().split(/\s+/);
  if(!raw.startsWith(`${pid} (`)||end<0||['Z','X','x'].includes(parts[0])||!/^\d+$/.test(parts[19]??''))fail('UPDATE_PROCESS_IDENTITY_UNKNOWN');
  return {pid,birth:parts[19],exe:await readlink(`/proc/${pid}/exe`)};
 }
 let stdout;try{({stdout}=await exec('/bin/ps',['-ww','-p',String(pid),'-o','pid=','-o','lstart=','-o','comm='],options()))}catch(e){if(e.code===1&&!e.stdout?.trim()&&!e.stderr?.trim())return null;throw e}
 const match=stdout.trim().match(/^(\d+)\s+((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) [A-Z][a-z]{2} [ \d]\d \d{2}:\d{2}:\d{2} \d{4})\s+(.+)$/);
 if(!match||Number(match[1])!==pid)fail('UPDATE_PROCESS_IDENTITY_UNKNOWN');
 // comm is corroborating evidence, not permission to signal a PID or a trusted executable path.
 return {pid,birth:match[2],exe:match[3]};
}
/** Null means independently observed absence. Missing OS evidence is an error. */
export async function processIdentity(pid){
 if(!Number.isSafeInteger(pid)||pid<1||pid>0xffffffff)fail('UPDATE_PROCESS_IDENTITY_INVALID');
 if(!['win32','linux','darwin'].includes(process.platform))fail('UPDATE_PROCESS_PLATFORM_UNSUPPORTED');
 try{
  const before=process.platform==='win32'?null:await scope();if(before&&!validScope(before))fail('UPDATE_PROCESS_IDENTITY_UNKNOWN');
  const a=await sample(pid),live=zero(pid),b=await sample(pid),after=before?await scope():null;
  if(!isDeepStrictEqual(before,after)||!isDeepStrictEqual(a,b))fail('UPDATE_PROCESS_IDENTITY_UNKNOWN');
  if(!a&&live==='absent')return null;
  if(!a||live!=='alive')fail('UPDATE_PROCESS_IDENTITY_UNKNOWN');
  const id={...a,...before};if(before&&!validBirth(id))fail('UPDATE_PROCESS_IDENTITY_UNKNOWN');return id;
 }catch(e){if(e.code?.startsWith('UPDATE_PROCESS_'))throw e;fail('UPDATE_PROCESS_IDENTITY_UNKNOWN')}
}
export async function isProcessAlive(identity){
 if(!identity?.birth||!identity.exe)fail('UPDATE_PROCESS_IDENTITY_UNKNOWN');
 if(process.platform!=='win32'&&identity.birth!=='exited-before-inspection'&&(!validScope(identity)||!validBirth(identity)||identity.platform!==process.platform))fail('UPDATE_PROCESS_IDENTITY_UNKNOWN');
 if(process.platform==='win32'&&identity.identityVersion!==undefined)fail('UPDATE_PROCESS_IDENTITY_UNKNOWN');
 const current=await processIdentity(identity.pid);if(!current)return false;
 if(identity.birth==='exited-before-inspection')fail('UPDATE_PROCESS_IDENTITY_UNKNOWN');
 if(process.platform==='win32')return current.birth===identity.birth&&current.exe===identity.exe;
 if(current.bootId!==identity.bootId)return false;
 if(current.namespace!==identity.namespace)fail('UPDATE_PROCESS_IDENTITY_UNKNOWN');
 if(current.birth!==identity.birth)return false;
 if(current.exe!==identity.exe)fail('UPDATE_PROCESS_IDENTITY_UNKNOWN');
 return true;
}