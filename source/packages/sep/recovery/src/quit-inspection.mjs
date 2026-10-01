let sequence=0;
const unknown=()=>Object.assign(new Error('RECOVERY_QUIT_UNKNOWN'),{code:'RECOVERY_QUIT_UNKNOWN'});
/** Read-only rc.2 quit inspection bound to the captured owned child. */
export function inspectOwnedHostQuit(child,isCurrent){
 if(!child?.connected||child.exitCode!==null||!isCurrent())return Promise.reject(unknown());
 return new Promise((resolve,reject)=>{
  const requestId=++sequence;let settled=false;
  const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);child.off('message',message);child.off('close',closed);child.off('disconnect',closed);if(error)reject(error);else resolve(value);};
  const closed=()=>finish(unknown());
  const message=value=>{if(value?.type!=='quit-inspection'||value.requestId!==requestId)return;if(!isCurrent()||!child.connected||child.exitCode!==null||value.error!==undefined||typeof value.activeTasks!=='boolean'||typeof value.scheduledTasks!=='boolean'){finish(unknown());return;}finish(null,{activeTasks:value.activeTasks,scheduledTasks:value.scheduledTasks});};
  const timer=setTimeout(closed,3000);
  child.on('message',message);child.once('close',closed);child.once('disconnect',closed);
  try{child.send({type:'quit-inspection',requestId},error=>{if(error)closed();});}catch{closed();}
 });
}
