import assert from 'node:assert/strict';
const fail=code=>{throw Object.assign(Error(code),{code});};
export function validateRuntimeReceipt(actual,expected){
 const shape=rows=>Array.isArray(rows)&&rows.length===84&&new Set(rows.map(r=>r?.path)).size===84&&rows.every(r=>r&&Object.keys(r).sort().join('|')==='path|sha256|source'&&typeof r.path==='string'&&typeof r.source==='string'&&/^[a-f0-9]{64}$/.test(r.sha256));
 if(!shape(actual)||!shape(expected))fail('SEP_NATIVE_APPLICATION_RUNTIME');
 const normalize=rows=>rows.map(r=>({path:r.path,source:r.source,sha256:r.sha256})).sort((a,b)=>a.path.localeCompare(b.path));
 try{assert.deepEqual(normalize(actual),normalize(expected));}catch{fail('SEP_NATIVE_APPLICATION_RUNTIME');}
 return 84;
}
export function tapCounts(text){return Object.fromEntries(['tests','pass','fail','skipped','cancelled'].map(k=>{const matches=[...text.matchAll(new RegExp('^# '+k+' (\\d+)\\r?$','gm'))];return[k,matches.length===1?Number(matches[0][1]):-1];}));}
export function assertTapPass(text,count){const counts=tapCounts(text);try{assert.deepEqual(counts,{tests:count,pass:count,fail:0,skipped:0,cancelled:0});}catch{fail('SEP_NATIVE_APPLICATION_TESTS');}return counts;}
