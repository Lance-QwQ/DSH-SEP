import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import assert from 'node:assert/strict';
import {host,call,load,root,installed} from './host.mjs';
import * as plugin from '../src/computer-click.js';
const work=resolve(import.meta.dirname,'..');
const run=process.argv[2]??'native-01';
assert.match(run,/^native-[0-9]{2}$/);
const dir=join(work,'evidence',run);await mkdir(dir);
const exe=join(root,'dsh-daily/runtime/windows-mcp/v1.3.24-win-x64/Sbroenne.WindowsMcp.exe');
assert.equal(createHash('sha256').update(await readFile(exe)).digest('hex'),'6415d0a068280fdf3fdbab75904add3ee974422d56f49f17060da14f8b2f8fcb');
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!/(KEY|SECRET|TOKEN|PASSWORD|ELECTRON_RUN_AS_NODE)/i.test(k)));
let app,mcp,ctx,fixture,buffer='',sequence=0;const pending=new Map(),records=[];
const exited=p=>p.exitCode!==null||p.signalCode!==null;
async function stop(p){if(!p||exited(p))return 'already-exited';await Promise.race([new Promise(r=>p.once('exit',r)),delay(4000)]);let method='normal-close';if(!exited(p)){method='owned-child-kill-after-deadline';p.kill();await Promise.race([new Promise(r=>p.once('exit',r)),delay(3000)]);}assert.ok(exited(p),'owned child still active');return method;}
function request(method,params){
 const id=++sequence;return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{pending.delete(id);reject(Error('MCP_TEST_TIMEOUT'));},20000);
  pending.set(id,{resolve:m=>{clearTimeout(timer);m.error?reject(Error(JSON.stringify(m.error))):resolve(m.result);},reject});
  mcp.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');
 });
}
try{
 app=spawn(join(installed,'electron/dist/electron.exe'),[join(import.meta.dirname,'fixture.cjs'),`--fixture-dir=${dir}`],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
 let diagnostics='';app.stdout.on('data',()=>{});app.stderr.on('data',b=>{diagnostics=(diagnostics+b.toString()).slice(-4000);});
 for(let i=0;i<150;i++){try{fixture=JSON.parse(await readFile(join(dir,'state.json'),'utf8'));break;}catch{if(exited(app))throw Error('FIXTURE_EXIT '+diagnostics);await delay(100);}}
 assert.ok(fixture?.windowHandle,'fixture never ready');assert.equal(fixture.pid,app.pid);
 mcp=spawn(exe,['--tools','ui_find,ui_click,ui_wait,ui_snapshot'],{env,windowsHide:true,stdio:['pipe','pipe','pipe']});mcp.stderr.on('data',()=>{});
 mcp.stdout.on('data',b=>{buffer+=b;for(;;){const i=buffer.indexOf('\n');if(i<0)break;const line=buffer.slice(0,i);buffer=buffer.slice(i+1);let m;try{m=JSON.parse(line);}catch{continue;}const p=pending.get(m.id);if(p){pending.delete(m.id);p.resolve(m);}}});
 const hello=await request('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'sep-click-isolated-test',version:'1'}});
 assert.equal(hello.serverInfo.version,'1.3.24');mcp.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
 const catalog=await request('tools/list',{});await writeFile(join(dir,'catalog.json'),JSON.stringify(catalog,null,2));
 ctx=await host();const {createMcpToolDefinition}=await load('dsh-mcp-client');
 for(const tool of catalog.tools)ctx.tools.register(createMcpToolDefinition(ctx,{name:'mcp__sep_windows__'+tool.name,rawName:tool.name,description:tool.description,inputSchema:tool.inputSchema,async call(args){
  assert.equal(args.windowHandle,fixture.windowHandle,'only this test window is allowed');
  const response=await request('tools/call',{name:tool.name,arguments:args});records.push({tool:tool.name,args,response});return response;
 }}));
 await ctx.plugin(plugin,{enabled:true,verificationTimeoutMs:2000});
 const snapshot=await request('tools/call',{name:'ui_snapshot',arguments:{windowHandle:fixture.windowHandle,mode:'full',includeDiagnostics:true}});
 records.push({tool:'diagnostic-snapshot',response:snapshot});
 const observed=await request('tools/call',{name:'ui_find',arguments:{windowHandle:fixture.windowHandle,name:'SEP测试确认',controlType:'Button',requireUnique:true}});
 records.push({tool:'initial-observation',response:observed});assert.notEqual(observed.isError,true);
 const observedItem=JSON.parse(observed.content[0].text).items[0];assert.ok(observedItem.id);
 const action={requestId:run,windowHandle:fixture.windowHandle,target:{elementId:observedItem.id,name:observedItem.name,controlType:observedItem.type},expected:{mode:'appear',name:'已完成 1',controlType:'Text'}};
 const result=await call(ctx,action);assert.equal(result.isError,false,JSON.stringify(result));assert.equal(result.value.outcome,'expected_condition_observed');
 const replay=await call(ctx,action);assert.deepEqual(replay.value,result.value);
 const ambiguous=await call(ctx,{requestId:run+'-ambiguous',windowHandle:fixture.windowHandle,target:{name:'同名测试',controlType:'Button'}});assert.equal(ambiguous.isError,true);
 const disabled=await call(ctx,{requestId:run+'-disabled',windowHandle:fixture.windowHandle,target:{name:'禁用测试',controlType:'Button'}});assert.equal(disabled.isError,true);
 const actual=JSON.parse(await readFile(join(dir,'state.json'),'utf8'));assert.equal(actual.count,1);assert.equal(records.filter(x=>x.tool==='ui_click').length,1);
 await writeFile(join(dir,'result.json'),JSON.stringify({status:'pass',server:hello.serverInfo,fixture:{pid:app.pid,windowHandle:fixture.windowHandle},checks:{singleClick:true,postcondition:true,replayNoDuplicate:true,ambiguousNoClick:true,disabledNoClick:true,count:actual.count},result,replay,ambiguous,disabled},null,2));
 console.log(JSON.stringify({status:'pass',run,clickCount:actual.count}));
}catch(error){await writeFile(join(dir,'failure.json'),JSON.stringify({status:'fail',error:String(error),stack:error.stack},null,2));throw error;}
finally{
 await writeFile(join(dir,'trace.json'),JSON.stringify(records,null,2));
 if(ctx)await ctx.fiber.dispose();if(mcp)mcp.stdin.end();
 await writeFile(join(dir,'close.request'),'normal test close');const appCleanup=await stop(app),mcpCleanup=await stop(mcp);
 await writeFile(join(dir,'resources.json'),JSON.stringify({appExited:!app||exited(app),mcpExited:!mcp||exited(mcp),appCleanup,mcpCleanup},null,2));
}
