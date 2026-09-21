const $=id=>document.getElementById(id);let token=location.hash.slice(1),pending,confirming=false;
if(token){sessionStorage.setItem('dsh-recovery-capability',token);history.replaceState(null,'',location.pathname);}else token=sessionStorage.getItem('dsh-recovery-capability');
async function rpc(method,params={}){const r=await fetch('/rpc',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({method,params})});const v=await r.json();if(!v.ok)throw Error(v.error.code);return v.result;}
const output=v=>{$('result').textContent=JSON.stringify(v,null,2);};
function run(fn){return async()=>{try{$('error').textContent='';await fn();}catch(e){$('error').textContent=e.message;}};}
async function refresh(){const s=await rpc('status');$('status').textContent=JSON.stringify(s,null,2);const selected=$('project').value;$('project').replaceChildren(...s.projects.map(p=>{const o=document.createElement('option');o.value=p.id;o.textContent=`${p.root} · ${p.state}`;return o;}));if(s.projects.some(p=>p.id===selected))$('project').value=selected;}
function preview(method,plan,extra={}){if(confirming)return;pending={method,plan,params:{planId:plan.planId,confirmationHash:plan.confirmationHash,...extra}};$('details').textContent=JSON.stringify(plan,null,2);$('preview').hidden=false;$('preview').scrollIntoView({block:'center'});}
$('refresh').onclick=run(refresh);
$('start').onclick=run(async()=>{output(await rpc('startHost'));await refresh();});
$('stop').onclick=run(async()=>{output(await rpc('stopHost'));await refresh();});
$('add').onclick=run(async()=>{output(await rpc('addProject',{root:$('addRoot').value}));await refresh();});
$('rebind').onclick=run(async()=>preview('commitRebind',await rpc('planRebind',{projectId:$('project').value,newRoot:$('newRoot').value})));
$('backup').onclick=run(async()=>output(await rpc('createBackup',{projectId:$('project').value})));
$('listBackups').onclick=run(async()=>output(await rpc('listBackups')));
$('restore').onclick=run(async()=>preview('restoreBackup',await rpc('planRestore',{backupId:$('backupId').value,targetRoot:$('targetRoot').value})));
$('deleteBackup').onclick=run(async()=>preview('deleteBackup',await rpc('planDeleteBackup',{backupId:$('backupId').value})));
$('resume').onclick=run(async()=>output(await rpc('planResume',{taskId:$('taskId').value})));
$('continue').onclick=run(async()=>{
 if(confirming)return;
 if(pending?.method==='createContinuation'){$('preview').hidden=false;$('preview').scrollIntoView({block:'center'});return;}
 const taskId=$('taskId').value,plan=await rpc('planResume',{taskId});
 if(!plan.canResume){output(plan);throw Error('续接条件未满足，请先核对未知结果和工作区。');}
 const requestId=crypto.randomUUID();
 preview('createContinuation',{...plan,requestId,change:'创建新的原生会话，绑定原任务和当前批准目录；不复制历史正文，不调用模型或重放工具。'},{taskId,requestId});delete pending.params.planId;
});
$('reconcile').onclick=run(async()=>{const plan=await rpc('planResume',{taskId:$('taskId').value});preview('reconcileOperation',{...plan,reviewedOperation:$('operationId').value,reviewedOutcome:$('outcome').value},{operationId:$('operationId').value,outcome:$('outcome').value});delete pending.params.planId;});
$('confirm').onclick=run(async()=>{
 if(!pending||confirming)return;const action=pending;confirming=true;$('confirm').disabled=true;$('cancel').disabled=true;
 try{output(await rpc(action.method,action.params));pending=undefined;$('preview').hidden=true;await refresh();}
 catch(error){
  if(action.method==='createContinuation'){
   pending=action;$('preview').hidden=false;$('details').textContent=JSON.stringify({...action.plan,lastError:error.message,retry:'已保留本次 requestId。再次确认只核查或完成同一会话；先刷新状态可查看已保留的回执。'},null,2);
  }else{pending=undefined;$('preview').hidden=true;}
  throw error;
 }finally{confirming=false;$('confirm').disabled=false;$('cancel').disabled=false;}
});
$('cancel').onclick=()=>{if(confirming)return;pending=undefined;$('preview').hidden=true;};
$('artifacts').onclick=run(async()=>output(await rpc('listBackupArtifacts')));
$('deleteArtifact').onclick=run(async()=>preview('deleteBackupArtifact',await rpc('planDeleteBackupArtifact',{artifactId:$('artifactId').value})));
run(refresh)();
