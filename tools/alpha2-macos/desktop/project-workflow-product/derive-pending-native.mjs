// Test-carrier derivation: preserve r70 input and assertions; bind the new
// pending-aware overlay migration to an explicitly supplied new app receipt.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
const definitions=[
 {base:'native-data-r2.mjs',pin:'ca9a0d4c2eb7c6723be5bd261c8d5be37cd3cc8a98f09f92eb8b6bd558505733',result:'native-data-r4.mjs',changes:[
  ["const previous=(await c.module('document-business/profile-layout.mjs')).businessLayout(layoutInput),next=(await c.module('desktop/project-workflow-product/profile-layout.mjs')).businessLayout(layoutInput)","const previous=(await c.module('desktop/project-workflow-product/profile-layout.mjs')).businessLayout(layoutInput),next=(await c.module('desktop/project-workflow-product/pending-startup/profile-layout.mjs')).businessLayout(layoutInput)"],
 ]},
 {base:'native-worker-r3.mjs',pin:'4b76efbaa89f17db7908a04a0c628ca19585432bb9862e7168d3e35688a54603',result:'native-worker-r4.mjs',changes:[["from './native-data-r2.mjs'","from './native-data-r4.mjs'"]]},
 {base:'native-operator-r3.mjs',pin:'7dfd70efc983200ebd25acbe8f2a0e057a7ce79ac73ef85a79dd56f06149f318',result:'native-operator-r4.mjs',changes:[
  ["['native-operator-r3.mjs','native-worker-r3.mjs','native-readiness.mjs'","['native-operator-r4.mjs','native-worker-r4.mjs','NATIVE-PENDING-ORIGIN.json','derive-pending-native.mjs','native-readiness.mjs'"],
  ["'native-dom-r3.mjs','native-data-r2.mjs'","'native-dom-r3.mjs','native-data-r4.mjs'"],
  ["new URL('./native-worker-r3.mjs',import.meta.url)","new URL('./native-worker-r4.mjs',import.meta.url)"],
 ]},
];
const files=[];
for(const row of definitions){
 const bytes=await readFile(new URL(row.base,import.meta.url));assert.equal(sha(bytes),row.pin);
 let text=bytes.toString('utf8');
 for(const [before,after] of row.changes){assert.equal(text.split(before).length,2,before);text=text.replace(before,after);}
 await writeFile(new URL(row.result,import.meta.url),text,{flag:'wx'});
 files.push({base:row.base,sourceSha256:row.pin,result:row.result,resultSha256:sha(text),transformations:row.changes.map(([before,after])=>({before,after,occurrences:1}))});
}
await writeFile(new URL('./NATIVE-PENDING-ORIGIN.json',import.meta.url),JSON.stringify({schema:1,scope:'Test carrier only: same two actual DOM rounds, same P2 authority and assertions. Synthetic former overlay now means r61 project layout. It does not authorize a production migration or change the installed application.',files},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:'pass',files:files.map(({result,resultSha256})=>({path:result,sha256:resultSha256}))}));
