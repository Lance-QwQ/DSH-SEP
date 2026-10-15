import {EntryTree} from '@deepseek-ai/cordis-plugin-loader';

export const name='dsh-sep-native-settings-ui';
export const inject=['loader','clientModules','connection'];
export const provide=['sepNativeSettingsUi'];
const UI='@deepseek-ai/dsh-client-ui-settings-memory';
const fail=code=>{throw Object.assign(new Error(code),{code});};

/** Memory-only child tree. The trusted caller owns the outer Loader row. */
class OwnedTree extends EntryTree{write(){}}
export function assertOwner(ctx){
 if(!ctx.fiber?.entry)fail('SEP_NATIVE_UI_LOADER_ENTRY_REQUIRED');
 if(ctx.fiber.entry.subtree||ctx.fiber.entry.subgroup||ctx.get('sepNativeSettingsUi')||ctx.clientModules.clientPath(UI))fail('SEP_NATIVE_UI_OWNER_CONFLICT');
}
export async function apply(ctx,config){
 assertOwner(ctx);
 const entry=ctx.fiber.entry,priorGroup=entry.subgroup,tree=new OwnedTree(ctx);
 const closed=Promise.withResolvers();let phase='preparing',finishing,child;
 const status=()=>({phase,resourcesRetained:phase!=='closed'});
 async function close(){
  if(phase==='closed')return status();
  if(finishing)return finishing;
  finishing=(async()=>{
   if(entry.subtree!==tree||entry.subgroup!==tree.root)fail('SEP_NATIVE_UI_OWNER_CHANGED');
   phase='draining';
   await child?.fiber?.dispose();
   // Recheck after the await. Never detach a replacement owner's tree.
   if(entry.subtree!==tree||entry.subgroup!==tree.root)fail('SEP_NATIVE_UI_OWNER_CHANGED');
   tree.root.stop();
   delete entry.subtree;
   if(priorGroup===undefined)delete entry.subgroup;else entry.subgroup=priorGroup;
   phase='closed';closed.resolve();return status();
  })().finally(()=>{finishing=undefined;});return finishing;
 }
 ctx.provide('sepNativeSettingsUi',Object.freeze({status,close,whenClosed:()=>closed.promise}));
 // Fiber disposal deliberately retains ownership when close cannot prove it.
 // The outer entry reports a bounded blocked receipt and permits close retry.
 ctx.effect(()=>async()=>{try{await close();}catch{}await closed.promise;});
 try{
  const id=await tree.create({id:'sep-native-settings',name:new URL('../modules/ui-settings-memory/lib/index.js',import.meta.url).href,config});
  child=ctx.loader.resolve(id);await tree.await();
  if(child?.fiber?.state!==2||!ctx.clientModules.clientPath(UI))fail('SEP_NATIVE_UI_UNAVAILABLE');
  phase='ready';
 }catch(error){await close();throw error;}
}
