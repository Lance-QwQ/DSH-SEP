// Test-only r5 carrier. The trusted surface wait, late Electron identity,
// every UI action, assertions, and ownership cleanup remain unchanged.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
const definitions=[
 {base:'native-worker-r4.mjs',pin:'826353ddb3b2992a038326447b159ac06a11b1a43be68a4cd19a3c2738e14a96',result:'native-worker-r5.mjs',changes:[
  ["observedPid:observed?.observedPid??null,appPath:","observedPid:observed?.observedPid??null,execPath:observed?.execPath??null,electronVersion:observed?.electronVersion??null,processType:observed?.processType??null,appPath:"],
  ["  result.earlyIdentity=await verifyWorkspaceInspector({phase:'early',read:readIdentity,save,expectedPid:app.desktopPid,expectedAppPath:asar});","  const readEarlyIdentity=()=>client.eval('({observedPid:process.pid,execPath:process.execPath,electronVersion:process.versions.electron??null,processType:process.type??null})');\n  result.earlyIdentity=await verifyWorkspaceInspector({phase:'early',read:readEarlyIdentity,save,expectedPid:app.desktopPid,expectedAppPath:asar});"],
 ]},
 {base:'native-operator-r4.mjs',pin:'8458521a08bc8fdb4130340e67f0c55c056a69af2789a54c8f299c3e0cd37c18',result:'native-operator-r5.mjs',changes:[
  ["['native-operator-r4.mjs','native-worker-r4.mjs','NATIVE-PENDING-ORIGIN.json'","['native-operator-r5.mjs','native-worker-r5.mjs','NATIVE-IDENTITY-ORIGIN.json','derive-inspector-identity.mjs','NATIVE-PENDING-ORIGIN.json'"],
  ["new URL('./native-worker-r4.mjs',import.meta.url)","new URL('./native-worker-r5.mjs',import.meta.url)"],
 ]},
];
const files=[],verify=process.argv.includes('--verify');
for(const row of definitions){
 const bytes=await readFile(new URL(row.base,import.meta.url));assert.equal(sha(bytes),row.pin);
 let text=bytes.toString('utf8');
 for(const [before,after] of row.changes){assert.equal(text.split(before).length,2,before);text=text.replace(before,after);}
 if(verify)assert.equal(await readFile(new URL(row.result,import.meta.url),'utf8'),text);
 else await writeFile(new URL(row.result,import.meta.url),text,{flag:'wx'});
 files.push({base:row.base,sourceSha256:row.pin,result:row.result,resultSha256:sha(text),transformations:row.changes.map(([before,after])=>({before,after,occurrences:1}))});
}
const receipt={schema:1,scope:'Test-only early Inspector identity sequencing. No product changes. Import-free early exact PID precedes trusted ready; late Electron/appPath/isReady, UI and cleanup remain unchanged.',files};
const json=JSON.stringify(receipt,null,2)+'\n';
if(verify)assert.equal(await readFile(new URL('./NATIVE-IDENTITY-ORIGIN.json',import.meta.url),'utf8'),json);
else await writeFile(new URL('./NATIVE-IDENTITY-ORIGIN.json',import.meta.url),json,{flag:'wx'});
console.log(JSON.stringify({status:'pass',mode:verify?'verify':'derive',files:files.map(({result,resultSha256})=>({path:result,sha256:resultSha256}))}));
