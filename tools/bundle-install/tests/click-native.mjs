import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {createServer} from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';
import assert from 'node:assert/strict';
import {setup,close,agent,call,load} from './native-settings-fixture.mjs';
const dir=process.env.SEP_CLICK_NATIVE_ROOT;await mkdir(dir,{recursive:true});
const exe=process.env.SEP_WINDOWS_MCP_EXE,electron=process.env.SEP_ELECTRON_EXE;
assert.equal(createHash('sha256').update(await readFile(exe)).digest('hex'),'6415d0a068280fdf3fdbab75904add3ee974422d56f49f17060da14f8b2f8fcb');
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!/(KEY|SECRET|TOKEN|PASSWORD|ELECTRON_RUN_AS_NODE)/i.test(key)));env.TEMP=join(dir,'temp');env.TMP=env.TEMP;await mkdir(env.TEMP,{recursive:true});
let app,mcp,f,fixture,control,buffer='',sequence=0;const pending=new Map(),trace=[];
const exited=p=>p.exitCode!==null||p.signalCode!==null;
async function stop(p){if(!p||exited(p))return 'already-exited';let method='normal-close';await Promise.race([new Promise(r=>p.once('close',r)),delay(4000)]);if(!exited(p)){method='owned-child-kill-after-deadline';p.kill();await Promise.race([new Promise(r=>p.once('close',r)),delay(3000)]);}assert(exited(p));return method;}
function request(method,params){const id=++sequence;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('MCP_TEST_TIMEOUT'));},20000);pending.set(id,{resolve:msg=>{clearTimeout(timer);msg.error?reject(Error('MCP_PROTOCOL_ERROR')):resolve(msg.result);},reject});mcp.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});}
try{
 app=spawn(electron,[join(import.meta.dirname,'click-native-fixture.cjs'),'--fixture-dir='+dir],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});app.stdout.on('data',()=>{});app.stderr.on('data',()=>{});
 for(let i=0;i<150;i++){try{fixture=JSON.parse(await readFile(join(dir,'state.json')));break;}catch{if(exited(app))throw Error('FIXTURE_EXIT');await delay(100);}}
 assert(fixture?.windowHandle);assert.equal(fixture.pid,app.pid);
 mcp=spawn(exe,['--tools','ui_find,ui_click,ui_wait,ui_snapshot'],{env,windowsHide:true,stdio:['pipe','pipe','pipe']});mcp.stderr.on('data',()=>{});mcp.stdin.on('error',()=>{});mcp.stdout.on('data',data=>{buffer+=data;assert(buffer.length<1024*1024);for(;;){const i=buffer.indexOf('\n');if(i<0)break;const line=buffer.slice(0,i);buffer=buffer.slice(i+1);let msg;try{msg=JSON.parse(line);}catch{continue;}const entry=pending.get(msg.id);if(entry){pending.delete(msg.id);entry.resolve(msg);}}});
 const hello=await request('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'sep-bundle22-owned-test',version:'1'}});assert.equal(hello.serverInfo.version,'1.3.24');mcp.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
 const catalog=await request('tools/list',{});f=await setup({mountRoot:false,business:{click:{enabled:true,verificationTimeoutMs:2500}},shutdownMs:5000});
 const {createMcpToolDefinition}=await load('@deepseek-ai/dsh-mcp-client');
 await f.ctx.plugin({name:'owned-real-mcp-test-transport',inject:['tools'],apply(child){for(const tool of catalog.tools)child.tools.register(createMcpToolDefinition(child,{name:'mcp__sep_windows__'+tool.name,rawName:tool.name,description:tool.description,inputSchema:tool.inputSchema,async call(args){assert.equal(args.windowHandle,fixture.windowHandle,'only this owned test window is allowed');const value=await request('tools/call',{name:tool.name,arguments:args});trace.push({tool:tool.name,args,value});return value;}}));}});
 await f.mount();const a=await agent(f);
 const observed=await request('tools/call',{name:'ui_find',arguments:{windowHandle:fixture.windowHandle,name:'SEP测试确认',controlType:'Button',requireUnique:true}});assert.notEqual(observed.isError,true);const item=JSON.parse(observed.content[0].text).items[0];assert(item?.id);
 const controlToken=randomBytes(32).toString('hex'),go=Promise.withResolvers();let accepted=false;
 control=createServer((req,res)=>{if(req.method!=='POST'||req.url!=='/one-owned-click'||req.headers['x-test-token']!==controlToken||accepted){res.writeHead(403);res.end();return;}accepted=true;res.end('accepted');go.resolve();});await new Promise(resolve=>control.listen(0,'127.0.0.1',resolve));
 await writeFile(join(dir,'ready.json'),JSON.stringify({status:'ready',pid:app.pid,windowHandle:fixture.windowHandle,target:{elementId:item.id,name:item.name,controlType:item.type},server:hello.serverInfo,controlEndpoint:'http://127.0.0.1:'+control.address().port+'/one-owned-click',controlToken}));console.log('READY_FOR_ONE_OWNED_CLICK');
 let timer;const launchWatch=setInterval(()=>{readFile(join(dir,'go.request')).then(()=>go.resolve(),()=>{});},100);try{await Promise.race([go.promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('TEST_ACTION_DEADLINE')),60000);})]);}finally{clearTimeout(timer);clearInterval(launchWatch);}
 const action={requestId:'native-one',windowHandle:fixture.windowHandle,target:{elementId:item.id,name:item.name,controlType:item.type},expected:{mode:'appear',name:'已完成 1',controlType:'Text'}};
 const value=await call(f,a,'computer_click',action);assert.equal(value.outcome,'expected_condition_observed');assert.deepEqual(await call(f,a,'computer_click',action),value);
 await assert.rejects(call(f,a,'computer_click',{requestId:'ambiguous',windowHandle:fixture.windowHandle,target:{name:'同名测试',controlType:'Button'}}),/SEP_CLICK_PREFLIGHT_FAILED/);
 await assert.rejects(call(f,a,'computer_click',{requestId:'disabled',windowHandle:fixture.windowHandle,target:{name:'禁用测试',controlType:'Button'}}),/SEP_CLICK_PREFLIGHT_FAILED/);
 const after=JSON.parse(await readFile(join(dir,'state.json')));assert.equal(after.count,1);assert.equal(trace.filter(row=>row.tool==='ui_click').length,1);assert.equal(f.requests.length,0);
 await writeFile(join(dir,'result.json'),JSON.stringify({status:'pass',scope:'owned synthetic Electron window; actual Windows MCP; native alpha.1 tool factory and controlled root',count:after.count,result:value,checks:{singleClick:true,replayDeduplicated:true,ambiguousRefused:true,disabledRefused:true}},null,2));console.log('PASS_ONE_CLICK');
}catch(error){await writeFile(join(dir,'failure.json'),JSON.stringify({status:'fail',message:error.message,stack:error.stack},null,2));throw error;}
finally{if(control)await new Promise(resolve=>control.close(resolve));await writeFile(join(dir,'trace.json'),JSON.stringify(trace,null,2));if(f)await close(f);if(mcp)mcp.stdin.end();await writeFile(join(dir,'close.request'),'normal owned test close');const appCleanup=await stop(app),mcpCleanup=await stop(mcp);await writeFile(join(dir,'resources.json'),JSON.stringify({controlClosed:!control?.listening,appExited:!app||exited(app),mcpExited:!mcp||exited(mcp),appCleanup,mcpCleanup},null,2));}
