import {constants} from 'node:fs';
import {open,realpath} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {isAbsolute,resolve} from 'node:path';
export const fail=code=>{throw Object.assign(Error(code),{code});};
const error=code=>Object.assign(Error(code),{code});
export const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export const LIMITS=Object.freeze({entries:2000,bytes:268435456,file:20971520,depth:16});
const validPath=path=>typeof path==='string'&&isAbsolute(path)&&resolve(path)===path&&!/[\u0000-\u001f\u007f]/u.test(path);
const identity=s=>[s.dev,s.ino,s.size,s.mtimeNs,s.ctimeNs,s.mode,s.nlink].join(':');
const codeFrom=text=>/^SEP_ATTACHMENT_[A-Z0-9_]+$/u.test(text.trim())?text.trim():'SEP_ATTACHMENT_NATIVE_FAILED';
/** The wire adapter is POSIX portable; production binaries are Darwin/APFS
 * only. Linux tests use a separately built, explicitly hashed test binary. */
export function createAttachmentTree({helperPath,helperSha256,lockPath,timeoutMs=30000}) {
 if(process.platform==='win32'||!validPath(helperPath)||!validPath(lockPath)||!/^[a-f0-9]{64}$/u.test(helperSha256)||!Number.isSafeInteger(timeoutMs)||timeoutMs<100||timeoutMs>30000)fail('SEP_ATTACHMENT_CONFIG');
 async function verifyHelper(){
  if(await realpath(helperPath)!==helperPath)fail('SEP_ATTACHMENT_HELPER_CHANGED');
  const file=await open(helperPath,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{const before=await file.stat({bigint:true});if(!before.isFile()||before.nlink!==1n||before.uid!==BigInt(process.getuid())||before.size>16777216n||(before.mode&0o022n)!==0n)fail('SEP_ATTACHMENT_HELPER_CHANGED');
   const body=await file.readFile();if(identity(before)!==identity(await file.stat({bigint:true}))||hash(body)!==helperSha256)fail('SEP_ATTACHMENT_HELPER_CHANGED');
  }finally{await file.close();}
 }
 async function session(args,maxBytes=LIMITS.bytes*2+1048576){
  await verifyHelper();const child=spawn(helperPath,args,{stdio:['pipe','pipe','pipe'],env:{PATH:'/usr/bin:/bin',LC_ALL:'C',SEP_ATTACHMENT_NATIVE_LOCK:lockPath}});
  let pending='',stderr='',seen=0,failed,ended=false,waiter,timer,closedResolve;
  const rows=[],closed=new Promise(resolve=>{closedResolve=resolve;});
  const reject=reason=>{if(!failed)failed=reason;if(waiter){waiter.reject(failed);waiter=undefined;}if(!ended)child.kill('SIGKILL');};
  const arm=()=>{clearTimeout(timer);timer=setTimeout(()=>reject(error('SEP_ATTACHMENT_DEADLINE')),timeoutMs);};arm();
  child.on('error',()=>reject(error('SEP_ATTACHMENT_NATIVE_START')));child.stdin.on('error',()=>{if(!ended)reject(error('SEP_ATTACHMENT_NATIVE_PIPE'));});
  child.stderr.on('data',chunk=>{stderr+=chunk.toString('utf8');if(stderr.length>4096)reject(error('SEP_ATTACHMENT_NATIVE_PROTOCOL'));});
  child.stdout.on('data',chunk=>{
   if(failed)return;seen+=chunk.length;if(seen>maxBytes)return reject(error('SEP_ATTACHMENT_NATIVE_PROTOCOL'));pending+=chunk.toString('utf8');
   let end;while((end=pending.indexOf('\n'))>=0){const line=pending.slice(0,end);pending=pending.slice(end+1);let row;
    try{row=JSON.parse(line);}catch{return reject(error('SEP_ATTACHMENT_NATIVE_PROTOCOL'));}
    if(waiter){waiter.resolve(row);waiter=undefined;}else rows.push(row);
    if(rows.length>LIMITS.entries+3)return reject(error('SEP_ATTACHMENT_NATIVE_PROTOCOL'));
   }
   if(pending.length>LIMITS.file*2+16384)reject(error('SEP_ATTACHMENT_NATIVE_PROTOCOL'));
  });
  child.on('close',(status,signal)=>{ended=true;clearTimeout(timer);if(status!==0&&!failed)failed=error(codeFrom(stderr));if(pending&&!failed)failed=error('SEP_ATTACHMENT_NATIVE_PROTOCOL');if(waiter){waiter.reject(failed??error('SEP_ATTACHMENT_NATIVE_EOF'));waiter=undefined;}closedResolve({status,signal});});
  async function finish(){child.stdin.end();const receipt=await Promise.race([closed,new Promise(resolve=>{const t=setTimeout(()=>resolve(undefined),2000);t.unref();})]);if(!receipt){reject(error('SEP_ATTACHMENT_CLEANUP_UNCONFIRMED'));throw failed;}if(failed)throw failed;}
  return {
   next(){if(failed)return Promise.reject(failed);if(waiter)return Promise.reject(error('SEP_ATTACHMENT_BUSY'));if(rows.length)return Promise.resolve(rows.shift());if(ended)return Promise.reject(error('SEP_ATTACHMENT_NATIVE_EOF'));return new Promise((resolve,reject)=>{waiter={resolve,reject};});},
   send(text,end=false){if(failed)throw failed;arm();if(end)child.stdin.end(text);else child.stdin.write(text);},
   idle(){clearTimeout(timer);seen=0;},finish,
   async abort(){reject(error('SEP_ATTACHMENT_ABORTED'));await Promise.race([closed,new Promise(resolve=>{const t=setTimeout(resolve,2000);t.unref();})]);if(!ended)throw error('SEP_ATTACHMENT_CLEANUP_UNCONFIRMED');},
   get failed(){return failed;},get ended(){return ended;}
  };
 }
 async function capture(root,{copyTo}={}){
  if(!validPath(root)||copyTo!==undefined&&!validPath(copyTo))fail('SEP_ATTACHMENT_PATH');
  const child=await session(['tree',root,...copyTo===undefined?[]:[copyTo]]),entries=[],versions=[],observed=new Map();let bytes=0,prepared=false,rootIdentity;
  try{while(true){const row=await child.next();
   if(row.phase==='committed'){if(!prepared)fail('SEP_ATTACHMENT_NATIVE_PROTOCOL');await child.finish();break;}
   if(row.phase==='prepared'){if(prepared||row.bytes!==bytes||typeof row.rootVersion!=='string')fail('SEP_ATTACHMENT_NATIVE_PROTOCOL');prepared=true;rootIdentity=row.rootVersion.split(':').slice(0,2).join(':');versions.push(['',row.rootVersion]);child.send('verify\n');continue;}
   if(prepared||!['file','directory'].includes(row.kind)||typeof row.pathHex!=='string'||!/^(?:[a-f0-9]{2})+$/u.test(row.pathHex)||typeof row.version!=='string')fail('SEP_ATTACHMENT_NATIVE_PROTOCOL');
   const path=Buffer.from(row.pathHex,'hex').toString('utf8');if(Buffer.from(path).toString('hex')!==row.pathHex||path.startsWith('/')||path.split('/').some(x=>!x||x==='.'||x==='..')||observed.has(path)||entries.length>=LIMITS.entries)fail('SEP_ATTACHMENT_NATIVE_PROTOCOL');
   versions.push([path,row.version]);observed.set(path,row.version);
   if(row.kind==='directory'){entries.push({path,kind:'directory',version:row.version});continue;}
   if(!Number.isSafeInteger(row.size)||row.size<0||row.size>LIMITS.file||typeof row.executable!=='boolean'||typeof row.dataHex!=='string'||row.dataHex.length!==row.size*2||!/^[a-f0-9]*$/u.test(row.dataHex))fail('SEP_ATTACHMENT_NATIVE_PROTOCOL');
   bytes+=row.size;if(bytes>LIMITS.bytes)fail('SEP_ATTACHMENT_LIMIT');entries.push({path,kind:'file',version:row.version,size:row.size,sha256:hash(Buffer.from(row.dataHex,'hex')),executable:row.executable});
  }
  entries.sort((a,b)=>Buffer.compare(Buffer.from(a.path),Buffer.from(b.path)));versions.sort((a,b)=>Buffer.compare(Buffer.from(a[0]),Buffer.from(b[0])));
  return {public:{rootIdentity,sha256:hash(JSON.stringify(entries)),version:hash(JSON.stringify(versions)),entries,bytes},observed};
  }catch(e){await child.abort();throw e;}
 }
 async function directory(path,privateRoot=false){
  if(!validPath(path))fail('SEP_ATTACHMENT_PATH');const child=await session(['hold',path,...privateRoot?['private']:[]],65536);let active=false,closed=false,activeFlow,closing,finished=false;
  const decode=row=>{if(row.kind!=='directory'||!['dev','ino','mode','uid'].every(k=>typeof row[k]==='string'&&/^\d+$/u.test(row[k])))fail('SEP_ATTACHMENT_NATIVE_PROTOCOL');return Object.fromEntries(['dev','ino','mode','uid'].map(k=>[k,BigInt(row[k])]));};
  try{decode(await child.next());child.idle();}catch(e){await child.abort();throw e;}
  async function command(text){if(closed)fail('SEP_ATTACHMENT_CLOSED');if(active)fail('SEP_ATTACHMENT_BUSY');active=true;activeFlow=(async()=>{try{child.send(text+'\n');const value=decode(await child.next());child.idle();return value;}catch(e){await child.abort();throw e;}finally{active=false;}})();return activeFlow;}
  return {async stat(options){const value=await command('stat');return options?.bigint?value:Object.fromEntries(Object.entries(value).map(([k,v])=>[k,Number(v)]));},async sync(){await command('sync');},
   close(){
    if(finished)return Promise.resolve();if(closing)return closing;closed=true;
    // Do not let close replace an accepted stat/sync response waiter. The
    // existing command deadline and abort cleanup remain in force while draining.
    closing=(async()=>{if(activeFlow)await activeFlow.catch(()=>{});
     if(child.failed||child.ended){await child.abort();finished=true;return;}
     try{child.send('close\n');const row=await child.next();if(row.phase!=='closed')fail('SEP_ATTACHMENT_NATIVE_PROTOCOL');await child.finish();finished=true;}catch(e){await child.abort();throw e;}
    })().finally(()=>{closing=undefined;});return closing;
   }
  };
 }
 async function syncDirectory(path){if(!validPath(path))fail('SEP_ATTACHMENT_PATH');const child=await session(['sync',path],4096);try{const row=await child.next();if(row.phase!=='committed')fail('SEP_ATTACHMENT_NATIVE_PROTOCOL');await child.finish();}catch(e){await child.abort();throw e;}}
 async function applyFile(root,options){
  if(!options||typeof options!=='object'||Object.keys(options).some(k=>!['path','expectedSha256','expectedVersion','expectedRootIdentity','text','delete'].includes(k)))fail('SEP_ATTACHMENT_CONFIG');
  const {path,expectedSha256,expectedVersion,expectedRootIdentity,text}=options,remove=options.delete===true;
  if(typeof path!=='string'||!path||path.startsWith('/')||path.split('/').some(x=>!x||x==='.'||x==='..')||/[\u0000-\u001f\u007f]/u.test(path)||!(expectedSha256==='absent'||/^[a-f0-9]{64}$/u.test(expectedSha256))||remove&&text!==undefined||!remove&&typeof text!=='string'||options.delete!==undefined&&options.delete!==true)fail('SEP_ATTACHMENT_CONFIG');
  const body=remove?Buffer.alloc(0):Buffer.from(text);if(body.length>LIMITS.file)fail('SEP_ATTACHMENT_LIMIT');
  const before=await capture(root),entry=before.public.entries.find(x=>x.path===path);
  if(expectedSha256==='absent'?entry||remove:!entry||entry.kind!=='file'||entry.sha256!==expectedSha256)fail('SEP_ATTACHMENT_STALE_FILE');
  if(!remove&&(before.public.bytes-(entry?.size??0)+body.length>LIMITS.bytes||before.public.entries.length+(entry?0:1)>LIMITS.entries))fail('SEP_ATTACHMENT_LIMIT');
  if(before.public.rootIdentity!==expectedRootIdentity||(entry?.version??'absent')!==expectedVersion)fail('SEP_ATTACHMENT_STALE_FILE');
  const version=entry?before.observed.get(path):'absent',child=await session(['apply',root,path,version,remove?'delete':'write'],4096);
  try{child.send(remove?'':body.toString('hex')+'\n',true);const row=await child.next();if(row.phase!=='committed')fail('SEP_ATTACHMENT_NATIVE_PROTOCOL');await child.finish();return {status:'committed'};}catch(e){await child.abort();throw e;}
 }
 return Object.freeze({lockPath,tree:async(root,options)=>(await capture(root,options)).public,directory,syncDirectory,applyFile});
}
