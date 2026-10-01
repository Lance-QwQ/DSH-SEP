/** Real SEP services scoped to one SDK snapshot workspace. */
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openService} from '../../../packages/sep/recovery/src/server.mjs';
import * as recoveryHost from '../../../packages/sep/recovery/src/host-plugin.mjs';
import * as suite from '../../../packages/sep/system-enhancement-package/src/index.js';
import * as safeChange from '../../../packages/sep/system-enhancement-package/src/sep-safe-change/index.js';
export const name='sep-safe-change-snapshot-runtime';
export const inject=['tools','fs','systemPrompt','sandboxPolicy','storageDomain'];
/** @param {import('@deepseek-ai/cordis').Context} ctx - Scenario-owned context. */
export async function apply(ctx){
 const root=process.cwd(),state=join(root,'.dsh','sep-snapshot');await mkdir(state,{recursive:true});
 const controlRoot=await mkdtemp(join(tmpdir(),'sep-snapshot-recovery-'));
 const service=await openService({controlRoot});
 ctx.effect(()=>async()=>{await service.close();await rm(controlRoot,{recursive:true,force:true});});
 if(!service.controller)throw Error('Snapshot recovery controller did not acquire its own journal');
 const project=await service.controller.addProject({root});
 await ctx.plugin(recoveryHost,service.hostConnection);
 await ctx.plugin(suite,{enabled:true,lockDirectory:join(state,'locks'),projects:[{root,sources:['.'],recoveryProjectId:project.id}],recovery:{enabled:true},modules:{rag:false,memory:false,media:false}});
 await ctx.plugin(safeChange,{enabled:true,projects:[{root,sources:['.'],recoveryProjectId:project.id}],recoveryEnabled:true});
}

