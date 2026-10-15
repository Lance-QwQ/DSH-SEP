import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {load,prerequisites} from './host-modules.mjs';
import {fixture} from './transaction-fixtures.mjs';
import * as plugin from './linux-profile-plugin.mjs';
const {Context}=await load('@deepseek-ai/cordis'),{SessionId}=await load('@deepseek-ai/dsh-session'),{ToolCallId}=await load('@deepseek-ai/dsh-llm');
let seq=0;
const server="import sys,json\nfor line in sys.stdin:\n v=json.loads(line)\n if v['method']=='initialize':print(json.dumps({'jsonrpc':'2.0','id':0,'result':{'protocolVersion':'2024-11-05','capabilities':{},'serverInfo':{'name':'synthetic','version':'1'}}}),flush=True)\n elif v['method']=='tools/call':print(json.dumps({'jsonrpc':'2.0','id':1,'result':{'content':[{'type':'text','text':open('/work/data.txt').read()}]}}),flush=True)";
async function setup(){
 const f=await fixture(),ctx=new Context();await prerequisites(ctx);const fiber=ctx.plugin(plugin,{...f,servers:{synthetic:{command:['/usr/bin/python3','-c',server]}}});await fiber;
 const handle=await ctx.agents.create({sessionId:SessionId('linux-'+ ++seq),meta:{cwd:f.source,delegationDepth:0},agentOptions:{}});
 const call=(name,args,signal=new AbortController().signal,agent=handle.agent)=>ctx.tools.execute({name,arguments:args,agent,signal,callId:ToolCallId('call-'+ ++seq)});
 return {...f,ctx,fiber,agent:handle.agent,call,close:()=>ctx.fiber.dispose()};
}
const ok=result=>{assert.equal(result.isError,false,JSON.stringify(result.error));return result.value;};
test('real host tools share one candidate and only the controller can publish it',async()=>{
 const f=await setup();try{
  assert.equal((await f.call('write',{file_path:'data.txt',content:'bad'})).error.info.code,'FS_NOT_OBSERVED');
  assert.equal(ok(await f.call('read',{file_path:'data.txt'})).text,'original');
  ok(await f.call('edit',{file_path:'data.txt',old_string:'original',new_string:'one'}));
  assert.equal(ok(await f.call('read',{file_path:'data.txt'})).text,'one');
  ok(await f.call('bash',{command:'printf two > data.txt'}));
  assert.equal(ok(await f.call('read',{file_path:'data.txt'})).text,'two');
  assert.equal(await readFile(join(f.source,'data.txt'),'utf8'),'original');
  const view=await f.ctx.sepLinuxProfile.review();assert.equal(view.changes.length,1);
  assert.equal((await f.call('commit',{planHash:view.planHash})).isError,true);
  assert.equal((await f.ctx.sepLinuxProfile.commit({planHash:view.planHash})).status,'committed');
  assert.equal(await readFile(join((await f.ctx.sepLinuxProfile.current()).path,'data.txt'),'utf8'),'two');
  assert.equal(await readFile(join(f.source,'data.txt'),'utf8'),'original');
 }finally{await f.close();}
});

