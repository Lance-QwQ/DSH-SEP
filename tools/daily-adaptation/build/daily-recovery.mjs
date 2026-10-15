import {readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const sha=value=>createHash('sha256').update(value).digest('hex');
/** Retain the existing center/guardian/continuation implementation and add
 * an authenticated write fence needed by the new protected-file provider.
 * Copies are a new daily adapter, never edits to captured bundle.24 modules. */
export async function buildDailyRecovery({coreRoot,out,leaseSource}){
 await mkdir(out);await cp(join(coreRoot,'bundle/modules/recovery'),out,{recursive:true});
 await cp(leaseSource,join(out,'src/project-write-lease.mjs'));
 const origins=[];
 for(const name of ['server.mjs','host-plugin.mjs','guardian.mjs']){
  const path=join(out,'src',name),original=await readFile(path,'utf8');let text=original;const transforms=[];
  const replace=(from,to)=>{if(text.split(from).length!==2)throw Error('SEP_DAILY_RECOVERY_ORIGIN');text=text.replace(from,to);transforms.push({from,to});};
  if(name==='server.mjs'){
   replace("import {safeHostCode}","import {createProjectWriteLeases} from './project-write-lease.mjs';\nimport {safeHostCode}");
   replace("  const token=randomBytes",`  const projectWriteLeases=host&&controller?createProjectWriteLeases(controller):undefined;
  if(projectWriteLeases){
   const original=controller;
   const readMethods=new Set(['status','inspectProject','assertBusinessOpen','beginOperation','finishOperation','interruptOperations']);
   controller=new Proxy(original,{get(target,key){const value=target[key];return typeof value==='function'&&!readMethods.has(key)?(...args)=>projectWriteLeases.mutate(()=>value(...args)):value;}});
  }
  const token=randomBytes`);
   replace('  const methods={','  const methods={\n    acquireProjectWrite:params=>{if(!projectWriteLeases)throw failure(\'RECOVERY_WRITE_OWNER_UNPROVEN\');return projectWriteLeases.acquire(params);},\n    releaseProjectWrite:params=>{if(!projectWriteLeases)throw failure(\'RECOVERY_WRITE_OWNER_UNPROVEN\');return projectWriteLeases.release(params);},');
   replace("'beginOperation','finishOperation','planResume','checkContinuation'].includes(request.method)","'beginOperation','finishOperation','planResume','checkContinuation','acquireProjectWrite','releaseProjectWrite'].includes(request.method)");
   replace("['projectForPath','projectById','finishOperation','checkContinuation'].includes(request.method)","['projectForPath','projectById','finishOperation','checkContinuation','releaseProjectWrite'].includes(request.method)");
   replace('afterExit:async event=>{await controller.interruptOperations', 'onSpawn:event=>{projectWriteLeases?.observeChild(event);host.onSpawn?.(event);},afterExit:async event=>{await projectWriteLeases?.afterExit(event);await controller.interruptOperations');
   replace('return {connection,connectionFile,desktopConnection,hostConnection:', 'return {projectWriteLeases,connection,connectionFile,desktopConnection,hostConnection:');
  }else if(name==='guardian.mjs'){
   replace("message.dshVersion !== '0.2.0-rc.2'","message.dshVersion !== '0.2.1-alpha.1'");
  }else{
   replace(" const api={listProjects:"," let writeTail=Promise.resolve();\n const api={listProjects:");
   replace(" ctx.provide('recoveryHost',api);",` api.withProject=(id,work)=>{
  const task=writeTail.then(async()=>{
   lifetime.signal.throwIfAborted();
   const lease=await client.call('acquireProjectWrite',{projectId:id});let dispatched=false;
   try{
    lifetime.signal.throwIfAborted();const current=await api.projectById({id});
    if(current.state!=='ready'||current.generation!==lease.project.generation||current.root!==lease.project.root)fail('RECOVERY_STALE_CONTEXT');
    dispatched=true;const result=await work(current);
    const receipt=await client.call('releaseProjectWrite',{leaseId:lease.leaseId,outcome:'succeeded'});
    if(!receipt.accepted)fail('RECOVERY_STALE_RESULT');return result;
   }catch(error){
    await client.call('releaseProjectWrite',{leaseId:lease.leaseId,outcome:dispatched?'unknown':'succeeded'}).catch(()=>{});throw error;
   }
  });
  writeTail=task.catch(()=>{});pending.add(task);return task.finally(()=>pending.delete(task));
 };
 ctx.provide('recoveryHost',api);`);
  }
  await writeFile(path,text);origins.push({file:'src/'+name,sourceSha256:sha(original),transforms,resultSha256:sha(text)});
 }
 const manifest=JSON.parse(await readFile(join(out,'package.json')));manifest.version+='-daily.alpha1.1';
 for(const [name,range]of Object.entries(manifest.peerDependencies??{}))if(name.startsWith('@deepseek-ai/dsh-')&&name!=='@deepseek-ai/dsh-invariants')manifest.peerDependencies[name]='0.2.1-alpha.1';
 await writeFile(join(out,'package.json'),JSON.stringify(manifest,null,2)+'\n');
 await writeFile(join(out,'DAILY-ORIGIN.json'),JSON.stringify({schema:1,coreRoot,leaseSha256:sha(await readFile(leaseSource)),origins},null,2)+'\n');return out;
}
