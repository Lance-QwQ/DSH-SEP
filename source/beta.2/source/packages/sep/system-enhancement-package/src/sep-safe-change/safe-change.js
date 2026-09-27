import {lstat,realpath} from 'node:fs/promises';
import {resolve,relative,isAbsolute,sep} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';

const fail=code=>{throw Object.assign(new Error(code),{code});};
const digest=value=>createHash('sha256').update(value).digest('hex');
const key=p=>process.platform==='win32'?resolve(p).toLowerCase():resolve(p);
const abort=signal=>{if(signal?.aborted)fail('SC_ABORTED');};
const decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});
const maxBytes=1048576;
function text(value){if(typeof value!=='string')fail('SC_CONTENT');if(Buffer.byteLength(value)>maxBytes)fail('SC_TOO_LARGE');if(value.includes('\0')||decoder.decode(Buffer.from(value))!==value)fail('SC_UTF8_REQUIRED');return value;}
function pathName(value){
 if(typeof value!=='string'||!value||value.length>2048||isAbsolute(value)||/[\x00-\x1f:]/.test(value))fail('SC_PATH');
 const parts=value.replaceAll('\\','/').split('/');
 if(parts.some(p=>!p||p==='.'||p==='..'||/[. ]$/.test(p)||/^(?:\.git|\.dsh|\.codex|\.env(?:\..*)?|node_modules|credentials(?:\..*)?|id_rsa|id_ed25519|con|prn|aux|nul|com[1-9]|lpt[1-9])(?:$|\.)/i.test(p)))fail('SC_PATH');
 return parts.join('/');
}
function checksOf(checks){
 if(!Array.isArray(checks)||checks.length<1||checks.length>16)fail('SC_CHECKS');
 return checks.map(c=>{
  if(!c||!['contains','excludes','equals','jsonValue'].includes(c.kind))fail('SC_CHECKS');
  if(c.kind==='jsonValue'){
   if(typeof c.pointer!=='string'||c.pointer.length>1024||!c.pointer.startsWith('/')||!['string','number','boolean'].includes(typeof c.value)&&c.value!==null||typeof c.value==='string'&&c.value.length>4096||typeof c.value==='number'&&!Number.isFinite(c.value))fail('SC_CHECKS');
   return {kind:c.kind,pointer:c.pointer,value:c.value};
  }
  if(typeof c.value!=='string'||!c.value.length||c.value.length>4096)fail('SC_CHECKS');
  return {kind:c.kind,value:c.value};
 });
}
async function rootIdentity(root){
 const s=await lstat(root,{bigint:true});if(!s.isDirectory()||s.isSymbolicLink()||key(await realpath(root))!==key(root))fail('SC_ROOT_UNSAFE');return `${s.dev}:${s.ino}`;
}
async function syntax(content,format,signal){
 if(format==='json'){try{JSON.parse(content.replace(/^\uFEFF/,''));return true;}catch{return false;}}
 if(format==='text')return true;
 // Parse stdin in a bounded child. No target code, imports, package scripts,
 // loaders or user-supplied command line is ever executed.
 return new Promise((res,rej)=>{
  const child=spawn(process.execPath,['--check',`--input-type=${format==='javascript-module'?'module':'commonjs'}`],{windowsHide:true,env:{...process.env.SystemRoot?{SystemRoot:process.env.SystemRoot}:{}},stdio:['pipe','pipe','pipe']});
  let cancelled=false,timedOut=false,size=0;
  const stop=()=>{cancelled=true;child.kill();};const timer=setTimeout(()=>{timedOut=true;child.kill();},5000);
  signal?.addEventListener('abort',stop,{once:true});if(signal?.aborted)stop();
  child.stdout.on('data',b=>{size+=b.length;if(size>16384)child.kill();});child.stderr.on('data',b=>{size+=b.length;if(size>16384)child.kill();});
  child.stdin.on('error',()=>{});child.stdin.end(content);
  const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',stop);};
  child.once('error',e=>{cleanup();rej(e);});child.once('close',code=>{cleanup();if(cancelled)rej(Object.assign(new Error('SC_ABORTED'),{code:'SC_ABORTED'}));else res(!timedOut&&size<=16384&&code===0);});
 });
}

/** Candidate isolation is an in-memory copy, never an OS sandbox. All original
 * mutations go through the host's native recoverable version-guarded provider.
 * Pending bodies are ephemeral, bounded, non-refreshing, and never journaled.
 */
