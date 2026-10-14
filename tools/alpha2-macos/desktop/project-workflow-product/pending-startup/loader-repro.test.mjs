import test from 'node:test';import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {setup,ok,origin} from './loader-fixture.mjs';
import {createControlledFileProfile} from '../../../profile/controlled-files.mjs';
import {openTrustedProject} from '../../../project-workflow/derived-transaction-store.mjs';
import {openWorkflowProject} from '../../../project-workflow/project-factory.mjs';
import {wrapManagedProject} from '../../../project-workflow/derived-lifecycle.mjs';
import {createProjectTree} from '../../../apfs-tree/project-tree.mjs';
import {macDocumentAuthority} from '../../../business/documents.mjs';
import {owned} from '../../../business/bundle-modules.mjs';
import {load} from '../../../business/host-modules.mjs';
const {openControl}=await owned('modules/system-enhancement-package/src/p2/control.js');
const {createUserMessage}=await load('@deepseek-ai/dsh-llm');
const output=process.env.SEP_PENDING_REPRO_OUTPUT;assert(output);await mkdir(output,{recursive:true,mode:0o700});
const sha=b=>createHash('sha256').update(b).digest('hex');
test('real Loader can reopen a pending project without selecting it or granting body access',async()=>{
 const result={schema:1,status:'fail',scope:process.env.SEP_PENDING_NATIVE==='1'?'real official Loader + same P2 + production Mac workflow factory, parser and cold attachments; not full AppKit/Electron application proof':'real official Loader + same P2 + native project helper; POSIX reproduction is not full Mac application proof',origin,paidCalls:0};let first,second,control,project,profile,failure;
 try{
  first=await setup({loader:true});ok(await first.call('read',{file_path:'data.txt'}));ok(await first.call('write',{file_path:'data.txt',content:'pending synthetic candidate'}));
  const plans=await first.ctx.sepMacProfile.plans();assert.equal(plans.length,1);result.planHash=plans[0].planHash;assert.equal(first.providerCalls(),0);await first.close();result.firstClosed=true;
  control=await openControl({storageRoot:first.memory,initialize:false,recoverDocumentDeletion:true});await control.recoverDocumentDeletions();const helperPath=process.env.SEP_MAC_TREE_HELPER,helperSha256=sha(await readFile(helperPath));
  project=wrapManagedProject(await(process.platform==='darwin'?openWorkflowProject({root:first.root,source:first.source,helperPath,helperSha256}):openTrustedProject({root:first.root,source:first.source,io:createProjectTree({helperPath,helperSha256,lockPath:join(first.root,'.native.lock')})})));
  await project.bindDocumentAuthority(macDocumentAuthority(control,first.source));profile=await createControlledFileProfile({project,source:first.source,authorize:async()=>{throw Error('Model execution forbidden');}});
  assert.equal((await profile.controller.plans()).length,1);assert.equal((await profile.controller.current()).generation,1);
  await assert.rejects(profile.controller.withDocumentView(()=>assert.fail('body view admitted')),{code:'SEP_MAC_RESTART_REVIEW_REQUIRED'});result.pendingBodyAccessRejected=true;
  assert.equal((await profile.controller.close()).resourcesConfirmedReleased,true);await profile.controller.whenClosed();profile=undefined;project=undefined;await control.close();control=undefined;result.intermediateOwnersClosed=true;
  try{second=await setup({loader:true,base:first});result.secondRuntimePresent=!!second.api;}catch(e){failure=e;result.originalCause={code:e.code??'ASSERTION',...(e.diagnostic??{})};}
  assert.equal(!!failure,false,JSON.stringify(result.originalCause));assert.equal(second.api.status().phase,'active');assert.equal(second.api.status().reviewRequired,true);assert.equal(second.api.status().bodyAdmissionOpen,false);
  const memory=await second.ctx.suiteEnhancements.memorySettings.list({}),budget=await second.ctx.suiteEnhancements.budgetSettings.list({});assert.equal(memory.available,true);assert.equal(budget.available,true);result.settingsAvailable=true;
  const ledger=JSON.parse(await readFile(second.budgetPath));await second.ctx.suiteEnhancements.budgetSettings.updateDefault({limitCny:40,expectedRevision:budget.defaults.revision});assert.deepEqual(JSON.parse(await readFile(second.budgetPath)).entries,ledger.entries);result.ledgerPreserved=true;
  result.bodyRejections=[];for(const name of ['read','suite_memory_recall','suite_memory_get','suite_memory_export','suite_index','suite_delegate']){const response=await second.call(name,name==='read'?{file_path:'data.txt'}:name==='suite_memory_recall'?{query:'synthetic'}:name==='suite_memory_get'?{id:'synthetic'}:name==='suite_delegate'?{tasks:[{label:'synthetic',prompt:'do not dispatch'}]}:{});assert.equal(response.isError,true);assert.match(JSON.stringify(response.error),/\bSEP_MAC_RESTART_REVIEW_REQUIRED\b/);result.bodyRejections.push({name,code:'SEP_MAC_RESTART_REVIEW_REQUIRED'});}
  assert.throws(()=>second.api.stream({}),{code:'SEP_MAC_RESTART_REVIEW_REQUIRED'});
  await assert.rejects(async()=>{for await(const _part of second.ctx.llm.stream({provider:'deepseek-official',model:'deepseek-v4-flash',maxTokens:64,messages:[],tools:[],signal:new AbortController().signal})){}},{code:'SEP_MAC_RESTART_REVIEW_REQUIRED'});
  second.agent.followup(createUserMessage({content:[{type:'text',text:'synthetic blocked request'}],source:{kind:'user'}}));await second.agent.whenIdle();assert(second.agentErrors.some(e=>(e.code??e.message)==='SEP_MAC_RESTART_REVIEW_REQUIRED'));
  assert.equal(second.providerCalls(),0);result.modelCalls=0;result.bodyToolsRejected=true;result.agentRequestRejected=true;
  if(process.env.SEP_PENDING_NATIVE==='1'){assert.equal(second.api.status().parser.admissionOpen,true);for(const [name,args]of [['suite_extract',{path:'data.txt'}],['suite_vision',{path:'data.txt',question:'synthetic forbidden'}]]){const response=await second.call(name,args);assert.equal(response.isError,true);assert.match(JSON.stringify(response.error),/\bSEP_MAC_RESTART_REVIEW_REQUIRED\b/);}result.parserAndVisionBodyRejected=true;}
  const identity=await second.ctx.sepMacProfile.startupIdentity();assert.deepEqual(Object.keys(identity).sort(),['generation','needsSelection','pendingPlanHashes','selectedPlanHash','sequence','sha256','version']);assert.equal(identity.needsSelection,true);assert.deepEqual(identity.pendingPlanHashes,[result.planHash]);result.metadataIdentityBound=true;
  const bridge=await second.ctx.sepMacProfile.openCurrentProject({nonce:'a'.repeat(64),programSha256:'b'.repeat(64),ownerGeneration:'synthetic-owner'}),document={windowId:1,documentGeneration:'synthetic-document'};
  await bridge.request('bind',document);const status=await bridge.request('status',{document,input:{}});assert(status.bytes>0);
  await bridge.request('select',{document,input:{planHash:result.planHash}});const preview=await bridge.request('review',{document,input:{planHash:result.planHash}});assert(preview.bytes>0);result.privateReviewReachable=true;
  assert.equal(second.api.status().reviewRequired,false);assert.equal(second.api.status().bodyAdmissionOpen,true);assert.equal(second.providerCalls(),0);result.status='pass';
 }finally{
  if(second){await second.close();assert.equal(second.api.status().phase,'closed');if(process.env.SEP_PENDING_NATIVE==='1')assert.equal(second.api.status().parser.resourcesConfirmedReleased,true);result.runtimeClosed=true;}if(first&&!result.firstClosed)await first.close();if(profile){const r=await profile.controller.close();assert.equal(r.resourcesConfirmedReleased,true);await profile.controller.whenClosed();}else if(project){const r=await project.close();assert.equal(r.resourcesConfirmedReleased,true);await project.whenClosed();}if(control)await control.close();
  // A fresh P2 lease is evidence that the failed Loader released its P2 owner.
  if(first){const check=await openControl({storageRoot:first.memory,initialize:false,recoverDocumentDeletion:true});await check.assertOwned();await check.close();result.p2LeaseReacquired=true;assert.equal(await readFile(join(first.source,'data.txt'),'utf8'),'original');result.originalSourceUnchanged=true;}
  await writeFile(join(output,'LOADER-REPRO.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
 }
});
test('real activation fingerprint binds ledger and explicit plan selection; discard and close preserve gates',async()=>{
 let first,second;const result={schema:1,status:'fail'};
 try{
  first=await setup({loader:true});ok(await first.call('read',{file_path:'data.txt'}));ok(await first.call('write',{file_path:'data.txt',content:'fingerprint pending'}));const [candidate]=await first.ctx.sepMacProfile.plans();await first.close();
  // The fixture creates an agent before returning. Disable only its optional
  // native-compaction activation in this fingerprint-specific test; test 1
  // covers the real compaction entry during normal activation before agents.
  second=await setup({loader:true,base:first,activate:false,runtimeOptions:{compaction:undefined}});const carrier=second.ctx.sepMacProfile,plan=await second.api.review(),ledger=JSON.parse(await readFile(second.budgetPath));
  ledger.initialSpent=2;await writeFile(second.budgetPath,JSON.stringify(ledger));await assert.rejects(second.api.activate({planHash:plan.planHash}),{code:'SEP_MAC_PLAN_CHANGED'});result.ledgerChangeRejected=true;
  const beforeSelection=await second.api.review();await carrier.resume({planHash:candidate.planHash});await assert.rejects(second.api.activate({planHash:beforeSelection.planHash}),{code:'SEP_MAC_PLAN_CHANGED'});result.selectionChangeRejected=true;
  const current=await second.api.review();await second.api.activate({planHash:current.planHash});assert.equal(second.api.status().bodyAdmissionOpen,true);assert.equal(ok(await second.call('read',{file_path:'data.txt'})).text,'fingerprint pending');
  await carrier.discard(candidate.planHash);assert.equal((await carrier.plans()).length,0);assert.equal(ok(await second.call('read',{file_path:'data.txt'})).text,'original');result.explicitDiscardReturnedBaseline=true;
  const settings=second.ctx.suiteEnhancements.memorySettings;assert.equal(second.providerCalls(),0);await second.close();
  await assert.rejects(carrier.startupIdentity(),{code:'SEP_MAC_PROFILE_CLOSED'});await assert.rejects(settings.list({}),{code:'SEP_MAC_CLOSED'});assert.throws(()=>second.api.stream({}),{code:'SEP_MAC_CLOSED'});result.closedReferencesRejected=true;result.modelCalls=0;result.status='pass';
 }finally{if(second)await second.close();else if(first)await first.close();await writeFile(join(output,'FINGERPRINT.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});}
});
test('metadata startup rejects file or multiple source configurations before creating business services',async()=>{
 for(const sources of [['data.txt'],['.','data.txt'],['./']])await assert.rejects(setup({loader:true,business:{sources}}),e=>e.code==='SEP_TEST_RUNTIME_SERVICE_MISSING'&&e.diagnostic.codes.includes('SEP_PENDING_SCOPE_CONFIG'));
});
test('production document/image runtime uses the same exact pending-startup derivation',async()=>{
 const production=await import('./runtime.mjs'),core=await import('./runtime-core.mjs');assert.equal(typeof production.apply,'function');assert.equal(typeof core.apply,'function');assert.equal(production.origin.changes.length,core.origin.changes.length);assert(production.origin.changes.length>=10);
});
