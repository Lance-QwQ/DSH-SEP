const fail=code=>{throw Object.assign(Error(code),{code});};
/** Validate the private Host URL before any credential-bearing network request. */
export function httpReadyUrl(value){
 let u;try{u=new URL(value);}catch{fail('RECOVERY_HTTP_READY');}
 if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||!u.port||u.username||u.password||u.hash||u.pathname!=='/'
  ||[...u.searchParams.keys()].length!==1||!u.searchParams.has('token')||!/^[A-Za-z0-9_-]{16,256}$/.test(u.searchParams.get('token')))fail('RECOVERY_HTTP_READY');
 return u;
}
/** One authenticated Host generation; closing aborts accepted requests and forbids new ones. */
export async function openHttpCarrier(ready,{signal}={}){
 const url=httpReadyUrl(ready.url),lifetime=new AbortController();
 const handshake=await fetch(url,{redirect:'manual',signal:AbortSignal.any([lifetime.signal,AbortSignal.timeout(5000),...(signal?[signal]:[])])});
 const raw=handshake.headers.get('set-cookie');await handshake.body?.cancel();
 if(handshake.status!==303||!raw||raw.length>8192)fail('RECOVERY_HTTP_AUTH');
 const cookie=raw.split(';',1)[0];if(!/^[^=\s;,]+=[^\r\n;,]+$/.test(cookie))fail('RECOVERY_HTTP_AUTH');
 return {ready,close:()=>lifetime.abort(),async fetch(request){
  if(lifetime.signal.aborted)fail('RECOVERY_HTTP_CLOSED');
  const source=new URL(request.url);if(source.protocol!=='dsh-app:'||source.hostname!=='app'||source.port||source.username||source.password)fail('RECOVERY_HTTP_ORIGIN');
  const origin=request.headers.get('origin');if(origin!==null&&origin!=='dsh-app://app')fail('RECOVERY_HTTP_ORIGIN');
  const target=new URL(url.origin);target.pathname=source.pathname;target.search=source.search;
  const headers=new Headers(request.headers);for(const n of ['host','origin','authorization','cookie','sec-fetch-site'])headers.delete(n);headers.set('cookie',cookie);
  const response=await fetch(target,{method:request.method,headers,body:request.body,duplex:'half',redirect:'manual',signal:AbortSignal.any([request.signal,lifetime.signal])});
  const outgoing=new Headers(response.headers);for(const n of ['content-encoding','content-length','set-cookie'])outgoing.delete(n);
  return new Response(response.body,{status:response.status,headers:outgoing});
 }};
}
