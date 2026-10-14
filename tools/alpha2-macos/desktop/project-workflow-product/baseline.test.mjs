import test from 'node:test';import assert from 'node:assert/strict';
import {readFile,appendFile} from 'node:fs/promises';import {join} from 'node:path';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';
import {executePreload} from './preload-harness.mjs';
import {createHostOwner} from '../managed-broker/host-owner.mjs';import {openDesktopRpc} from '../managed-broker/desktop-rpc.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),pins=JSON.parse(await readFile(new URL('./BASELINE.json',import.meta.url))),root=process.env.SEP_PROJECT_PRODUCT_BASELINE;
assert.ok(root,'explicit D:/RUNNER_TEMP baseline required');
const preload=await readFile(join(root,'preload.cjs'),'utf8');assert.equal(sha(preload),pins.entries.preload.sha256);
test('source replay reproduces the three actual r44 entry hashes',async()=>{const r=JSON.parse(await readFile(join(root,'ORIGIN.json')));for(const [key,pin]of Object.entries(pins.entries)){const row=r.outputs.find(r=>r.key===key);assert.equal(sha(await readFile(join(root,row.file))),pin.sha256);assert.equal(row.sha256,pin.sha256);}});
test('workspace preload exposes only four fixed project intents',async()=>{const f=executePreload(preload),api=f.exposed.get('sepCurrentProject');assert.ok(api,'r44 has no current-project UI bridge');assert.deepEqual(Object.keys(api).sort(),['begin','call','commit','presented']);await api.call('status',{});assert.equal(f.calls.at(-1)[0],'sep-current-project:call');assert.equal(JSON.stringify(api).includes('nonce'),false);});
test('foreign origins and subframes receive no current-project bridge',()=>{for(const options of [{protocol:'https:',hostname:'example.test'},{isMainFrame:false}])assert.equal(executePreload(preload,options).exposed.has('sepCurrentProject'),false);});
test('actual host owner provides an owned private desktop attachment, with exact child cleanup',async()=>{
 const file=new URL('../managed-broker/fixture-business.mjs',import.meta.url),owner=createHostOwner({nodeExecutable:process.execPath,modulePath:fileURLToPath(file),moduleSha256:sha(await readFile(file)),input:{},env:{SystemRoot:process.env.SystemRoot,PATH:process.env.PATH},startDeadlineMs:3000,stopDeadlineMs:3000});
 try{await owner.start();assert.equal(typeof owner.attachProjectDesktop,'function','r44 host owner has no private workflow attachment');}
 finally{const closed=await owner.stop();assert.equal(closed.phase,'stopped');assert.equal(closed.lastExit.code,0);assert.equal(closed.lastExit.forced,false);await appendFile(join(root,'BASELINE-CHILD-CLEANUP.jsonl'),JSON.stringify(closed)+'\n');}
});
test('existing authenticated lifecycle HTTP refuses project management',async()=>{
 let calls=0;const owner={status:()=>({phase:'running',generation:1,pid:123}),start:()=>{calls++;},ready:()=>{calls++;},inspect:()=>{calls++;},stop:()=>{calls++;}};
 const rpc=await openDesktopRpc({projectDir:root,owner});try{const response=await fetch(rpc.connection.endpoint+'rpc',{method:'POST',headers:{authorization:'Bearer '+rpc.connection.token,'content-type':'application/json'},body:JSON.stringify({method:'confirmCommit',params:{}})});assert.equal(response.status,400);assert.equal((await response.json()).error.code,'RECOVERY_METHOD');assert.equal(calls,0);}finally{assert.equal((await rpc.close()).status,'pass');}
});
