import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile,symlink,access,chmod} from 'node:fs/promises';
import {join} from 'node:path';
import {fixture} from './transaction-fixtures.mjs';
import {setup,ok} from './sep-fixture.mjs';
import {hash} from './project-tree.mjs';
import {runIsolated} from './linux-isolation.mjs';
import {load} from './host-modules.mjs';
import {owned} from './bundle-modules.mjs';
const args={snapshotId:'public-case',seeds:['child.py'],roots:[{path:'child.py',symbol:'Child'}]};
const sourceFiles={'base.py':'class Base:\n    pass\n','child.py':'from base import Base\nclass Child(Base):\n    pass\n'};
async function input(files=sourceFiles){const base=await fixture(),path=join(base.base,'public-case.json'),body=JSON.stringify({visibility:'public',task:{instance_id:'synthetic-context',repo:'synthetic/public',base_commit:'1'.repeat(40),problem_statement:'Inspect Child static bases.'},files});await writeFile(path,body,{mode:0o400});return {base,config:{enabled:true,python:'/usr/bin/python3',snapshots:[{id:'public-case',projectId:'synthetic-project',root:base.source,path,sha256:hash(body)}]}};}
const errorCode=r=>r.error?.info?.code??r.error?.message?.split(':')[0];

test('Linux complete composition resolves static named bases in a readonly namespace without charges or a write plan',async()=>{
 const i=await input(),f=await setup({base:i.base,business:{context:i.config}});try{const before=await readFile(f.budgetPath),v=ok(await f.call('suite_context_prepare',args));assert.equal(v.status,'pass');assert.deepEqual(v.added,['base.py']);assert.deepEqual(Object.keys(v.files).sort(),['base.py','child.py']);assert.equal(v.trust,'untrusted_public_source');assert.equal(v.evaluation,'not_run');assert.equal(v.projectId,'synthetic-project');assert.deepEqual(await f.ctx.sepLinuxProfile.plans(),[]);assert.equal(f.providerCalls(),0);assert.deepEqual(await readFile(f.budgetPath),before);assert.equal(await readFile(join(f.source,'data.txt'),'utf8'),'original');assert.equal(f.api.status().context,'sandboxed-static-public-snapshots');}finally{await f.close();}
});
test('Linux context preserves the larger snapshot contract while ordinary shell output stays bounded',async()=>{
 const files={...sourceFiles,'child.py':sourceFiles['child.py']+'#'+'x'.repeat(80000)},i=await input(files),f=await setup({base:i.base,business:{context:i.config}});try{const v=ok(await f.call('suite_context_prepare',args));assert.equal(v.status,'pass');assert.equal(v.files['child.py'],files['child.py']);assert.equal((await f.call('bash',{command:"python3 -c 'print(\"x\"*100000)'"})).isError,true);assert.deepEqual(await f.ctx.sepLinuxProfile.plans(),[]);}finally{await f.close();}
});
test('Linux context reports dynamic inheritance and never executes supplied top-level Python',async()=>{
 const i=await input({'child.py':"open('/tmp/sep-context-must-not-execute','w').write('bad')\nclass Child(make_base()):\n pass\n"}),f=await setup({base:i.base,business:{context:i.config}});try{const v=ok(await f.call('suite_context_prepare',args));assert.equal(v.status,'blocked');assert(v.unresolved.some(x=>x.reason==='dynamic_base_expression'));await assert.rejects(access('/tmp/sep-context-must-not-execute'),{code:'ENOENT'});assert.equal(f.providerCalls(),0);}finally{await f.close();}
});
test('Linux context refuses foreign sessions, children and calls after runtime close',async()=>{
 const i=await input(),f=await setup({base:i.base,business:{context:i.config}});try{for(const [id,cwd,depth,want]of [['foreign-context',f.base,0,'CONTEXT_SCOPE'],['child-context',f.source,1,'SEP_LINUX_CHILD_READONLY']]){const a=(await f.ctx.agents.create({sessionId:id,meta:{cwd,delegationDepth:depth},agentOptions:{}})).agent;assert.equal(errorCode(await f.call('suite_context_prepare',args,a)),want);}const held=f.ctx.tools.get('suite_context_prepare');assert.equal((await f.api.close()).status,'pass');assert.equal(errorCode(await f.call('suite_context_prepare',args)),'UNKNOWN_TOOL');await assert.rejects(held.execute(args,{agent:f.agent,signal:new AbortController().signal}),{code:'SEP_LINUX_CLOSED'});}finally{await f.close();}
});
test('Linux context refuses changed snapshot bytes and canonical path aliases during mount',async()=>{
 for(const kind of ['hash','alias']){const i=await input();if(kind==='hash'){await chmod(i.config.snapshots[0].path,0o600);await writeFile(i.config.snapshots[0].path,'{}');}else{const alias=join(i.base.base,'alias.json');await symlink(i.config.snapshots[0].path,alias);i.config.snapshots[0].path=alias;}await assert.rejects(setup({base:i.base,business:{context:i.config}}),e=>/CONTEXT_SNAPSHOT_HASH|CONTEXT_CANONICAL_PATH/.test(e.message));}
});
test('Linux parser sandbox opt-in preserves default input ceiling and supports bounded large readonly replies',async()=>{
 const f=await fixture(),scratch=join(f.base,'parser-scratch');await mkdir(scratch,{mode:0o700});const command=['/usr/bin/python3','-I','-c','import sys;sys.stdout.write(sys.stdin.read())'],input='a'.repeat(80000);
 await assert.rejects(runIsolated({...f.isolation,source:f.source,scratch,command,readOnly:true,input}),{code:'SEP_LINUX_SANDBOX_CONFIG'});
 const r=await runIsolated({...f.isolation,source:f.source,scratch,command,readOnly:true,input,maxInputBytes:100000,maxOutputBytes:100000});assert.equal(r.code,0);assert.equal(r.stdout,input);assert.equal(r.exited,true);
 const unicode='中'.repeat(30000),u=await runIsolated({...f.isolation,source:f.source,scratch,command,readOnly:true,input:unicode,maxInputBytes:100000,maxOutputBytes:100000});assert.equal(u.stdout,unicode);
});
test('Linux context preserves parser refusal codes and denies unknown snapshots and untrusted Python binaries',async()=>{
 const i=await input(),f=await setup({base:i.base,business:{context:i.config}});try{assert.equal(errorCode(await f.call('suite_context_prepare',{...args,seeds:['../secret.py']})),'CONTEXT_PATH');assert.equal(errorCode(await f.call('suite_context_prepare',{...args,snapshotId:'unknown'})),'CONTEXT_SCOPE');assert.equal(f.providerCalls(),0);assert.deepEqual(await f.ctx.sepLinuxProfile.plans(),[]);}finally{await f.close();}const j=await input();j.config.python='/usr/bin/sh';await assert.rejects(setup({base:j.base,business:{context:j.config}}),{code:'CONTEXT_CONFIG'});
});
test('Linux trusted parser capability cannot mutate source/work or read the control roots',async()=>{
 const f=await setup();try{const code="import json,pathlib\nr=[]\nfor p in ['/source/data.txt','/work/data.txt']:\n try:pathlib.Path(p).write_text('changed');r.append('writable')\n except OSError:r.append('readonly')\nprint(json.dumps({'writes':r,'controlVisible':pathlib.Path('/opt/dsh-sep-cross-platform').exists()}))",v=JSON.parse(await f.ctx.sepLinuxProfile.parseContext({code,input:''}));assert.deepEqual(v,{writes:['readonly','readonly'],controlVisible:false});assert.deepEqual(await f.ctx.sepLinuxProfile.plans(),[]);assert.equal(await readFile(join(f.source,'data.txt'),'utf8'),'original');}finally{await f.close();}
});
test('Linux readonly parser cancellation kills its dispatched namespace before returning',async()=>{
 const f=await fixture(),scratch=join(f.base,'cancel-parser');await mkdir(scratch,{mode:0o700});const abort=new AbortController();let owner;const r=await runIsolated({...f.isolation,source:f.source,scratch,readOnly:true,command:['/usr/bin/python3','-I','-c','import time;time.sleep(30)'],signal:abort.signal,timeoutMs:5000,onSpawn:proof=>{owner=proof;abort.abort();}});assert(owner);assert.equal(r.reason,'cancelled');assert.equal(r.exited,true);
});
test('Linux parser sandbox enforces its explicit output cap and refuses excessive capability limits',async()=>{
 const f=await fixture(),scratch=join(f.base,'limited-scratch');await mkdir(scratch,{mode:0o700});const command=['/usr/bin/python3','-I','-c','import sys\nwhile True:sys.stdout.write("x"*4096);sys.stdout.flush()'];const r=await runIsolated({...f.isolation,source:f.source,scratch,command,readOnly:true,maxOutputBytes:10000});assert.equal(r.reason,'output-limit');assert.equal(r.exited,true);assert(Buffer.byteLength(r.stdout+r.stderr)<=10000);await assert.rejects(runIsolated({...f.isolation,source:f.source,scratch,command,maxInputBytes:11*1024*1024}),{code:'SEP_LINUX_SANDBOX_CONFIG'});
});
test('Linux native Agent receives the actual sandboxed context tool result and settles only its two synthetic model requests',async()=>{
 const i=await input(),{LlmAdapter,ToolCallId,createUserMessage}=await load('@deepseek-ai/dsh-llm'),{sessionEvents}=await owned('modules/system-enhancement-package/src/session-events.js');let requests=0,f;
 class Adapter extends LlmAdapter{
  async resolveModel(provider,id){return {provider,id,name:id,context:{contextWindow:100000}};}
  async *stream(options){requests++;const result=options.messages.find(m=>m.role==='tool');if(!result){assert(options.tools.some(t=>t.name==='suite_context_prepare'));const id=ToolCallId('native-static-context'),parameters=JSON.stringify(args);yield {type:'block-start',index:0,blockType:'tool-call'};yield {type:'tool-call-delta',index:0,id,name:'suite_context_prepare',argumentsDelta:parameters};yield {type:'block-end',index:0,block:{type:'tool-call',id,name:'suite_context_prepare',arguments:parameters}};}else{assert(JSON.stringify(result).includes('static_named_inheritance_only'));assert(JSON.stringify(result).includes('base.py'));const text='synthetic static context verified';yield {type:'block-start',index:0,blockType:'text'};yield {type:'text-delta',index:0,text};yield {type:'block-end',index:0,block:{type:'text',text}};}yield {type:'usage',usage:{inputTokens:10,outputTokens:2}};yield {type:'finish',reason:{kind:result?'stop':'tool-calls'}};}
 }
 try{f=await setup({base:i.base,business:{context:i.config},adapterFactory:()=>new Adapter()});f.agent.followup(createUserMessage({content:[{type:'text',text:'Inspect the configured public Child inheritance snapshot.'}],source:{kind:'user'}}));await f.agent.whenIdle();assert.deepEqual(f.agentErrors,[]);assert.equal(requests,2);assert(JSON.stringify(sessionEvents(f.agent.session)).includes('synthetic static context verified'));const ledger=JSON.parse(await readFile(f.budgetPath));assert.equal(ledger.entries.length,2);assert(ledger.entries.every(e=>e.status==='settled'));assert.deepEqual(await f.ctx.sepLinuxProfile.plans(),[]);}finally{await f?.close();}
});
