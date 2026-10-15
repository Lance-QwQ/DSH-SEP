import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const sha=value=>createHash('sha256').update(value).digest('hex');
const files=['native-settings-installation.js','settings-runtime.js','protected-profile.js','protected-file-tools.js','file-protection.js','project-binding.js'];
/** Materialize a daily-only composition with a mechanically replayable origin.
 * The reviewed bundle core and its default admission are never edited. The
 * trusted deployment must bind this adapter, its core and all prerequisites. */
export async function buildDailyComposition({coreRoot,out}){
 await mkdir(out);const origins=[];
 for(const name of files){
  const source=join(coreRoot,'bundle/lib',name),input=await readFile(source,'utf8');let result=input;const transforms=[];
  const replace=(from,to)=>{if(result.split(from).length!==2)throw Error('SEP_DAILY_ORIGIN_ANCHOR');result=result.replace(from,to);transforms.push({from,to});};
  // Keep the five local adapter edges; every other import binds to the
  // immutable core rather than copying or bundling worker-relative modules.
  for(const match of [...result.matchAll(/from '(\.\.?\/[^']+)'/g)]){
   const spec=match[1];if(spec.startsWith('./')&&files.includes(spec.slice(2)))continue;
   replace(match[0],"from '"+pathToFileURL(resolve(dirname(source),spec)).href+"'");
  }
  if(name==='file-protection.js'){
   const start=result.indexOf(' async governed(policy,work){'),end=result.indexOf('\n writeText(',start);
   if(start<0||end<start)throw Error('SEP_DAILY_ORIGIN_ANCHOR');
   replace(result.slice(start,end),` async governed(policy,work){
  if(this.closed)fail('RECOVERY_UNAVAILABLE');
  policy??=this.ctx.get('sandboxPolicy')?.resolve();
  if(policy?.mode==='read-only')fail('FS_SANDBOX_DENIED');
  const pending=(async()=>{
   const selected=await this.ctx.recoveryHost.projectForPath({cwd:policy?.workspaceRoot??this.config.cwd});
   if(this.closed)fail('RECOVERY_UNAVAILABLE');
   return this.ctx.recoveryHost.withProject(selected.id,project=>{
    if(!same(project.root,selected.root)||project.generation!==selected.generation)fail('RECOVERY_STALE_CONTEXT');
    return work({...policy,workspaceRoot:project.root,mode:'workspace-write'});
   });
  })();
  this.pending.add(pending);
  try{return await pending;}finally{this.pending.delete(pending);}
 }`);
  }
  if(name==='project-binding.js'){
   replace("   if(typeof session.header.cwd!=='string'||!same(session.header.cwd,active.result.project.root))fail('SEP_BINDING_SESSION_SCOPE');", "   if(typeof session.header.cwd!=='string')fail('SEP_BINDING_SESSION_SCOPE');\n   const sessionProject=await ctx.recoveryHost.projectForPath({cwd:session.header.cwd});");
   replace("return freeze({...current,sessionId:session.header.id,status:'reviewed-session'});", "return freeze({...current,project:sessionProject,sourceProject:{...current.sourceProject,root:sessionProject.root,recoveryProjectId:sessionProject.id},sessionId:session.header.id,status:'reviewed-session'});");
  }
  if(name==='settings-runtime.js'){
   replace("export const name='dsh-sep-settings-runtime';",`import * as DailySafeChange from '${pathToFileURL(join(coreRoot,'bundle/modules/system-enhancement-package/src/sep-safe-change/index.js')).href}';
import * as DailyCheckpoint from '${pathToFileURL(join(coreRoot,'bundle/modules/task-checkpoint/lib/index.js')).href}';
import {createAssessmentService} from '${pathToFileURL(join(coreRoot,'bundle/modules/system-enhancement-package/src/update-assessment-service.js')).href}';
import {createAdoptionRetention,withAdoptionRecoveryGuard} from '${pathToFileURL(join(coreRoot,'bundle/modules/system-enhancement-package/src/p2/adoption-retention.js')).href}';
import {sweepAdoptionMetadata} from '${pathToFileURL(join(coreRoot,'bundle/modules/system-enhancement-package/src/p2/adoption-metadata-retention.js')).href}';
export const name='dsh-sep-settings-runtime';`);
   replace('let phase=\'preparing\',projectRoot,profile,policy,native,controller,store,p1,plan,transition,finishing,cleanupProblem,consumers,restorationComplete=false,initializationFailure,initializationCause;',"let phase='preparing',projectRoot,profile,policy,native,controller,store,p1,plan,transition,finishing,cleanupProblem,consumers,dailySafeChange,dailyCheckpoint,dailyAssessment,restorationComplete=false,initializationFailure,initializationCause;");
   replace('business:businessConfig,compaction:',"business:businessConfig.extend({captureModel:z.string().min(1).max(128).optional()}),compaction:");
   replace('let phase=\'preparing\',projectRoot,profile,policy,native,controller,store,p1,plan,transition,finishing,cleanupProblem,consumers,dailySafeChange,dailyCheckpoint,dailyAssessment,restorationComplete=false,initializationFailure,initializationCause;',"let phase='preparing',projectRoot,profile,policy,native,controller,store,p1,plan,transition,finishing,cleanupProblem,consumers,dailySafeChange,dailyCheckpoint,dailyAssessment,dailyRetention,restorationComplete=false,initializationFailure,initializationCause;");
   replace('captureModel:config.p1.model,attachmentSelection:', 'captureModel:config.business.captureModel??config.p1.model,attachmentSelection:');
   replace('Promise.allSettled([restored,drain(),...agentDrains])','Promise.allSettled([restored,drain(),dailyAssessment?.close(),dailyRetention?.stop(),...agentDrains])');
   replace('const [restoration]=await Promise.allSettled(', 'const [restoration,,assessmentCleanup,retentionCleanup]=await Promise.allSettled(');
   replace('   restorationComplete=true;',"   restorationComplete=true;\n   if(assessmentCleanup?.status==='rejected'){phase='cleanup-blocked';cleanupProblem='SEP_ASSESSMENT_CLEANUP_BLOCKED';return receipt();}");
   replace("   try{\n    await native?.dispose();", "   if(retentionCleanup?.status==='rejected'){phase='cleanup-blocked';cleanupProblem='SEP_RETENTION_CLEANUP_BLOCKED';return receipt();}\n   try{\n    await native?.dispose();");
   replace("  ctx.provide('suiteEnhancements',Object.freeze({scope:",`  dailyAssessment=createAssessmentService({config:config.p1,resolveKey:()=>ctx.get('credentials')?.resolve('DEEPSEEK_API_KEY'),track});
  const updateAssessment=Object.freeze(Object.fromEntries(['get','update','observe','retry','idle'].map(method=>[method,async(...args)=>{const release=enter('callback');try{return await dailyAssessment[method](...args);}finally{release();}}])));
  const p2=ctx.get('sepStorageControl');dailyRetention=createAdoptionRetention({storageRoot:p2.storageRoot,withRecoveryGuard:(input,fn)=>withAdoptionRecoveryGuard({...input,control:p2},fn),afterRun:()=>sweepAdoptionMetadata({storageRoot:p2.storageRoot,control:p2})});await dailyRetention.start();
  ctx.provide('suiteEnhancements',Object.freeze({p2Retention:Object.freeze({status:dailyRetention.status}),updateAssessment,scope:`);
   replace("const scope=new Scope(ctx.get('fs'),[{root:project.root,sources:config.business.sources,...config.business.userProfile?{userProfile:config.business.userProfile}:{},recoveryProjectId:project.id}],{enabled:true,followRegisteredProjects:false,recoveryHost:ctx.recoveryHost});await scope.init();",
    "const registered=await ctx.recoveryHost.listProjects();if(registered.length>16)fail('SEP_DAILY_PROJECT_LIMIT');\n  const scope=new Scope(ctx.get('fs'),registered.map(row=>({root:row.root,sources:row.id===project.id?config.business.sources:[],...row.id===project.id&&config.business.userProfile?{userProfile:config.business.userProfile}:{},recoveryProjectId:row.id})),{enabled:true,followRegisteredProjects:true,recoveryHost:ctx.recoveryHost});await scope.init();");
   replace('projects:[{id:project.id,root:project.root}]','projects:registered.filter(row=>row.state===\'ready\').map(row=>({id:row.id,root:row.root}))');
   // This daily root is admitted only into a dedicated cold host. All agents
   // belong to that host; shared-host mounting is not a supported mode.
   replace("if(cwd&&(pathKey(cwd)===pathKey(projectRoot)||pathKey(cwd).startsWith(pathKey(projectRoot)+(process.platform==='win32'?'\\\\':'/'))))",'if(cwd)');
   replace("if(!cwd||!(pathKey(cwd)===pathKey(projectRoot)||pathKey(cwd).startsWith(pathKey(projectRoot)+(process.platform==='win32'?'\\\\':'/'))))return next();",'if(!cwd)return next();');
   replace("  phase='ready';\n  startup.resolve();",`  dailySafeChange=await mount(DailySafeChange,{enabled:true,projects:registered.filter(row=>row.state==='ready').map(row=>({root:row.root,sources:['.'],recoveryProjectId:row.id})),recoveryEnabled:true});
  dailyCheckpoint=await mount(DailyCheckpoint,{allowedTools:['read','write','edit','file_manage'],maxTasks:8,maxSteps:16,maxOperations:64,maxArtifactBytes:1048576,maxStateBytes:1048576,maxInputBytes:16384,maxOutputBytes:262144});
  phase='ready';
  startup.resolve();`);
   replace('await native?.dispose();await consumers?.close();await policy?.dispose();', 'await native?.dispose();await dailyCheckpoint?.dispose();await dailySafeChange?.dispose();await consumers?.close();await policy?.dispose();');
  }
  await writeFile(join(out,name),result);origins.push({file:name,source,sourceSha256:sha(input),transforms,resultSha256:sha(result)});
 }
 const manifest={name:'dsh-sep-daily-alpha1-adapter',version:'0.1.0',private:true,type:'module',main:'./native-settings-installation.js',dsh:'0.2.1-alpha.1',sep:'0.2.1-beta.3-bundle.24'};
 await writeFile(join(out,'package.json'),JSON.stringify(manifest,null,2)+'\n');
 await writeFile(join(out,'ORIGIN.json'),JSON.stringify({schema:1,scope:'daily-only, immutable bundle.24 retained',origins},null,2)+'\n');return {out,origins};
}
