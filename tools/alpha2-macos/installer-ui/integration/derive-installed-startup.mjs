// Mechanical test-operator derivation only. Existing original is untouched.
import assert from 'node:assert/strict';import{readFile,writeFile}from'node:fs/promises';import{fileURLToPath}from'node:url';import{createHash}from'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex'),source='package/exercise-installed-startup.mjs',bytes=await readFile(new URL('../../'+source,import.meta.url)),sourceSha256='3c76a7e17ad8f095cc8d40ea51e2831d42ba4ccb3c2ccec623cdf7517e461275';assert.equal(sha(bytes),sourceSha256);
const transforms=[
 {from:"from'./package-inventory.mjs'",to:"from'../../package/package-inventory.mjs'"},
 {from:"from'./installed-profile-binding.mjs'",to:"from'../../package/installed-profile-binding.mjs'"},
 {from:"new URL('./application-observer.m',import.meta.url)",to:"new URL('../../package/application-observer.m',import.meta.url)"},
 {from:'6d0705c190bc56b3028cfa26a287ca04eba9ab39822e2edae1177a1033ccbf67',to:'742c503ba230ee9dd92f54b8c4646af3385dd1d6259fdfdcbc2212f2ff020d13'}
];let text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);for(const row of transforms){assert.equal(text.split(row.from).length-1,1);text=text.replace(row.from,row.to);}
const result=Buffer.from(text),origin={schema:1,source,sourceSha256,result:'installer-ui/integration/installed-startup.mjs',resultSha256:sha(result),scope:'Only relocate three test helper imports and replace the old r44 archive identity with independently verified r61. Behavior and failure cleanup remain original.',transforms};
for(const [name,body]of [['installed-startup.mjs',result],['installed-startup.origin.json',Buffer.from(JSON.stringify(origin,null,2)+'\n')]]){const p=fileURLToPath(new URL('./'+name,import.meta.url));try{await writeFile(p,body,{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;assert.deepEqual(await readFile(p),body);}}
console.log(JSON.stringify({status:'pass',sourceSha256,resultSha256:origin.resultSha256,transforms:4}));
