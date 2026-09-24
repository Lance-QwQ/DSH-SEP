import {safeHostCode} from "./startup-diagnostic.mjs";
import {request} from 'node:http';

export function recoveryClient({endpoint,token,timeoutMs=5000}) {
  const url=new URL(endpoint);
  if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.username||url.password||url.pathname!=='/'||url.search||url.hash||!/^\w{40,128}$/.test(token))throw Error('RECOVERY_CONNECTION_INVALID');
  return {async call(method,params={}) {
    const body=Buffer.from(JSON.stringify({method,params}));
    if(body.length>65536)throw Error('RECOVERY_REQUEST_TOO_LARGE');
    return new Promise((resolve,reject)=>{
      const req=request(new URL('rpc',url),{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json','content-length':body.length}},res=>{
        let length=0;const chunks=[];
        res.on('data',chunk=>{length+=chunk.length;if(length>4*1024*1024)res.destroy(Error('RECOVERY_RESPONSE_TOO_LARGE'));else chunks.push(chunk);});
        res.once('error',reject);res.once('end',()=>{try{const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(res.statusCode!==200||value.ok!==true){const error=Error(value.error?.code??'RECOVERY_UNAVAILABLE');error.code=value.error?.code??'RECOVERY_UNAVAILABLE';const hostCode=safeHostCode(value.error?.hostCode);if(hostCode)error.hostCode=hostCode;reject(error);}else resolve(value.result);}catch(error){reject(error);}});
      });
      req.setTimeout(timeoutMs,()=>req.destroy(Error('RECOVERY_TIMEOUT')));req.once('error',reject);req.end(body);
    });
  }};
}
