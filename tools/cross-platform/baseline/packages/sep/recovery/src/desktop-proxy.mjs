import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';

const forbidden=new Set(['host','connection','transfer-encoding','content-length','authorization','proxy-authorization','x-dsh-desktop-request']);
const failure=code=>Object.assign(Error(code),{code});
/** Authenticated server-side streaming adapter. Authentication belongs to openService. */
export function createDesktopProxy(desktop){
 if(typeof desktop?.fetch!=='function')throw failure('RECOVERY_DESKTOP_CONFIG');
 const maxRequests=desktop.limits?.maxRequests??16,maxMetadataBytes=desktop.limits?.maxMetadataBytes??12288;
 if(!Number.isSafeInteger(maxRequests)||maxRequests<1||maxRequests>128||!Number.isSafeInteger(maxMetadataBytes)||maxMetadataBytes<256||maxMetadataBytes>16384)throw failure('RECOVERY_DESKTOP_CONFIG');
 const active=new Set();let closed=false;
 return {
  close(){closed=true;for(const abort of active)abort.abort(failure('RECOVERY_CLOSING'));},
  async handle(req,res){
   const reject=(status,code)=>{if(res.headersSent){res.destroy();return;}res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({ok:false,error:{code}}));};
   if(closed){reject(503,'RECOVERY_CLOSING');return;}
   if(active.size>=maxRequests){reject(429,'RECOVERY_DESKTOP_ACTIVE_LIMIT');return;}
   let meta;
   try{
    const encoded=req.headers['x-dsh-desktop-request'];if(typeof encoded!=='string'||encoded.length>maxMetadataBytes||!/^[A-Za-z0-9_-]+$/.test(encoded))throw Error();
    meta=JSON.parse(Buffer.from(encoded,'base64url').toString('utf8'));
    if(!meta||Object.keys(meta).some(k=>!['url','headers'].includes(k))||typeof meta.url!=='string'||!Array.isArray(meta.headers))throw Error();
    const url=new URL(meta.url);if(url.protocol!=='dsh-app:'||url.hostname!=='app'||url.port||url.username||url.password||url.hash)throw Error();
    if(meta.headers.some(row=>!Array.isArray(row)||row.length!==2||row.some(x=>typeof x!=='string')||forbidden.has(row[0].toLowerCase())))throw Error();
   }catch{reject(400,'RECOVERY_DESKTOP_REQUEST');return;}
   const abort=new AbortController();active.add(abort);
   const cancel=()=>{if(!res.writableFinished)abort.abort(failure('RECOVERY_DESKTOP_DISCONNECTED'));};
   req.once('aborted',cancel);res.once('close',cancel);
   try{
    const hasBody=!['GET','HEAD'].includes(req.method);
    const request=new Request(meta.url,{method:req.method,headers:meta.headers,signal:abort.signal,...hasBody?{body:Readable.toWeb(req),duplex:'half'}:{}});
    const response=await desktop.fetch(request);abort.signal.throwIfAborted();
    if(!(response instanceof Response))throw failure('RECOVERY_DESKTOP_RESPONSE');
    const headers=Object.fromEntries([...response.headers].filter(([name])=>!forbidden.has(name)));res.writeHead(response.status,headers);
    if(response.body===null)res.end();else await pipeline(Readable.fromWeb(response.body),res,{signal:abort.signal});
   }catch(error){if(!abort.signal.aborted)reject(error.code==='RECOVERY_DESKTOP_UNAVAILABLE'?503:502,'RECOVERY_DESKTOP_UNAVAILABLE');}
   finally{req.off('aborted',cancel);res.off('close',cancel);active.delete(abort);}
  },
 };
}
