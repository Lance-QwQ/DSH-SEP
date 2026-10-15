import {open,rename,lstat,realpath} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
const demand=(v,c)=>{if(!v)throw Error(c);};
/** Download into an exclusive partial file; publish its name only after verification. */
export async function downloadPackage({directory,release,fetcher=fetch,signal,maxBytes=536870912,timeoutMs=300000,onProgress=()=>{}}){
 const abort=AbortSignal.any([AbortSignal.timeout(timeoutMs),...(signal?[signal]:[])]);abort.throwIfAborted();
 demand(release?.source==='sep'&&/^[a-f0-9]{64}$/.test(release.bundle?.sha256??'')&&Number.isSafeInteger(maxBytes)&&maxBytes>0&&maxBytes<=536870912,'SEP_DOWNLOAD_INPUT');
 const bundle=release.bundle;demand(/^https:\/\/github\.com\/Lance-QwQ\/DSH-SEP\/releases\/download\/[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+\.zip$/.test(bundle.url??''),'SEP_DOWNLOAD_ORIGIN');
 const st=await lstat(directory);demand(st.isDirectory()&&!st.isSymbolicLink()&&resolve(await realpath(directory)).toLowerCase()===resolve(directory).toLowerCase(),'SEP_DOWNLOAD_DIRECTORY');
 const partial=join(directory,'package.zip.part'),destination=join(directory,'package.zip');let response,target=bundle.url;
 for(let hop=0;hop<4;hop++){
  abort.throwIfAborted();response=await fetcher(target,{method:'GET',redirect:'manual',credentials:'omit',headers:{'user-agent':'DSH-SEP-Self-Update',accept:'application/octet-stream'},signal:abort});
  if([301,302,303,307,308].includes(response.status)){
   const next=new URL(response.headers.get('location')??'',target);await response.body?.cancel();
   demand(next.protocol==='https:'&&!next.username&&!next.password&&!next.hash&&['github.com','release-assets.githubusercontent.com'].includes(next.hostname),'SEP_DOWNLOAD_ORIGIN');
   if(next.hostname==='github.com')demand(next.href===bundle.url,'SEP_DOWNLOAD_ORIGIN');target=next.href;response=null;continue;
  }break;
 }
 demand(response,'SEP_DOWNLOAD_REDIRECT_LIMIT');if(!response.ok){await response.body?.cancel();throw Error('SEP_DOWNLOAD_HTTP_'+response.status);}
 const length=response.headers.get('content-length');if(length!==null&&(!/^\d+$/.test(length)||!Number.isSafeInteger(Number(length))||Number(length)>maxBytes)){await response.body?.cancel();throw Error('SEP_DOWNLOAD_SIZE');}
 const reader=response.body?.getReader();demand(reader,'SEP_DOWNLOAD_EMPTY');let handle,count=0,complete=false;const hash=createHash('sha256');
 try{
  handle=await open(partial,'wx',0o600);
  for(;;){abort.throwIfAborted();const {done,value}=await reader.read();if(done)break;count+=value.length;demand(count<=maxBytes,'SEP_DOWNLOAD_SIZE');hash.update(value);await handle.writeFile(value);onProgress({bytes:count,total:length===null?null:Number(length)});}
  abort.throwIfAborted();demand(count>0&&(length===null||count===Number(length)),'SEP_DOWNLOAD_TRUNCATED');demand(hash.digest('hex')===bundle.sha256,'SEP_DOWNLOAD_HASH');
  await handle.sync();await handle.close();handle=null;
  try{await lstat(destination);throw Error('SEP_DOWNLOAD_EXISTS');}catch(e){if(e.code!=='ENOENT')throw e;}
  await rename(partial,destination);complete=true;return destination;
 }finally{await handle?.close();if(!complete)await reader.cancel().catch(()=>{});reader.releaseLock();}
}
