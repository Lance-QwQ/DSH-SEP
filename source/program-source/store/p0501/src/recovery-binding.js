import {isAbsolute,resolve} from 'node:path';
import {lstat,realpath} from 'node:fs/promises';
import {fail} from './errors.js';

const key=p=>process.platform==='win32'?resolve(p).toLowerCase():resolve(p);
export const sameRecoveryRoot=(a,b)=>key(a)===key(b);
function authority(value){
  if(!value||typeof value.id!=='string'||!isAbsolute(value.root??'')||!/^[a-f0-9]{64}$/.test(value.memoryKey??'')||!Number.isSafeInteger(value.generation)||value.generation<1||!['ready','paused'].includes(value.state))fail('RECOVERY_AUTHORITY_INVALID');
  const i=value.identity;
  if(!i||typeof i.realpath!=='string'||!sameRecoveryRoot(i.realpath,value.root)||!/^\d+$/.test(i.dev??'')||!/^\d+$/.test(i.ino??'')||!/^\d+$/.test(i.birthtimeNs??''))fail('RECOVERY_AUTHORITY_INVALID');
  return value;
}

export function recoveryBinding(host){
  if(!host||typeof host.projectById!=='function'||typeof host.projectForPath!=='function')fail('RECOVERY_UNAVAILABLE');
  async function call(method,args,nullable=false){
    let result;try{result=await host[method](args);}catch(error){
      // Only path lookup may report an unregistered workspace as absent.
      // Scope still rejects a missing configured root as stale; outages and
      // invalid/paused authorities must never silently disable protection.
      if(nullable&&method==='projectForPath'&&error?.code==='RECOVERY_PROJECT_UNKNOWN')return null;
      fail('RECOVERY_UNAVAILABLE');
    }
    if(nullable&&result===null)return null;
    return authority(result);
  }
  async function ready(p){
    if(p.state!=='ready')fail('RECOVERY_PROJECT_PAUSED');
    let stat,canonical;try{stat=await lstat(p.root,{bigint:true});canonical=await realpath(p.root);}catch{fail('RECOVERY_PROJECT_PAUSED');}
    if(!stat.isDirectory()||stat.isSymbolicLink()||!sameRecoveryRoot(canonical,p.root)||String(stat.dev)!==p.identity.dev||String(stat.ino)!==p.identity.ino||String(stat.birthtimeNs)!==p.identity.birthtimeNs)fail('RECOVERY_PROJECT_PAUSED');
    return p;
  }
  return {
    byId:id=>call('projectById',{id}),
    forPath:cwd=>call('projectForPath',{cwd},true),
    ready,
    async configured(p){return p.recoveryProjectId?call('projectById',{id:p.recoveryProjectId}):call('projectForPath',{cwd:p.root});},
    async assert(project){
      const current=await ready(await call('projectById',{id:project.recoveryProjectId}));
      if(current.id!==project.recoveryProjectId||current.memoryKey!==project.key||current.generation!==project.recoveryGeneration||!sameRecoveryRoot(current.root,project.root))fail('RECOVERY_STALE_CONTEXT');
      return current;
    },
  };
}

/** Native settings does not carry a session cwd. Its selected project is still
 * checked against current recovery authority, including inside the store queue. */
export function guardRecoverySettings(scope,automatic){
  if(!scope?.recovery||!automatic)return automatic;
  return {...automatic,
    async settings(project,input){await scope.assertProject(project);return automatic.settings(project,input);},
    async updateSettings(project,input,expected,options={}){
      await scope.assertProject(project);
      return automatic.updateSettings(project,input,expected,{...options,beforeCommit:async()=>{await options.beforeCommit?.();await scope.assertProject(project);}});
    },
  };
}

export function guardRecoverySettingsService(scope,service){
  if(!scope?.recovery)return service;
  return Object.fromEntries(['list','get','update'].map(name=>[name,async(raw={},options)=>{
    await scope.refreshRecoveryProjects(name==='list'?undefined:raw?.projectId);
    return service[name](raw,options);
  }]));
}
