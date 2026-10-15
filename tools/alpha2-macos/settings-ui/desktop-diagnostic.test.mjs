import test from 'node:test';import assert from 'node:assert/strict';import {runInNewContext} from 'node:vm';
import {settingsDomSnapshot} from './desktop-diagnostic.mjs';
test('diagnostic distinguishes a missing dialog without page contents',()=>{const result=runInNewContext('('+settingsDomSnapshot.toString()+')()',{document:{querySelector:()=>null}});assert.deepEqual(JSON.parse(JSON.stringify(result)),{dialog:false});});
test('diagnostic retains structure and known error class but discards arbitrary text and paths',()=>{
 const secret='PRIVATE BODY /Users/private SECRET-KEY';
 const select={options:[{},{}]},recall={checked:false,disabled:false};
 const section={querySelector:s=>s==='h2'?{textContent:'Memory enhancement'}:s==='select'?select:null,querySelectorAll:s=>s==='input[role="switch"]'?[{...recall,getAttribute:()=> 'Recall existing memory automatically'}]:[],getAttribute:()=> 'false'};
 const dialog={querySelectorAll:s=>s==='section'?[section]:s==='nav button'?[{textContent:'Memory enhancement',getAttribute:()=> 'true'}]:s==='[role="alert"]'?[{textContent:'Could not read memory settings. Refresh to try again.'},{textContent:secret}]:[]};
 const result=runInNewContext('('+settingsDomSnapshot.toString()+')()',{document:{querySelector:()=>dialog}});
 assert.equal(result.memory.exists,true);assert.equal(result.memory.busy,false);assert.equal(result.memory.options,2);assert.equal(result.memory.recall.checked,false);assert.equal(result.activeNav,'memory');assert.deepEqual(Array.from(result.alerts),['read-error','other']);assert.equal(JSON.stringify(result).includes(secret),false);
});
