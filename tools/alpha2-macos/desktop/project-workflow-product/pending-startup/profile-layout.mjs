import {join} from 'node:path';
import {frozen} from '../../../document-business/derive.mjs';
import {boundedRead} from '../../../business/bounded-read.mjs';
import {createProjectTree} from '../../../apfs-tree/project-tree.mjs';
import {migrateOverlay} from '../overlay.mjs';
const oldFile=new URL('../profile-layout.mjs',import.meta.url),documentFile=new URL('../../../document-business/profile-layout.mjs',import.meta.url);
await frozen(oldFile,'1de544f372f2540d6681999610678146aa6b4b16dd1a984d9f56de5a79d2d4f5');
await frozen(documentFile,'4820b2258bfe18e1b1ef3e832bfee1db615fe415567fd8070e15804b8a33d840');
const old=await import(oldFile),document=await import(documentFile),text=value=>JSON.stringify(value,null,2)+'\n';
export function businessLayout(input){
 const original=old.businessLayout(input),patch=structuredClone(original.patch),rows=patch.find(x=>Array.isArray(x.insert))?.insert;
 for(const [id,before,after]of [['mac-controlled',new URL('../profile-plugin.mjs',import.meta.url).href,new URL('./profile-plugin.mjs',import.meta.url).href],['mac-sep-business',new URL('../../../document-business/runtime.mjs',import.meta.url).href,new URL('./runtime.mjs',import.meta.url).href]]){
  const matches=rows?.filter(x=>x.id===id);if(matches?.length!==1||matches[0].name!==before)throw Object.assign(Error('SEP_PENDING_LAYOUT'),{code:'SEP_PENDING_LAYOUT'});matches[0].name=after;
 }
 return {...original,patch};
}
/** Exact known predecessor bytes only; compareSwap remains the native CAS. */
export async function migrateKnownOverlay(input,{read,compareSwap}){
 const current=await read(),next=text(businessLayout(input).patch),predecessors=[text(old.businessLayout(input).patch),text(document.businessLayout(input).patch)];
 const previous=predecessors.find(value=>value===current)??predecessors[0];
 return migrateOverlay({read,compareSwap,previous,next});
}
export async function initializeBusinessProfile(input){
 // The immutable document initializer validates PROFILE/READY and creates the
 // original baseline for a fresh directory. It never accepts a new binding.
 businessLayout(input);const record=await document.initializeBusinessProfile(input),path='home/profiles/desktop/cordis.patch.yml';
 const io=createProjectTree({helperPath:input.helperPath,helperSha256:input.helperSha256,lockPath:join(input.dataRoot,'.native.lock')});
 await migrateKnownOverlay(input,{read:async()=>String(await boundedRead(join(input.dataRoot,path),{maxBytes:1048576})),compareSwap:value=>io.applyFile(input.dataRoot,{path,...value})});return record;
}
export const completeBusinessInitialization=document.completeBusinessInitialization;
