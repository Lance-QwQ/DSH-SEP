import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import{createHash}from'node:crypto';import{spawnSync}from'node:child_process';
import{deriveDiagnostic}from'./derive.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const source={worker:await readFile(new URL('../desktop/workspace-diagnostic-worker.mjs',import.meta.url),'utf8'),operator:await readFile(new URL('../desktop/workspace-diagnostic.mjs',import.meta.url),'utf8')};
test('fixed original diagnostic derives reversible test-only worker/operator with valid module syntax',()=>{
 const derived=deriveDiagnostic(source);for(const name of ['worker','operator']){let reverted=derived.outputs[name];for(const row of [...derived.origin[name].transforms].reverse()){assert.equal(reverted.split(row.after).length,2);reverted=reverted.replace(row.after,row.before);}assert.equal(reverted,source[name]);assert.equal(derived.origin[name].sourceSha256,sha(source[name]));assert.equal(derived.origin[name].resultSha256,sha(derived.outputs[name]));const syntax=spawnSync(process.execPath,['--input-type=module','--check'],{input:derived.outputs[name],encoding:'utf8'});assert.equal(syntax.status,0,syntax.stderr);}
 assert(derived.outputs.worker.includes('probeSettingsPage({client,windowId:workspace.id,round:input.round,diagnosticRoot:input.outputRoot})'));
 assert(derived.outputs.operator.includes('dataRoot:sharedDataRoot'));
});
test('unexpected worker or operator bytes are rejected before producing any derived source',()=>{
 for(const name of ['worker','operator'])assert.throws(()=>deriveDiagnostic({...source,[name]:source[name]+'\n'}),{code:'SEP_SETTINGS_ORIGIN_CHANGED'});
});
