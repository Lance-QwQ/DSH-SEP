import {isAbsolute,resolve} from 'node:path';
const fail=code=>{throw Object.assign(Error(code),{code});};
export async function bounded(promise,ms,code){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(Error(code),{code})),ms);})]);}finally{clearTimeout(timer);}}
export function parseLaunchArgs(args){if(![2,3].includes(args.length)||args[2]!==undefined&&args[2]!=='--headless'||args.slice(0,2).some(p=>typeof p!=='string'||!isAbsolute(p)||resolve(p)!==p||p.includes('\0')))fail('SEP_LINUX_LAUNCH_ARGUMENTS');return {program:args[0],data:args[1],headless:args[2]==='--headless'};}
export async function sendHostMessage(child,message){if(!child?.connected)fail('SEP_LINUX_IPC_CLOSED');try{await new Promise((r,j)=>child.send(message,error=>error?j(error):r()));}catch{fail('SEP_LINUX_IPC_CLOSED');}}
export async function waitForDesktop({host,desktop,stopping,phase,desktopMs=5000}){
 const outcome=await Promise.race([desktop.completion.then(()=> 'desktop'),stopping.then(()=> 'signal'),host.completion.then(()=> 'host')]);
 if(outcome==='host'){
  // A planned RPC stop may finish the Host before Electron closes its window.
  // An unplanned Host death must enter owned-child cleanup immediately.
  if(phase()==='running')fail('SEP_LINUX_HOST_EXITED');
  await bounded(desktop.completion,desktopMs,'SEP_LINUX_DESKTOP_STOP_UNCONFIRMED');
 }
 return outcome;
}
export function ownChild(child){
 let exit,closing,forced=false;const completion=new Promise(resolve=>{child.once('error',()=>{});child.once('close',(code,signal)=>{exit={code,signal};resolve(exit);});if(child.exitCode!==null||child.signalCode!==null){exit={code:child.exitCode,signal:child.signalCode};resolve(exit);}});
 return {completion,get exit(){return exit;},stop({graceMs=2000,killMs=2000}={}){return closing??=(async()=>{if(!exit){child.kill('SIGTERM');try{await bounded(completion,graceMs,'SEP_LINUX_DESKTOP_STOP_DEADLINE');}catch{if(!exit){forced=true;child.kill('SIGKILL');await bounded(completion,killMs,'SEP_LINUX_DESKTOP_STOP_UNCONFIRMED');}}}return {status:forced?'blocked':'pass',exit,forced};})().catch(e=>{closing=undefined;throw e;});}};
}
