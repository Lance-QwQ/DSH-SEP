import {readFile,writeFile,open} from 'node:fs/promises';
import {spawn} from 'node:child_process';
const generation=process.argv[2]??'r2';if(!/^r[1-9][0-9]*$/.test(generation))throw Error('INVALID_GENERATION');
const base='D:/AIData/ProjectWork/DSH/alpha2-desktop-continuation-20261012',file=base+'/DESKTOP-PROBE-INPUT-'+generation+'.json';
const input=JSON.parse(await readFile(file,'utf8'));
const env={...process.env,SEP_DESKTOP_PROBE_INPUT:file,DSH_HOME:input.home,SEP_DAILY_SELECTION_PATH:input.selectionFile,SEP_DAILY_SELECTION_SHA256:input.selectionSha256,DSH_DESKTOP_DSH_DIR:input.runtime,DSH_DESKTOP_PRIMARY_RUNTIME_DIR:'D:/AIData/ProjectWork/DSH/release-beta2-20261007/bundle-full/runtime/primary-runtime',DSH_DESKTOP_PNPM_ENTRY:'D:/AIData/ProjectWork/DSH/release-beta2-20261007/bundle-full/runtime/pnpm/bin/pnpm.cjs',DSH_DESKTOP_OPEN_DEVTOOLS:'0',DSH_TELEMETRY_DISABLED:'1',DSH_DESKTOP_DIAGNOSTIC_FILE:input.receipt+'.main-error.txt'};delete env.ELECTRON_RUN_AS_NODE;
const log=await open(base+'/desktop-lifecycle-'+generation+'.log','wx');
// This is an explicitly visible GUI acceptance probe. SW_HIDE startup flags
// can suppress Windows' first ShowWindow even when the app calls show().
const child=spawn('D:/AIData/ProjectWork/DSH/release-beta2-20261007/bundle-full/runtime/desktop/electron.exe',[input.app],{cwd:input.project,env,stdio:['ignore',log.fd,log.fd],windowsHide:false});
await writeFile(base+'/DESKTOP-PROBE-OWNER-'+generation+'.json',JSON.stringify({pid:child.pid,app:input.app,receipt:input.receipt})+'\n',{flag:'wx'});
const result=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal,pid:child.pid}));});
await log.close();await writeFile(base+'/DESKTOP-PROBE-EXIT-'+generation+'.json',JSON.stringify(result)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
