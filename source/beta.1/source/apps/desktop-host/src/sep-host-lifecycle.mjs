/** Managed desktop lifetime. Deadlines bound termination, not data durability. */
export function createHostLifecycle({managed,owner=process,shutdownTimeoutMs=40000,report=code=>console.error(code),exit=code=>process.exit(code)}={}) {
 const fault=code=>Object.assign(new Error(code),{code});
 if(!Number.isSafeInteger(shutdownTimeoutMs)||shutdownTimeoutMs<10||shutdownTimeoutMs>45000)throw fault('SEP_HOST_LIFETIME_CONFIG');
 if(managed&&(!owner.connected||typeof owner.send!=='function'))throw fault('SEP_HOST_PARENT_UNAVAILABLE');
 let resolveApplication,started=false,stopping,terminal=false,forced=false,failure=null,phase='starting';
 const application=new Promise(resolve=>{resolveApplication=resolve;});
 const diagnostic=code=>{try{report(code);}catch{/* Diagnostics cannot prevent termination. */}};
 const send=message=>new Promise((resolve,reject)=>{
  if(!owner.connected||typeof owner.send!=='function'){resolve();return;}
  try{owner.send(message,error=>error?reject(error):resolve());}catch(error){reject(error);}
 });
 function detach(){owner.removeListener('disconnect',disconnected);owner.removeListener('message',message);owner.removeListener('SIGINT',signal);owner.removeListener('SIGTERM',signal);}
 function assertActive(){
  if(stopping||terminal)throw fault('SEP_HOST_STOPPING');
  if(managed&&!owner.connected){void stop('parent-disconnected');throw fault('SEP_HOST_PARENT_UNAVAILABLE');}
 }
 function stop(reason='requested') {
  if(stopping)return stopping;
  phase='stopping';
  if(reason==='parent-disconnected'){failure='SEP_HOST_PARENT_DISCONNECTED';diagnostic(failure);owner.exitCode=1;}
  let finish,timer;
  stopping=new Promise(resolve=>{finish=resolve;});
  const complete=value=>{if(terminal)return;terminal=true;phase='stopped';clearTimeout(timer);detach();finish(value);};
  timer=setTimeout(()=>{
   if(terminal)return;
   forced=true;const code='SEP_HOST_SHUTDOWN_TIMEOUT';diagnostic(code);owner.exitCode=1;
   complete({status:'blocked',code,drained:false,outcome:'unknown'});
   // No lock deletion or write replay: next boot must validate the persisted journals.
   exit(1);
  },shutdownTimeoutMs);
  void(async()=>{
   const result=await application;
   if(terminal)return;
   if(!result?.ok){
    failure??='SEP_HOST_STARTUP_FAILED';diagnostic(failure);owner.exitCode=1;
    complete({status:'blocked',code:failure,drained:false,outcome:'unknown'});exit(1);return;
   }
   if(result?.ok)await result.value?.shutdown.shutdown(failure?1:0);
   if(terminal)return;
   if(!failure&&reason==='requested'&&owner.connected)await send({type:'shutdown-complete'});
   if(terminal)return;
   if(owner.connected)owner.disconnect();
   complete({status:failure?'blocked':'pass',code:failure,drained:true,outcome:failure?'interrupted':'closed'});
  })().catch(error=>{
   if(terminal)return;
   failure=typeof error?.code==='string'&&/^[A-Z0-9_]{1,80}$/.test(error.code)?error.code:'SEP_HOST_SHUTDOWN_FAILED';
   diagnostic(failure);owner.exitCode=1;complete({status:'blocked',code:failure,drained:false,outcome:'unknown'});exit(1);
  });
  return stopping;
 }
 function disconnected(){if(!stopping&&!terminal)void stop('parent-disconnected');}
 function message(value){if(value?.type==='shutdown')void stop();}
 function signal(){void stop();}
 owner.once('disconnect',disconnected);owner.on('message',message);
 if(managed){owner.once('SIGINT',signal);owner.once('SIGTERM',signal);}
 return {
  assertActive,send,stop,
  get stopping(){return stopping!==undefined;},
  status:()=>({phase,forced,failure}),
  startApplication(factory){
   assertActive();if(started)throw fault('SEP_HOST_APPLICATION_ALREADY_STARTED');started=true;
   const pending=Promise.resolve().then(()=>{assertActive();return factory();});
   pending.then(value=>resolveApplication({ok:true,value}),error=>resolveApplication({ok:false,error}));
   return pending;
  },
  async publishReady(value){assertActive();await send(value);assertActive();phase='running';},
  async startupFailed(error){
   if(stopping){if(!started)resolveApplication({ok:true,value:null});return stopping;}
   failure=typeof error?.code==='string'&&/^[A-Z0-9_]{1,80}$/.test(error.code)?error.code:'SEP_HOST_STARTUP_FAILED';
   diagnostic(failure);owner.exitCode=1;if(!started)resolveApplication({ok:false,error});
   return stop('startup-failed');
  },
 };
}
