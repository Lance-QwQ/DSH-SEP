import {open,rename,lstat,realpath,readFile} from 'node:fs/promises';import {dirname} from 'node:path';import {randomBytes} from 'node:crypto';
const fail=code=>{throw Object.assign(Error(code),{code});};
export function validatePreviousGeneration(prior){if(prior===null)return;if(prior?.schema!==1||!/^[a-f0-9]{32}$/.test(prior.generation??'')||prior.phase!=='closed'||prior.resourcesConfirmedReleased!==true)fail('SEP_MAC_PREVIOUS_LAUNCH_UNCONFIRMED');}
// Called while the native lease is held, before starting a child. A previous
// cleanly stopped attempt may have failed before writing any business bytes.
// Nonempty domains must carry an existing authority which the real business
// factory subsequently rechecks byte-for-byte; this never grants adoption.
export function selectBusinessInitialization(prior,names){validatePreviousGeneration(prior);if(!names.length)return true;if(prior===null)fail('SEP_MAC_FIRST_BOOT_NOT_EMPTY');if(!names.includes('PROFILE.json')&&!names.includes('BOOTSTRAP.json'))fail('SEP_MAC_FRESH_PROFILE_REQUIRED');return false;}
export function closedReceipt(desktopExit,host){return desktopExit?.code===0&&!desktopExit.signal&&host?.phase==='stopped'&&host.lastExit?.code===0&&host.lastExit?.forced===false?{status:'pass',resourcesConfirmedReleased:true,scope:'owned desktop main process and managed business host'}:{status:'blocked',resourcesConfirmedReleased:false};}
export async function readGeneration(path){let stat;try{stat=await lstat(path);}catch(e){if(e.code==='ENOENT')return null;throw e;}if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.size>8192||await realpath(path)!==path)fail('SEP_MAC_LAUNCH_STATE_INVALID');try{return JSON.parse(await readFile(path,'utf8'));}catch{fail('SEP_MAC_LAUNCH_STATE_INVALID');}}
export async function persistGeneration(path,value){const temporary=path+'.'+randomBytes(8).toString('hex')+'.tmp',h=await open(temporary,'wx',0o600);try{await h.writeFile(JSON.stringify(value)+'\n');await h.sync();}finally{await h.close();}await rename(temporary,path);const d=await open(dirname(path),'r');try{await d.sync();}finally{await d.close();}}
