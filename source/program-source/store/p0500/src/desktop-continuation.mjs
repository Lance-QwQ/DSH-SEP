import {createContinuation} from './continuation.mjs';
export const name='sep-desktop-continuation';
export const inject=['connection','recoveryHost','agents','sessions','sessionPersistence','agentPresets'];
/** Authenticated owned-desktop endpoint. A durable admin reservation is required for every creation.
 * 每次创建仍须恢复中心已持久化的管理员授权记录。
 */
export function apply(ctx){
 ctx.effect(()=>ctx.connection.fetch.register({path:'/api/sep-recovery/continuation',methods:['POST'],requestBody:'buffered',async fetch(request){
  const transport=ctx.get('sepDesktopTransport'),url=new URL(request.url);
  const pipe=transport?.kind==='electron-owned-pipe'&&url.protocol==='dsh-app:';
  const http=transport?.kind==='sep-owned-http'&&url.protocol==='http:'&&url.hostname==='dsh.internal';
  if(!pipe&&!http)return new Response('forbidden',{status:403});
  if(request.headers.get('content-type')!=='application/json')return new Response('content type',{status:415});
  const reader=request.body?.getReader();if(!reader)return new Response('empty',{status:400});
  let length=0;const chunks=[];
  try{
   for(;;){const next=await reader.read();if(next.done)break;length+=next.value.byteLength;if(length>4096){await reader.cancel();return new Response('limit',{status:413});}chunks.push(next.value);}
   const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
   if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>!['taskId','confirmationHash','requestId'].includes(key)))return new Response('invalid',{status:400});
   request.signal.throwIfAborted();
   // Cancellation never proves that a native persistence operation was undone.
   // 取消不代表已经落盘的操作被撤销；同一授权请求保留幂等核验。
   return Response.json(await createContinuation(ctx,body));
  }catch(error){return Response.json({code:typeof error.code==='string'&&/^[A-Z0-9_]{1,80}$/.test(error.code)?error.code:'CONTINUATION_FAILED'},{status:409});}
  finally{reader.releaseLock();}
 }}));
}

