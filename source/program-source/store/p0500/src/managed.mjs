import {openService} from './server.mjs';
import {readFile,lstat} from 'node:fs/promises';
import {join,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {createRecoveryMaintenance} from './maintenance.mjs';
import {openHttpCarrier} from './http-carrier.mjs';
import {createNativeSepLifecycle} from './sep-lock-native.mjs';
import {prepareSepLockScope,captureSepLockReceipt} from './sep-lock-recovery.mjs';
export async function openManagedService({host,...options}={}) {
 if(!host)return openService(options);
 if(!isAbsolute(host.suiteRoot??'')||!isAbsolute(host.suiteLockDirectory??'')||!isAbsolute(host.storageRoot??'')||!Array.isArray(host.projectIds)||!host.projectIds.length)throw Error('RECOVERY_MANAGED_CONFIG');
 const manifest=JSON.parse(await readFile(join(host.suiteRoot,'package.json'),'utf8'));
 if(manifest.name!=='dsh-system-enhancement-package'||manifest.version!=='0.1.0-alpha.15.dsh-alpha2.1')throw Error('RECOVERY_MANAGED_SUITE_VERSION');
 const {openControl}=await import(pathToFileURL(join(host.suiteRoot,'src/p2/control.js')).href);
 const {storageIdentity}=await import(pathToFileURL(join(host.suiteRoot,'src/p2/storage-location.js')).href);
 const desktopConfig=host.desktop;
 let DesktopHostProcess;
 if(desktopConfig){
  if(!['desktop-v3','desktop-http'].includes(host.transport)||!isAbsolute(desktopConfig.projectDir??'')||typeof desktopConfig.dshVersion!=='string')throw Error('RECOVERY_DESKTOP_CONFIG');
  if(host.transport==='desktop-v3'){
   if(!isAbsolute(desktopConfig.transportModule??''))throw Error('RECOVERY_DESKTOP_CONFIG');
   ({DesktopHostProcess}=await import(pathToFileURL(desktopConfig.transportModule).href));
   if(typeof DesktopHostProcess!=='function')throw Error('RECOVERY_DESKTOP_TRANSPORT');
  }
 }
 const nativeOwnership=createNativeSepLifecycle({suiteLockDirectory:host.suiteLockDirectory,storageRoot:host.storageRoot,openControl});
 let service,prepared,lastRecovery=null,lastPrerequisite=null,hostUrl=null,ownedChild=null,carrier=null;
 const calls=new Map(),failure=code=>Object.assign(Error(code),{code});
 function forgetChild() {
  ownedChild=null;carrier?.close?.();carrier=null;
  for(const call of calls.values())call.reject(failure('CONTINUATION_OUTCOME_UNKNOWN'));
  calls.clear();
 }
 const suiteLockDirectory=host.suiteLockDirectory,storageRoot=host.storageRoot;
 const configured={...host,
  onSpawn:event=>{nativeOwnership.observeChild(event);host.onSpawn?.(event);},
  beforeStart:async()=>{
   try{
    await service.controller.assertBusinessOpen();
    let ready=0;for(const id of host.projectIds){const p=await service.controller.inspectProject(id);if(p.state==='ready')ready++;}
    if(!ready){lastPrerequisite='RECOVERY_NO_READY_PROJECT';return false;}
    const admitted=await nativeOwnership.beforeStart();if(admitted.status!=='pass'){lastPrerequisite=admitted.reason;return false;}
    prepared=await prepareSepLockScope({suiteLockDirectory,storageRoot,resolveStorageIdentity:storageIdentity});lastPrerequisite=null;return true;
   }catch(error){lastPrerequisite=error.code??'RECOVERY_PREREQUISITE';return false;}
  },
  readiness:async({child,generation,signal,observedReady})=>{
   const ready=await observedReady;signal.throwIfAborted();
   // Ready must still prove that both SEP data owners belong to this child.
   // Exit recovery uses the native lease proof, including before-ready exits.
   await captureSepLockReceipt({child,generation,prepared,suiteLockDirectory,storageRoot});
   if(desktopConfig){
    if(ready.dshVersion!==desktopConfig.dshVersion)throw failure('RECOVERY_DESKTOP_VERSION');
    if(host.transport==='desktop-http'){
     if(ready.transport!=='desktop-http')throw failure('RECOVERY_DESKTOP_VERSION');
     const transport=await openHttpCarrier(ready,{signal});
     if(signal.aborted){transport.close();signal.throwIfAborted();}carrier=transport;
    }else{
     if(ready.protocolVersion!==3)throw failure('RECOVERY_DESKTOP_VERSION');
     const transport=new DesktopHostProcess(host.command.file,desktopConfig.projectDir,undefined,{child,ready:Promise.resolve(ready)});
     await transport.start();signal.throwIfAborted();carrier=transport;
    }
   }
   if(host.readyFile){const s=await lstat(host.readyFile);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||s.size>4096)throw Error('RECOVERY_READY_FILE');const ready=JSON.parse(await readFile(host.readyFile,'utf8'));const url=new URL(ready.url);if(ready.pid!==child.pid||url.protocol!=='http:'||url.hostname!=='127.0.0.1'||!url.port||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('RECOVERY_READY_URL');hostUrl=url.href;}
   ownedChild=child;
   child.on('message',message=>{
    if(ownedChild!==child||message?.type!=='dsh-recovery-continuation-result')return;
    const call=calls.get(message.id);if(!call)return;
    if(message.ok===true&&message.proof?.status==='native-persisted'&&typeof message.proof.sessionId==='string'&&/^[a-f0-9]{64}$/.test(message.proof.headerHash??''))call.resolve({sessionId:message.proof.sessionId,headerHash:message.proof.headerHash});else call.reject(failure(typeof message.code==='string'&&/^[A-Z0-9_]{1,80}$/.test(message.code)?message.code:'CONTINUATION_OUTCOME_UNKNOWN'));
   });
   host.onOwnedChild?.(child);return true;
  },
  createContinuation:(request,complete)=>{
   const child=ownedChild;if(!child?.connected||child.exitCode!==null||service.guardian.status().phase!=='running')throw failure('CONTINUATION_HOST_UNAVAILABLE');
   if(calls.size>=16)throw failure('CONTINUATION_ACTIVE_LIMIT');
   const id=randomUUID();let timer;
   if(desktopConfig){
    const transport=carrier;if(!transport)throw failure('CONTINUATION_HOST_UNAVAILABLE');
    const abort=new AbortController();
    return new Promise((resolve,reject)=>{
     calls.set(id,{resolve,reject});timer=setTimeout(()=>{abort.abort();reject(failure('CONTINUATION_OUTCOME_UNKNOWN'));},15000);timer.unref();
     (async()=>{
      const response=await transport.fetch(new Request('dsh-app://app/api/sep-recovery/continuation',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(request),signal:abort.signal}));
      const reader=response.body?.getReader();if(!reader)throw failure('CONTINUATION_OUTCOME_UNKNOWN');
      let length=0;const chunks=[];try{for(;;){const next=await reader.read();if(next.done)break;length+=next.value.byteLength;if(length>4096){await reader.cancel();throw failure('CONTINUATION_OUTCOME_UNKNOWN');}chunks.push(next.value);}}finally{reader.releaseLock();}
      const proof=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if(!response.ok&&typeof proof.code==='string'&&/^[A-Z0-9_]{1,80}$/.test(proof.code))throw failure(proof.code);
      if(!response.ok||proof.status!=='native-persisted'||typeof proof.sessionId!=='string'||!/^[a-f0-9]{64}$/.test(proof.headerHash??''))throw failure('CONTINUATION_OUTCOME_UNKNOWN');
      return proof;
     })().then(resolve,reject);
    }).then(proof=>complete(proof,()=>ownedChild===child&&carrier===transport&&child.connected&&child.exitCode===null&&service.guardian.status().phase==='running')).finally(()=>{abort.abort();clearTimeout(timer);calls.delete(id);});
   }
   return new Promise((resolve,reject)=>{
    calls.set(id,{resolve,reject});timer=setTimeout(()=>reject(failure('CONTINUATION_OUTCOME_UNKNOWN')),15000);timer.unref();
    child.send({type:'dsh-recovery-continuation',id,request},error=>{if(error)reject(failure('CONTINUATION_OUTCOME_UNKNOWN'));});
   }).then(proof=>complete(proof,()=>ownedChild===child&&child.connected&&child.exitCode===null&&service.guardian.status().phase==='running')).finally(()=>{clearTimeout(timer);calls.delete(id);});
  },
  afterExit:async exit=>{
   hostUrl=null;forgetChild();
   lastRecovery=await nativeOwnership.afterExit(exit);
   if(lastRecovery.status!=='pass')throw Error(lastRecovery.reason);
   await host.afterExit?.(exit);
  },
 };
 const desktop=desktopConfig?{
  status:()=>({projectDir:desktopConfig.projectDir,dshVersion:desktopConfig.dshVersion,transport:host.transport,protocolVersion:host.transport==='desktop-http'?4:3}),
  ready:()=>{if(host.transport!=='desktop-http'||!carrier||!ownedChild?.connected||ownedChild.exitCode!==null||service.guardian.status().phase!=='running')throw failure('RECOVERY_DESKTOP_UNAVAILABLE');return carrier.ready;},
  fetch:request=>{if(!carrier||!ownedChild?.connected||ownedChild.exitCode!==null||service.guardian.status().phase!=='running')throw failure('RECOVERY_DESKTOP_UNAVAILABLE');return carrier.fetch(request);},
 }:undefined;
 service=await openService({...options,host:configured,desktop,statusDetails:()=>({lastPrerequisite,lastRecovery,hostUrl})});
 const recoveryStatus=()=>({lastPrerequisite,lastRecovery,hostUrl});
 const originalStatus=service.status;
 return {...service,maintenance:createRecoveryMaintenance({service,storageRoot,openControl}),recoveryStatus,status:async()=>({...await originalStatus(),managedRecovery:recoveryStatus()})};
}
