import {readFile} from 'node:fs/promises';import {join} from 'node:path';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
import {boundedRead} from '../../business/bounded-read.mjs';import {createProjectTree} from '../../apfs-tree/project-tree.mjs';import {migrateOverlay} from './overlay.mjs';
const source=new URL('../../document-business/profile-layout.mjs',import.meta.url),pin='4820b2258bfe18e1b1ef3e832bfee1db615fe415567fd8070e15804b8a33d840';if(createHash('sha256').update(await readFile(source)).digest('hex')!==pin)throw Error('SEP_PROJECT_PRODUCT_ORIGIN');
const original=await import(source);
export function businessLayout(input){
 const value=original.businessLayout(input),patch=structuredClone(value.patch),insert=patch.find(row=>Array.isArray(row.insert))?.insert,profile=insert?.find(row=>row.id==='mac-controlled');
 if(!profile||profile.name!==new URL('../../business/profile-plugin.mjs',import.meta.url).href||insert.some(row=>row.id==='mac-current-project-ui'))throw Error('SEP_PROJECT_PRODUCT_LAYOUT');
 profile.name=new URL('./profile-plugin.mjs',import.meta.url).href;insert.push({id:'mac-current-project-ui',name:pathToFileURL(join(input.hostRoot,'node_modules/@dsh-sep/current-project-ui/lib/index.js')).href});
 return {...value,patch};
}
export async function initializeBusinessProfile(input){
 const candidate=businessLayout(input),previous=original.businessLayout(input),record=await original.initializeBusinessProfile(input);
 const path='home/profiles/desktop/cordis.patch.yml',io=createProjectTree({helperPath:input.helperPath,helperSha256:input.helperSha256,lockPath:join(input.dataRoot,'.native.lock')});
 await migrateOverlay({previous:JSON.stringify(previous.patch,null,2)+'\n',next:JSON.stringify(candidate.patch,null,2)+'\n',read:async()=>String(await boundedRead(join(input.dataRoot,path),{maxBytes:1048576})),compareSwap:value=>io.applyFile(input.dataRoot,{path,...value})});
 return record;
}
export const completeBusinessInitialization=original.completeBusinessInitialization;
