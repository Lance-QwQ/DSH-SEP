// Local operator fixture only. No private bodies or generated config belong in Git.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,cp,readdir} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const phase=process.env.SEP_BUNDLE_TEST_ROOT,host=process.env.SEP_OFFICIAL_HARNESS,repo=process.env.SEP_SOURCE_REPO;
const prepared=JSON.parse(await readFile(join(phase,'PRIVATE-DESKTOP-PREPARED-r1.json'))),working=prepared.working;
const data=JSON.parse(await readFile(join(working,'DESKTOP-PRIVATE-INPUT.json'))),{input,base,dirs,binding}=data;
const sha=b=>createHash('sha256').update(b).digest('hex');
const origins=[];
async function derive(source,out,transform){const before=await readFile(source,'utf8'),edits=[];let value=before;const replace=(from,to)=>{assert.equal(value.split(from).length,2,'DERIVATION_ANCHOR');value=value.replace(from,to);edits.push({from,to});};await transform(replace,before);await writeFile(out,value,{flag:'wx'});origins.push({source,sourceSha256:sha(before),out,resultSha256:sha(value),transforms:edits});}
await writeFile(binding,`import {openVerificationControl,verificationIdentity} from ${JSON.stringify(new URL('./verification-copy.mjs',import.meta.url).href)};const grant={planPath:${JSON.stringify(data.fork.planPath)},expectedPlanHash:${JSON.stringify(data.fork.planHash)}};export const openControl=input=>openVerificationControl({...input,...grant});export const storageIdentity=input=>verificationIdentity({...input,...grant});\n`);
const selectionPath=input.selectionFile,selection=JSON.parse(await readFile(selectionPath));selection.bindings.find(b=>b.path===binding).sha256=sha(await readFile(binding));const selectionBytes=JSON.stringify(selection)+'\n';await writeFile(selectionPath,selectionBytes);
const checks=join(working,'private-profile-checks.mjs');
await derive(join(repo,'tools/alpha2-desktop/private-profile-checks.mjs'),checks,replace=>{
 replace("const saved=await call('memory_save'", "const previousPath=join(input.sessionRoot,'..','synthetic-memory-receipt.json');let previous;try{previous=JSON.parse(await readFile(previousPath));}catch(e){if(e.code!=='ENOENT')throw e;}if(previous){const old=await call('memory_get',{id:previous.id});assert.equal(sha(old.record.text),previous.textHash,'SYNTHETIC_MEMORY_REOPEN_FAILED');}\n const saved=await call('memory_save'");
 replace("assert(saved,'PRIVATE_COPY_SAVE_FAILED');", "assert(saved,'PRIVATE_COPY_SAVE_FAILED');const savedId=saved.record?.id??saved.id;assert.equal(typeof savedId,'string','SYNTHETIC_MEMORY_ID_MISSING');await writeFile(previousPath,JSON.stringify({id:savedId,textHash:sha(text)})+'\\n');");
 replace('memoryReady:true,','memoryReady:true,priorSyntheticMemoryReopened:!!previous,');
});
const probe=join(working,'host-check-plugin.mjs');
await writeFile(probe,`import {check} from ${JSON.stringify(pathToFileURL(checks).href)};import{writeFile}from'node:fs/promises';import{join}from'node:path';export const name='sep-private-desktop-check';export const inject=['suiteEnhancements','sepControlledInstallation','agents','tools','fs','sessionPersistence','sepStorageControl'];export function apply(ctx){const originalFetch=globalThis.fetch;globalThis.fetch=(url,options)=>{const p=new URL(typeof url==='string'||url instanceof URL?url:url.url);if(!['127.0.0.1','localhost','[::1]'].includes(p.hostname))throw Object.assign(Error('PRIVATE_EGRESS_DENIED'),{code:'PRIVATE_EGRESS_DENIED'});return originalFetch(url,options);};let active=false;const handler=m=>{if(m?.type!=='sep-private-desktop-check'||!Number.isSafeInteger(m.round)||active)return;active=true;void(async()=>{try{if(ctx.sepControlledInstallation.status().phase!=='active')throw Error('PRIVATE_PROFILE_NOT_ACTIVE');process.env.SEP_DAILY_PROFILE_CASE=JSON.stringify({...${JSON.stringify(input)},round:m.round});const result=await check(ctx,${JSON.stringify(input.privateCheck)});await writeFile(join(${JSON.stringify(working)},'host-check-'+m.round+'.json'),JSON.stringify({status:'pass',...result})+'\\n');process.send?.({type:'sep-private-desktop-result',round:m.round,status:'pass',result});}catch(error){await writeFile(join(${JSON.stringify(working)},'host-check-error-'+m.round+'.log'),error.stack??error.name);process.send?.({type:'sep-private-desktop-result',round:m.round,status:'fail',code:/^[A-Z][A-Z0-9_]+$/.test(error.code??'')?error.code:'PRIVATE_HOST_CHECK_FAILED'});}finally{active=false;}})();};process.on('message',handler);ctx.effect(()=>()=>{process.off('message',handler);globalThis.fetch=originalFetch;});}\n`);
const patchPath=join(input.profile,'cordis.patch.yml'),patch=JSON.parse(await readFile(patchPath));
const recovery=patch.flatMap(row=>row.insert??[]).find(row=>row.id==='sep-recovery');assert(recovery);recovery.name=pathToFileURL(join(host,'node_modules/@deepseek-ai/dsh-recovery/src/host-plugin.mjs')).href;recovery.config={registerSelectedWorkspaces:true};
patch.push({insert:[{id:'sep-private-desktop-check',name:pathToFileURL(probe).href,config:{}},{id:'sep-brand',name:pathToFileURL(join(host,'node_modules/dsh-sep-brand/lib/index.js')).href,config:{}}]});await writeFile(patchPath,JSON.stringify(patch)+'\n');
const synthetic=JSON.parse(await readFile(join(phase,'MANAGED-DESKTOP-FIXTURE-r5.json'))),config=JSON.parse(await readFile(synthetic.config));
const launcher=join(working,'launcher');await cp(dirname(synthetic.launcher),launcher,{recursive:true});
const managed=join(working,'managed-verification.mjs'),managedSource=join(host,'node_modules/@deepseek-ai/dsh-recovery/src/managed.mjs');
await derive(managedSource,managed,(replace,before)=>{
 for(const m of before.matchAll(/from (['"])(\.\/[^'"]+)\1/g))replace(m[0],`from '${pathToFileURL(resolve(dirname(managedSource),m[2])).href}'`);
 replace("await import(pathToFileURL(join(host.suiteRoot,'src/p2/control.js')).href)",`await import(${JSON.stringify(pathToFileURL(binding).href)})`);
 replace("await import(pathToFileURL(join(host.suiteRoot,'src/p2/storage-location.js')).href)",`await import(${JSON.stringify(pathToFileURL(binding).href)})`);
});
const launcherPath=join(launcher,'launcher.mjs'),launcherBefore=await readFile(launcherPath,'utf8'),from="await load(join(pkg('@deepseek-ai/dsh-recovery'),'src/managed.mjs'))",to=`await load(${JSON.stringify(managed)})`;assert.equal(launcherBefore.split(from).length,2);await writeFile(launcherPath,launcherBefore.replace(from,to));origins.push({source:synthetic.launcher,sourceSha256:sha(launcherBefore),out:launcherPath,resultSha256:sha(launcherBefore.replace(from,to)),transforms:[{from,to}]});
for(const name of ['state','electron-data','runtime-user','runtime-user/temp'])await mkdir(join(working,name),{recursive:true});
await writeFile(join(working,'electron-data/background-close-confirmed'),'synthetic preconfirmed; first notice independently verified\n');
await cp(join(synthetic.base,'runtime'),join(working,'runtime'),{recursive:true});
Object.assign(config,{dailyRoot:working,home:join(working,'dsh-home'),storageRoot:data.fork.storageRoot,controlRoot:join(base,'authority'),lockDirectory:dirs.locks,electronUserData:join(working,'electron-data'),runtimeUser:join(working,'runtime-user'),credentialsPath:join(working,'synthetic.env'),projects:[{id:selection.configuration.runtime.profile.selection.projectId,root:input.project}],dailySelectionPath:selectionPath,dailySelectionSha256:sha(selectionBytes),profileRoot:input.profile,desktopPayloadPath:join(working,'desktop-payload.json')});
await cp(JSON.parse(await readFile(synthetic.config)).desktopPayloadPath,config.desktopPayloadPath);await writeFile(config.credentialsPath,'DEEPSEEK_API_KEY=synthetic-not-a-real-key\n');await writeFile(join(working,'deployment.json'),JSON.stringify(config,null,2)+'\n');
await writeFile(join(working,'DESKTOP-ORIGINS.json'),JSON.stringify({origins,productionGraphUnchanged:true,verificationOnly:true},null,2)+'\n');
await writeFile(join(phase,'PRIVATE-DESKTOP-FIXTURE-r1.json'),JSON.stringify({working,launcher:launcherPath,config:join(working,'deployment.json'),planHash:prepared.planHash,productionEntry:'lib/main.js',privateCopiesOnly:true},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:'prepared-not-run',working,productionEntry:'lib/main.js'}));
