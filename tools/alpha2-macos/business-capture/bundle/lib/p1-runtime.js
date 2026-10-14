import {z} from 'zod';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import * as ProtectedProfile from './protected-profile.js';
import * as NativeCompaction from './native-compaction.js';
import {installP1,p1Config,p1Schemas} from '../host/p1-policy/index.js';
import {Budget} from '../modules/system-enhancement-package/src/deepseek.js';
import {Scope} from '../modules/system-enhancement-package/src/scope.js';
import {openStore} from '../modules/system-enhancement-package/src/store.js';

export const name='dsh-sep-p1-runtime';
export const inject=['loader','tools','systemPrompt','sessions','storageDomain','recoveryHost','llm','tokenMeter','agents','subagents','approval'];
export const provide=['sepP1Runtime'];
const fail=code=>{throw Object.assign(new Error(code),{code});};
const key=value=>JSON.stringify(value,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const hash=value=>createHash('sha256').update(key(value)).digest('hex');
const pathKey=value=>process.platform==='win32'?resolve(value).toLowerCase():resolve(value);
const schema=z.object({profile:z.record(z.string(),z.unknown()),p1:p1Config,compaction:z.object({nativeEntryId:z.string().min(1),maxInputBytes:z.number().int().min(1024).max(8*1024*1024).optional()}).strict(),shutdownMs:z.number().int().min(100).max(60000).default(5000)}).strict();
class ExistingBudget extends Budget{
 constructor(...args){super(...args);this.observedLedger=true;}
 async init(){if((await this.read()).version!==3)fail('SEP_P1_LEDGER_VERSION');}
}

/** Explicit cold P1 fragment, not the complete SEP business entry. The caller
 * owns startup admission and must use close() before removing prerequisites.
 * A bounded close receipt does not turn an uncooperative operation into a
 * completed one: owned providers/leases remain until actual settlement.
 * Cordis fiber disposal joins that settlement and has no independent deadline. */
export async function apply(ctx,input){
 let config;try{config=schema.parse(input);}catch{fail('SEP_P1_INPUT_INVALID');}
 if(!config.p1.enabled||config.p1.initialSpentCny!==0)fail('SEP_P1_INPUT_INVALID');
 if(pathKey(config.p1.budgetPath)!==pathKey(config.profile.selection?.budgetPath??''))fail('SEP_P1_BUDGET_MISMATCH');
 if(ctx.get('sepP1Runtime')||ctx.get('suiteEnhancements'))fail('SEP_P1_PROVIDER_CONFLICT');
 const lifetime=new AbortController(),children=[],pending=new Map(),waiters=new Set();
 let phase='preparing',projectRoot,profile,policy,native,controller,store,p1,plan,transition,finishing,cleanupProblem;
 const count=()=>Object.fromEntries(['model','tool','callback'].map(kind=>[kind,[...pending.values()].filter(v=>v===kind).length]));
 const receipt=()=>({status:phase==='closed'?'pass':'blocked',phase,resourcesRetained:phase!=='closed',pending:count(),...(cleanupProblem?{code:cleanupProblem}:{})});
 function enter(kind){if(phase!=='active')fail(phase==='preparing'||phase==='ready'?'SEP_P1_NOT_ACTIVE':'SEP_P1_CLOSED');return accept(kind);}
 function accept(kind){const token=Symbol(kind);pending.set(token,kind);let released=false;return()=>{if(released)return;released=true;pending.delete(token);if(!pending.size){for(const resolve of waiters)resolve();waiters.clear();}};}
 async function track(work){const release=accept('callback');try{return await work;}finally{release();}}
 const drain=async()=>{while(pending.size)await new Promise(resolve=>waiters.add(resolve));};
 async function mount(plugin,options){let fiber;ctx.effect(function*(){fiber=ctx.plugin(plugin,options);children.push(fiber);yield fiber.dispose;yield shutdownWait;});await fiber;return fiber;}
 function finish(){
  if(finishing)return finishing;
  if(phase==='closed')return Promise.resolve(receipt());
  phase='draining';lifetime.abort(Object.assign(new Error('SEP_P1_CLOSED'),{code:'SEP_P1_CLOSED'}));
  const agentDrains=[];
  if(projectRoot)for(const agent of ctx.agents.list()){
   const cwd=agent.session.header.cwd;if(cwd&&(pathKey(cwd)===pathKey(projectRoot)||pathKey(cwd).startsWith(pathKey(projectRoot)+(process.platform==='win32'?'\\':'/')))){agent.cancel({kind:'disposed'});agentDrains.push(agent.whenIdle());}
  }
  finishing=(async()=>{
   await Promise.allSettled(transition?[transition]:[]);
   // Cancel/drain compression concurrently with the model drain: compression
   // itself may own a model stream, so neither resource can close first.
   const restored=controller?controller.restore():Promise.resolve();
   const [restoration]=await Promise.allSettled([restored,drain(),...agentDrains]);
   if(restoration.status==='rejected'){phase='restore-blocked';cleanupProblem='SEP_NATIVE_RESTORE_BLOCKED';return receipt();}
   try{
    await native?.dispose();await policy?.dispose();await store?.close();await profile?.dispose();
    // Cordis may log and swallow a child's cleanup error. A still-present
    // owner marker is not evidence of successful physical lease release.
    try{await readFile(join(config.profile.selection.roots.memory,'.suite-memory','p2','owner.lock'));fail('SEP_P1_LEASE_RETAINED');}catch(error){if(error.code!=='ENOENT')throw error;}
    phase='closed';cleanupProblem=undefined;
   }catch(error){phase='cleanup-blocked';cleanupProblem=typeof error.code==='string'?error.code:'SEP_P1_CLEANUP_FAILED';}
   return receipt();
  })().finally(()=>{finishing=undefined;});return finishing;
 }
 async function shutdownWait(){const result=await finish();if(result.status!=='pass')ctx.logger.warn(result.code??'SEP_P1_CLEANUP_BLOCKED');}
 async function close(){let timer;try{return await Promise.race([finish(),new Promise(resolve=>{timer=setTimeout(()=>resolve(receipt()),config.shutdownMs);})]);}finally{clearTimeout(timer);}}
 ctx.effect(()=>shutdownWait);
 try{
  const budget=new ExistingBudget(config.p1.budgetPath,{limit:config.p1.limitCny,initialSpent:0,taskLimitCny:config.p1.taskLimitCny});await budget.init();
  profile=await mount(ProtectedProfile,config.profile);
  if(!ctx.get('sepProtectedProfile')||!ctx.get('sepGovernedStorage'))fail('SEP_P1_PROFILE_UNAVAILABLE');
  const project=await ctx.recoveryHost.projectById({id:config.profile.selection.projectId});
  projectRoot=project.root;
  const scope=new Scope(ctx.get('fs'),[{root:project.root,sources:[],recoveryProjectId:project.id}],{enabled:true,recoveryHost:ctx.recoveryHost});await scope.init();
  const storage=ctx.get('sepGovernedStorage');
  store=await openStore(storage,config.profile.selection.roots.locks);
  policy=await mount({name:'dsh-sep-owned-p1-policy',inject:['tools','llm','agents','sessions','subagents','approval'],async apply(inner){
   p1=await installP1(inner,{config:config.p1,scope,store,budget,lifecycle:{enter,accept},signal:lifetime.signal,track,runAccess:work=>storage.withAccess(work)});
   // Registry tokens span pre-policy, dispatch, and final result publication.
   // Do not replace their signals: the real turn binding must remain intact.
   const toolTokens=new Map();
   inner.on('tools/pre-execute',async(exec,next)=>{
    const cwd=exec.agent?.session?.header?.cwd;
    if(!cwd||!(pathKey(cwd)===pathKey(projectRoot)||pathKey(cwd).startsWith(pathKey(projectRoot)+(process.platform==='win32'?'\\':'/'))))return next();
    const release=enter('tool');toolTokens.set(exec.token,release);
    try{return await next();}catch(error){toolTokens.delete(exec.token);release();throw error;}
   });
   inner.on('tools/result',exec=>{toolTokens.get(exec.token)?.();toolTokens.delete(exec.token);});
   for(const [action,args] of Object.entries({delegate:p1Schemas.delegate,tasks:p1Schemas.tasks,review:p1Schemas.review,status:z.object({}).strict()})){
    inner.tools.register({name:`suite_${action}`,description:`P1 ${action}; delegated-task limits apply only to suite_delegate tasks.`,parameters:JSON.parse(JSON.stringify({type:'object',...z.toJSONSchema(args)})),output:{schema:{type:'object'},render:(_a,value)=>[{type:'text',text:JSON.stringify(value)}]},async execute(raw,exec){
     const release=enter('tool');try{
      const budgetScope=p1.scopeForExecution(exec),signal=AbortSignal.any([exec.signal,lifetime.signal]);signal.throwIfAborted();
      const parsed=args.parse(raw),selected=await scope.caller({...exec,signal});
      if(action==='status')return {p1:{...p1.status(),budget:await p1.budgetStatus(exec)}};
      const work=()=>p1[action](selected,parsed,{...exec,signal,budgetScope});
      return await (action==='delegate'?work():storage.withAccess(work));
     }finally{release();}
    }});
   }
  }});
  if(!p1)fail('SEP_P1_POLICY_UNAVAILABLE');
  native=await mount(NativeCompaction,{...config.compaction,projects:[{id:project.id,root:project.root}]});controller=ctx.get('sepNativeCompaction');if(!controller)fail('SEP_P1_COMPACTION_UNAVAILABLE');
  phase='ready';
  const review=async()=>{
   if(phase!=='ready'||transition)fail('SEP_P1_STATE');
   const binding=await ctx.get('sepProtectedProfile').review(),compaction=await controller.review();
   if(phase!=='ready')fail('SEP_P1_CLOSED');
   plan={binding,compaction,planHash:hash({binding,compaction,p1:config.p1,shutdownMs:config.shutdownMs})};
   return {planHash:plan.planHash,bindingHash:binding.planHash,nativeHash:compaction.planHash,scope:'explicit cold P1 fragment; complete business Profile remains blocked'};
  };
  ctx.provide('sepP1Runtime',{
   status:()=>({...receipt(),p1:p1.status(),completeProfileStatus:'blocked',businessEnabled:false,wholeApplicationDeadlineVerified:false}),review,
   async activate(input){
    if(phase!=='ready'||transition)fail('SEP_P1_STATE');
    if(!plan||!input||Object.keys(input).length!==1||typeof input.planHash!=='string'||input.planHash!==plan.planHash)fail('SEP_P1_PLAN_INVALID');
    const reviewed=plan;
    transition=(async()=>{await ctx.get('sepProtectedProfile').confirm({planHash:reviewed.binding.planHash});if(phase!=='ready')fail('SEP_P1_CLOSED');await controller.activate({planHash:reviewed.compaction.planHash});if(phase!=='ready')fail('SEP_P1_CLOSED');phase='active';return {phase};})().finally(()=>{transition=undefined;});
    return transition;
   },close,
   stream:options=>{if(phase!=='active')fail(phase==='ready'?'SEP_P1_NOT_ACTIVE':'SEP_P1_CLOSED');return ctx.llm.stream({...options,signal:AbortSignal.any([lifetime.signal,...options.signal?[options.signal]:[]])});},
  });
 }catch(error){await shutdownWait();throw error;}
}