test('a proven absent file can be created only in the managed copy and requires a fresh observation',async()=>{
 const f=await setup();try{
  assert.equal((await f.call('write',{file_path:'new.txt',content:'bad'})).error.info.code,'FS_NOT_OBSERVED');
  assert.deepEqual(ok(await f.call('read',{file_path:'new.txt'})),{exists:false,version:'absent'});
  assert.equal((await f.call('edit',{file_path:'new.txt',old_string:'x',new_string:'y'})).error.info.code,'FS_NOT_FOUND');
  ok(await f.call('write',{file_path:'new.txt',content:'created'}));
  assert.equal(ok(await f.call('read',{file_path:'new.txt'})).text,'created');
  await assert.rejects(readFile(join(f.source,'new.txt')),{code:'ENOENT'});
  const plan=await f.ctx.sepLinuxProfile.review();await f.ctx.sepLinuxProfile.commit({planHash:plan.planHash});
  assert.equal(await readFile(join((await f.ctx.sepLinuxProfile.current()).path,'new.txt'),'utf8'),'created');
  await assert.rejects(readFile(join(f.source,'new.txt')),{code:'ENOENT'});
 }finally{await f.close();}
});
test('MCP tools/call uses the same isolated candidate, no inherited network or controller files',async()=>{
 const f=await setup();try{
  ok(await f.call('bash',{command:'printf mcp > data.txt'}));
  const v=ok(await f.call('mcp_call',{server:'synthetic',name:'read',arguments:{}}));assert.equal(v.result.content[0].text,'mcp');
  assert.equal((await f.call('mcp_call',{server:'unknown',name:'read',arguments:{}})).error.info.code,'SEP_LINUX_MCP_UNKNOWN');
  assert.equal((await f.call('bash',{command:'test ! -e '+f.root+'; test ! -e /mnt/c; test ! -e /mnt/d; test ! -e /home/sep-rc; test ! -e /run/WSL; ls /sys/class/net'})).isError,true);
  assert.equal(await readFile(join(f.source,'data.txt'),'utf8'),'original');
 }finally{await f.close();}
});
test('parallel calls serialize without losing changes and readonly child Agents cannot mutate',async()=>{
 const f=await setup();try{
  const results=await Promise.all([f.call('bash',{command:'printf a > a.txt'}),f.call('bash',{command:'printf b > b.txt'})]);results.forEach(ok);
  const child=(await f.ctx.agents.create({sessionId:SessionId('child-'+ ++seq),meta:{cwd:f.source,delegationDepth:1},agentOptions:{}})).agent;
  assert.equal(ok(await f.call('read',{file_path:'a.txt'},undefined,child)).text,'a');
  assert.equal((await f.call('write',{file_path:'a.txt',content:'bad'},undefined,child)).error.info.code,'SEP_LINUX_CHILD_READONLY');
  assert.equal((await f.call('bash',{command:'printf bad > a.txt'},undefined,child)).isError,true);
  assert.equal(ok(await f.call('read',{file_path:'a.txt'})).text,'a');
  assert.equal((await f.ctx.sepLinuxProfile.review()).changes.length,2);
 }finally{await f.close();}
});
test('cancellation preserves the prior candidate; unload closes old references and remount recovers',async()=>{
 const f=await setup();try{
  ok(await f.call('bash',{command:'printf kept > kept.txt'}));const first=await f.ctx.sepLinuxProfile.review();
  const abort=new AbortController(),call=f.call('bash',{command:'printf lost > lost.txt; sleep 5'},abort.signal);setTimeout(()=>abort.abort(),200);assert.equal((await call).isError,true);
  assert.equal((await f.ctx.sepLinuxProfile.review()).planHash,first.planHash);assert.equal(ok(await f.call('read',{file_path:'kept.txt'})).text,'kept');
  const ref=f.ctx.sepLinuxProfile;await f.fiber.dispose();await assert.rejects(ref.current(),{code:'SEP_LINUX_PROFILE_CLOSED'});
  const fiber=f.ctx.plugin(plugin,{root:f.root,source:f.source,isolation:f.isolation,servers:{}});await fiber;
  assert.equal((await f.ctx.sepLinuxProfile.current()).sequence,0);await f.ctx.sepLinuxProfile.discard(first.planHash);
 }finally{await f.close();}
});
test('cold Loader refuses conflicting unrestricted providers without deleting them',async()=>{
 const f=await fixture(),ctx=new Context();await prerequisites(ctx);const retained={marker:1};ctx.provide('fs',retained);try{await assert.rejects(Promise.resolve(ctx.plugin(plugin,{...f,servers:{}})),{code:'SEP_LINUX_PROFILE_CONFLICT'});assert.equal(ctx.fs,retained);}finally{await ctx.fiber.dispose();}
});

