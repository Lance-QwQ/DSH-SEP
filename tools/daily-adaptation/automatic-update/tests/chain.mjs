import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID,randomBytes} from 'node:crypto';
const B=process.env.SEP_BUNDLE_TEST_ROOT,U=process.env.SEP_UPDATE_RUNTIME,load=n=>import(pathToFileURL(join(U,n))),json=async p=>JSON.parse(await readFile(p)),sha=b=>createHash('sha256').update(b).digest('hex');
const generation=process.argv[2];if(!/^r[1-9][0-9]*$/.test(generation??''))throw Error('GENERATION');
const f=await json(process.env.SEP_UPDATE_FIXTURE??join(B,'UPDATE-FIXTURE-r1.json')),out=join(B,'chain-'+generation);await mkdir(out);const checks=[];
const check=(name,value=true)=>{assert(value,name);checks.push({name,status:'pass'});console.log('PASS '+name);};
const baseline={ledger:sha(await readFile(JSON.parse(await readFile(f.installation.dailySelectionPath)).configuration.runtime.profile.selection.budgetPath)),selector:sha(await readFile(join(f.installation.dailyRoot,'deployment-rc2.json'))),profile:sha(await readFile(join(f.installation.profileRoot,'cordis.patch.yml')))};
try{
 const {preparePackage}=await load('prepare-package.mjs'),{prepareCandidateProfile}=await load('materialized-profile.mjs'),{checkPreparedHealth}=await load('prepare-health.mjs');
 const workRoot=join(out,'candidate');let prepared;
 if(process.env.SEP_CHAIN_PREPARED)prepared=await json(process.env.SEP_CHAIN_PREPARED);else{prepared=await preparePackage({archive:f.archive,bundleSha256:f.release.bundle.sha256,currentRoot:f.installation.releaseRoot,workRoot,release:f.release});prepared.workRoot=workRoot;await prepareCandidateProfile({installation:f.installation,prepared});}check('archive validated and materialized without aliases');check('external Profile and cold selection rebased');await writeFile(join(out,'prepared.json'),JSON.stringify(prepared,null,2)+'\n');
 const healthRoot=join(out,'health');await checkPreparedHealth({programRoot:prepared.root,probeRoot:healthRoot,graphHash:prepared.graphHash,installation:f.installation});check('real synthetic alpha.1 host settings and normal close');
 const updates=join(out,'updates'),key=randomBytes(32);await mkdir(updates);await writeFile(join(updates,'control-key'),key);
 const {prepareOfflinePlan,executePreparedPlan,validatePlanConsent}=await load('prepare-offline.mjs'),transaction=await prepareOfflinePlan({directory:join(out,'publication'),installation:f.installation,prepared,healthPath:join(healthRoot,'health.json'),updatesDirectory:updates,release:f.release});check('real P2 and recovery controller prepared exact report');
 const {sign,durableJson}=await load('update-admission.mjs');const consent={...transaction.expected,accepted:true};validatePlanConsent(transaction.expected,consent);await durableJson(transaction.op.directory,'consent.json',sign(consent,key));
 const result=await executePreparedPlan('apply',join(transaction.op.directory,'operator.json'));check('publication committed and reopened',result.status==='committed'&&result.businessEntry==='open');
 const selected=await json(join(f.installation.dailyRoot,'deployment-rc2.json'));check('selector binds candidate graph and separate profile',selected.graphHash===prepared.graphHash&&selected.profileRoot===prepared.profileRoot);
 check('ledger retained byte for byte',sha(await readFile(JSON.parse(await readFile(selected.dailySelectionPath)).configuration.runtime.profile.selection.budgetPath))===baseline.ledger);check('old Profile retained byte for byte',sha(await readFile(join(f.installation.profileRoot,'cordis.patch.yml')))===baseline.profile);
 const recovery=await executePreparedPlan('recover',join(transaction.op.directory,'operator.json'));check('recover recognizes already committed without replay',recovery.status==='committed'&&recovery.alreadyFinalized);
 const {openDaily}=await import(pathToFileURL(join(transaction.op.launcherRoot,'launcher.mjs')));let running;try{running=await openDaily(join(f.installation.dailyRoot,'deployment-rc2.json'),{readCredential:false});const ready=await running.start();check('installed selection starts actual managed host',ready.phase==='running');}finally{await running?.close();}check('installed host closes normally');
 await writeFile(join(out,'RESULT.json'),JSON.stringify({schema:1,status:'pass',checks,plan:transaction.plan.hash,prepared,notVerified:['public HTTPS download','native review dialog interaction','Electron launch/reopen in this updater chain','arbitrary host upgrade or dependency topology migration','Linux/macOS']},null,2)+'\n');
}catch(e){await writeFile(join(out,'RESULT.json'),JSON.stringify({schema:1,status:'fail',checks,error:{code:e.code??e.message,stack:e.stack}},null,2)+'\n');console.error(e);process.exitCode=1;}
