import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile,writeFile,mkdir,mkdtemp,access} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {setup,close,load,require} from './full-browser-fixture.mjs';
import {browser,button} from './full-browser-driver.mjs';
const P=resolve(process.env.SEP_PHASE_ROOT),UI='@deepseek-ai/dsh-client-ui-settings-memory';
async function carrier(business={}){
 const f=await setup({mountRoot:false,business});try{
  const profile=join(f.base,'native-profile');await mkdir(profile);await writeFile(join(profile,'package.json'),JSON.stringify({name:'sep-full-native-test-profile',version:'1.0.0',dsh:{profile:{bundles:[]}}}));await writeFile(join(profile,'cordis.patch.yml'),'[]\n');
  f.ctx.provide('profileContext',{name:'sep-full-native-test',dir:profile,patchPath:join(profile,'cordis.patch.yml'),installAnchor:resolve(process.env.SEP_OFFICIAL_HARNESS),cwd:f.dirs.project,home:f.base,startedBundles:[],overlays:[]});
  for(const name of ['config-editor','settings','commands'])await f.ctx.plugin((await load('@deepseek-ai/dsh-'+name)).default);
  await f.mount();
  const roster=['agent-default-model','client-file-upload','workspace','session-title','session-query-sqlite','typert-registry','api-gateway','api-remotes','api-settings-controller','api-workspace-controller','api-session-controller','client-ui-renderer','client-ui-settings','client-locale','client-shortcuts','client-ui-settings-general','client-ui-theme','client-ui-layout','client-ui-session','client-ui-workspace','client-ui-sidebar','client-ui-conversation','client-resources','client-ui-sidebar-right','client-ui-chat','client-ui-brand-official','client-ui-input-trigger','client-hmr'];
  for(const name of roster){const config=name==='agent-default-model'?{provider:'deepseek-official',model:'deepseek-v4-flash'}:name==='session-title'?{fallbackMaxWords:5,fallbackMaxBytes:40,maxTitleBytes:80}:name==='session-query-sqlite'?{path:':memory:',openAt:'never'}:name==='api-session-controller'?{nativeOpen:false}:name==='api-workspace-controller'?{documentsDirectory:f.dirs.project}:undefined;await f.ctx.loader.create({id:'full-'+name,name:pathToFileURL(require.resolve('@deepseek-ai/dsh-'+name)).href,...config?{config}:{}});}
  await f.ctx.loader.await();
  const states=[...f.ctx.loader.entries()].filter(e=>e.options.id?.startsWith('full-')).map(e=>({id:e.options.id,state:e.fiber?.state}));assert(states.every(e=>e.state===2),JSON.stringify(states));
  for(const name of ['kernel.js','kernel.css']){const body=await readFile(join(P,'assets',name));f.ctx.effect(()=>f.ctx.webServer.register({kind:'exact',path:'/'+name,handler(req,res){if(!f.connection.authorizeIndex(req,res))return;res.setHeader('Content-Type',name.endsWith('.css')?'text/css':'text/javascript');res.end(body);}}));}
  f.indexHtml=()=>f.ctx.webServer.renderIndex('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><link rel="stylesheet" href="/kernel.css"><title>SEP full native UI validation</title></head><body><div id="root"></div><script type="module" src="/kernel.js"></script></body></html>');
  return f;
 }catch(error){await close(f);throw error;}
}
const f=await carrier({pluginGroup:true});try{const workspace=await f.ctx.workspaceRegistry.create(f.dirs.project,'SEP 合成工作区');const created=await f.ctx.sessionController.create({workspaceId:workspace.id,sessionId:'sep-full-ui-live'});const renamed=await f.ctx.sessionController.rename({sessionId:created.sessionId,title:'SEP 合成会话'});const agent=f.ctx.agents.get(created.sessionId);console.log(JSON.stringify({workspace:{id:workspace.id,path:workspace.path},created,renamed,events:agent.session.snapshotEvents(),query:await f.ctx.sessionQuery.listSessions(),list:await f.ctx.sessionController.list({})},null,2));}finally{await close(f);}