test('real Loader cold-starts the profile and removes its tools on unload',async()=>{
 const f=await fixture(),{boot}=await load('@deepseek-ai/dsh-app-boot'),{pathToFileURL}=await import('node:url');const config=join(f.base,'cordis.yml');await writeFile(config,'[]\n');
 const ctx=await boot('dsh',config,[{insert:[{id:'linux-controlled',name:new URL('./linux-profile-plugin.mjs',import.meta.url).href,config:{...f,servers:{}}}]}],prerequisites);
 try{assert(ctx.sepLinuxProfile);assert(ctx.tools.get('bash'));const entry=[...ctx.loader.entries()].find(x=>x.options.id==='linux-controlled');await entry.fiber.dispose();assert.equal(ctx.tools.get('bash'),undefined);assert.equal(ctx.get('sepLinuxProfile'),undefined);}finally{await ctx.fiber.dispose();}
});

test('late foreign tools are refused before dispatch and runtime child depth is monotone',async()=>{
 const f=await setup();let dispatched=false;try{
  const {defineTool}=await load('@deepseek-ai/dsh-tools');f.ctx.tools.register(defineTool({name:'escape',description:'synthetic negative',parameters:{},output:{schema:{type:'string'},render:(_a,value)=>[{type:'text',text:value}]},execute:()=>{dispatched=true;return 'bad';}}));
  assert.equal((await f.call('escape',{})).error.info.code,'SEP_LINUX_UNCONTROLLED_TOOL');assert.equal(dispatched,false);
  const child=(await f.ctx.agents.create({sessionId:SessionId('runtime-child-'+ ++seq),meta:{cwd:f.source,delegationDepth:0},agentOptions:{subagentDepth:1}})).agent;
  assert.equal((await f.call('bash',{command:'printf bad > data.txt'},undefined,child)).isError,true);
  assert.equal(ok(await f.call('read',{file_path:'data.txt'})).text,'original');
 }finally{await f.close();}
});

test('source, controller, home, Windows mounts and external network are unreachable from the tool carrier',async()=>{
 const f=await setup();try{
  const code="import os,socket;assert all(not os.path.exists(p) for p in "+JSON.stringify([f.root,f.source,'/mnt/c','/mnt/d','/home/sep-rc','/run/WSL'])+");s=socket.socket();s.settimeout(.2)\ntry:s.connect(('1.1.1.1',443));raise AssertionError('network reachable')\nexcept OSError:pass\nprint('isolated')";
  assert.match(ok(await f.call('bash',{command:'/usr/bin/python3 -c '+"'"+code.replaceAll("'","'\\''")+"'"})).text,/isolated/);
  assert.equal((await f.call('read',{file_path:'../state.sqlite'})).error.info.code,'FS_PATH_OUTSIDE');
 }finally{await f.close();}
});

