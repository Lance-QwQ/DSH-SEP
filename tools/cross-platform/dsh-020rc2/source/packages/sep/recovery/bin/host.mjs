#!/usr/bin/env node
import {readFile,lstat,open,rename} from 'node:fs/promises';
import {isAbsolute,join} from 'node:path';
import {bootRecoveryHost} from '../src/host-runtime.mjs';
import {createContinuation} from '../src/continuation.mjs';
const configFile=process.argv[2];let host,closing;
const continuations=new Set();
async function close(){return closing??=(async()=>{await Promise.allSettled([...continuations]);await host?.ctx.fiber.dispose();if(process.connected)process.disconnect();})();}
process.on('message',m=>{
 if(m?.type==='dsh-daily-shutdown'){void close();return;}
 if(m?.type!=='dsh-recovery-continuation'||typeof m.id!=='string'||!/^[a-f0-9-]{36}$/.test(m.id))return;
 const reply=value=>{if(process.connected)process.send({type:'dsh-recovery-continuation-result',id:m.id,...value},()=>{});};
 if(closing||!host||continuations.size>=16){reply({ok:false,code:closing?'RECOVERY_CLOSING':'CONTINUATION_HOST_UNAVAILABLE'});return;}
 const work=Promise.resolve().then(()=>createContinuation(host.ctx,m.request)).then(proof=>reply({ok:true,proof}),error=>reply({ok:false,code:error.code??'CONTINUATION_OUTCOME_UNKNOWN'}));
 continuations.add(work);void work.finally(()=>continuations.delete(work));
});process.once('SIGINT',()=>void close());process.once('SIGTERM',()=>void close());
try{
 if(!isAbsolute(configFile??'')||(await lstat(configFile)).size>256*1024)throw Error('RECOVERY_HOST_CONFIG');
 const config=JSON.parse(await readFile(configFile,'utf8'));host=await bootRecoveryHost(config);
 if(closing){await host.ctx.fiber.dispose();}else {
  const ready={pid:process.pid,url:host.url,projectId:host.project.id};
  const path=join(config.home,'host-ready.json'),temp=path+`.${process.pid}.pending`,file=await open(temp,'wx',0o600);
  try{await file.writeFile(JSON.stringify(ready));await file.sync();}finally{await file.close();}await rename(temp,path);
  process.send?.({type:'dsh-guardian-ready',url:host.url,projectId:host.project.id});
 }
}catch(error){console.error(JSON.stringify({code:error.code??'RECOVERY_HOST_START_FAILED'}));process.exitCode=1;await close();}
