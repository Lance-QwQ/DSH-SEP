import assert from 'node:assert/strict';
import {test} from 'node:test';
import {writeFile,readFile,access} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {setup,close,agent,owned,root} from './native-settings-fixture.mjs';
const entry=process.env.SEP_CONTEXT_ENTRY==='original'?'modules/context-preparation/index.mjs':'host/context-preparation/index.mjs';
async function fixture(){
 const f=await setup();
 try{
  const payload={visibility:'public',task:{instance_id:'synthetic-context-1',repo:'synthetic/fixture',base_commit:'a'.repeat(40),problem_statement:'Read named static bases only.'},files:{'sample.py':'class Root:\n    pass\n\nclass Child(Root):\n    pass\n'}};
  const path=join(f.dirs.project,'snapshot.json'),body=JSON.stringify(payload);await writeFile(path,body);const config={enabled:true,python:process.env.SEP_TEST_PYTHON,snapshots:[{id:'synthetic-context',projectId:'synthetic-project',root:f.dirs.project,path,sha256:createHash('sha256').update(body).digest('hex')}]};
  f.contextFiber=f.ctx.plugin(await owned(entry),config);await f.contextFiber;f.a=await agent(f);f.args={snapshotId:'synthetic-context',seeds:['sample.py'],roots:[{path:'sample.py',symbol:'Child'}]};return f;
 }catch(error){await close(f);throw error;}
}
test('the actual context tool executes its Python companion from a deep real installed package path',async()=>{
 const f=await fixture();try{
  const script=join(root,'bundle/modules/context-preparation/context_resolver.py');assert(script.length>300,'fixture must exercise Windows deep path');await access(script);
  const tool=f.ctx.tools.get('suite_context_prepare',f.a);const result=await tool.execute(f.args,{agent:f.a,signal:new AbortController().signal,callId:'deep-context'});
  assert.equal(result.trust,'untrusted_public_source');assert.equal(result.evaluation,'not_run');assert.match(JSON.stringify(result),/Child/);assert.match(JSON.stringify(result),/Root/);assert.equal(result.snapshotId,f.args.snapshotId);assert.deepEqual(await readFile(f.budgetPath),f.bytes);assert.equal(f.requests.length,0);
 }finally{await f.contextFiber?.dispose();await close(f);}
});
test('the real registry cancels context preparation before dispatch without publishing a result body',async()=>{
 const f=await fixture();try{const abort=new AbortController();abort.abort();const result=await f.ctx.tools.execute({name:'suite_context_prepare',arguments:f.args,agent:f.a,signal:abort.signal,callId:'cancel-context'});assert.equal(result.isError,true);assert.equal(result.value,undefined);assert.deepEqual(await readFile(f.budgetPath),f.bytes);assert.equal(f.requests.length,0);}finally{await f.contextFiber?.dispose();await close(f);}
});
test('context tool keeps scope checks before Python execution',async()=>{
 const f=await fixture();try{const tool=f.ctx.tools.get('suite_context_prepare',f.a);await assert.rejects(tool.execute(f.args,{agent:{session:{header:{id:'foreign',cwd:f.dirs.project}}},signal:new AbortController().signal}),/CONTEXT_SCOPE/);assert.deepEqual(await readFile(f.budgetPath),f.bytes);}finally{await f.contextFiber?.dispose();await close(f);}
});