export function createSafeChanges({fs,clock=Date.now,ttlMs=30*60*1000,maxPlans=32,maxTotalBytes=16*1048576}={}){
 const plans=new Map(),busy=new Set();let tail=Promise.resolve(),closed=false,queued=0;
 function clear(p){p.before='';p.after='';plans.delete(p.id);}
 function sweep(){for(const p of plans.values())if(!busy.has(p.id)&&clock()>=p.expiresAt)clear(p);}
 function bytes(){return [...plans.values()].reduce((n,p)=>n+Buffer.byteLength(p.before)+Buffer.byteLength(p.after),0);}
 function publicPlan(p){return {id:p.id,path:p.path,status:p.status,revision:p.revision,format:p.format,checks:p.checks,expiresAt:p.expiresAt,baselineSha256:p.baselineSha256,candidateSha256:digest(p.after),planHash:p.planHash??null,validation:p.validation??null,scope:'single UTF-8 file; isolated memory candidate; content/syntax checks only; no runtime tests',...p.receipt?{receipt:p.receipt}:{}};}
 function own(id,exec){const p=plans.get(id);if(!p)fail('SC_PLAN_GONE');if(p.owner!==exec.key||p.sessionId!==exec.sessionId||key(p.root)!==key(exec.root))fail('SC_OWNER');return p;}
 async function snapshot(root,path,signal){
  const expected=resolve(root,path),rel=relative(root,expected);if(!rel||rel.startsWith('..'+sep)||isAbsolute(rel))fail('SC_PATH');
  const target=await fs.resolve(expected,{signal});if(key(fs.processPath(target))!==key(expected))fail('SC_SOURCE_UNSAFE');
  const actual=await lstat(expected,{bigint:true});if(!actual.isFile()||actual.isSymbolicLink()||actual.nlink!==1n||key(await realpath(expected))!==key(expected))fail('SC_SOURCE_UNSAFE');
  if(actual.size>BigInt(maxBytes))fail('SC_TOO_LARGE');
  const before=await fs.stat(target,signal);if(!before||before.type!=='file')fail('SC_SOURCE_UNSAFE');
  if(before.version!==`${actual.dev}:${actual.ino}:${actual.size}:${actual.mtimeNs}:${actual.ctimeNs}`)fail('SC_SOURCE_CHANGED');
  const content=text(decoder.decode(await fs.readBytes(target,signal,maxBytes)));
  const after=await fs.stat(target,signal);if(after?.version!==before.version)fail('SC_SOURCE_CHANGED');abort(signal);
  return {target,version:before.version,content,sha256:digest(content)};
 }
 async function execute(args,exec){
  if(closed)fail('SC_CLOSED');sweep();abort(exec.signal);
  if(!exec.root||!isAbsolute(exec.root)||!exec.key||!exec.sessionId)fail('SC_OWNER');
  if(args.action==='prepare'){
   if(args.runtimeTest)fail('SC_RUNTIME_NOT_CONFIGURED');
   const path=pathName(args.path),checks=checksOf(args.checks);if(!['text','json','javascript','javascript-module'].includes(args.format))fail('SC_FORMAT');
   if(plans.size>=maxPlans)fail('SC_CAPACITY');
   const identity=await rootIdentity(exec.root),s=await snapshot(exec.root,path,exec.signal);
   if(bytes()+2*Buffer.byteLength(s.content)>maxTotalBytes)fail('SC_CAPACITY');
   const p={id:randomUUID(),owner:exec.key,sessionId:exec.sessionId,root:exec.root,rootIdentity:identity,path,checks,format:args.format,before:s.content,after:s.content,version:s.version,baselineSha256:s.sha256,revision:0,status:'prepared',expiresAt:clock()+ttlMs};plans.set(p.id,p);return publicPlan(p);
  }
  if(args.action==='list')return {plans:[...plans.values()].filter(p=>p.owner===exec.key&&p.sessionId===exec.sessionId&&key(p.root)===key(exec.root)).map(publicPlan)};
  const p=own(args.id,exec);
  if(args.action==='cancel'){if(['publishing','uncertain'].includes(p.status))fail('SC_OUTCOME_UNCERTAIN');clear(p);return {status:'cancelled',id:args.id};}
  if(args.action==='status')return publicPlan(p);
  if(args.action==='review'){
   const offset=args.offset??0,length=args.length??8192;if(!Number.isInteger(offset)||offset<0||!Number.isInteger(length)||length<1||length>16384)fail('SC_REVIEW_RANGE');
   return {...publicPlan(p),before:p.before.slice(offset,offset+length),after:p.after.slice(offset,offset+length),offset,beforeCharacters:p.before.length,afterCharacters:p.after.length,truncated:Math.max(p.before.length,p.after.length)>offset+length};
  }
  if(args.action==='publish'&&p.status==='committed'){if(args.planHash!==p.planHash)fail('SC_PLAN_CHANGED');return p.receipt;}
  if(['committed','publishing','uncertain'].includes(p.status))fail('SC_OUTCOME_UNCERTAIN');
  if(args.action==='stage'){
   const content=text(args.content);if(bytes()-Buffer.byteLength(p.after)+Buffer.byteLength(content)>maxTotalBytes)fail('SC_CAPACITY');
   p.after=content;p.revision++;p.status='staged';delete p.planHash;delete p.validation;return publicPlan(p);
  }
  if(args.action==='verify'){
   delete p.planHash;const results=[{kind:'syntax',format:p.format,pass:await syntax(p.after,p.format,exec.signal)}];
   for(const c of p.checks){let pass=false;try{if(c.kind==='contains')pass=p.after.includes(c.value);else if(c.kind==='excludes')pass=!p.after.includes(c.value);else if(c.kind==='equals')pass=p.after===c.value;else {let v=JSON.parse(p.after.replace(/^\uFEFF/,''));for(const k of c.pointer.slice(1).split('/').map(x=>x.replaceAll('~1','/').replaceAll('~0','~'))){if(v===null||typeof v!=='object'||!Object.hasOwn(v,k))throw Error();v=v[k];}pass=v===c.value;}}catch{}results.push({kind:c.kind,pass});}
   abort(exec.signal);p.validation={status:results.every(r=>r.pass)?'pass':'fail',results,runtimeTests:'not_run',candidateSha256:digest(p.after)};p.status=p.validation.status==='pass'?'verified':'failed';
   if(p.status==='verified')p.planHash=digest(JSON.stringify({id:p.id,rootIdentity:p.rootIdentity,root:key(p.root),path:p.path,owner:p.owner,sessionId:p.sessionId,version:p.version,revision:p.revision,baseline:p.baselineSha256,candidate:digest(p.after),format:p.format,checks:p.checks}));
   return {...publicPlan(p),status:p.validation.status,confirmation:p.planHash?`确认发布文件修改 ${p.planHash}`:null};
  }
  if(args.action==='publish'){
   if(p.status!=='verified'||p.validation?.status!=='pass')fail('SC_NOT_VERIFIED');
   if(args.planHash!==p.planHash||p.validation.candidateSha256!==digest(p.after))fail('SC_PLAN_CHANGED');
   if(exec.confirmedHash!==p.planHash)fail('SC_CONFIRMATION_REQUIRED');
   if(!exec.policy||exec.policy.mode==='read-only')fail('SC_READ_ONLY');
   if(await rootIdentity(p.root)!==p.rootIdentity)fail('SC_ROOT_CHANGED');
   let s;try{s=await snapshot(p.root,p.path,exec.signal);}catch(e){if(e.code==='SC_ABORTED')throw e;fail('SC_SOURCE_CHANGED');}
   if(s.version!==p.version||s.sha256!==p.baselineSha256)fail('SC_SOURCE_CHANGED');
   abort(exec.signal);if(clock()>=p.expiresAt){clear(p);fail('SC_PLAN_GONE');}
   if(fs.recoveryStatus!=='ready')fail('SC_RECOVERY_REQUIRED');p.status='publishing';
   try{
    const outcome=await fs.writeText(s.target,p.after,{kind:'replaceIfVersion',version:p.version},exec.signal,exec.policy);
    p.receipt={status:'committed',id:p.id,planHash:p.planHash,path:p.path,candidateSha256:digest(p.after),mutationId:outcome.mutationId??null,version:outcome.version};p.status='committed';
    // No further fallible I/O after successful publication; cancellation after
    // the provider commit cannot turn a committed operation into a retry.
    return p.receipt;
   }catch(e){p.status='uncertain';p.validation={...p.validation,publicationError:e.code??'UNKNOWN'};throw e;}
  }
  fail('SC_ACTION');
 }
 return {execute(args,exec){
  if(queued>=4)return Promise.reject(Object.assign(new Error('SC_BUSY'),{code:'SC_BUSY'}));queued++;
  const work=tail.then(async()=>{sweep();if(args.id)busy.add(args.id);try{return await execute(args,exec);}finally{busy.delete(args.id);if(closed&&plans.has(args.id))clear(plans.get(args.id));}}).finally(()=>{queued--;});tail=work.catch(()=>{});return work;
 },sweep,close(){closed=true;for(const p of plans.values())if(!busy.has(p.id))clear(p);},idle(){return tail;}};
}
