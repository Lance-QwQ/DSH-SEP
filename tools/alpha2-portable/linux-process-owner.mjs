import {readFile,readlink} from 'node:fs/promises';
const uuid=/^[a-f0-9-]{36}$/;
const ns=/^pid:\[\d+\]$/;
const boot=async()=> (await readFile('/proc/sys/kernel/random/boot_id','utf8')).trim();
export async function inspectProcess(pid){
 if(!Number.isSafeInteger(pid)||pid<1)return {state:'unknown'};
 try{
  const stat=await readFile('/proc/'+pid+'/stat','utf8'),fields=stat.slice(stat.lastIndexOf(')')+2).split(' ');
  const namespace=await readlink('/proc/'+pid+'/ns/pid');
  const status=await readFile('/proc/'+pid+'/status','utf8');
  const again=await readFile('/proc/'+pid+'/stat','utf8'),other=again.slice(again.lastIndexOf(')')+2).split(' ');
  if(fields[19]!==other[19]||!/^\d+$/.test(fields[19])||!ns.test(namespace))return {state:'unknown'};
  const namespacePid=Number(status.match(/^NSpid:\s+([\d\t ]+)$/m)?.[1].trim().split(/\s+/).at(-1));
  return {state:fields[0]==='Z'?'zombie':'alive',pid,birth:fields[19],namespace,namespacePid,uid:Number(status.match(/^Uid:\s+(\d+)/m)?.[1]),group:Number(fields[2]),session:Number(fields[3])};
 }catch(e){return {state:e.code==='ENOENT'||e.code==='ESRCH'?'absent':'unknown'};}
}
export async function captureSandboxOwner(leaderPid,initPid){
 const leader=await inspectProcess(leaderPid),init=await inspectProcess(initPid),hostNamespace=await readlink('/proc/self/ns/pid'),bootId=await boot();
 if(leader.state!=='alive'||init.state!=='alive'||leader.uid!==process.getuid()||init.uid!==process.getuid()||leader.group!==leader.pid||leader.namespace!==hostNamespace||init.namespace===hostNamespace||init.namespacePid!==1||!uuid.test(bootId))throw Object.assign(Error('SEP_SANDBOX_OWNER_UNKNOWN'),{code:'SEP_SANDBOX_OWNER_UNKNOWN'});
 return {schema:2,bootId,hostNamespace,uid:process.getuid(),leader,init};
}
export async function inspectSandbox(owner){
 if(owner?.schema!==2||owner.init?.namespacePid!==1||!uuid.test(owner.bootId??'')||!ns.test(owner.hostNamespace??'')||!ns.test(owner.init?.namespace??'')||owner.init.namespace===owner.hostNamespace||owner.uid!==process.getuid()||![owner.leader,owner.init].every(p=>Number.isSafeInteger(p?.pid)&&p.pid>0&&/^\d+$/.test(p?.birth??'')))return {state:'unknown',reason:'ownership-invalid'};
 if(await boot()!==owner.bootId)return {state:'gone',reason:'kernel-rebooted'};
 if(await readlink('/proc/self/ns/pid')!==owner.hostNamespace)return {state:'unknown',reason:'observer-namespace-changed'};
 for(const expected of [owner.leader,owner.init]){
  const actual=await inspectProcess(expected.pid);
  if(actual.state==='unknown')return {state:'unknown',reason:'process-unreadable'};
  if(actual.state==='alive')return {state:'alive',reason:actual.birth===expected.birth?'owned-process-alive':'pid-reused'};
 }
 // PID 1 was observed before releasing the dispatch barrier. Linux disables
 // allocation and reaps namespace members before its init finishes exiting.
 // An unrelated undumpable host process is not evidence about this namespace.
 // https://man7.org/linux/man-pages/man7/pid_namespaces.7.html
 // https://github.com/torvalds/linux/blob/v6.18/kernel/pid_namespace.c
 return {state:'gone',reason:'namespace-init-exited'};
}
