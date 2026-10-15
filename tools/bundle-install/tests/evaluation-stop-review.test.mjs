
import assert from 'node:assert/strict';import {test} from 'node:test';import {spawn} from 'node:child_process';import {once} from 'node:events';
import {readFile} from 'node:fs/promises';import {setup,close,owned} from './native-settings-fixture.mjs';
const childSource=String.raw`
const http=require('node:http'),input=JSON.parse(process.argv[1]);let generationId='d'.repeat(32);
const health={projectId:'synthetic',catalogSha256:'c'.repeat(64),stateIdentity:'b'.repeat(64),generationId,protocol:'sep-eval-lifecycle-v1',assessments:['synthetic']};
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(health));});
server.listen(0,'127.0.0.1',()=>{console.log(JSON.stringify({ready:{...health,endpoint:'http://127.0.0.1:'+server.address().port,token:'e'.repeat(64),challenge:input.challenge}}));});
process.stdin.resume();process.stdin.on('end',()=>process.send?.({kind:'stop-requested'}));
process.on('message',msg=>{if(msg==='release')server.close(()=>{console.log(JSON.stringify({closed:{status:'pass',quiescent:true,generationId}}));process.disconnect();});});
`;
test('real evaluation child remains blocked at the deadline and a later explicit stop confirms actual exit', {timeout:15000},async()=>{
 const f=await setup(),{Entry}=await owned('host/evaluation-entry/entry.mjs');let child,entry;
 try{entry=new Entry(f.ctx,{enabled:true,shutdownMs:100,backend:{entry:'/opt/dsh-sep-eval/lifecycle.py',configPath:'/opt/dsh-sep-eval/config.json',configSha256:'a'.repeat(64),stateIdentity:'b'.repeat(64)},project:{projectId:'synthetic',catalogSha256:'c'.repeat(64),root:f.dirs.project}},
  {ownership:{signal:new AbortController().signal,enter:()=>()=>{}},spawnBackend:challenge=>{child=spawn(process.execPath,['-e',childSource,JSON.stringify({challenge})],{windowsHide:true,stdio:['pipe','pipe','pipe','ipc']});return child;}});
 assert.equal((await entry.start()).status,'pass');const first=await entry.stop();assert.equal(first.status,'blocked');assert.equal(child.exitCode,null);
 const exited=once(child,'close');child.send('release');await exited;
 assert.equal((await entry.stop()).status,'pass');assert.equal(entry.state,'stopped');assert.equal((await entry.stop()).status,'pass');assert.deepEqual(await readFile(f.budgetPath),f.bytes);
 }finally{if(child&&child.exitCode===null){const exited=once(child,'close');child.kill();await exited;}await entry?.stop();await close(f);}
});
