import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {deriveReadonlySources} from './derive-sources.mjs';
const core=await readFile(new URL('../transactions/transaction-store.mjs',import.meta.url),'utf8');
const lifecycle=await readFile(new URL('../lifecycle/managed-project-lifecycle.mjs',import.meta.url),'utf8');
test('fixed source derives only the documented owner-scoped readback additions and is reversible',()=>{
  const result=deriveReadonlySources({core,lifecycle});
  for(const [name,base] of [['core',core],['lifecycle',lifecycle]]){
    let restored=result.outputs[name];
    for(const transform of [...result.origin[name].transforms].reverse()){
      assert.equal(restored.split(transform.after).length-1,1);
      restored=restored.replace(transform.after,transform.before);
    }
    assert.equal(restored,base);
  }
});
test('unknown transaction bytes and unknown lifecycle bytes are rejected before derivation',()=>{
  for(const input of [{core:core+'\n',lifecycle},{core,lifecycle:lifecycle+'\n'}]){
    assert.throws(()=>deriveReadonlySources(input),e=>e.code==='SEP_MAC_WORKFLOW_ORIGIN_CHANGED');
  }
});
