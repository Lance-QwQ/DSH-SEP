import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {connectInspector} from './inspector-client.mjs';
import {isPowerShellPolicyBlock,assertWrapperEnded,assertLauncherClosed,disconnectAndWait} from './desktop-outcomes.mjs';
const stderr=Buffer.from('SecurityError: ParentContainsErrorRecordException\r\nFullyQualifiedErrorId : UnauthorizedAccess\r\nabout_Execution_Policies\r\n');
test('classifies only the explicit original PowerShell policy refusal',()=>assert.equal(isPowerShellPolicyBlock('start.ps1',{code:1,signal:null},stderr),true));
test('does not turn arbitrary errors, other entrypoints, signals or incomplete evidence into policy blocks',()=>{
 for(const [entry,end,bytes]of [['start.vbs',{code:1,signal:null},stderr],['start.ps1',{code:0,signal:null},stderr],['start.ps1',{code:1,signal:'SIGTERM'},stderr],['start.ps1',null,stderr],...['SecurityError','UnauthorizedAccess','Execution_Policies'].map(marker=>['start.ps1',{code:1,signal:null},Buffer.from(stderr.toString().replace(marker,''))])])assert.equal(isPowerShellPolicyBlock(entry,end,bytes),false);
});
test('known nonzero wrapper exit is a released child, not successful entry acceptance',()=>assert.doesNotThrow(()=>assertWrapperEnded({code:1,signal:null})));
test('unknown wrapper completion remains blocked',()=>{for(const end of [null,undefined,{}, {code:null,signal:null}])assert.throws(()=>assertWrapperEnded(end));});
test('normal launcher close is confirmed separately from wrapper classification',()=>assert.doesNotThrow(()=>assertLauncherClosed({code:0,signal:null})));
test('already-ended nonzero or unknown main launcher cannot be called a normal close',()=>{for(const end of [null,{code:1,signal:null},{code:null,signal:'SIGTERM'}])assert.throws(()=>assertLauncherClosed(end));});
async function until(work,ms){const end=Date.now()+ms;while(Date.now()<end){const value=work();if(value)return value;await delay(20);}throw Error('TEST_CHILD_EXIT_DEADLINE');}
test('actual Inspector connection is disconnected before waiting for the owned process to exit',{timeout:12000},async()=>{
 const child=spawn(process.execPath,['--inspect=127.0.0.1:0','-e','setInterval(()=>{},1000)'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
 let text='',exit=null,inspector;
 child.stdout.resume();child.stderr.on('data',b=>{text+=b.toString('utf8');assert(text.length<65536);});child.once('close',(code,signal)=>exit={code,signal});
 try{
  const endpoint=await until(()=>text.match(/ws:\/\/127\.0\.0\.1:\d+\/[\w-]+/)?.[0],3000);inspector=await connectInspector(endpoint);
  assert.equal(await inspector.evaluate('process.pid'),child.pid);
  await inspector.evaluate('setImmediate(()=>process.exit(0));true');
  await disconnectAndWait(inspector,()=>until(()=>exit,1500));assert.deepEqual(exit,{code:0,signal:null});
 }finally{inspector?.close();await until(()=>exit,5000);assert.deepEqual(exit,{code:0,signal:null});assert.throws(()=>process.kill(child.pid,0),{code:'ESRCH'});}
});
