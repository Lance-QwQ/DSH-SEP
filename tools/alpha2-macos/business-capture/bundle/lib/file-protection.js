import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {isAbsolute,resolve} from 'node:path';
import z from '@deepseek-ai/schemastery';
import {FsError} from '@deepseek-ai/dsh-fs';
import ProtectedLocalFileSystem,{readHeldContent,readProtectedObservation} from '../host/protected-files/index.js';
import {createHash} from 'node:crypto';

// Cordis exposes services through context proxies. Unexported Symbols retain
// private owned state without JavaScript private-field receiver branding.
const observationState=Symbol('sep.observationState');
const observationKey=Symbol('sep.observationKey');
const rememberObservation=Symbol('sep.rememberObservation');
const trackedRead=Symbol('sep.trackedRead');
const decodeObservedText=Symbol('sep.decodeObservedText');
const protectedSnapshot=Symbol('sep.protectedSnapshot');
const require=createRequire(import.meta.url);
const fail=code=>{throw new FsError(code,code);};
const same=(a,b)=>resolve(a).toLowerCase()===resolve(b).toLowerCase();

/** Explicit Windows x64 protected provider. The native provider and root bundle
 * are unchanged; configuration must select one registered project.
 * @param ctx - actual official Cordis context with owned recovery authority.
 * @param config - explicit workspace, project ID, and bounded backup policy. */
export default class SepProtectedFileSystem extends ProtectedLocalFileSystem{
 static inject=['recoveryHost'];
 static Config=z.object({
  cwd:z.string().required(),projectId:z.string().required(),
  diffBasisMaxBytes:z.number().default(10*1024*1024),
  observationMaxEntries:z.number().default(1024),
  recovery:z.object({root:z.string().required(),maxFileBytes:z.number().required(),maxTotalBytes:z.number().required(),maxEntries:z.number().required(),retentionMs:z.number().required(),recordPublishMaxRetries:z.number().default(3),recordPublishRetryDelayMs:z.number().default(25)}).required(),
 });
 constructor(ctx,config){
  if(process.platform!=='win32'||process.arch!=='x64')fail('FS_PROTECTION_UNAVAILABLE');
  if(!isAbsolute(config.cwd)||typeof config.projectId!=='string'||!config.projectId)fail('RECOVERY_PROJECT_REQUIRED');
  if(typeof ctx.recoveryHost?.withProject!=='function')fail('RECOVERY_UNAVAILABLE');
  for(const name of ['@deepseek-ai/dsh-fs','@deepseek-ai/dsh-fs-local']){
   let version;try{version=JSON.parse(readFileSync(require.resolve(name+'/package.json'),'utf8')).version;}catch{fail('SEP_FS_HOST_UNSUPPORTED');}
   if(version!=='0.2.1-alpha.1')fail('SEP_FS_HOST_UNSUPPORTED');
  }
  if(!Number.isSafeInteger(config.observationMaxEntries)||config.observationMaxEntries<1)fail('FS_OBSERVATION_CONFIG');
  super(ctx,{...config,requireRecovery:true});
  this.closed=false;this.pending=new Set();
  ctx.effect(()=>async()=>{this.closed=true;await Promise.allSettled([...this.pending]);this[observationState].clear();});
 }
 // Receipts retain only a native version and digest, never the observed body.
 // Retaining ambiguous entries prevents a newer reader from authorizing an
 // older caller that happens to carry the same five-field version.
 [observationState]=new Map();
 [observationKey](target,version){return `${resolve(String(target.targetKey)).toLowerCase()}\0${version}`;}
 [rememberObservation](target,snapshot){
  const key=this[observationKey](target,snapshot.version),hash=createHash('sha256').update(snapshot.bytes).digest('hex');
  const prior=this[observationState].get(key);
  if(prior){if(prior.hash!==hash)prior.ambiguous=true;return;}
  if(this[observationState].size>=this.config.observationMaxEntries)fail('FS_OBSERVATION_LIMIT');
  this[observationState].set(key,{hash,ambiguous:false});
 }
 async [trackedRead](work){
  if(this.closed)fail('RECOVERY_UNAVAILABLE');
  const pending=Promise.resolve().then(work);this.pending.add(pending);
  try{return await pending;}finally{this.pending.delete(pending);}
 }
 [decodeObservedText](bytes){
  if(bytes.subarray(0,8192).includes(0))fail('FS_NOT_TEXT');
  try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{fail('FS_NOT_TEXT');}
 }
 async [protectedSnapshot](target,signal,maxBytes){
  return this.withLock(target.targetKey,()=>readProtectedObservation(target,maxBytes,signal,this.internals));
 }
 async readText(target,signal){
  return this[trackedRead](async()=>{
   const snapshot=await this[protectedSnapshot](target,signal,this.config.recovery.maxFileBytes);
   const text=this[decodeObservedText](snapshot.bytes);this[rememberObservation](target,snapshot);return text;
  });
 }
 async readBytes(target,signal,maxBytes){
  return this[trackedRead](async()=>{
   if(!Number.isSafeInteger(maxBytes)||maxBytes<0)fail('FS_TOO_LARGE');
   const snapshot=await this[protectedSnapshot](target,signal,Math.min(maxBytes,this.config.recovery.maxFileBytes));
   this[rememberObservation](target,snapshot);return snapshot.bytes;
  });
 }
 async streamText(target,signal){
  if(this.closed)fail('RECOVERY_UNAVAILABLE');
  const provider=this;
  return (async function*(){
   const snapshot=await provider[trackedRead](()=>provider[protectedSnapshot](target,signal,provider.config.recovery.maxFileBytes));
   const text=provider[decodeObservedText](snapshot.bytes);
   yield text;
   // A consumer that stops early has no successful complete observation.
   if(signal?.aborted)fail('FS_ABORTED');
   if(provider.closed)fail('RECOVERY_UNAVAILABLE');
   provider[rememberObservation](target,snapshot);
  })();
 }
 /** Trusted subclass hook, called by the private engine inside native file and
  * ancestor ownership, before durable records or preimages are created. */
 async assertObservedContent(target,expected,signal){
  if(expected?.version===undefined)return;
  const receipt=this[observationState].get(this[observationKey](target,expected.version));
  if(!receipt)fail('FS_NOT_OBSERVED');
  if(receipt.ambiguous)fail('FS_OBSERVATION_AMBIGUOUS');
  const current=await readHeldContent(target,this.config.recovery.maxFileBytes,signal,this.internals);
  const hash=createHash('sha256').update(current.bytes).digest('hex');
  if(receipt.hash!==hash)fail('FS_STALE_CONTENT');
 }

