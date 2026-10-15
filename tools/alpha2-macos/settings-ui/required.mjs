import {verifySettingsUi,settingsPackage} from './adapter.mjs';
import {openSettingsClient} from './transport.mjs';
const fail=code=>{throw Object.assign(Error(code),{code});};
/** Loader state and the actual composed browser graph; host HTTP readiness alone is insufficient. */
export function inspectSettingsMount(ctx,{entryId,entryUrl,clientPath}){
 const rows=[...ctx.loader.entries()].filter(e=>e.options.id===entryId);
 if(rows.length!==1||rows[0].disabled||rows[0].options.disabled===true||rows[0].options.name!==entryUrl||rows[0].fiber?.state!==2)fail('SEP_MAC_SETTINGS_NOT_MOUNTED');
 const modules=ctx.get?.('clientModules')??ctx.clientModules,graph=modules?.graph(),entries=graph?.entries?.filter(e=>e.id===settingsPackage);
 if(entries?.length!==1||modules.clientPath(settingsPackage)!==clientPath||typeof entries[0].url!=='string')fail('SEP_MAC_SETTINGS_CLIENT_MISSING');
 const injection=ctx.webServer.collectIndexInjections().filter(r=>r.kind==='global'&&r.name==='__DSH_BOOT__');
 if(injection.length!==1||!injection[0].value.entries.some(e=>e.id===settingsPackage&&e.url===entries[0].url))fail('SEP_MAC_SETTINGS_CLIENT_MISSING');
 return {clientUrl:entries[0].url};
}
/** Mandatory startup gate after business activation, before exposing ready. No writes or paid calls. */
export async function assertSettingsMounted(ctx,{entryId='mac-sep-settings',hostRoot}){
 const adapter=await verifySettingsUi({hostRoot}),mount=inspectSettingsMount(ctx,{entryId,...adapter});
 const client=await openSettingsClient(ctx.connection.authenticatedUrl('http://127.0.0.1:'+ctx.webServer.port));
 const memory=await client.request('sep-memory/list',{}),budget=await client.request('sep-budget/list',{});
 if(memory.available!==true||budget.available!==true)fail('SEP_MAC_SETTINGS_SERVICE_UNAVAILABLE');
 const content=await client.resource(mount.clientUrl);
 if(!content.includes(settingsPackage)||!content.includes('sep-memory')||!content.includes('sep-budget'))fail('SEP_MAC_SETTINGS_CLIENT_MISSING');
 return Object.freeze({status:'pass',fiberActive:true,clientAdvertised:true,staticClientServed:true,memoryAvailable:true,budgetAvailable:true});
}
