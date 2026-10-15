// Test-only single preview-template escape repair. Preserve the frozen r75
// carrier, product, lifecycle, error handling and all final assertions.
import assert from 'node:assert/strict';import {readFile,writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
const definitions=[
 {base:'native-dom-r3.mjs',pin:'32798f21b8f2610389700a1108536981635e6f142a8993e5fc9cb6562acf1f38',result:'native-dom-r4.mjs',changes:[
  [String.raw`.map(e=>e.textContent).join('\n')`,String.raw`.map(e=>e.textContent).join('\\n')`],
 ]},
 {base:'native-worker-r5.mjs',pin:'3a36edcf03bd036c09fe8564224d85ce594bb7b2b71a228ab55db5b8080fab54',result:'native-worker-r6.mjs',changes:[
  ["from './native-dom-r3.mjs'","from './native-dom-r4.mjs'"],
 ]},
 {base:'native-operator-r5.mjs',pin:'69d2fb326f9bec0663f5b25f13b53fa4c365433edda2c7c91ca15a8d31262f53',result:'native-operator-r6.mjs',changes:[
  ["['native-operator-r5.mjs','native-worker-r5.mjs','NATIVE-IDENTITY-ORIGIN.json'","['native-operator-r6.mjs','native-worker-r6.mjs','NATIVE-RENDERER-ORIGIN.json','derive-renderer-grammar.mjs','NATIVE-IDENTITY-ORIGIN.json'"],
  ["'native-dom-r3.mjs','native-data-r4.mjs'","'native-dom-r4.mjs','native-data-r4.mjs'"],
  ["new URL('./native-worker-r5.mjs',import.meta.url)","new URL('./native-worker-r6.mjs',import.meta.url)"],
 ]},
];
const files=[],verify=process.argv.includes('--verify');
for(const row of definitions){
 const bytes=await readFile(new URL(row.base,import.meta.url));assert.equal(sha(bytes),row.pin);let text=bytes.toString('utf8');
 for(const [before,after] of row.changes){assert.equal(text.split(before).length,2,before);text=text.replace(before,after);}
 if(verify)assert.equal(await readFile(new URL(row.result,import.meta.url),'utf8'),text);else await writeFile(new URL(row.result,import.meta.url),text,{flag:'wx'});
 files.push({base:row.base,sourceSha256:row.pin,result:row.result,resultSha256:sha(text),transformations:row.changes.map(([before,after])=>({before,after,occurrences:1}))});
}
const receipt={schema:1,scope:'Test-only emitted preview JavaScript grammar correction. Same fixed r74 product and assertions. Select click remains single; native confirmation, ownership cleanup and finally logic are unchanged.',files};
const json=JSON.stringify(receipt,null,2)+'\n';
if(verify)assert.equal(await readFile(new URL('./NATIVE-RENDERER-ORIGIN.json',import.meta.url),'utf8'),json);else await writeFile(new URL('./NATIVE-RENDERER-ORIGIN.json',import.meta.url),json,{flag:'wx'});
console.log(JSON.stringify({status:'pass',mode:verify?'verify':'derive',files:files.map(({result,resultSha256})=>({path:result,sha256:resultSha256}))}));
