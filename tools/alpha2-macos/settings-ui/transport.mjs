import {randomUUID} from 'node:crypto';
const fail=code=>{throw Object.assign(Error(code),{code});};
async function text(response){const reader=response.body?.getReader();if(!reader)fail('SEP_MAC_SETTINGS_HTTP_BODY');const chunks=[];let size=0;try{while(true){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>2097152)fail('SEP_MAC_SETTINGS_HTTP_LIMIT');chunks.push(Buffer.from(next.value));}}finally{await reader.cancel().catch(()=>{});}return Buffer.concat(chunks).toString('utf8');}
/** Loopback carrier transport; credentials remain in this lexical closure and are never returned. */
export async function openSettingsClient(authenticatedUrl){
 const start=new URL(authenticatedUrl);if(start.protocol!=='http:'||start.hostname!=='127.0.0.1'||start.username||start.password)fail('SEP_MAC_SETTINGS_HTTP_ORIGIN');
 const origin=start.origin,response=await fetch(start,{redirect:'manual',signal:AbortSignal.timeout(8000)}),cookies=response.headers.getSetCookie();await response.body?.cancel();
 if(![302,303].includes(response.status)||cookies.length!==1)fail('SEP_MAC_SETTINGS_HTTP_AUTH');const cookie=cookies[0].split(';',1)[0];
 const url=path=>{const value=new URL(path,origin+'/');if(value.origin!==origin)fail('SEP_MAC_SETTINGS_HTTP_ORIGIN');return value;};
 async function raw(endpoint,payload,{unauthenticated=false}={}){if(!/^(?:sep-memory\/(?:list|get|update)|sep-budget\/(?:list|get|update|updateDefault))$/.test(endpoint))fail('SEP_MAC_SETTINGS_HTTP_ENDPOINT');const rpcId=randomUUID(),result=await fetch(url('/api/'+endpoint),{method:'POST',headers:{'content-type':'application/json',origin,...unauthenticated?{}:{cookie}},body:JSON.stringify({type:'client-request',rpcId,method:endpoint,payload}),redirect:'manual',signal:AbortSignal.timeout(8000)});const body=await text(result);return {status:result.status,rpcId,body};}
 return Object.freeze({
  async request(endpoint,payload){const r=await raw(endpoint,payload);if(r.status!==200)fail('SEP_MAC_SETTINGS_HTTP_ROUTE');let body;try{body=JSON.parse(r.body);}catch{fail('SEP_MAC_SETTINGS_HTTP_BODY');}if(body.type!=='server-response'||body.rpcId!==r.rpcId||body.result?.ok!==true)fail('SEP_MAC_SETTINGS_HTTP_RESULT');return body.result.value;},
  async rejected(endpoint,payload){const r=await raw(endpoint,payload);if(r.status!==200)fail('SEP_MAC_SETTINGS_HTTP_ROUTE');let body;try{body=JSON.parse(r.body);}catch{fail('SEP_MAC_SETTINGS_HTTP_BODY');}if(body.rpcId!==r.rpcId||body.result?.ok!==false)fail('SEP_MAC_SETTINGS_HTTP_EXPECTED_REFUSAL');return body.result.error?.message;},
  async unauthenticatedStatus(){return (await raw('sep-memory/list',{},{unauthenticated:true})).status;},
  async resource(path){const r=await fetch(url(path),{headers:{cookie},redirect:'manual',signal:AbortSignal.timeout(8000)});if(r.status!==200){await r.body?.cancel();fail('SEP_MAC_SETTINGS_HTTP_CLIENT');}return text(r);},
 });
}
