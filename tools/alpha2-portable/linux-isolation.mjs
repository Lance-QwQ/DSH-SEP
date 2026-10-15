// Experimental Linux-only execution carrier. Only the trusted controller may
// publish a validated working copy. No direct writeback or unsafe fallback.
import {constants} from 'node:fs';
import {open,realpath,statfs,readdir,readFile} from 'node:fs/promises';
import {isAbsolute,relative,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {StringDecoder} from 'node:string_decoder';
import {captureSandboxOwner} from './linux-process-owner.mjs';
const fail=code=>{throw Object.assign(Error(code),{code});};
const inside=(a,b)=>{const p=relative(a,b);return p===''||p!=='..'&&!p.startsWith('../')&&!isAbsolute(p);};
async function directory(path,privateRoot){
 if(!isAbsolute(path)||resolve(path)!==path||await realpath(path)!==path)fail('SEP_LINUX_SANDBOX_PATH');
 const handle=await open(path,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
 try{const s=await handle.stat({bigint:true});
  if(!s.isDirectory()||s.ino===0n||(await statfs('/proc/self/fd/'+handle.fd,{bigint:true})).type!==0xef53n||s.uid!==BigInt(process.getuid())||privateRoot&&(s.mode&0o077n)!==0n)fail('SEP_LINUX_SANDBOX_PATH');
  return handle;
 }catch(error){await handle.close();throw error;}
}

/** Pin source/work directories by inherited descriptors, expose only read-only
 * system files and source, and run a bounded command in isolated namespaces.
 * The trusted caller owns a fresh empty private scratch root. Same-user arbitrary host
 * code, kernel exploits and resource quotas are out of scope. */
export async function runIsolated({bwrap,binarySha256,source,scratch,command,timeoutMs=3000,signal,copySourceHash,onSpawn=()=>{},readOnly=false,input='',maxInputBytes=16384,maxOutputBytes=65536}){
 if(process.platform!=='linux'||process.arch!=='x64')fail('SEP_LINUX_SANDBOX_UNAVAILABLE');
 if(!/^[a-f0-9]{64}$/.test(binarySha256??'')||!Array.isArray(command)||command.length<1||command.length>32||!command.every(x=>typeof x==='string'&&x.length<16384&&!x.includes('\0'))||!command[0].startsWith('/usr/bin/')||!Number.isSafeInteger(timeoutMs)||timeoutMs<50||timeoutMs>10000)fail('SEP_LINUX_SANDBOX_CONFIG');
 if(copySourceHash!==undefined&&!/^[a-f0-9]{64}$/.test(copySourceHash)||signal!==undefined&&!(signal instanceof AbortSignal))fail('SEP_LINUX_SANDBOX_CONFIG');
 if(!Number.isSafeInteger(maxInputBytes)||maxInputBytes<1||maxInputBytes>10*1024*1024||!Number.isSafeInteger(maxOutputBytes)||maxOutputBytes<1||maxOutputBytes>12*1024*1024)fail('SEP_LINUX_SANDBOX_CONFIG');
 if(typeof onSpawn!=='function'||typeof readOnly!=='boolean'||typeof input!=='string'||Buffer.byteLength(input)>maxInputBytes||readOnly&&copySourceHash!==undefined)fail('SEP_LINUX_SANDBOX_CONFIG');
 if(signal?.aborted)return {code:null,signal:null,reason:'cancelled',stdout:'',stderr:'',exited:true,dispatched:false};
 if(inside(source,scratch)||inside(scratch,source))fail('SEP_LINUX_SANDBOX_PATH');
 const held=[];let timer,killTimer,abort;
 try{
  const sourceFd=await directory(source,false);held.push(sourceFd);
  const scratchFd=await directory(scratch,true);held.push(scratchFd);
  // This proof carrier accepts no inherited workspace entries. A preexisting
  // hard link could otherwise write the source through a writable mount. A
  // future snapshot importer must validate and copy all entries independently.
  if((await readdir('/proc/self/fd/'+scratchFd.fd)).length)fail('SEP_LINUX_SANDBOX_WORKSPACE_NOT_EMPTY');
  if(await realpath(bwrap)!==resolve(bwrap))fail('SEP_LINUX_SANDBOX_IDENTITY');
  const binary=await open(bwrap,constants.O_RDONLY|constants.O_NOFOLLOW);held.push(binary);
  const binaryInfo=await binary.stat({bigint:true});
  if(!binaryInfo.isFile()||binaryInfo.nlink!==1n||(binaryInfo.mode&0o6022n)!==0n||createHash('sha256').update(await binary.readFile()).digest('hex')!==binarySha256)fail('SEP_LINUX_SANDBOX_IDENTITY');
  const task=copySourceHash?['/usr/bin/python3','-c',await readFile(new URL('./snapshot-bootstrap.py',import.meta.url),'utf8'),copySourceHash,...command]:command;
  const args=['--info-fd','6','--block-fd','7','--unshare-user','--unshare-pid','--unshare-net','--unshare-ipc','--unshare-uts','--disable-userns','--assert-userns-disabled','--cap-drop','ALL','--die-with-parent','--new-session','--clearenv','--setenv','PATH','/usr/bin:/bin','--setenv','HOME','/tmp','--setenv','LANG','C.UTF-8','--ro-bind','/usr','/usr','--symlink','usr/bin','/bin','--symlink','usr/lib','/lib','--symlink','usr/lib64','/lib64','--proc','/proc','--dev','/dev','--tmpfs','/tmp','--dir','/run','--ro-bind-fd','3','/source','--bind-fd','4','/work','--chdir','/work','--remount-ro','/','--',...task];
  if(signal?.aborted)return {code:null,signal:null,reason:'cancelled',stdout:'',stderr:'',exited:true,dispatched:false};
  if(readOnly){const index=args.indexOf('--bind-fd');args.splice(index,3,'--ro-bind-fd','3','/work');}
  const child=spawn('/proc/self/fd/5',args,{detached:true,env:{LANG:'C.UTF-8'},stdio:['pipe','pipe','pipe',sourceFd.fd,scratchFd.fd,binary.fd,'pipe','pipe']});
  let reason='exit',stdout='',stderr='',output=0,exited=false,finish,owner,info='';const outDecoder=new StringDecoder('utf8'),errDecoder=new StringDecoder('utf8');
  const stop=why=>{if(exited||reason!=='exit')return;reason=why;if(child.pid)try{process.kill(-child.pid,'SIGKILL');}catch(error){if(error.code!=='ESRCH')reason='cleanup-blocked';}killTimer=setTimeout(()=>finish({code:null,signal:null,reason:'cleanup-blocked',stdout,stderr,exited:false,owner}),2000);};
  const collect=which=>chunk=>{output+=chunk.length;if(output>maxOutputBytes){stop('output-limit');return;}if(which==='stdout')stdout+=outDecoder.write(chunk);else stderr+=errDecoder.write(chunk);};
  child.stdout.on('data',collect('stdout'));child.stderr.on('data',collect('stderr'));
  child.stdin.on('error',error=>{if(error.code!=='EPIPE')stop('input-failed');});child.stdin.end(input);
  const closed=new Promise((resolve,reject)=>{finish=resolve;child.once('error',reject);child.once('close',(code,signal)=>{exited=true;stdout+=outDecoder.end();stderr+=errDecoder.end();resolve({code,signal,reason,stdout,stderr,exited:true,owner});});});
  child.stdio[7].on('error',()=>stop('handshake-failed'));
  child.stdio[6].on('data',chunk=>{info+=chunk;if(info.length>8192)stop('handshake-failed');});
  child.stdio[6].once('end',()=>{void (async()=>{
   if(reason!=='exit'||exited)return;
   try{const value=JSON.parse(info);owner=await captureSandboxOwner(child.pid,value['child-pid']);if(reason!=='exit'||exited)return;await onSpawn(owner);if(reason==='exit'&&!exited)child.stdio[7].end('1');}
   catch{stop('handshake-failed');}
  })();});
  abort=()=>stop('cancelled');signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  timer=setTimeout(()=>stop('timeout'),timeoutMs);
  return await closed;
 }finally{clearTimeout(timer);clearTimeout(killTimer);if(abort)signal?.removeEventListener('abort',abort);for(const handle of held.reverse())await handle.close();}
}
