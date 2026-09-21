import {spawn} from 'node:child_process';import {randomBytes} from 'node:crypto';import * as evaluation from './evaluation/index.mjs';
const limit=(promise,ms,label)=>{let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label)),ms);})]).finally(()=>clearTimeout(timer));};
export class Entry{
 constructor(ctx,config={},internal={}){this.ctx=ctx;this.config=config;this.spawnBackend=internal.spawnBackend??(challenge=>{
  const b=config.backend;if(!b||!b.entry?.startsWith('/opt/dsh-sep-eval/')||!b.entry.endsWith('/lifecycle.py')||!b.configPath?.startsWith('/opt/dsh-sep-eval/'))throw Error('BACKEND_CONFIG');
  return spawn('wsl.exe',['-d','DSH-SEP-Eval','-u','root','--exec','/opt/dsh-sep-eval/swebench-venv/bin/python','-B',b.entry,b.configPath,b.configSha256,challenge,...config.recover?['--recover']:[]],{windowsHide:true,stdio:['pipe','pipe','pipe']});
 });this.state='idle';this.runtime=null;}
 async start(){
  if(!this.config.enabled)return {status:'not_run',scope:'disabled'};
  if(['starting','ready','stopping'].includes(this.state))throw Error('ALREADY_ACTIVE');if(this.state==='blocked')throw Error('RECOVERY_REQUIRED');
  const b=this.config.backend,p=this.config.project;if(!/^[a-f0-9]{64}$/.test(b?.configSha256??'')||!/^[a-f0-9]{64}$/.test(b?.stateIdentity??'')||!/^[a-f0-9]{64}$/.test(p?.catalogSha256??''))throw Error('ENTRY_CONFIG');
  this.state='starting';const challenge=randomBytes(32).toString('hex');const r={plugin:null,connection:null,closed:null,stopPromise:null};r.attached=new Promise(yes=>{r.attachResolve=yes;});this.runtime=r;
  try{
   r.child=await this.spawnBackend(challenge);let readyResolve,readyReject,exitResolve;
   r.ready=new Promise((yes,no)=>{readyResolve=yes;readyReject=no;});r.exited=new Promise(yes=>{exitResolve=yes;});
   let buffer='';r.child.stdout.on('data',chunk=>{buffer+=chunk.toString();if(buffer.length>65536){readyReject(Error('CONTROL_OUTPUT_LIMIT'));r.child.stdin.end();return;}let at;while((at=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,at);buffer=buffer.slice(at+1);try{const msg=JSON.parse(line);if(msg.ready)readyResolve(msg.ready);else if(msg.closed)r.closed=msg.closed;else readyReject(Error('CONTROL_PROTOCOL'));}catch{readyReject(Error('CONTROL_PROTOCOL'));}}});
   // Diagnostics can contain arbitrary library output: consume, do not publish credentials.
   r.child.stderr.on('data',()=>{});r.child.stdin.on('error',()=>{});
   r.child.on('error',()=>{readyReject(Error('BACKEND_START'));});
   r.child.on('close',code=>{r.exitCode=code;exitResolve(code);readyReject(Error('BACKEND_EXIT'));if(this.runtime===r&&this.state==='ready'){this.state='blocked';r.revocation=Promise.resolve(r.plugin?.dispose()).catch(()=>{});}});
   r.attachResolve();
   if(this.state!=='starting'){r.ready.catch(()=>{});r.child.stdin.end();throw Error('START_CANCELLED');}
   const c=await limit(r.ready,25000,'BACKEND_READY_TIMEOUT');r.connection=c;
   const url=new URL(c.endpoint);if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||!url.port||url.pathname!=='/'||url.username||url.password||url.search||url.hash)throw Error('HANDSHAKE_ENDPOINT');
   if(c.challenge!==challenge||c.protocol!=='sep-eval-lifecycle-v1'||c.projectId!==p.projectId||c.catalogSha256!==p.catalogSha256||c.stateIdentity!==b.stateIdentity||!/^[a-f0-9]{32}$/.test(c.generationId??'')||!/^[a-f0-9]{64}$/.test(c.token??''))throw Error('HANDSHAKE_BINDING');
   // WSL localhost forwarding can lag the Linux listen event. Retry only this
   // read-only probe, never registration/submission or an HTTP rejection.
   let response;const probeDeadline=Date.now()+5000;
   while(!response){try{response=await fetch(c.endpoint+'/health',{headers:{'X-API-Key':c.token,'X-SEP-Generation':c.generationId},redirect:'error',signal:AbortSignal.timeout(Math.max(1,Math.min(1000,probeDeadline-Date.now())))});}catch{if(Date.now()>=probeDeadline||this.state!=='starting')throw Error('HANDSHAKE_UNREACHABLE');await new Promise(r=>setTimeout(r,100));}}
   if(!response.ok)throw Error('HANDSHAKE_HEALTH');
   const chunks=[];let bytes=0;for await(const chunk of response.body){bytes+=chunk.length;if(bytes>65536)throw Error('HANDSHAKE_LIMIT');chunks.push(chunk);}const h=JSON.parse(Buffer.concat(chunks).toString());
   if(h.generationId!==c.generationId||h.stateIdentity!==b.stateIdentity||h.projectId!==p.projectId||h.catalogSha256!==p.catalogSha256||h.protocol!==c.protocol)throw Error('HANDSHAKE_HEALTH');
   if(this.runtime!==r||this.state!=='starting'||r.exitCode!==undefined)throw Error('START_CANCELLED');
   r.installPromise=this.ctx.plugin(evaluation,{enabled:true,projects:[{...p,endpoint:c.endpoint,token:c.token,generationId:c.generationId}]});r.plugin=await r.installPromise;
   if(r.exitCode!==undefined||this.state!=='starting'){await r.plugin.dispose();throw Error('BACKEND_EXIT');}
   this.state='ready';return {status:'pass',scope:'entry_ready_only',generationId:c.generationId,projectId:p.projectId};
  }catch(error){r.attachResolve();await this.stop();throw error;}
 }
 async stop(){
  const r=this.runtime;if(!r)return {status:'not_run',scope:'entry_not_started'};if(r.stopPromise)return r.stopPromise;
  this.state='stopping';const shutdownMs=this.config.shutdownMs??30000;if(!Number.isInteger(shutdownMs)||shutdownMs<100||shutdownMs>30000)throw Error('SHUTDOWN_LIMIT');
  r.stopPromise=(async()=>{
   const deadline=Date.now()+shutdownMs;
   try{
    await limit(r.attached,Math.max(1,deadline-Date.now()),'SHUTDOWN_DEADLINE');
    const disposed=r.installPromise?r.installPromise.then(plugin=>plugin.dispose()):Promise.resolve(r.plugin?.dispose());r.child?.stdin.end('\n');
    await limit(Promise.all([disposed,r.exited??Promise.resolve(-1)]),Math.max(1,deadline-Date.now()),'SHUTDOWN_DEADLINE');
    if(r.exitCode!==0||r.closed?.status!=='pass'||r.closed?.quiescent!==true||r.closed?.generationId!==r.connection?.generationId)throw Error('CLEANUP_UNCONFIRMED');
    this.state='stopped';return {status:'pass',scope:'entry_shutdown_only',generationId:r.connection.generationId,cleanup:r.closed};
   }catch(error){this.state='blocked';return {status:'blocked',scope:'entry_shutdown_only',reason:error.message,generationId:r.connection?.generationId??null};}
  })();return r.stopPromise;
 }
}
