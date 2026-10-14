// macOS composition derived from fixed Linux orchestration. File transactions
// use the native trusted carrier. Shell/MCP/visual/eval/AX remain unavailable.
import {AsyncLocalStorage} from 'node:async_hooks';
import {lstat,realpath,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {owned} from './bundle-modules.mjs';
import {load} from './host-modules.mjs';
import {createSnapshotScope} from './snapshot-scope.mjs';
import {macDocumentFactory,macDocumentAuthority,documentDescription} from './documents.mjs';
import {createSettingsConsumers,businessConfig} from './consumers.mjs';
import {createProjectTree} from '../apfs-tree/project-tree.mjs';
const {z}=await load('zod');
const {openControl}=await owned('modules/system-enhancement-package/src/p2/control.js'),{bindStorage}=await owned('modules/system-enhancement-package/src/p2/storage.js'),{openStore}=await owned('modules/system-enhancement-package/src/store.js'),{Budget}=await owned('modules/system-enhancement-package/src/deepseek.js');
const {installP1,p1Config,p1Schemas}=await owned('host/p1-policy/index.js');
const {delegationDepthOf}=await load('@deepseek-ai/dsh-subagent');
const fail=code=>{throw Object.assign(Error(code),{code});};
const schema=z.object({source:z.string(),memory:z.string(),locks:z.string(),budgetPath:z.string(),helperPath:z.string(),helperSha256:z.string().regex(/^[a-f0-9]{64}$/),nativeLockPath:z.string(),initialize:z.boolean().default(false),business:businessConfig,p1:p1Config,compaction:z.object({nativeEntryId:z.string().min(1)}).strict().optional(),shutdownMs:z.number().int().min(100).max(30000).default(5000)}).strict();
export const name='sep-mac-business-runtime';
export const inject=['sepMacProfile','storageDomain','llm','agents','sessions','tools','subagents','approval','workingDirectory','fs'];
export async function apply(ctx,input){
 const config=schema.parse(input);if(!config.p1.enabled||resolve(config.p1.budgetPath)!==resolve(config.budgetPath)||config.p1.initialSpentCny!==0)fail('SEP_MAC_CONFIG');
 if(ctx.get('sepMacRuntime')||ctx.get('suiteEnhancements'))fail('SEP_MAC_PROVIDER_CONFLICT');
 if(config.business.context||config.business.vision||config.business.click||config.business.evaluation||config.business.media)fail('SEP_MAC_CAPABILITY_UNAVAILABLE');
 const carrier=ctx.sepMacProfile,local=new AsyncLocalStorage(),abort=new AbortController(),pending=new Set(),children=[],disposed=new Set();
 let phase='preparing',closing,control,storage,store,consumers,scope,p1,plan,revokeTools,native,nativeFiber,closedResolve;const cleaned=new Set();const closed=new Promise(r=>{closedResolve=r;});
 const nativeIo=createProjectTree({helperPath:config.helperPath,helperSha256:config.helperSha256,lockPath:config.nativeLockPath});
 const available=()=>{if(phase!=='active')fail(phase==='ready'||phase==='preparing'?'SEP_MAC_NOT_ACTIVE':'SEP_MAC_CLOSED');};
 const accept=()=>{const token={};pending.add(token);return()=>pending.delete(token);};
 const enter=()=>{available();return accept();};
 const track=async promise=>{const release=accept();try{return await promise;}finally{release();}};
 const access=work=>local.getStore()?storage.withAccess(work):carrier.withView((view,documentOps)=>local.run({...view,documentOps},()=>storage.withAccess(work)));
 const mounted=async(plugin,options)=>{const fiber=ctx.plugin(plugin,options);children.push(fiber);await fiber;return fiber;};
 const status=()=>JSON.parse(JSON.stringify({phase,status:phase==='closed'||phase==='active'?'pass':'blocked',pending:pending.size,consumers:consumers?.status(),p1:p1?.status(),compaction:native?.status()??{status:'not_run'},documents:'governed-managed-copies; imported-source-retained',context:'disabled',vision:'disabled',evaluation:'disabled',computerClick:'disabled',fullMacCertification:'blocked',resourcesConfirmedReleased:phase==='closed',unavailable:['untrusted-shell','MCP','context-parser','visual-attachments','AX-click','evaluation','original-source-deletion','automatic-installation']}));
 async function finish(){
  phase='closing';abort.abort();
  // This is a dedicated host: every source-scoped Agent belongs to this owner.
  for(const a of ctx.agents.list())if(a.session.header.cwd===config.source)a.cancel({kind:'disposed'});
  // Never close storage below an accepted call that still uses it.
  while(pending.size)await new Promise(r=>setTimeout(r,10));
  const failures=[];
  const attempt=async(key,operation)=>{if(cleaned.has(key))return true;try{await operation();cleaned.add(key);return true;}catch(error){failures.push(error);return false;}};
  const nativeDone=await attempt('native',()=>native?.restore());
  const consumersDone=await attempt('consumers',()=>consumers?.close());
  if(consumersDone){
   let ordinaryDone=true;
   for(const fiber of [...children].reverse()){
    if(fiber===nativeFiber&&!nativeDone)continue;
    if(!disposed.has(fiber))try{await fiber.dispose();disposed.add(fiber);}catch(error){failures.push(error);if(fiber!==nativeFiber)ordinaryDone=false;}
   }
   if(ordinaryDone&&await attempt('store',()=>store?.close()))await attempt('control',()=>control?.close());
  }
  if(failures.length)throw failures[0];
  revokeTools?.();phase='closed';const result=status();closedResolve(result);return result;
 }
 function close(){if(phase==='closed')return Promise.resolve(status());if(closing)return closing;closing=finish().catch(error=>{phase='cleanup-blocked';return {...status(),code:/^[A-Z][A-Z0-9_]{0,79}$/.test(error.code??'')?error.code:'SEP_MAC_CLEANUP_BLOCKED'};}).finally(()=>{closing=undefined;});return closing;}
 const boundedClose=async()=>{let timer;try{return await Promise.race([close(),new Promise(r=>{timer=setTimeout(()=>r({...status(),status:'blocked',resourcesRetained:true,resourcesConfirmedReleased:false}),config.shutdownMs);})]);}finally{clearTimeout(timer);}};
 // Retain admission after disposing P1's accounting hooks. A closed owner
 // must never expose the underlying paid adapter while its host still lives.
 ctx.on('llm/stream',async function*(options,next){available();yield* next(options);});
 // Native UI sessions omit maxTokens. Bind an explicit Profile default before
 // native prepareCall records the request; explicit proposals still reach P1
 // unchanged and can be refused. Never alter another project's agents.
 ctx.on('agent/request',async(payload,next)=>{
  const agent=payload.agent;if(!agent||ctx.agents.get(agent.id)!==agent||agent.session.header.cwd!==config.source)return next();
  const release=enter();try{payload.signal.throwIfAborted();const proposed=await next();available();payload.signal.throwIfAborted();return proposed.maxTokens===undefined?{...proposed,maxTokens:config.p1.profileLimits?.maxOutputTokens??2048}:proposed;}finally{release();}
 });
 ctx.effect(()=>async()=>{await close();});
 try{
  const roots=[config.source,config.memory,config.locks,join(config.budgetPath,'..')].map(resolvePath=>resolve(resolvePath));
  for(const path of roots){const stat=await lstat(path);if(!stat.isDirectory()||stat.isSymbolicLink()||stat.uid!==process.getuid()||await realpath(path)!==path||path!==config.source&&(stat.mode&0o077)!==0)fail('SEP_MAC_STORAGE_SCOPE');}
  const outside=r=>r==='..'||r.startsWith('../')||isAbsolute(r);for(let i=0;i<roots.length;i++)for(let j=0;j<i;j++){const r=relative(roots[i],roots[j]),s=relative(roots[j],roots[i]);if(!outside(r)||!outside(s))fail('SEP_MAC_STORAGE_SCOPE');}
  control=await openControl({storageRoot:config.memory,initialize:config.initialize,recoverDocumentDeletion:true});
  await control.recoverDocumentDeletions();await carrier.bindDocumentAuthority(macDocumentAuthority(control,config.source));
  storage=await bindStorage({facility:ctx.storageDomain,storageRoot:config.memory,control});
  store=await openStore(storage,config.locks);
  await carrier.withView(view=>local.run(view,async()=>{scope=await createSnapshotScope({source:config.source,sources:config.business.sources,userProfile:config.business.userProfile,workingDirectory:ctx.workingDirectory,view:async()=>local.getStore()??await carrier.withView(v=>v)});}));
  const budget=new Budget(config.budgetPath,{limit:config.p1.limitCny,initialSpent:0,taskLimitCny:config.p1.taskLimitCny});
  if(!config.initialize)await readFile(config.budgetPath);await budget.init();
  await mounted({name:'sep-mac-owned-p1',async apply(inner){p1=await installP1(inner,{config:config.p1,scope,store,budget,signal:abort.signal,track,lifecycle:{enter,accept},runAccess:access});}});
  consumers=await createSettingsConsumers(ctx,{config:config.business,scope,store,storage:{...storage,withAccess:access},control,p1,signal:abort.signal,enter,track,mount:mounted,budget,captureModel:config.p1.model,onControl:v=>{consumers=v;},documentManagerFactory:macDocumentFactory({source:config.source,local,syncDirectory:nativeIo.syncDirectory}),documentDescription});
  if(config.compaction){
   const entries=[...ctx.get('loader').entries()].filter(e=>e.options.id===config.compaction.nativeEntryId);
   if(entries.length!==1)fail('SEP_MAC_COMPACTION_ENTRY');
   await mounted(await owned('lib/native-compaction.js'),{nativeEntryId:entries[0].id,projects:[{id:scope.projects[0].key,root:config.source}]});
   nativeFiber=children.at(-1);native=ctx.get('sepNativeCompaction');if(!native)fail('SEP_MAC_COMPACTION_UNAVAILABLE');
  }
  for(const [action,args]of Object.entries({...p1Schemas,status:z.object({}).strict()}))ctx.tools.register({name:'suite_'+action,description:'macOS governed SEP '+action,parameters:JSON.parse(JSON.stringify({type:'object',...z.toJSONSchema(args)})),output:{schema:{type:'object'},render:(_a,v)=>[{type:'text',text:JSON.stringify(v)}]},async execute(raw,exec){const release=enter();try{const selected=await scope.caller(exec),work=()=>p1[action](selected,args.parse(raw),{...exec,budgetScope:p1.scopeForExecution(exec)});return action==='status'?status():await(action==='delegate'?work():access(work));}finally{release();}}});
  const tools=['computer_click','computer_observe','eval_status','eval_submit','eval_result','eval_cancel','eval_artifact_register','context_prepare','attachment_read','index','search','history_expand','extract','document_delete','vision','memory_save','memory_revise','memory_revoke','memory_recall','memory_get','memory_export','memory_archive','memory_archive_search','memory_archive_get','memory_restore','memory_purge','delegate','tasks','review','status'].map(n=>ctx.tools.get('suite_'+n)).filter(Boolean);
  revokeTools=carrier.authorizeTools(tools);
  ctx.on('tools/pre-execute',async(exec,next)=>{if(!tools.some(t=>t===ctx.tools.get(exec.name,exec.agent)))return next();available();if(delegationDepthOf(exec.agent)>0&&!['suite_status','suite_search','suite_memory_recall','suite_memory_get','suite_extract'].includes(exec.name))fail('SEP_MAC_CHILD_READONLY');return next();});
  const fingerprint=async()=>{await control.assertOwned();const cp=await control.checkpoint(),view=await carrier.withView(v=>v);return createHash('sha256').update(JSON.stringify({source:config.source,memory:config.memory,identity:control.identity,head:cp.head,view:view.version,business:config.business,p1:config.p1,ledger:createHash('sha256').update(await readFile(config.budgetPath)).digest('hex')})).digest('hex');};
  ctx.provide('sepMacRuntime',{status,close:boundedClose,whenClosed:()=>closed,async review(){if(phase!=='ready')fail('SEP_MAC_STATE');const data=await fingerprint(),compaction=await native?.review();plan={data,compaction,planHash:createHash('sha256').update(JSON.stringify({data,compaction})).digest('hex')};return {planHash:plan.planHash,scope:'isolated macOS governed business composition'};},async activate(input){if(phase!=='ready'||!plan||!input||Object.keys(input).length!==1||input.planHash!==plan.planHash)fail('SEP_MAC_PLAN_INVALID');const selected=plan;if(await fingerprint()!==selected.data){plan=undefined;fail('SEP_MAC_PLAN_CHANGED');}if(phase!=='ready')fail('SEP_MAC_CLOSED');if(native)await native.activate({planHash:selected.compaction.planHash});if(phase!=='ready')fail('SEP_MAC_CLOSED');phase='active';return status();},stream:options=>{available();return ctx.llm.stream({...options,signal:AbortSignal.any([abort.signal,...options.signal?[options.signal]:[]])});}});
  ctx.provide('suiteEnhancements',{scope:'isolated-macos',memoryFactHintsProtocol:1,memorySettings:consumers.memorySettings,budgetSettings:consumers.budgetSettings});phase='ready';
 }catch(error){await boundedClose();throw error;}
}
