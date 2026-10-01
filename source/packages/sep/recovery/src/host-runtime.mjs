import {readFile,realpath,lstat} from 'node:fs/promises';
import {join,isAbsolute,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import {recoveryClient} from './client.mjs';

/** Independent bootstrap: recovery service retains its own cwd; only this owned host uses the approved project. */
export async function bootRecoveryHost(config,{connection}={}) {
 for(const k of ['hostRoot','home','suiteRoot','profileFile'])if(!isAbsolute(config[k]??''))throw Error('RECOVERY_HOST_CONFIG');
 if(!Array.isArray(config.projectIds)||!config.projectIds.length||!config.suiteConfig||!Array.isArray(config.overlays??[]))throw Error('RECOVERY_HOST_CONFIG');
 const client=recoveryClient(connection??{endpoint:process.env.DSH_RECOVERY_ENDPOINT,token:process.env.DSH_RECOVERY_TOKEN});
 const projects=await Promise.all(config.projectIds.map(id=>client.call('projectById',{id}))),ready=projects.find(p=>p.state==='ready');
 if(!ready)throw Error('RECOVERY_NO_READY_PROJECT');
 // Never substitute control/home for a missing task workspace and never mkdir a project.
 const path=await realpath(ready.root),stat=await lstat(path,{bigint:true});
 if(String(stat.dev)!==ready.identity.dev||String(stat.ino)!==ready.identity.ino||String(stat.birthtimeNs)!==ready.identity.birthtimeNs)throw Error('RECOVERY_PROJECT_CHANGED');
 process.chdir(path);process.env.DSH_HOME=config.home;
 const profileRel=relative(config.home,config.profileFile);if(isAbsolute(profileRel)||profileRel.startsWith('..'))throw Error('RECOVERY_PROFILE_OUTSIDE_HOME');
 await readFile(config.profileFile,'utf8');
 const pkg=name=>join(config.hostRoot,'node_modules','@deepseek-ai',name);
 const load=name=>import(pathToFileURL(join(pkg(name),'lib/index.js')).href);
 const [{boot,loadOverlayPatches,healProfilesModuleFallback},{provideCmdline}]=await Promise.all([load('dsh-app-boot'),load('dsh-cmdline')]);
 await healProfilesModuleFallback({installAnchor:await realpath(join(pkg('dsh'),'package.json')),home:config.home});
 // This dedicated profile starts with an empty local overlay; existing daily profiles are not imported.
 const suiteConfig={...config.suiteConfig,recovery:{enabled:true},projects:config.suiteConfig.projects.map(p=>{const bound=projects.find(q=>q.id===p.recoveryProjectId);if(!bound)throw Error('RECOVERY_PROJECT_CONFIG');return {...p,root:bound.root};})};
 const patches=[
  ...loadOverlayPatches('recovery',join(pkg('dsh-base'),'cordis.patch.yml')),
  ...loadOverlayPatches('recovery',join(pkg('dsh-web-app'),'cordis.patch.yml')),
  {id:'settings',config:{path:join(config.home,'settings.json'),watch:false}},
  {id:'storage-json',config:{root:config.suiteConfig.p2.storageRoot}},
  {id:'session-persistence-jsonl',config:{root:join(config.home,'sessions'),requireExistingRoot:true}},
  {id:'sandbox-policy',config:{mode:'workspace-write',workspaceRoot:ready.root}},
  {id:'agent-loop',config:{agents:[]}},
  {id:'agent-presets',config:{default:'standard',roots:[{path:join(pkg('dsh'),'config/agent-presets'),trust:'system'}],includeUserRoot:false}},
  {id:'webserver',config:{host:'127.0.0.1',port:0}},
  {id:'web-runtime',config:{printUrl:false,surfaceContext:false,trustedHosts:[]}},
  {id:'connection',config:{trustedHosts:[]}},
  ...(config.overlays??[]),
  {insert:[{id:'host-recovery',name:pathToFileURL(join(import.meta.dirname,'host-plugin.mjs')).href,config:connection??{}},{id:'sep-memory-suite',name:pathToFileURL(join(import.meta.dirname,'suite-plugin.mjs')).href,config:suiteConfig}]},
 ];
 const ctx=await boot('recovery',config.profileFile,patches,c=>provideCmdline(c,{args:[],exit:()=>{}}));
 if(ctx.get('suiteEnhancements')?.modules.memory!=='ready'){await ctx.fiber.dispose();throw Error('RECOVERY_SUITE_NOT_READY');}
 return {ctx,project:ready,url:ctx.webServer?.port?`http://127.0.0.1:${ctx.webServer.port}/`:null};
}
