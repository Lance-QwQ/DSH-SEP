import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import vm from 'node:vm';
import {deriveNativeReadiness} from './derive-native-readiness.mjs';import {observeReady} from './native-readiness.mjs';
const source={};for(const name of ['worker','operator','dom'])source[name]=await readFile(new URL('./native-'+name+(name==='dom'?'':'-r2')+'.mjs',import.meta.url),'utf8');
const derived=deriveNativeReadiness(source),AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
test('r3 outputs exactly replay frozen r2 inputs and reject every changed input',async()=>{
 for(const [name,text]of Object.entries(derived.outputs))assert.equal(text,await readFile(new URL('./native-'+name+'-r3.mjs',import.meta.url),'utf8'));
 assert.deepEqual(derived.origin,JSON.parse(await readFile(new URL('./NATIVE-READINESS-ORIGIN.json',import.meta.url))).origin);
 for(const name of Object.keys(source))assert.throws(()=>deriveNativeReadiness({...source,[name]:source[name]+'\n'}),{code:'SEP_PROJECT_NATIVE_READINESS_ORIGIN'});
});
test('actual derived worker brand block waits for absence and retains all original measured-value assertions',async()=>{
 const code=derived.outputs.worker,measure=code.slice(code.indexOf('function measureBrand(){'),code.indexOf('\nasync function main(){'));
 const block=code.slice(code.indexOf("  result.stage='brand';"),code.indexOf("\n  result.stage='project';"));
 const run=new AsyncFunction('renderer','workspace','result','assert','observeReady','abort','control','save','measureBrand',block+'return result.badge;');
 async function exercise(change={}){
  let reads=0;const record=[];const context={location:{protocol:'dsh-app:',host:'app'},innerWidth:1000,innerHeight:800,devicePixelRatio:1};
  const wordmark={tagName:'svg',querySelector:()=>({}),getBoundingClientRect:()=>({right:52})};
  const badge={previousElementSibling:wordmark,isConnected:true,checkVisibility:()=>true,textContent:'SEP',getBoundingClientRect:()=>({width:32,height:14,left:58,top:0,right:90,bottom:14,...change}),querySelector:()=>({getAttribute:()=> '2'}),getAttribute:()=> 'true'};
  context.document={querySelectorAll:()=>++reads===1?[]:[badge]};const measured=vm.runInNewContext('('+measure+')',context);
  const result=await run(async()=>measured(),{id:1},{},assert,observeReady,new AbortController(),{status:()=>({blocked:false})},async(_name,value)=>record.push(value),measured);
  assert.equal(reads,2);assert.equal(record[0].first.classification,'SEP_WORKSPACE_BRAND_UNAVAILABLE');assert.equal(record[0].last.classification,'ready');return result;
 }
 assert.equal((await exercise()).width,32);await assert.rejects(exercise({width:31}),{code:'ERR_ASSERTION'});await assert.rejects(exercise({height:13}),{code:'ERR_ASSERTION'});await assert.rejects(exercise({left:55}),{code:'ERR_ASSERTION'});
});
