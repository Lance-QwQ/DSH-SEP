import assert from 'node:assert/strict';
import {test} from 'node:test';
import {adaptDailyPresets} from '../lib/daily-presets.mjs';
const make=()=>['standard','cordis','minimal','ptc'].map(id=>({id:'preset-'+id,name:'@deepseek-ai/dsh-agent-preset',config:{id,plugins:id!=='minimal'?[{id:'compaction',name:'cordis:group',group:true,isolate:{compaction:true,toolResultPruner:true},config:[{id:'compaction-basic',name:'@deepseek-ai/dsh-compaction-basic',config:{auto:true}},{id:'command-compact',name:'@deepseek-ai/dsh-command-compact'},{id:'custom',name:'user-plugin',config:{value:17}}]}]:[{id:'custom',name:'user-plugin'}]}}));
test('cold overlay changes exactly engine admission and its realm, retaining user configuration',()=>{
 const rows=make(),before=structuredClone(rows),result=adaptDailyPresets(rows);assert.deepEqual(rows,before);assert.equal(result.length,3);
 for(let i=0;i<result.length;i++){
  const original=before.find(row=>row.id===result[i].id),expected=structuredClone(original.config);delete expected.plugins[0].isolate.compaction;expected.plugins[0].config[0].disabled=true;
  assert.deepEqual(result[i],{id:original.id,config:expected});
 }
});
test('unknown or ambiguous preset topology refuses without dropping user rows',()=>{
 for(const mutate of [rows=>rows.pop(),rows=>rows[0].config.plugins[0].config.push({id:'compaction-basic',name:'user-plugin'}),rows=>rows[0].config.plugins[0].isolate.compaction=false,rows=>rows[0].config.plugins[0].config[0].name='custom-engine',rows=>rows[2].config.plugins.push(rows[0].config.plugins[0])]){
  const rows=make();mutate(rows);assert.throws(()=>adaptDailyPresets(rows),error=>error.code==='SEP_DAILY_PRESET_UNSUPPORTED');
 }
});