test('native UI filesystem sees the reviewed candidate but can never write or accept foreign targets',async()=>{
 const f=await setup();try{
  assert(f.ctx.fs,'Linux UI readonly filesystem is mounted');ok(await f.call('bash',{command:'printf preview > data.txt'}));
  const target=await f.ctx.fs.resolve('data.txt',{cwd:f.source});assert.equal(await f.ctx.fs.readText(target),'preview');
  ok(await f.call('bash',{command:'mkdir nested; printf nested > nested/a.txt'}));
  await assert.rejects(f.ctx.fs.readText(target),{code:'FS_STALE_VERSION'});
  const root=await f.ctx.fs.resolve(f.source),rows=await f.ctx.fs.listDir(root);assert.equal(rows.find(x=>x.name==='nested').type,'directory');
  assert.equal(await f.ctx.fs.readText(await f.ctx.fs.resolve('nested/a.txt',{cwd:f.source})),'nested');
  await assert.rejects(f.ctx.fs.writeText(target,'bad'),{code:'FS_SANDBOX_DENIED'});await assert.rejects(f.ctx.fs.editText(target,{oldString:'preview',newString:'bad',replaceAll:false}),{code:'FS_SANDBOX_DENIED'});
  await assert.rejects(f.ctx.fs.resolve('/etc/passwd'),{code:'FS_SANDBOX_DENIED'});await assert.rejects(f.ctx.fs.readText({targetKey:'/etc/passwd',displayPath:'/etc/passwd'}),{code:'FS_SANDBOX_DENIED'});
  assert.equal(await readFile(join(f.source,'data.txt'),'utf8'),'original');
 }finally{await f.close();}
});
test('restart requires explicit candidate selection and resumes the exact reviewed work copy',async()=>{
 const f=await setup();try{
  ok(await f.call('bash',{command:'printf resumed > data.txt'}));const first=await f.ctx.sepLinuxProfile.review();
  await f.fiber.dispose();await f.ctx.plugin(plugin,{root:f.root,source:f.source,isolation:f.isolation,servers:{}});
  assert.equal((await f.call('read',{file_path:'data.txt'})).error.info.code,'SEP_LINUX_RESTART_REVIEW_REQUIRED');
  assert.equal((await f.ctx.sepLinuxProfile.plans()).length,1);
  await assert.rejects(f.ctx.sepLinuxProfile.resume({planHash:'0'.repeat(64)}),{code:'SEP_PROJECT_PLAN_INVALID'});
  await f.ctx.sepLinuxProfile.resume({planHash:first.planHash});
  assert.equal(ok(await f.call('read',{file_path:'data.txt'})).text,'resumed');
  ok(await f.call('bash',{command:'printf continued > continued.txt'}));
  const next=await f.ctx.sepLinuxProfile.review();assert.equal(next.changes.length,2);
  await f.ctx.sepLinuxProfile.commit({planHash:next.planHash});
  assert.equal(await readFile(join(f.source,'data.txt'),'utf8'),'original');
 }finally{await f.close();}
});
test('official in-process SubagentRuntime activation inherits readonly isolation and bounded disposal',{timeout:8000},async()=>{
 const f=await setup();let release;const held=new Promise(resolve=>release=resolve);let activation;
 try{
  const {LlmAdapter}=await load('@deepseek-ai/dsh-llm');
  class SyntheticAdapter extends LlmAdapter{
   async *stream(){await held;yield {type:'block-start',index:0,blockType:'text'};yield {type:'text-delta',index:0,text:'synthetic completed'};yield {type:'block-end',index:0,block:{type:'text',text:'synthetic completed'}};yield {type:'usage',usage:{inputTokens:10,outputTokens:2}};yield {type:'finish',reason:{kind:'stop'}};}
  }
  f.ctx.llm.registerAdapter(['synthetic'],new SyntheticAdapter());
  await f.ctx.plugin((await load('@deepseek-ai/dsh-working-directory')).default,{defaultDirectory:f.source});
  await f.ctx.plugin((await load('@deepseek-ai/dsh-subagent')).default);
  await f.ctx.plugin(await load('@deepseek-ai/dsh-subagent-spawn-in-process'),{providerName:'spawn'});
  activation=await f.ctx.subagents.startActivation({provider:'spawn',label:'synthetic Linux isolation',request:{parent:f.agent,prompt:[{type:'text',text:'synthetic task'}],maxDepth:1,agentOptions:{provider:'synthetic',model:'synthetic'}},signal:new AbortController().signal,delivery:'caller'});
  const child=f.ctx.agents.get(activation.childId);assert(child);assert.equal(child.session.header.delegationDepth,1);
  assert.equal(ok(await f.call('read',{file_path:'data.txt'},undefined,child)).text,'original');
  assert.equal((await f.call('bash',{command:'printf forbidden > data.txt'},undefined,child)).isError,true);
  assert.equal(typeof activation.result?.then,'function');release();const completed=await activation.result;assert.equal(completed.stopReason,'completed');assert.match(JSON.stringify(completed.output),/synthetic completed/);await activation.dispose();
  assert.equal(ok(await f.call('read',{file_path:'data.txt'})).text,'original');
 }finally{release();await activation?.dispose();await f.close();}
});
