import {createServer} from 'node:http';import {randomBytes,timingSafeEqual} from 'node:crypto';import {isAbsolute} from 'node:path';
const fail=code=>{throw Object.assign(Error(code),{code});};
const methods=new Set(['desktopStatus','startHost','desktopReady','desktopQuitInspection','stopHost']);
const publicCodes=new Set(['RECOVERY_CLOSING','RECOVERY_DESKTOP_UNAVAILABLE','RECOVERY_OPERATION_FAILED']);
function guardian(owner){const s=owner.status();if(!s||!['idle','starting','running','stopping','stopped','blocked'].includes(s.phase)||!Number.isSafeInteger(s.generation)||s.generation<1||(s.pid!==null&&(!Number.isSafeInteger(s.pid)||s.pid<1)))fail('RECOVERY_DESKTOP_UNAVAILABLE');return s;}
function readyValue(value){if(!value||!Array.isArray(value.injections)||typeof value.url!=='string')fail('RECOVERY_DESKTOP_UNAVAILABLE');const u=new URL(value.url);if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||!u.port||u.username||u.password||u.hash||u.pathname!=='/'||[...u.searchParams.keys()].length!==1||!/^[A-Za-z0-9_-]{16,256}$/.test(u.searchParams.get('token')??''))fail('RECOVERY_DESKTOP_UNAVAILABLE');return {url:u.href,injections:value.injections};}
/** Narrow protocol-4 transport. It does not confer program/lease authority;
 * the caller supplies the one owned Host and holds its native launch lease. */
export async function openDesktopRpc({projectDir,owner,closeDeadlineMs=5000}={}){
 if(!isAbsolute(projectDir??'')||!Number.isSafeInteger(closeDeadlineMs)||closeDeadlineMs<1||closeDeadlineMs>30000||!owner||['status','start','ready','inspect','stop'].some(k=>typeof owner[k]!=='function'))fail('SEP_MAC_BROKER_CONFIG');
 const token=randomBytes(32).toString('hex'),expected=Buffer.from('Bearer '+token);let endpoint,closing=false,closed=false,finishing,drainResolve;
 const work=new Set();let closedResolve;const closedPromise=new Promise(r=>{closedResolve=r;});
 const server=createServer({maxHeaderSize:8192},async(req,res)=>{
  const send=(status,value)=>{if(!res.destroyed&&!res.writableEnded){res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(value));}};
  let marker,timer;try{
   if(req.headers.host!==new URL(endpoint).host){send(403,{ok:false,error:{code:'RECOVERY_HOST_HEADER'}});return;}
   if(req.headers.origin!==undefined){send(403,{ok:false,error:{code:'RECOVERY_ORIGIN'}});return;}
   if(req.method!=='POST'||req.url!=='/rpc'){send(404,{ok:false,error:{code:'RECOVERY_ROUTE'}});return;}
   const actual=Buffer.from(req.headers.authorization??'');if(actual.length!==expected.length||!timingSafeEqual(actual,expected)){send(401,{ok:false,error:{code:'RECOVERY_UNAUTHORIZED'}});return;}
   if(closing){send(503,{ok:false,error:{code:'RECOVERY_CLOSING'}});return;}
   let n=0;const chunks=[];timer=setTimeout(()=>req.destroy(),5000);
   for await(const c of req){n+=c.length;if(n>4096){send(413,{ok:false,error:{code:'RECOVERY_REQUEST_TOO_LARGE'}});return;}chunks.push(c);}clearTimeout(timer);
   let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{send(400,{ok:false,error:{code:'RECOVERY_JSON'}});return;}
   if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['method','params'].includes(k))||!methods.has(body.method)||!body.params||typeof body.params!=='object'||Array.isArray(body.params)||Object.keys(body.params).length){send(400,{ok:false,error:{code:'RECOVERY_METHOD'}});return;}
   if(closing){send(503,{ok:false,error:{code:'RECOVERY_CLOSING'}});return;}
   marker={};work.add(marker);let result;
   if(body.method==='desktopStatus')result={projectDir,dshVersion:'0.2.1-alpha.2',protocolVersion:4,transport:'desktop-http',guardian:guardian(owner)};
   else if(body.method==='startHost'){await owner.start();result=guardian(owner);if(result.phase!=='running')fail('RECOVERY_DESKTOP_UNAVAILABLE');}
   else if(body.method==='desktopReady'){const r=readyValue(await owner.ready()),g=guardian(owner);if(g.phase!=='running')fail('RECOVERY_DESKTOP_UNAVAILABLE');result={...r,transport:'desktop-http',dshVersion:'0.2.1-alpha.2',pid:g.pid,generation:g.generation};}
   else if(body.method==='desktopQuitInspection'){const v=await owner.inspect();if(typeof v?.activeTasks!=='boolean'||typeof v?.scheduledTasks!=='boolean')fail('RECOVERY_DESKTOP_UNAVAILABLE');result={activeTasks:v.activeTasks,scheduledTasks:v.scheduledTasks};}
   else result=await owner.stop();
   send(200,{ok:true,result});
  }catch(e){send(409,{ok:false,error:{code:publicCodes.has(e.code)?e.code:'RECOVERY_OPERATION_FAILED'}});}
  finally{clearTimeout(timer);if(marker){work.delete(marker);if(work.size===0){drainResolve?.();drainResolve=undefined;}}}
 });
 server.requestTimeout=5000;server.headersTimeout=5000;server.maxConnections=16;
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});endpoint='http://127.0.0.1:'+server.address().port+'/';
 const connection=Object.freeze({endpoint,token,role:'desktop',projectDir,dshVersion:'0.2.1-alpha.2',protocolVersion:4});
 function close(){
  if(closed)return Promise.resolve({status:'pass',resourcesConfirmedReleased:true});closing=true;
  finishing??=(async()=>{if(work.size)await new Promise(r=>{drainResolve=r;});await new Promise(r=>{server.close(r);server.closeIdleConnections();});closed=true;const receipt={status:'pass',resourcesConfirmedReleased:true};closedResolve(receipt);return receipt;})();
  return new Promise(resolve=>{const timer=setTimeout(()=>resolve({status:'blocked',code:'SEP_MAC_RPC_CLOSE_DEADLINE',pendingRequests:work.size,resourcesConfirmedReleased:false}),closeDeadlineMs);finishing.then(r=>{clearTimeout(timer);resolve(r);});});
 }
 return Object.freeze({connection,close,whenClosed:()=>closedPromise});
}
