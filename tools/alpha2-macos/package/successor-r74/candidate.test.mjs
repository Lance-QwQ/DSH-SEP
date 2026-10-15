// Fixed new build acceptance, not a claim that the failed r74 UI round passed.
import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
const moduleUrl=process.env.SEP_SUCCESSOR_BASELINE?pathToFileURL(resolve(process.env.SEP_SUCCESSOR_BASELINE)).href:new URL('./candidate-binding.mjs',import.meta.url).href;
const {validateCandidateFacts,validateAssemblyBytes,candidatePaths}=await import(moduleUrl);
const bytes=await readFile(new URL('./fixtures/ASSEMBLY-r74.json',import.meta.url));
const actual=JSON.parse(bytes),expected='5aa8ddfc6b72141f494eb50e07cdced61e1fc89080368b9edf922389641f2704';
test('accepts the byte-exact actual r74 successful build receipt',()=>{assert.equal(validateAssemblyBytes(bytes,expected).sourceCommit,'155f324013fada4caf3ecd15a9631678d4d5c4a7');});
test('accepts the verified 84-runtime build without changing its blocked certification',()=>{const r=validateCandidateFacts(actual);assert.equal(r.runtime.length,84);assert.equal(r.fullMacCertification,'blocked');});
test('rejects modified original bytes and a substituted digest',()=>{assert.throws(()=>validateAssemblyBytes(Buffer.concat([bytes,Buffer.from(' ')]),expected),{code:'SEP_PROJECT_CANDIDATE_RESULT'});assert.throws(()=>validateAssemblyBytes(bytes,'0'.repeat(64)),{code:'SEP_PROJECT_CANDIDATE_RESULT'});});
test('rejects unapproved runtime cardinality and duplicate entry identities',()=>{for(const runtime of[actual.runtime.slice(1),[...actual.runtime,actual.runtime[0]],[actual.runtime[1],...actual.runtime.slice(1)]])assert.throws(()=>validateCandidateFacts({...actual,runtime}),{code:'SEP_PROJECT_CANDIDATE_FACTS'});});
test('rejects stale or substituted build manifests and archive binding',()=>{for(const patch of[{sourceCommit:'157eef6bcaaee8db959f37ed267ff202b9bc206c'},{programSha256:'0'.repeat(64)},{bootstrapSha256:'0'.repeat(64)},{treeSha256:'0'.repeat(64)},{artifactBytes:actual.artifactBytes+1},{artifactSha256:'0'.repeat(64)}])assert.throws(()=>validateCandidateFacts({...actual,...patch}),{code:'SEP_PROJECT_CANDIDATE_FACTS'});});
test('rejects unsuccessful build or source mutation claim',()=>{for(const patch of[{status:'fail'},{originalUnchanged:false}])assert.throws(()=>validateCandidateFacts({...actual,...patch}),{code:'SEP_PROJECT_CANDIDATE_FACTS'});});
test('derives only a normalized absolute restoration layout',()=>{const root=resolve('successor-native-fixture');assert.deepEqual(candidatePaths(root),{application:join(root,'restored/DSH SEP.app'),archive:join(root,'DSH-SEP-macOS-Alpha2-project-preview.zip'),inventory:join(root,'PACKAGE-INVENTORY.json')});for(const bad of['relative',root+'/../escape'])assert.throws(()=>candidatePaths(bad),{code:'SEP_PROJECT_CANDIDATE_PATH'});});
