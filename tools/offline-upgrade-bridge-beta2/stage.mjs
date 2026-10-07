import{readFile,writeFile,mkdir,lstat,realpath,copyFile,symlink,readdir}from'node:fs/promises';
import{join,resolve,dirname,relative,isAbsolute}from'node:path';import{pathToFileURL}from'node:url';import{createHash}from'node:crypto';
import{assertAdmission,verifyExactGraph}from'./operator/exact-contract.mjs';
const root=import.meta.dirname,sha=b=>createHash('sha256').update(b).digest('hex'),json=async p=>JSON.parse(await readFile(p));
const demand=(v,c)=>{if(!v)throw Object.assign(Error(c),{code:c});},key=p=>resolve(p).toLowerCase();
const inside=(a,b)=>{const rel=relative(a,b);return rel===''||!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..\\')&&!rel.startsWith('../');};
/** Admit only the two embedded base contracts; candidate code is loaded after graph audit. */
export async function stageInstallation({installationRoot,workRoot,targetRoot,signal}={}){
 demand(process.platform==='win32'&&process.arch==='x64','BRIDGE_PLATFORM_UNSUPPORTED');
 for(const p of [installationRoot,workRoot,targetRoot])demand(typeof p==='string'&&isAbsolute(p),'BRIDGE_ABSOLUTE_PATH_REQUIRED');
 const installation=await json(join(installationRoot,'deployment-rc2.json'));demand(key(installation.dailyRoot)===key(installationRoot),'BRIDGE_INSTALLATION_ROOT');
 const pairs=await json(join(root,'contracts/PAIRS.json')),pair=pairs.find(p=>p.baseGraphHash===installation.graphHash);demand(pair,'EXACT_BASELINE');
 const admission=assertAdmission({schema:1,kind:'exact-same-host-adaptation-input',hostVersion:'0.2.0-rc.2',fromSepVersion:'0.2.1-beta.1',sepVersion:'0.2.1-beta.2',...pair});
 await (await import('./integrity.mjs')).verifyBundle();signal?.throwIfAborted();
 const op=await import('./operator/offline.mjs'),{auditInstalledGraph}=await import('./operator/shared/sep-update/runtime/audit-graph.mjs'),{fileHash}=await import('./operator/shared/sep-update/update-inventory.mjs'),{planProfiles,writeProfiles,preserveAdditionalAliases}=await import('./profiles.mjs');
 await op.assertInstallationIdle(installation,[]);await op.verifySelectedInstallation(installation);
 for(const p of [installationRoot,dirname(workRoot),dirname(targetRoot)])demand(key(await realpath(p))===key(p),'BRIDGE_PATH_ALIAS');
 demand(!inside(installation.releaseRoot,targetRoot)&&!inside(targetRoot,installation.releaseRoot)&&!inside(workRoot,targetRoot)&&!inside(targetRoot,workRoot),'BRIDGE_PATH_OVERLAP');
 for(const field of ['home','storageRoot','controlRoot','electronUserData','runtimeUser'])for(const p of [workRoot,targetRoot])demand(!inside(installation[field],p)&&!inside(p,installation[field]),'BRIDGE_PRIVATE_PATH_OVERLAP');
 for(const p of [workRoot,targetRoot]){let exists;try{await lstat(p);exists=true}catch(e){if(e.code!=='ENOENT')throw e}demand(!exists,'BRIDGE_DESTINATION_EXISTS');}
 const dir=join(root,'contracts',pair.label),beforeBytes=await readFile(join(installation.releaseRoot,'graph.json')),afterBytes=await readFile(join(dir,'after-graph.json')),contractBytes=await readFile(join(dir,'exact-changes.json'));
 demand(sha(beforeBytes)===pair.baseGraphHash&&sha(afterBytes)===pair.targetGraphHash&&sha(contractBytes)===pair.contractSha256,'BRIDGE_GRAPH_BINDING');
 const before=JSON.parse(beforeBytes),after=JSON.parse(afterBytes),contract=JSON.parse(contractBytes);verifyExactGraph(before,after,contract);
 await auditInstalledGraph(installation.releaseRoot,pair.baseGraphHash);const profiles=await planProfiles({currentRoot:installation.releaseRoot,targetRoot,oldGraph:before,graph:after});
 const selectorSha256=await fileHash(join(installationRoot,'deployment-rc2.json'));const changes=new Map(contract.changes.map(c=>[c.path,c]));
 for(const c of changes.values())demand(await fileHash(join(root,'payload',c.after.sha256))===c.after.sha256,'BRIDGE_PAYLOAD_CHANGED');
 signal?.throwIfAborted();await mkdir(workRoot);await mkdir(targetRoot);
 for(const f of after.files){signal?.throwIfAborted();const dest=join(targetRoot,f.path),source=changes.has(f.path)?join(root,'payload',f.sha256):join(installation.releaseRoot,f.path);await mkdir(dirname(dest),{recursive:true});await copyFile(source,dest,1);}
 for(const[dir,deps]of[[targetRoot,after.roots],...after.packages.map(p=>[join(targetRoot,'store',p.id),p.dependencies])])for(const[name,id]of Object.entries(deps??{})){signal?.throwIfAborted();const dest=join(dir,'node_modules',name);await mkdir(dirname(dest),{recursive:true});await symlink(join(targetRoot,'store',id),dest,'junction');}
 await writeFile(join(targetRoot,'graph.json'),afterBytes,{flag:'wx'});const profileRecords=await writeProfiles(profiles),additionalAliases=await preserveAdditionalAliases(installation.releaseRoot,targetRoot,after);
 await auditInstalledGraph(targetRoot,pair.targetGraphHash);await auditInstalledGraph(installation.releaseRoot,pair.baseGraphHash);await op.verifySelectedInstallation(installation);await op.assertInstallationIdle(installation,[]);await (await import('./integrity.mjs')).verifyBundle();
 demand(await fileHash(join(installationRoot,'deployment-rc2.json'))===selectorSha256,'BRIDGE_SELECTOR_CHANGED');signal?.throwIfAborted();
 const result={schema:1,status:'staged-not-selected',oldRoot:installation.releaseRoot,newRoot:targetRoot,oldGraphHash:pair.baseGraphHash,graphHash:pair.targetGraphHash,targetGraphHash:pair.targetGraphHash,changedFiles:contract.changes.length,profiles:profileRecords,additionalAliases,selectorSha256,installation,admission,label:pair.label,workRoot,scope:'Create-only program staging. No business data copied and no selector changed. Preparation, exact report consent and P2 publication are still required.'};
 await writeFile(join(workRoot,'STAGED.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});return result;
}
