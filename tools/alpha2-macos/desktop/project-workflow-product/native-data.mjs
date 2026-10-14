// TEST ONLY. Synthetic staging happens only after the actual prior launcher has
// confirmed closed. It reopens the one same Profile, never an alternate store.
import assert from 'node:assert/strict';import {readFile,writeFile,mkdir,realpath} from 'node:fs/promises';import {join,dirname} from 'node:path';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
import {loadProgram} from '../managed-broker/program-manifest.mjs';
import {fixtureResourcesUnknown} from './native-contract.mjs';
const sha=v=>createHash('sha256').update(v).digest('hex'),original='original\n',committed='committed fixture\n',candidate='candidate fixture\n';
async function save(input,name,r){await writeFile(join(input.outputRoot,name),JSON.stringify(r,null,2)+'\n',{flag:'wx',mode:0o600});}
async function closed(input){const state=JSON.parse(await readFile(join(input.dataRoot,'launcher/generation.json'),'utf8'));assert.equal(state.phase,'closed');assert.equal(state.resourcesConfirmedReleased,true);assert(/^[a-f0-9]{32}$/.test(state.generation));return state;}
async function setup(input){
 assert.equal(process.platform,'darwin');assert.equal(process.arch,'arm64');assert([1,2].includes(input.round));assert.equal(await realpath(input.dataRoot),input.dataRoot);
 const p=await loadProgram(input.programPath,input.programSha256),runtime=join(p.root,'Resources/product/runtime'),businessRoot=join(input.dataRoot,'business'),source=join(input.dataRoot,'project'),module=path=>import(pathToFileURL(join(runtime,path)));
 return{p,runtime,businessRoot,source,module};
}
async function withExisting(input,config,work){
 let project,profile,body,error,receipt;
 try{
  const {openWorkflowProject}=await config.module('project-workflow/project-factory.mjs'),{wrapManagedProject}=await config.module('project-workflow/derived-lifecycle.mjs'),{createControlledFileProfile}=await config.module('profile/controlled-files.mjs');
  project=wrapManagedProject(await openWorkflowProject({root:join(config.businessRoot,'managed'),source:config.source,helperPath:config.p.entries.helper.path,helperSha256:config.p.entries.helper.sha256}));
  const exec={signal:new AbortController().signal};profile=await createControlledFileProfile({project,source:config.source,authorize:async value=>{assert.equal(value,exec);return{sessionId:'project-native-fixture',depth:0,cwd:config.source};}});body=await work({project,profile,exec});
 }catch(e){error=e;}
 finally{
  try{receipt=profile?await profile.controller.close():project?await project.close():{status:'pass',resourcesConfirmedReleased:true};if(receipt.status==='pass'&&receipt.resourcesConfirmedReleased===true)await (profile?.controller.whenClosed()??project?.whenClosed());}catch{receipt={status:'blocked',resourcesConfirmedReleased:false};}
  if(fixtureResourcesUnknown(error))receipt={status:'blocked',resourcesConfirmedReleased:false,code:error.code};
  await save(input,'FIXTURE-CLEANUP-'+(input.round===2&&!input.finishing?'stage':'inspect')+'.json',{status:receipt.status,receipt,forcedTermination:false});
 }
 if(receipt.status!=='pass'||receipt.resourcesConfirmedReleased!==true)throw Object.assign(Error('SEP_PROJECT_NATIVE_FIXTURE_BLOCKED'),{code:'SEP_PROJECT_NATIVE_FIXTURE_BLOCKED',resourcesUnknown:true});if(error)throw error;return body;
}
export async function prepareProjectRound(input){
 const c=await setup(input);if(input.round===1){await mkdir(c.source,{mode:0o700});await writeFile(join(c.source,'a.txt'),original,{flag:'wx',mode:0o600});return{status:'pass',kind:'fresh synthetic source',sourceSha256:sha(original),expectedGeneration:1};}
 const prior=await closed(input),recordBytes=await readFile(join(c.businessRoot,'PROFILE.json')),record=JSON.parse(recordBytes);assert.equal(record.source,c.source);assert.equal(record.managed,join(c.businessRoot,'managed'));assert.equal(record.dataRoot,c.businessRoot);assert.deepEqual(await readFile(join(c.source,'a.txt')),Buffer.from(original));
 const protectedPaths=['PROFILE.json','profile-authority/READY.json','budget/ledger.json'],protectedInputs=[];for(const path of protectedPaths)protectedInputs.push({path,sha256:sha(await readFile(join(c.businessRoot,path)))});
 const staged=await withExisting(input,c,async({project,profile,exec})=>{
  assert.equal((await project.current()).generation,1);assert.equal((await profile.controller.plans()).length,0);
  await profile.execute('read',{file_path:'a.txt'},exec);await profile.execute('write',{file_path:'a.txt',content:committed},exec);const reviewed=await profile.controller.review();await profile.controller.commit({planHash:reviewed.planHash});
  assert.equal((await project.current()).generation,2);await profile.execute('read',{file_path:'a.txt'},exec);await profile.execute('write',{file_path:'a.txt',content:candidate},exec);const plans=await profile.controller.plans();assert.equal(plans.length,1);
  return{status:'pass',syntheticTrustedSetupCommit:true,uiCommit:false,expectedGeneration:2,planHash:plans[0].planHash};
 });
 // Reconstruct only the exact former overlay at the same installation paths.
 // The first real product run supplied the prior clean generation and ledger.
 const layoutInput={programRoot:record.programRoot,hostRoot:record.hostRoot,bundleRoot:record.bundleRoot,dataRoot:record.dataRoot,projectRoot:record.source,helperPath:record.helperPath,helperSha256:record.helperSha256,attachmentHelperPath:record.attachmentHelperPath,attachmentHelperSha256:record.attachmentHelperSha256,parser:record.parser,initialize:false,shutdownMs:record.shutdownMs};
 const previous=(await c.module('document-business/profile-layout.mjs')).businessLayout(layoutInput),next=(await c.module('desktop/project-workflow-product/profile-layout.mjs')).businessLayout(layoutInput),oldText=JSON.stringify(previous.patch,null,2)+'\n',newText=JSON.stringify(next.patch,null,2)+'\n',path='home/profiles/desktop/cordis.patch.yml';
 assert.equal((await readFile(join(c.businessRoot,path))).toString(),newText);const {createProjectTree}=await c.module('apfs-tree/project-tree.mjs');await createProjectTree({helperPath:c.p.entries.helper.path,helperSha256:c.p.entries.helper.sha256,lockPath:join(c.businessRoot,'.native.lock')}).applyFile(c.businessRoot,{path,expectedSha256:sha(newText),text:oldText});
 for(const row of protectedInputs)assert.equal(sha(await readFile(join(c.businessRoot,row.path))),row.sha256,row.path);
 const result={...staged,sourceSha256:sha(original),profileSha256:sha(recordBytes),protectedInputs,priorGeneration:prior.generation,overlayMigration:{syntheticFormerOverlay:true,oldSha256:sha(oldText),newSha256:sha(newText)}};await save(input,'PREPARATION.json',result);return result;
}
export async function finishProjectRound(input,preparation){
 await closed(input);const c=await setup(input);assert.equal(sha(await readFile(join(c.source,'a.txt'))),preparation.sourceSha256);const profileSha256=sha(await readFile(join(c.businessRoot,'PROFILE.json')));
 if(input.round===2){assert.equal(profileSha256,preparation.profileSha256);assert.equal(sha(await readFile(join(c.businessRoot,'home/profiles/desktop/cordis.patch.yml'))),preparation.overlayMigration.newSha256);for(const row of preparation.protectedInputs)assert.equal(sha(await readFile(join(c.businessRoot,row.path))),row.sha256,row.path);}
 const result=await withExisting({...input,finishing:true},c,async({project,profile})=>{const current=await project.current();assert.equal(current.generation,preparation.expectedGeneration);assert.equal(await readFile(join(current.path,'a.txt'),'utf8'),input.round===1?original:committed);assert.equal((await profile.controller.plans()).length,0);return{status:'pass',generation:current.generation,sourceUnchanged:true,profileSha256,noPendingPlan:true};});
 return result;
}
