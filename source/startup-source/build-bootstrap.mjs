import fs from 'node:fs/promises';
import path from 'node:path';
const project=await fs.realpath(path.resolve(import.meta.dirname,'../..'));
const prior=path.join(project,'work/daily-owner-recovery-20260924'),out=path.join(import.meta.dirname,'bootstrap');
await fs.mkdir(out,{recursive:true});
let launcher=await fs.readFile(path.join(prior,'candidate/launcher.mjs'),'utf8');
launcher=launcher.replace("c.graphHash!=='7a1719d5bf7ce51a6973ab0f10d7532c1b0f2af086553adb7a438d08b1eb47a2'","c.graphHash!=='@GRAPH_HASH@'")
 .replace("return client.call('startHost');","return client.call('startHost',{manual:true});")
 .replace("fail(state.recoveryState?.reason??'RECOVERY_UNAVAILABLE');","fail(state.recoveryState?.ownerReason??state.recoveryState?.reason??'RECOVERY_UNAVAILABLE');")
 .replace("const close=()=>Promise.resolve(runtime.service?runtime.close():undefined).then(()=>{process.exitCode=0;});","let closing;const close=()=>closing??=(async()=>{try{if(runtime.service)await runtime.close();process.exitCode=0;}catch(error){console.error('DSH SEP shutdown incomplete: '+(error.code??'DAILY_SHUTDOWN_FAILED'));process.exitCode=1;}})();")
 .replace("child.once('error',()=>{void close();});","child.once('error',error=>{console.error('DSH SEP desktop failed: '+(error.code??'DAILY_DESKTOP_FAILED'));void close().finally(()=>{process.exitCode=1;});});")
 .replace("../deployment-rc2.json","../deployment.json");
await fs.writeFile(path.join(out,'launcher.mjs'),launcher);
for(const name of ['startup-lease.mjs'])await fs.copyFile(path.join(prior,name),path.join(out,name));
for(const name of ['launch.mjs','start.vbs']){
 let text=await fs.readFile(path.join(prior,'candidate',name),'utf8');
 text=text.replaceAll('managed-rc2','@MANAGED_DIR@').replaceAll('deployment-rc2.json','@CONFIG_FILE@');
 if(name==='launch.mjs')text="import {safeHostCode} from './@MANAGED_DIR@/startup-diagnostic.mjs';\n"+text.replace("console.error('DSH SEP startup failed: '+code);","const host=safeHostCode(error.hostCode),detail=code+(host?' ('+host+')':'');\n console.error('DSH SEP startup failed: '+detail);").replace("'DSH SEP startup failed: '+code+'\\r\\nTime:","'DSH SEP startup failed: '+detail+'\\r\\nTime:");
 await fs.writeFile(path.join(out,name),text);
}
await fs.copyFile(path.join(import.meta.dirname,'diagnostics/startup-diagnostic.mjs'),path.join(out,'startup-diagnostic.mjs'));
await fs.writeFile(path.join(out,'start.ps1'),`$ErrorActionPreference='Stop'\nSet-Location -LiteralPath $PSScriptRoot\n& (Join-Path $PSScriptRoot 'runtime\\node\\node.exe') (Join-Path $PSScriptRoot 'launch.mjs')\nexit $LASTEXITCODE\n`);
let scan=await fs.readFile(path.join(prior,'startup-coordinator.mjs'),'utf8');
scan=scan.slice(0,scan.indexOf('export async function assertAbsentProcesses'))
 .replace("import {acquireStartupLease} from './startup-lease.mjs';\n",'')
 .replace("import {readLockStamp,createTrustedColdReceipt,recoverColdOwners} from './cold-recovery/recover.mjs';\n",'');
await fs.writeFile(path.join(out,'checkpoint-inspection.mjs'),scan);
console.log(JSON.stringify({out}));
