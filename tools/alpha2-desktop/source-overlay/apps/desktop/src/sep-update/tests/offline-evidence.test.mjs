import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {hash} from '../update-core.mjs';
import {readOfflinePluginEvidence,offlineEvidencePaths} from '../prepare-offline.mjs';
test('legacy offline plans have no evidence and no extra bound files',async()=>{assert.equal(await readOfflinePluginEvidence({}),null);assert.deepEqual(offlineEvidencePaths({}),[]);});
test('offline review reloads exact evidence bytes rather than accepting an unchecked object',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'sep-offline-evidence-')),path=join(dir,'evidence.json');
 const body=JSON.stringify({schema:1,kind:'plugin-compatibility-evidence',currentBinding:hash('a'),targetBinding:hash('b'),currentGraphHash:hash('c'),targetGraphHash:hash('d'),targetVersion:'0.1.7-rc.2',environment:{platform:process.platform,arch:process.arch},testedAt:new Date().toISOString(),records:[]});await writeFile(path,body);
 const op={compatibilityEvidence:{compatibilityEvidencePath:path,bindings:[{path,sha256:hash(body)}]}};
 assert.equal((await readOfflinePluginEvidence(op)).recordCount,0);assert.deepEqual(offlineEvidencePaths(op),[path]);
 await writeFile(path,'{}');await assert.rejects(readOfflinePluginEvidence(op),/UPDATE_PLUGIN_EVIDENCE_CHANGED/);
});
test('an unbound evidence document is rejected',async()=>{await assert.rejects(readOfflinePluginEvidence({compatibilityEvidence:{compatibilityEvidencePath:join(tmpdir(),'unbound.json'),bindings:[]}}),/UPDATE_PLUGIN_EVIDENCE_UNBOUND/);});
