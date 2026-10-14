import test from 'node:test';import assert from 'node:assert/strict';import {resolve,join} from 'node:path';
import {businessLayout as previousLayout} from '../profile-layout.mjs';
import {businessLayout as documentLayout} from '../../../document-business/profile-layout.mjs';
import {mkdir,readFile,mkdtemp} from 'node:fs/promises';import {createHash} from 'node:crypto';
const input={programRoot:resolve('/program'),hostRoot:resolve('/host'),bundleRoot:resolve('/bundle'),dataRoot:resolve('/private/data'),projectRoot:resolve('/private/project'),helperPath:resolve('/helpers/tree'),helperSha256:'a'.repeat(64),attachmentHelperPath:resolve('/helpers/attachment'),attachmentHelperSha256:'b'.repeat(64),parser:{runtimeRoot:resolve('/parsers'),manifestSha256:'c'.repeat(64),stateRoot:join(resolve('/private/data'),'parser')}};
const text=value=>JSON.stringify(value,null,2)+'\n';
test('pending layout changes only the two trusted entries and preserves profile binding and all gates',async()=>{
 const m=await import('./profile-layout.mjs'),previous=previousLayout(input),next=m.businessLayout(input);assert.deepEqual(next.record,previous.record);assert.deepEqual(next.runtime,previous.runtime);
 const normalized=structuredClone(next.patch),rows=normalized.find(x=>x.insert).insert,old=previous.patch.find(x=>x.insert).insert;
 for(const [id,file]of [['mac-controlled','profile-plugin.mjs'],['mac-sep-business','runtime.mjs']]){const row=rows.find(x=>x.id===id);assert.equal(row.name,new URL(file,import.meta.url).href);row.name=old.find(x=>x.id===id).name;}
 assert.deepEqual(normalized,previous.patch);assert.equal(next.runtime.business.capture,false);assert.equal(next.runtime.business.media,true);assert.equal(next.runtime.p1.enabled,true);
});
test('overlay accepts only exact document, r61 product, or already-current bytes with native CAS',async()=>{
 const m=await import('./profile-layout.mjs'),next=text(m.businessLayout(input).patch);
 for(const old of [text(documentLayout(input).patch),text(previousLayout(input).patch),next]){let state=old,writes=0;const result=await m.migrateKnownOverlay(input,{read:async()=>state,compareSwap:async value=>{assert.equal(value.expectedSha256,(await import('node:crypto')).createHash('sha256').update(state).digest('hex'));state=value.text;writes++;}});assert.equal(result.status,'pass');assert.equal(state,next);assert.equal(writes,old===next?0:1);}
 let writes=0;await assert.rejects(m.migrateKnownOverlay(input,{read:async()=>'{"unexpected":true}',compareSwap:async()=>{writes++;}}),{code:'SEP_PROJECT_UI_OVERLAY_CHANGED'});assert.equal(writes,0);
});
test('derived standalone retains exact cleanup, settings assertion and private channel ownership code',async()=>{
 const m=await import('./standalone.mjs');assert.equal(typeof m.openMacBusiness,'function');assert.equal(m.origin.inputSha256,'d20e356c0a475c4acf1a5ec7f138bc21b36de4deea704e270d042c0b1b1e0128');assert.equal(m.origin.changes.length,1);
 await assert.rejects(m.openMacBusiness({}),{code:'SEP_PROJECT_UI_OWNER'});
});
test('real native CAS migrates fresh document and r61 profiles without changing PROFILE or initialization authority',async()=>{
 const m=await import('./profile-layout.mjs'),old=await import('../profile-layout.mjs'),document=await import('../../../document-business/profile-layout.mjs');
 const root=process.env.SEP_MAC_BUSINESS_TEST_ROOT,helperPath=process.env.SEP_MAC_TREE_HELPER;assert(root&&helperPath);await mkdir(root,{recursive:true,mode:0o700});
 for(const previous of [document,old]){const base=await mkdtemp(join(root,'layout-')),dataRoot=join(base,'business'),source=join(base,'source'),args={...input,programRoot:resolve(process.env.SEP_MAC_PROGRAM_ROOT??'/program'),hostRoot:process.env.SEP_OFFICIAL_HARNESS,bundleRoot:process.env.SEP_MAC_BUNDLE_ROOT,dataRoot,projectRoot:source,helperPath,helperSha256:createHash('sha256').update(await readFile(helperPath)).digest('hex'),parser:{...input.parser,stateRoot:join(dataRoot,'parser')},initialize:true};
  await previous.initializeBusinessProfile(args);const profile=await readFile(join(dataRoot,'PROFILE.json')),init=await readFile(join(dataRoot,'home/profiles/desktop/initialize.patch.yml'));
  await m.initializeBusinessProfile(args);assert.equal(await readFile(join(dataRoot,'home/profiles/desktop/cordis.patch.yml'),'utf8'),text(m.businessLayout(args).patch));assert((await readFile(join(dataRoot,'PROFILE.json'))).equals(profile));assert((await readFile(join(dataRoot,'home/profiles/desktop/initialize.patch.yml'))).equals(init));
  await m.completeBusinessInitialization(args);const reopened=await m.initializeBusinessProfile({...args,initialize:false});assert.equal(reopened.newlyInitialized,false);assert((await readFile(join(dataRoot,'PROFILE.json'))).equals(profile));
 }
});
