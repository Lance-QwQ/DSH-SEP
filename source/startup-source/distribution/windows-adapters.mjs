import {readFile,lstat,realpath,mkdir,open,unlink} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex'),fail=c=>{throw Object.assign(Error(c),{code:c});},demand=(v,c)=>{if(!v)fail(c);};
const key=p=>resolve(p).toLowerCase();
async function regular(p){const s=await lstat(p);demand(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1&&key(await realpath(p))===key(p),'REPAIR_SOURCE_IDENTITY');return readFile(p);}
export async function assertWindowsInactive(c){
 demand(process.platform==='win32','REPAIR_WINDOWS_REQUIRED');
 const locks=[join(c.controlRoot,'owner.lock.json'),join(c.controlRoot,'guardian/guardian/owner.json'),join(c.lockDirectory,'dsh-system-enhancement-package-v1.lock'),join(c.storageRoot,'.suite-memory/p2/owner.lock')],pids=[];
 for(const path of locks)try{const value=JSON.parse(await regular(path));demand(Number.isSafeInteger(value.pid)&&value.pid>0,'REPAIR_OWNER_METADATA');pids.push(value.pid);try{process.kill(value.pid,0);fail('REPAIR_OWNER_ALIVE');}catch(e){if(e.code!=='ESRCH')throw e;}}catch(e){if(e.code!=='ENOENT')throw e;}
 const roots=[c.dailyRoot,c.releaseRoot,c.home],legacy=c.dailyRoot.replace('DSH SYSTEM ENHANCEMENT PACKAGE','DSH ENHANCEMENGT SUITE');if(legacy!==c.dailyRoot)try{if(key(await realpath(legacy))===key(c.dailyRoot))roots.push(legacy);}catch(e){if(e.code!=='ENOENT')throw e;}
 const payload=Buffer.from(JSON.stringify({roots,pids})).toString('base64');
 const ps=String.raw`$ErrorActionPreference='Stop'
$c=([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('__PAYLOAD__'))|ConvertFrom-Json)
$all=@(Get-CimInstance Win32_Process)
$matches=@($all|Where-Object {
 $p=$_;if($p.ProcessId -eq __SELF__){return $false};if($p.ProcessId -in $c.pids){return $true}
 if($p.Name -notmatch '^(node|electron)(\.exe)?$'){return $false}
 foreach($r in $c.roots){if(($p.ExecutablePath -and $p.ExecutablePath.StartsWith($r+'\',[StringComparison]::OrdinalIgnoreCase)) -or ($p.CommandLine -and $p.CommandLine.IndexOf($r,[StringComparison]::OrdinalIgnoreCase) -ge 0)){return $true}};return $false
})
@{complete=$true;owners=$matches.Count}|ConvertTo-Json -Compress`.replace('__PAYLOAD__',payload).replace('__SELF__',String(process.pid));
 const r=spawnSync(join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(ps,'utf16le').toString('base64')],{encoding:'utf8',windowsHide:true,timeout:15000});demand(r.status===0,'REPAIR_PROCESS_CENSUS');const result=JSON.parse(r.stdout);demand(result.complete&&result.owners===0,'REPAIR_OWNER_PRESENT');return {status:'pass',owners:0};
}
async function acquireNative(c){
 // Alpha.2 no longer exposes the historical profile-boot d('installation')
 // API. Its actual writers coordinate HOME/profiles/node_modules via p0074's
 // withFileLock, and HOME/profiles/desktop/lock via DesktopProjectManager's wx
 // PID file. Hold both real protocols; never reclaim an existing native lock.
 const graph=JSON.parse(await regular(join(c.releaseRoot,'graph.json')));
 for(const [id,name]of [['p0073','@deepseek-ai/dsh-app-boot'],['p0074','@deepseek-ai/dsh-atomic-write'],['p0485','@deepseek-ai/dsh-desktop']]){
  demand(graph.packages.some(p=>p.id===id&&p.name===name),'REPAIR_NATIVE_PACKAGE');
  for(const f of graph.files.filter(f=>f.path.startsWith('store/'+id+'/')))demand(sha(await regular(join(c.releaseRoot,f.path)))===f.sha256,'REPAIR_NATIVE_CHANGED');
 }
 const app=(await regular(join(c.releaseRoot,'store/p0073/lib/index.js'))).toString(),desktop=(await regular(join(c.releaseRoot,'store/p0485/lib/main.js'))).toString();
 demand(app.includes('withFileLock(modulesDir,')&&app.includes('join(profilesDir, "node_modules")')&&desktop.includes('join6(realpathSync(this.paths.profile), "lock")'),'REPAIR_NATIVE_PROTOCOL_CHANGED');
 const {withFileLock}=await import(pathToFileURL(join(c.releaseRoot,'store/p0074/lib/index.js')));demand(typeof withFileLock==='function','REPAIR_NATIVE_PROTOCOL_CHANGED');
 const profiles=join(c.home,'profiles'),profile=join(profiles,'desktop');for(const p of [profiles,profile]){await mkdir(p,{recursive:true});const s=await lstat(p);demand(s.isDirectory()&&!s.isSymbolicLink()&&key(await realpath(p))===key(p),'REPAIR_NATIVE_DIRECTORY');}
 let entered,failed,releaseHold;const ready=new Promise((r,j)=>{entered=r;failed=j;}),hold=new Promise(r=>releaseHold=r);
 const operation=withFileLock(join(profiles,'node_modules'),async()=>{entered();await hold;},{waitMs:2000});operation.catch(failed);await ready;
 const lock=join(profile,'lock'),lockBytes=Buffer.from(String(process.pid)+'\n');let handle,stamp;
 try{handle=await open(lock,'wx',0o600);await handle.writeFile(lockBytes);await handle.sync();stamp=await handle.stat();}
 catch(e){releaseHold();await operation;throw e;}
 let released=false;return async()=>{if(released)return;released=true;try{const current=await lstat(lock);demand(current.isFile()&&!current.isSymbolicLink()&&current.nlink===1&&current.dev===stamp.dev&&current.ino===stamp.ino&&(await regular(lock)).equals(lockBytes),'REPAIR_NATIVE_LEASE_CHANGED');await handle.close();handle=null;await unlink(lock);}finally{if(handle)await handle.close();releaseHold();await operation;}};
}
export function createWindowsRepairAdapters({acquireStartupLease,inspectColdCheckpoint}={}){
 demand(typeof acquireStartupLease==='function'&&typeof inspectColdCheckpoint==='function','REPAIR_TRUSTED_MODULES_REQUIRED');
 return {acquireLease:c=>acquireStartupLease(join(c.dailyRoot,'state/startup.sqlite3')),acquireNative,assertInactive:assertWindowsInactive,async verifyStorage(c){const result=await inspectColdCheckpoint(c);demand(result.verified===true,'REPAIR_STORAGE_NOT_ADMITTED');return result;}};
}
