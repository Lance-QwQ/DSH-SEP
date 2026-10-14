// Test-operator classification only. This cannot authorize product operations.
import {setTimeout as delay} from 'node:timers/promises';
import {isDeepStrictEqual} from 'node:util';
const admitted=new WeakSet();
const fail=code=>{throw Object.assign(Error(code),{code});};
function receipt(row,action,identity){
 if(!row||row.action!==action||!Number.isInteger(row.exitCode)||row.signal!==null||row.killed!==false||row.errorCode!==null||typeof row.stdout!=='string')fail('SEP_HIDE_OBSERVER');
 let p;try{p=JSON.parse(row.stdout);}catch{fail('SEP_HIDE_OBSERVER');}
 if(!p||!isDeepStrictEqual(p,row.parsed)||p.status!=='pass'||p.action!==action||p.terminated!==false||p.birthSource!=='proc_bsdinfo'||typeof p.hidden!=='boolean'||typeof p.active!=='boolean'||typeof p.requestSent!=='boolean')fail('SEP_HIDE_OBSERVER');
 if(!Number.isSafeInteger(row.pid)||row.pid<2||p.pid!==row.pid||typeof row.bundlePath!=='string'||!row.bundlePath.startsWith('/')||typeof p.bundleIdentifier!=='string'||!p.bundleIdentifier||!Number.isSafeInteger(p.birthSeconds)||p.birthSeconds<1||!Number.isSafeInteger(p.birthMicroseconds)||p.birthMicroseconds<0||p.birthMicroseconds>=1e6)fail('SEP_HIDE_IDENTITY');
 if(identity&&(row.pid!==identity.pid||row.bundlePath!==identity.bundlePath||p.bundleIdentifier!==identity.bundleIdentifier||p.birthSeconds!==identity.birthSeconds||p.birthMicroseconds!==identity.birthMicroseconds))fail('SEP_HIDE_IDENTITY');
 if(action==='snapshot'?(row.exitCode!==0||p.requestSent!==true):!((row.exitCode===0&&p.requestSent===true)||(row.exitCode===1&&p.requestSent===false)))fail('SEP_HIDE_OBSERVER');
 return p;
}
export function admitVisibleSnapshot(row){
 const p=receipt(row,'snapshot');if(p.hidden!==false)fail('SEP_HIDE_BASELINE');
 const identity=Object.freeze({pid:row.pid,bundlePath:row.bundlePath,bundleIdentifier:p.bundleIdentifier,birthSeconds:p.birthSeconds,birthMicroseconds:p.birthMicroseconds,beforeHidden:false});
 admitted.add(identity);return identity;
}
export async function observeHiddenEffect({identity,request,snapshot,timeoutMs=10000,intervalMs=150}){
 if(!admitted.has(identity)||typeof snapshot!=='function'||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>10000||!Number.isSafeInteger(intervalMs)||intervalMs<1||intervalMs>1000)fail('SEP_HIDE_INPUT');
 const action=receipt(request,'hide',identity),until=performance.now()+timeoutMs;let snapshots=0;
 while(performance.now()<until){
  const row=await snapshot(),p=receipt(row,'snapshot',identity);snapshots++;
  if(performance.now()>=until)break;
  if(p.hidden===true)return {status:'pass',...identity,observedHidden:true,apiRequestSent:action.requestSent,actionExitCode:request.exitCode,snapshots};
  await delay(Math.min(intervalMs,Math.max(1,until-performance.now())));
 }
 fail('SEP_HIDE_EFFECT_DEADLINE');
}