 // A committed body is known under the engine's held handles, after journal
 // durability. Capacity exhaustion must never reclassify that commit as a
 // failed operation: skip the new receipt, so subsequent guarded calls refuse.
 observeCommittedContent(target,version,content){
  if(version===undefined)return;
  const key=this[observationKey](target,version);
  if(!this[observationState].has(key)&&this[observationState].size>=this.config.observationMaxEntries)return;
  this[rememberObservation](target,{version,bytes:content});
 }
 get sandboxMode(){return this.ctx.get('sandboxPolicy')?.defaultMode;}

 async governed(policy,work){
  if(this.closed)fail('RECOVERY_UNAVAILABLE');
  policy??=this.ctx.get('sandboxPolicy')?.resolve();
  if(policy?.mode==='read-only')fail('FS_SANDBOX_DENIED');
  const pending=this.ctx.recoveryHost.withProject(this.config.projectId,project=>{
   if(!same(project.root,this.config.cwd)||policy?.workspaceRoot&&!same(policy.workspaceRoot,project.root))fail('RECOVERY_STALE_CONTEXT');
   // Protected operations remain in the selected project, including callers
   // whose native policy permits writes elsewhere. Ordinary Shell is unchanged.
   return work({...policy,workspaceRoot:project.root,mode:'workspace-write'});
  });
  this.pending.add(pending);
  try{return await pending;}finally{this.pending.delete(pending);}
 }
 writeText(target,content,expected,signal,policy){return this.governed(policy,p=>super.writeText(target,content,expected,signal,p));}
 editText(target,edit,expected,signal,policy){return this.governed(policy,p=>super.editText(target,edit,expected,signal,p));}
 moveFile(source,destination,expected,signal,policy){return this.governed(policy,p=>super.moveFile(source,destination,expected,signal,p));}
 removeFile(target,expected,signal,policy){return this.governed(policy,p=>super.removeFile(target,expected,signal,p));}
 restoreMutation(id,signal,policy){return this.governed(policy,p=>super.restoreMutation(id,signal,p));}
}
