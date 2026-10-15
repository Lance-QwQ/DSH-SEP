import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile,writeFile,mkdir,mkdtemp,access} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {setup,close,load,require} from './full-browser-fixture.mjs';
import {browser,button} from './full-browser-driver.mjs';
const P=resolve(process.env.SEP_PHASE_ROOT),UI='@deepseek-ai/dsh-client-ui-settings-memory';
export async function carrier(business={}){
 const f=await setup({mountRoot:false,business});try{
  const profile=join(f.base,'native-profile');await mkdir(profile);await writeFile(join(profile,'package.json'),JSON.stringify({name:'sep-full-native-test-profile',version:'1.0.0',dsh:{profile:{bundles:[]}}}));await writeFile(join(profile,'cordis.patch.yml'),'[]\n');
  const install=join(f.base,'synthetic-installation');await mkdir(install);const anchor=join(install,'package.json');await writeFile(anchor,JSON.stringify({name:'sep-synthetic-host',private:true,dependencies:{}}));
  const runtime=resolve(process.env.SEP_TEST_NODE),pnpm=resolve(process.env.SEP_TEST_PNPM),B=resolve(process.env.SEP_BUNDLE_BASE);
  await writeFile(join(profile,'.npmrc'),['store-dir='+join(B,'phase1/pnpm-store').replaceAll('\\','/'),'cache-dir='+join(B,'phase4/npm-cache').replaceAll('\\','/'),'ignore-scripts=true','auto-install-peers=false','manage-package-manager-versions=false'].join('\n')+'\n');
  f.profile={name:'sep-full-native-test',dir:profile,patchPath:join(profile,'cordis.patch.yml'),installAnchor:anchor,cwd:f.dirs.project,home:f.base,startedBundles:[],overlays:[{insert:[f.raw]}],telemetryDisabledEnv:'1',packageManager:{command:runtime,args:[pnpm,'--cache-dir',join(B,'phase4/npm-cache'),'--store-dir',join(B,'phase1/pnpm-store'),'--config.ignore-scripts=true','--config.auto-install-peers=false'],env:{XDG_STATE_HOME:join(P,'npm-state'),XDG_CACHE_HOME:join(P,'npm-cache'),npm_config_cache:join(P,'npm-cache'),npm_config_cache_dir:join(B,'phase4/npm-cache'),npm_config_prefer_offline:'true',npm_config_store_dir:join(B,'phase1/pnpm-store'),npm_config_ignore_scripts:'true',npm_config_auto_install_peers:'false'}}};
  f.ctx.provide('profileContext',f.profile);
  for(const name of ['config-editor','settings','commands'])await f.ctx.plugin((await load('@deepseek-ai/dsh-'+name)).default);
  // The install host uses the official pending entry, not a pre-mounted controlled SEP root.
  await f.ctx.plugin((await load('@deepseek-ai/dsh-session-persistence-jsonl')).default,{root:f.dirs.sessions});
  const rows=[f.raw,{id:'full-fs',name:pathToFileURL(require.resolve('@deepseek-ai/dsh-fs-local')).href,config:{cwd:f.dirs.project}}];
  // Adopt the fixture's early transport into the actual root Include tree before HMR.
  // Manual Loader root entries and Include children are distinct identities.
  for(const e of [...f.ctx.loader.entries()].filter(e=>['full-connection','client-modules'].includes(e.options.id))){rows.push(structuredClone(e.options));await e.fiber?.dispose();f.ctx.loader.remove(e.id);}

  const roster=['agent-default-model','client-file-upload','workspace','session-title','session-query-sqlite','typert-registry','api-gateway','api-remotes','api-settings-controller','api-workspace-controller','api-session-controller','client-ui-renderer','client-ui-settings','client-locale','client-shortcuts','client-ui-settings-general','client-ui-theme','client-ui-layout','client-ui-session','client-ui-workspace','client-ui-sidebar','client-ui-conversation','client-resources','client-ui-sidebar-right','client-ui-chat','client-ui-brand-official','client-ui-input-trigger','client-hmr'];
  for(const name of roster){const config=name==='agent-default-model'?{provider:'deepseek-official',model:'deepseek-v4-flash'}:name==='session-title'?{fallbackMaxWords:5,fallbackMaxBytes:40,maxTitleBytes:80}:name==='session-query-sqlite'?{path:':memory:',openAt:'never'}:name==='api-session-controller'?{nativeOpen:false}:name==='api-workspace-controller'?{documentsDirectory:f.dirs.project}:undefined;rows.push({id:'full-'+name,name:pathToFileURL(require.resolve('@deepseek-ai/dsh-'+name)).href,...config?{config}:{}});}
  const readiness=createAppReady();f.ctx.provide('appReady',readiness.service);
  await f.ctx.plugin((await load('@deepseek-ai/cordis-plugin-timer')).default);
  for(const name of ['plugin-manager','host-plugin-inventory','client-ui-plugin-manager'])rows.push({id:'full-'+name,name:pathToFileURL(require.resolve('@deepseek-ai/dsh-'+name)).href,...name==='plugin-manager'?{config:{fallbackRegistries:[],inspectTimeoutMs:5000,idleTimeoutMs:30000}}:name==='client-ui-plugin-manager'?{config:{registryProbeEnabled:false}}:{}});
  f.profile.overlays=[{insert:rows}];const {reconcileProfilePatches,readProfilePatches}=await load('@deepseek-ai/dsh-app-boot');await reconcileProfilePatches(f.ctx,readProfilePatches('dsh',f.profile),'dsh');f.connection=f.ctx.connection;
  f.installLog=[];f.ctx.on('plugin-manager/install-log',chunk=>f.installLog.push(chunk));
  await f.ctx.plugin((await load('@deepseek-ai/dsh-hmr')).default,{root:[],base:undefined});readiness.commit();await f.ctx.hmr.runExclusive(async()=>{});await f.ctx.loader.await();
  const states=[...f.ctx.loader.entries()].filter(e=>e.options.id?.startsWith('full-')).map(e=>({id:e.options.id,state:e.fiber?.state}));assert(states.every(e=>e.state===2),JSON.stringify(states));
  for(const name of ['kernel.js','kernel.css']){const body=await readFile(join(P,'assets',name));f.ctx.effect(()=>f.ctx.webServer.register({kind:'exact',path:'/'+name,handler(req,res){if(!f.connection.authorizeIndex(req,res))return;res.setHeader('Content-Type',name.endsWith('.css')?'text/css':'text/javascript');res.end(body);}}));}
  f.indexHtml=()=>f.ctx.webServer.renderIndex('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><link rel="stylesheet" href="/kernel.css"><title>SEP full native UI validation</title></head><body><div id="root"></div><script type="module" src="/kernel.js"></script></body></html>');
  return f;
 }catch(error){await close(f);throw error;}
}
// Official CLI readiness factory, TypeScript annotations removed for this JS carrier.
function createAppReady() {
  let ready = false
  const listeners = new Set()
  return {
    service: {
      onReady(listener) {
        if (ready) {
          listener()
          return () => {}
        }
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
    },
    commit() {
      if (ready) return
      ready = true
      for (const listener of [...listeners]) listener()
      listeners.clear()
    },
  }
}
