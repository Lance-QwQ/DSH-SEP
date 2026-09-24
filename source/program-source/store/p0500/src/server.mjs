import {safeHostCode} from "./startup-diagnostic.mjs";
import {createServer} from 'node:http';
import {readFile,open,rename,realpath} from 'node:fs/promises';
import {join,relative,isAbsolute,resolve,dirname} from 'node:path';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {openRecovery} from './controller.mjs';
import {openGuardian} from './guardian.mjs';
import * as backups from './backup.mjs';
import {createDesktopProxy} from './desktop-proxy.mjs';

const failure=code=>Object.assign(Error(code),{code});
const inside=(root,path)=>{const r=relative(root,path);return r===''||r!=='..'&&!r.startsWith('..\\')&&!r.startsWith('../')&&!isAbsolute(r);};
const key=path=>process.platform==='win32'?resolve(path).toLowerCase():resolve(path);
export async function openService({controlRoot,host,port=0,limits,statusDetails,desktop}={}) {
  if(statusDetails!==undefined&&typeof statusDetails!=='function')throw failure('RECOVERY_STATUS_DETAILS_INVALID');
  let controller,blocked,ownerReason;
  try{controller=await openRecovery({controlRoot,limits});}catch(error){if(!['OWNER_LOCKED','JOURNAL_CORRUPT','JOURNAL_LIMIT'].includes(error.code))throw error;blocked=error.code;ownerReason=error.reason;}
  const token=randomBytes(32).toString('hex'),hostToken=randomBytes(32).toString('hex'),desktopToken=desktop?randomBytes(32).toString('hex'):null;
  const desktopProxy=desktop?createDesktopProxy(desktop):null;
  let guardian,guardianBlocked,closed=false,closing=false,finalizing=false,closePromise;
  const inFlight=new Set();
  const html=await readFile(new URL('../ui/index.html',import.meta.url));
  const script=await readFile(new URL('../ui/app.js',import.meta.url));
  const status=async()=>{
    const details=statusDetails?{managedRecovery:await statusDetails()}:{};
    if(!controller)return {...details,recoveryState:{state:'blocked',reason:blocked,ownerReason},projects:[],operations:[],guardian:{state:'blocked'}};
    for(const p of controller.status().projects)await controller.inspectProject(p.id);
    return {...controller.status(),...details,recoveryState:{state:closing?'closing':'ready'},guardian:guardian?.status()??(guardianBlocked?{state:'blocked',phase:'blocked',reason:guardianBlocked}:{state:'unconfigured'})};
  };
  async function projectForPath({cwd}) {
    await controller.assertBusinessOpen();
    if(typeof cwd!=='string'||!isAbsolute(cwd))throw failure('RECOVERY_PROJECT_REQUIRED');
    const p=controller.status().projects.find(p=>inside(p.root,cwd));if(!p)throw failure('RECOVERY_PROJECT_UNKNOWN');
    const checked=await controller.inspectProject(p.id);if(checked.state!=='ready')throw failure('RECOVERY_PROJECT_PAUSED');
    let canonical;try{canonical=await realpath(cwd);}catch{throw failure('RECOVERY_PROJECT_PAUSED');}
    if(key(canonical)!==key(cwd)||!inside(checked.root,canonical))throw failure('RECOVERY_PATH_ALIAS');
    return checked;
  }
  // Serialize registration and recheck inside the queue. A moved/paused known
  // workspace never becomes a new identity; only a genuinely unknown directory
  // selected by the trusted host may acquire recovery metadata.
  let registrationTail=Promise.resolve();
  function registerProjectForPath(params){
    const work=registrationTail.then(async()=>{
      try{return await projectForPath(params);}catch(error){if(error.code!=='RECOVERY_PROJECT_UNKNOWN')throw error;}
      const project=await controller.addProject({root:params.cwd,automatic:true});
      return projectForPath({cwd:project.root});
    });
    registrationTail=work.catch(()=>{});return work;
  }
  const methods={
    desktopStatus:()=>({guardian:guardian?.status()??null,...(desktop?.status?desktop.status():{})}),
    desktopReady:async()=>{await controller.assertBusinessOpen();if(!desktop?.ready)throw failure('RECOVERY_DESKTOP_UNAVAILABLE');return desktop.ready();},
    status,addProject:p=>controller.addProject(p),inspectProject:({id})=>controller.inspectProject(id),
    projectForPath,registerProjectForPath,projectById:({id})=>controller.inspectProject(id),planRebind:p=>controller.planRebind(p),commitRebind:p=>controller.commitRebind(p),
    beginOperation:p=>controller.beginOperation(p),finishOperation:p=>controller.finishOperation(p),
    planResume:p=>controller.planResume(p),reconcileOperation:p=>controller.reconcileOperation(p),
    checkContinuation:p=>controller.checkContinuation(p),
    createContinuation:async({taskId,confirmationHash,requestId})=>{
      if(typeof host?.createContinuation!=='function')throw failure('CONTINUATION_HOST_UNAVAILABLE');
      const request={taskId,confirmationHash,requestId};
      const receipt=await controller.admitContinuation(request);if(receipt.status==='completed')return receipt;
      return host.createContinuation(request,(proof,authorityCheck)=>controller.completeContinuation({...request,sessionId:proof.sessionId,headerHash:proof.headerHash},{authorityCheck}));
    },
    interruptOperations:p=>controller.interruptOperations(p),
    listBackups:()=>backups.listWorkspaceBackups({controlRoot}),
    createBackup:async({projectId})=>{const project=await controller.inspectProject(projectId);if(project.state!=='ready')throw failure('RECOVERY_PROJECT_PAUSED');return backups.createWorkspaceBackup({controlRoot,project});},
    planRestore:({backupId,targetRoot})=>backups.previewWorkspaceRestore({controlRoot,backupId,targetRoot}),
    restoreBackup:({planId,confirmationHash})=>backups.restoreWorkspaceBackup({controlRoot,planId,confirmationHash}),
    planDeleteBackup:({backupId})=>backups.planDeleteBackup({controlRoot,backupId}),
    deleteBackup:({planId,confirmationHash})=>backups.commitDeleteBackup({controlRoot,planId,confirmationHash}),
    listBackupArtifacts:()=>backups.listBackupArtifacts({controlRoot}),
    planDeleteBackupArtifact:({artifactId})=>backups.planDeleteBackupArtifact({controlRoot,artifactId}),
    deleteBackupArtifact:({planId,confirmationHash})=>backups.commitDeleteBackupArtifact({controlRoot,planId,confirmationHash}),
    startHost:params=>{if(!guardian)throw failure(guardianBlocked??'RECOVERY_HOST_UNCONFIGURED');return guardian.start(params);},
    stopHost:()=>{if(!guardian)throw failure(guardianBlocked??'RECOVERY_HOST_UNCONFIGURED');return guardian.stop();},
  };
  let endpoint;
  const server=createServer(async(req,res)=>{
    const send=(code,value)=>{if(res.destroyed||res.writableEnded)return;res.writeHead(code,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(value));};
    try{
      if(req.headers.host!==new URL(endpoint).host){send(403,{ok:false,error:{code:'RECOVERY_HOST_HEADER'}});return;}
      if(req.headers.origin&&req.headers.origin!==new URL(endpoint).origin){send(403,{ok:false,error:{code:'RECOVERY_ORIGIN'}});return;}
      if(req.method==='GET'&&['/','/app.js'].includes(req.url)){
        res.writeHead(200,{'content-type':req.url==='/'?'text/html; charset=utf-8':'text/javascript; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",'referrer-policy':'no-referrer','x-content-type-options':'nosniff'});res.end(req.url==='/'?html:script);return;
      }
      const received=Buffer.from(req.headers.authorization??'');
      const matches=value=>{const expected=Buffer.from(`Bearer ${value}`);return received.length===expected.length&&timingSafeEqual(received,expected);};
      const admin=matches(token),hostAccess=matches(hostToken),desktopAccess=desktopToken!==null&&matches(desktopToken);
      if(!admin&&!hostAccess&&!desktopAccess){send(401,{ok:false,error:{code:'RECOVERY_UNAUTHORIZED'}});return;}
      if(req.url==='/desktop'){
        if(!desktopAccess||!desktopProxy){send(403,{ok:false,error:{code:'RECOVERY_ROLE_DENIED'}});return;}
        if(closing){send(503,{ok:false,error:{code:'RECOVERY_CLOSING'}});return;}
        await controller.assertBusinessOpen();
        const work=desktopProxy.handle(req,res);inFlight.add(work);try{await work;}finally{inFlight.delete(work);}return;
      }
      if(req.method!=='POST'||req.url!=='/rpc'){send(404,{ok:false,error:{code:'RECOVERY_ROUTE'}});return;}
      let n=0;const chunks=[];for await(const chunk of req){n+=chunk.length;if(n>65536){send(413,{ok:false,error:{code:'RECOVERY_REQUEST_TOO_LARGE'}});return;}chunks.push(chunk);}
      let request;try{request=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{send(400,{ok:false,error:{code:'RECOVERY_JSON'}});return;}
      if(!request||Object.keys(request).some(k=>!['method','params'].includes(k))||!Object.hasOwn(methods,request.method)||!request.params||typeof request.params!=='object'||Array.isArray(request.params)){send(400,{ok:false,error:{code:'RECOVERY_METHOD'}});return;}
      if(!admin&&!(hostAccess&&['projectForPath','registerProjectForPath','projectById','beginOperation','finishOperation','planResume','checkContinuation'].includes(request.method))&&!(desktopAccess&&['desktopStatus','desktopReady','startHost','stopHost'].includes(request.method))){send(403,{ok:false,error:{code:'RECOVERY_ROLE_DENIED'}});return;}
      // A graceful host stop may finish already dispatched work over fresh HTTP connections.
      // New administrative mutations and new host dispatches stop immediately at close().
      const drainingHost=hostAccess&&!admin&&['projectForPath','projectById','finishOperation','checkContinuation'].includes(request.method);
      if(finalizing||closing&&!drainingHost){send(503,{ok:false,error:{code:'RECOVERY_CLOSING'}});return;}
      if(!controller&&request.method!=='status')throw failure(blocked);
      const responseSettled=new Promise(done=>{if(res.destroyed||res.writableFinished)done();else{res.once('finish',done);res.once('close',done);}});
      const work=Promise.resolve().then(async()=>{
        try{send(200,{ok:true,result:await methods[request.method](request.params)});}
        catch(error){send(409,{ok:false,error:{code:typeof error.code==='string'?error.code:'RECOVERY_OPERATION_FAILED',...(safeHostCode(error.hostCode)?{hostCode:error.hostCode}:{})}});}
        finally{await responseSettled;}
      });
      inFlight.add(work);try{await work;}finally{inFlight.delete(work);}
    }catch(error){send(409,{ok:false,error:{code:typeof error.code==='string'?error.code:'RECOVERY_OPERATION_FAILED',...(safeHostCode(error.hostCode)?{hostCode:error.hostCode}:{})}});}
  });
  server.requestTimeout=10000;server.headersTimeout=10000;server.maxConnections=32;
  try{
    await new Promise((done,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',done);});
    endpoint=`http://127.0.0.1:${server.address().port}/`;
    if(host&&controller){
      try{guardian=await openGuardian({...host,controlRoot:join(controlRoot,'guardian'),command:{...host.command,env:{...(host.command.env??process.env),DSH_RECOVERY_ENDPOINT:endpoint,DSH_RECOVERY_TOKEN:hostToken}},afterExit:async event=>{await controller.interruptOperations({reason:'host-exit'});await host.afterExit?.(event);}});}
      catch(error){if(!['GUARDIAN_OWNER_UNPROVEN','GUARDIAN_JOURNAL_INVALID','GUARDIAN_JOURNAL_FULL'].includes(error.code))throw error;guardianBlocked=error.code;}
    }
    // Discovery remains outside the journal directory, so a corrupt journal can still show a diagnostic page.
    // OWNER_LOCKED may describe a live primary. A secondary diagnostic instance must
    // never replace the primary's discovery entry or assume its ownership is stale.
    const secondary=blocked==='OWNER_LOCKED';
    const connectionFile=join(dirname(controlRoot),secondary?`recovery-connection.diagnostic-${randomBytes(8).toString('hex')}.json`:'recovery-connection.json'),pendingFile=connectionFile+`.${randomBytes(8).toString('hex')}.pending`;
    const desktopConnection=desktopToken===null?undefined:{endpoint,token:desktopToken,role:'desktop',...(desktop?.status?desktop.status():{})};
    const connection={endpoint,token,...(desktopConnection?{desktop:desktopConnection}:{}),...(secondary?{diagnosticReason:blocked,activeDiscoveryUnchanged:true}:{})};const file=await open(pendingFile,'wx',0o600);
    try{await file.writeFile(JSON.stringify(connection));await file.sync();}finally{await file.close();}
    await rename(pendingFile,connectionFile);
    return {connection,connectionFile,desktopConnection,hostConnection:{endpoint,token:hostToken},controller,guardian,status,close(){
      if(closePromise)return closePromise;if(closed)return Promise.resolve();closing=true;
      closePromise=(async()=>{
        const errors=[];
        // afterExit calls controller directly; it remains available while the guardian drains.
        try{await guardian?.close();}catch(error){errors.push(error);}
        desktopProxy?.close();
        while(inFlight.size)await Promise.allSettled([...inFlight]);
        finalizing=true;
        await new Promise(done=>{server.close(done);server.closeAllConnections();});
        try{await controller?.close();}catch(error){errors.push(error);}
        closed=true;if(errors.length)throw errors[0];
      })();
      return closePromise;
    }};
  }catch(error){await guardian?.close();server.closeAllConnections();server.close();await controller?.close();throw error;}
}
