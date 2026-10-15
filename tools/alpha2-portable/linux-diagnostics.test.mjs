import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,unlink,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {openFixture,fixture} from './transaction-fixtures.mjs';
import {setup} from './sep-fixture.mjs';
import {spawn} from 'node:child_process';
test('missing independent document plan is a classified refusal, never an ordinary missing file',async()=>{
 const base=await fixture(),child=spawn(process.execPath,[new URL('./linux-document-worker.mjs',import.meta.url).pathname,JSON.stringify({base,phase:'document-authority-accepted'})],{env:process.env,stdio:'ignore'});
 const end=await new Promise(r=>child.once('close',(code,signal)=>r({code,signal})));assert.equal(end.signal,'SIGKILL');
 const plan=JSON.parse(await readFile(join(base.base,'document-test-plan.json')));await unlink(join(base.base,'memory/.suite-memory/p2/document-plans',plan.planHash+'.json'));
 await assert.rejects(setup({base}),{code:'SEP_LINUX_DOCUMENT_PLAN_UNVERIFIED'});
 assert.equal(await readFile(join(base.root,'generations/1/data/data.txt'),'utf8'),'original');
});
test('missing managed generation stops document review with a classified baseline failure',async()=>{
 const f=await openFixture();try{await f.project.bindDocumentAuthority({identity:'synthetic-diagnostic-authority',read:async()=>[]});await rm(join(f.root,'generations/1/data'),{recursive:true});await assert.rejects(f.project.reviewDocument('data.txt'),{code:'SEP_PROJECT_BASELINE_CHANGED'});assert.equal(await readFile(join(f.source,'data.txt'),'utf8'),'original');}finally{await f.project.close();}
});
test('missing generation during interrupted deletion cannot be treated as an approved deletion prefix',async()=>{
 const f=await openFixture(),marker={id:'document:synthetic-diagnostic',owner:'project:synthetic',status:'purged',documentPath:'data.txt',planHash:'a'.repeat(64)},authority=rows=>({identity:'synthetic-independent-authority',read:async()=>rows});await f.project.bindDocumentAuthority(authority([]));await f.project.close();
 const c=spawn(process.execPath,[new URL('./document-worker.mjs',import.meta.url).pathname,JSON.stringify({root:f.root,isolation:f.isolation,marker,phase:'document-intent-durable'})],{env:process.env,stdio:'ignore'});assert.equal((await new Promise(r=>c.once('close',(_code,signal)=>r(signal)))),'SIGKILL');
 await rm(join(f.root,'generations/1/data'),{recursive:true});const p=await f.openManagedProject({root:f.root,isolation:f.isolation});try{await assert.rejects(p.bindDocumentAuthority(authority([marker])),{code:'SEP_PROJECT_DOCUMENT_RECOVERY_INVALID'});assert.equal(await readFile(join(f.source,'data.txt'),'utf8'),'original');}finally{await p.close();}
});
test('MCP provider that refuses EOF has a bounded classified exit and leaves the sandbox usable',async()=>{
 const f=await openFixture(),client=await readFile(new URL('./mcp-stdio-client.py',import.meta.url),'utf8');
 const server="import sys,json,time\nfor line in sys.stdin:\n v=json.loads(line)\n if 'id' in v:print(json.dumps({'jsonrpc':'2.0','id':v['id'],'result':{'protocolVersion':'2024-11-05'} if v['id']==0 else {'content':[]}}),flush=True)\ntime.sleep(60)";
 try{const r=await f.project.run({command:['/usr/bin/python3','-c',client,JSON.stringify(['/usr/bin/python3','-c',server]),JSON.stringify({name:'synthetic',arguments:{}})],readOnly:true,reportOutput:true,timeoutMs:3000});assert.equal(r.status,'aborted');assert.equal(r.reason,'tool-failed');assert.deepEqual(JSON.parse(r.diagnostic),{status:'blocked',code:'MCP_EXIT_DEADLINE'});assert.equal((await f.project.run({command:['/usr/bin/true'],readOnly:true})).status,'read');assert.equal(await readFile(join(f.source,'data.txt'),'utf8'),'original');}finally{await f.project.close();}
});
