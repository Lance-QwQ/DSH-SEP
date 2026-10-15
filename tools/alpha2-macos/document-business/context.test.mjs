import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {hash} from './derive.mjs';
import {owned} from '../business/bundle-modules.mjs';
const baseline=process.env.SEP_DOCUMENT_BASELINE==='1';
const create=baseline?async()=>owned('host/context-preparation/index.mjs'):(await import('./context.mjs')).macContextPreparation;
const error=code=>Object.assign(Error(code),{code});
async function fixture(parseContext){
 const testRoot=resolve(process.env.SEP_DOCUMENT_TEST_ROOT);await mkdir(testRoot,{recursive:true,mode:0o700});const root=await mkdtemp(join(testRoot,'context-')),path=join(root,'snapshot.json');
 const files={'sample.py':'class PublicType:\n    pass\n'},task={instance_id:'synthetic',repo:'synthetic/public',base_commit:'0'.repeat(40),problem_statement:'Read only synthetic snapshot'};
 await writeFile(path,JSON.stringify({visibility:'public',task,files}),{mode:0o600});const sha256=hash(await readFile(path));
 const session={header:{id:'synthetic',origin:'user',cwd:root}},agent={session},tools=new Map(),effects=[];let active=0,closed=false;
 const ctx={tools:{register(tool){tools.set(tool.name,tool);}},agents:{get:id=>id===session.header.id?agent:undefined},get:name=>name==='workingDirectory'?{get:()=>session.header.cwd}:undefined,effect:fn=>effects.push(fn)};
 const services={binding:{runtimeRoot:'/synthetic-runtime',manifestSha256:'1'.repeat(64),stateRoot:root},parseContext},controller=new AbortController();
 const config={enabled:true,python:baseline?'/usr/bin/python3':'/synthetic-runtime/tool-runtime/python/bin/python3.12',snapshots:[{id:'sample',projectId:'synthetic',root,path,sha256}]};
 const plugin=await create(services);await plugin.apply(ctx,config,{signal:controller.signal,enter(){if(closed)throw error('OWNER_CLOSED');active++;return()=>active--;}});
 const args={snapshotId:'sample',seeds:['sample.py'],roots:[{path:'sample.py',symbol:'PublicType'}]};
 return {root,path,config,session,files,args,active:()=>active,tool:tools.get('suite_context_prepare'),exec:{agent,signal:new AbortController().signal},async close(){closed=true;controller.abort();for(const effect of effects)await effect()();},plugin};
}
test('context has no parser fallback and propagates capability refusal',async()=>{
 let calls=0;const f=await fixture(async()=>{calls++;throw error('SYNTHETIC_CONTEXT_REFUSAL');});try{await assert.rejects(()=>f.tool.execute(f.args,f.exec),{code:'SYNTHETIC_CONTEXT_REFUSAL'});assert.equal(calls,1);assert.equal(f.active(),0);}finally{await f.close();}
});
test('context parser receives data only and capability output retains snapshot provenance',async()=>{
 let request;const f=await fixture(async input=>{request=input;return JSON.stringify({synthetic:'owned-parser'});});try{const result=await f.tool.execute(f.args,f.exec);assert.equal(result.synthetic,'owned-parser');assert.equal(result.snapshotSha256,f.config.snapshots[0].sha256);assert.equal(result.trust,'untrusted_public_source');assert.equal(result.evaluation,'not_run');assert.deepEqual(Object.keys(request).sort(),['input','signal']);assert.deepEqual(JSON.parse(request.input),{files:f.files,seeds:f.args.seeds,roots:f.args.roots});}finally{await f.close();}
});
test('child and foreign snapshots are rejected before calling parser',async()=>{
 let calls=0;const f=await fixture(async()=>{calls++;throw error('wrong order');});try{f.session.header.origin='subagent';await assert.rejects(()=>f.tool.execute(f.args,f.exec),/CONTEXT_SCOPE/);f.session.header.origin='user';await assert.rejects(()=>f.tool.execute({...f.args,snapshotId:'foreign'},f.exec),/CONTEXT_SCOPE/);assert.equal(calls,0);}finally{await f.close();}
});
test('context missing service refuses; executable cannot be swapped in configuration',async()=>{
 await assert.rejects(()=>create(),{code:'SEP_MAC_CONTEXT_PARSER_REQUIRED'});
 const f=await fixture(async()=>JSON.stringify({}));try{await assert.rejects(()=>f.plugin.apply({}, {...f.config,python:'/usr/bin/python3'}),{code:'SEP_MAC_CONTEXT_BINDING'});}finally{await f.close();}
});
test('context close aborts accepted work, drains ownership and rejects old references',async()=>{
 let entered,release;const started=new Promise(r=>{entered=r;}),gate=new Promise(r=>{release=r;});const f=await fixture(async({signal})=>{entered();await gate;signal.throwIfAborted();return '{}';});
 const work=f.tool.execute(f.args,f.exec);const checked=assert.rejects(work);await started;assert.equal(f.active(),1);let drained=false;const closing=f.close().then(()=>{drained=true;});await new Promise(r=>setTimeout(r,10));assert.equal(drained,false);release();await checked;await closing;assert.equal(f.active(),0);await assert.rejects(()=>f.tool.execute(f.args,f.exec),{code:'OWNER_CLOSED'});
});
