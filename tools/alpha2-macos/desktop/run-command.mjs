import {spawn} from 'node:child_process';
import {createWriteStream} from 'node:fs';
import {finished} from 'node:stream/promises';
async function bounded(promise,ms){let timer;try{return await Promise.race([promise,new Promise(r=>{timer=setTimeout(()=>r(undefined),ms);})]);}finally{clearTimeout(timer);}}
export async function runOwnedCommand({file,args,cwd,env,logPath,timeoutMs=120000,killWaitMs=10000,logWaitMs=5000}){
 for(const value of [timeoutMs,killWaitMs,logWaitMs])if(!Number.isSafeInteger(value)||value<1)throw Error('COMMAND_DEADLINE_INVALID');
 const log=createWriteStream(logPath,{flags:'wx'}),child=spawn(file,args,{cwd,env,detached:process.platform!=='win32',stdio:['ignore','pipe','pipe']});
 const logCompletion=finished(log).then(()=>true,()=>false);
 child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false});
 let tail='',exited=false;for(const stream of [child.stdout,child.stderr])stream.on('data',b=>{tail=(tail+b).slice(-2048);});
 const close=new Promise(r=>{child.once('error',()=>r({exitCode:null,signal:null,spawnError:true}));child.once('close',(exitCode,signal)=>{exited=true;r({exitCode,signal});});});
 let result=await bounded(close,timeoutMs),timedOut=result===undefined;
 if(timedOut){try{if(process.platform==='win32')child.kill('SIGKILL');else process.kill(-child.pid,'SIGKILL');}catch{}result=await bounded(close,killWaitMs);}
 const cleanupConfirmed=result!==undefined;
 if(!cleanupConfirmed){child.stdout.destroy();child.stderr.destroy();child.unref();}
 log.end();const logFinished=await bounded(logCompletion,logWaitMs)===true;if(!logFinished)log.destroy();
 return {status:cleanupConfirmed&&logFinished?(result.exitCode===0&&!timedOut&&!result.spawnError?'pass':'fail'):'blocked',...(result??{exitCode:null,signal:null}),timedOut,cleanupConfirmed,logFinished,tail};
}
