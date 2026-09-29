/** Read-only command-line quiescence gate, not authority to terminate processes. */
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve} from 'node:path';
import {isProcessAlive} from './update-process-identity.mjs';
const run=promisify(execFile);
export function matchingProcessIds(stdout,roots,ignored=[]){
 if(typeof stdout!=='string'||!Array.isArray(roots)||!roots.length)throw Error('SEP_PLAN_PROCESS_QUERY');
 const result=[];
 for(const line of stdout.split(/\r?\n/).filter(s=>s.trim())){
  const match=/^\s*(\d+)\s+(.*)$/.exec(line);if(!match)throw Error('SEP_PLAN_PROCESS_QUERY');
  const pid=Number(match[1]);if(!Number.isSafeInteger(pid)||pid<=0)throw Error('SEP_PLAN_PROCESS_QUERY');
  if(!ignored.includes(pid)&&roots.some(root=>match[2].includes(root)))result.push(pid);
 }
 return result;
}
export async function assertInstallationIdle(installation,allowed=[]){
 if(typeof installation?.dailyRoot!=='string')throw Error('SEP_PLAN_PROCESS_QUERY');
 const ignore=[process.pid];for(const identity of allowed)if(await isProcessAlive(identity))ignore.push(identity.pid);
 const roots=[...new Set(['dailyRoot','releaseRoot','home','storageRoot','controlRoot'].map(k=>installation[k]).filter(Boolean).map(p=>resolve(p)))];
 if(roots.some(p=>/[\x00-\x1f\x7f]/.test(p)))throw Error('SEP_PLAN_PROCESS_QUERY');
 let pids;
 try{
  if(process.platform==='win32'){
   const encoded=Buffer.from(JSON.stringify(roots.map(p=>p.toLowerCase()))).toString('base64');
   const script=`$ErrorActionPreference='Stop'; $roots=ConvertFrom-Json ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}'))); $rows=@(Get-CimInstance Win32_Process | Where-Object { $cmd=$_.CommandLine; $_.ProcessId -notin @(${ignore.join(',')}) -and $cmd -and @($roots | Where-Object {$cmd.ToLowerInvariant().Contains($_)}).Count -gt 0 } | Select-Object ProcessId); ConvertTo-Json -InputObject $rows -Compress`;
   const {stdout}=await run('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:15000,maxBuffer:8388608});
   const rows=JSON.parse(stdout.trim());if(!Array.isArray(rows)||rows.some(p=>!Number.isSafeInteger(p.ProcessId)))throw Error('invalid process inventory');pids=rows.map(p=>p.ProcessId);
  }else if(['linux','darwin'].includes(process.platform)){
   const {stdout}=await run('/bin/ps',['-axww','-o','pid=','-o','command='],{timeout:15000,maxBuffer:8388608,env:{...process.env,LC_ALL:process.platform==='darwin'?'en_US.UTF-8':'C.UTF-8',LANG:process.platform==='darwin'?'en_US.UTF-8':'C.UTF-8'}});
   pids=matchingProcessIds(stdout,roots,ignore);
  }else throw Error('unsupported platform');
 }catch(error){throw Error('SEP_PLAN_PROCESS_QUERY',{cause:error});}
 if(pids.length)throw Error('SEP_PLAN_APP_RUNNING');
}
