// Test-only main-process inspection. All actions/observations are synchronous;
// waiting for a Promise inside a native modal would conflate UI and transport.
import assert from 'node:assert/strict';
export async function connectSmokeInspector(url){
 assert(/^ws:\/\/127\.0\.0\.1:\d+\/[a-z0-9-]+$/i.test(url));const ws=new WebSocket(url),pending=new Map();let seq=0;
 await new Promise((resolve,reject)=>{const t=setTimeout(()=>{ws.close();reject(Error('FULL_INSPECTOR_CONNECT'));},5000);ws.addEventListener('open',()=>{clearTimeout(t);resolve();},{once:true});ws.addEventListener('error',()=>{clearTimeout(t);reject(Error('FULL_INSPECTOR_CONNECT'));},{once:true});});
 ws.addEventListener('message',event=>{const m=JSON.parse(event.data),r=pending.get(m.id);if(!r)return;pending.delete(m.id);clearTimeout(r.timer);m.error?r.reject(Error('FULL_INSPECTOR_RPC')):r.resolve(m.result);});
 ws.addEventListener('close',()=>{for(const r of pending.values()){clearTimeout(r.timer);r.reject(Error('FULL_INSPECTOR_CLOSED'));}pending.clear();});
 const call=(method,params)=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('FULL_INSPECTOR_DEADLINE'));},10000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});
 return{close:()=>ws.close(),eval:async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:false,returnByValue:true});if(r.exceptionDetails)throw Object.assign(Error('FULL_INSPECTOR_EVALUATION'),{diagnostic:{errorType:r.exceptionDetails.exception?.className,description:String(r.exceptionDetails.exception?.description??'').slice(0,2048)}});return r.result?.value;}};
}
