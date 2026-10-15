// Test-only cases import the verified installed runtime, never a fixture launcher.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
const error=code=>Object.assign(Error(code),{code});
const code=e=>/^(SEP_|P2_|P1_|BUDGET_|OWNER_|FS_)[A-Z0-9_]{1,90}$/.test(e?.code??'')?e.code:'SEP_PRODUCT_NATIVE_ASSERTION';
export const nativeCaseNames=['assembled product emits actual lease ownership then actual UI ready and normal child cleanup','unconfirmed previous generation refuses before any owned event or desktop spawn'];
async function bounded(promise,ms,signal){
 let timer,abort;const interrupted=new Promise((_,reject)=>{timer=setTimeout(()=>reject(error('SEP_PRODUCT_NATIVE_DEADLINE')),ms);abort=()=>reject(error('SEP_PRODUCT_NATIVE_CLEANUP_REQUESTED'));if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});});
 try{return await Promise.race([promise,interrupted]);}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
async function until(predicate,signal){const end=Date.now()+65000;while(!predicate()){if(signal?.aborted)throw error('SEP_PRODUCT_NATIVE_CLEANUP_REQUESTED');if(Date.now()>=end)throw error('SEP_PRODUCT_NATIVE_DEADLINE');await delay(25);}}
async function marker(dataRoot){try{const s=JSON.parse(await readFile(join(dataRoot,'launcher/generation.json'),'utf8'));return{generation:s.generation,phase:s.phase,launcherPid:s.launcherPid??null,businessPid:s.businessPid??null,desktopPid:s.desktopPid??null,resourcesConfirmedReleased:s.resourcesConfirmedReleased===true};}catch{return null;}}
export async function runNativeLaunchCase(index,{programPath,programSha256,testRoot,signal,onProgress=async()=>{}}){
 const result={index,name:nativeCaseNames[index-1],status:'fail',stage:'prepare',events:[],cleanup:{status:'blocked',resourcesConfirmedReleased:false,normalCleanupAttempted:false}};
 let app,control,dataRoot,pending=false,launchPromise,cleanupStarted=false,finishedReceipt;
 async function cleanup(){
  cleanupStarted=true;
  if(app){
   const evidence={normalCleanupAttempted:finishedReceipt===undefined,generation:app.generation??control.status().generation,workerPid:process.pid,desktopPid:app.desktopPid??null,hostPid:app.hostPid??null};
   try{const receipt=finishedReceipt??await bounded(app.close({requestDesktop:true}),15000);if(receipt.status!=='pass'||receipt.resourcesConfirmedReleased!==true)throw error('SEP_PRODUCT_NATIVE_CLEANUP_UNCONFIRMED');await bounded(app.whenClosed(),1000);if(control.status().attached&&control.desktopReceipt().status!=='pass')throw error('SEP_PRODUCT_NATIVE_CLEANUP_UNCONFIRMED');return{...evidence,status:'pass',resourcesConfirmedReleased:true,receipt,marker:await marker(dataRoot)};}catch(e){return{...evidence,status:'blocked',resourcesConfirmedReleased:false,code:code(e),marker:await marker(dataRoot)};}
  }
  if(pending||control?.status().owned)return{status:'blocked',resourcesConfirmedReleased:false,normalCleanupAttempted:false,code:'SEP_PRODUCT_NATIVE_OPENING_UNCONFIRMED',workerPid:process.pid,marker:dataRoot?await marker(dataRoot):null};
  return{status:'pass',resourcesConfirmedReleased:true,normalCleanupAttempted:false,noOwnedGeneration:true};
 }
 async function launch(f){pending=true;launchPromise=f.launchFull({...f,control}).then(value=>{app=value;pending=false;void app.whenClosed().then(r=>{finishedReceipt=r;});return value;},e=>{pending=false;throw e;});return bounded(launchPromise,100000,signal);}
 try{
  if(index!==1&&index!==2)throw error('SEP_PRODUCT_NATIVE_CASE');
  const runtime=join(dirname(dirname(programPath)),'Resources/product/runtime');
  const {launchFull}=await import(pathToFileURL(join(runtime,'desktop/managed-broker/launch-full.mjs'))),{createLaunchControl}=await import(pathToFileURL(join(runtime,'desktop/product-control/launch-control.mjs')));
  await mkdir(testRoot,{recursive:true,mode:0o700});dataRoot=await mkdtemp(join(testRoot,'launch-'));result.dataRoot=dataRoot;
  const f={programPath,programSha256,dataRoot,launchFull};
  control=createLaunchControl({onEvent:e=>{result.events.push(e);if(index===1&&e.kind==='owned'){const s=JSON.parse(readFileSync(join(dataRoot,'launcher/generation.json'),'utf8'));assert.equal(s.phase,'starting');assert.equal(s.generation,e.generation);assert.equal(s.businessPid,null);assert.equal(s.desktopPid,null);assert.equal(s.programSha256,programSha256);}}});
  if(index===1){
   result.stage='launch';await launch(f);assert.equal(app.status,'running');result.stage='ready';await until(()=>result.events.some(x=>x.kind==='ready'||x.kind==='blocked'),signal);assert.equal(result.events.some(x=>x.kind==='blocked'),false);assert.equal(result.events[0].kind,'owned');
   result.stage='activate';control.activate('1'.repeat(24));await until(()=>result.events.some(x=>x.kind==='activated'||x.kind==='blocked'),signal);assert.equal(result.events.some(x=>x.kind==='activated'&&x.requestId==='1'.repeat(24)),true);
   result.stage='quit';control.requestQuit('2'.repeat(24));const receipt=await bounded(app.whenClosed(),30000,signal);assert.equal(receipt.status,'pass');assert.equal(receipt.resourcesConfirmedReleased,true);assert.equal(control.desktopReceipt().status,'pass');const finalMarker=await marker(dataRoot);assert.equal(finalMarker.phase,'closed');assert.equal(finalMarker.generation,app.generation);assert.equal(finalMarker.resourcesConfirmedReleased,true);assert.equal(result.events.some(x=>x.kind==='blocked'),false);
  }else{
   result.stage='previous-generation';const stateRoot=join(dataRoot,'launcher');await mkdir(stateRoot,{mode:0o700});const{persistGeneration}=await import(pathToFileURL(join(runtime,'desktop/managed-broker/launch-state.mjs')));await persistGeneration(join(stateRoot,'generation.json'),{schema:1,generation:'e'.repeat(32),phase:'active',resourcesConfirmedReleased:false});
   await assert.rejects(launch(f),{code:'SEP_MAC_PREVIOUS_LAUNCH_UNCONFIRMED'});assert.equal(result.events.length,0);assert.equal(control.status().attached,false);
  }
  result.status='pass';result.stage='complete';
 }catch(e){result.code=code(e);}
 finally{
  result.cleanup=await cleanup();if(result.cleanup.status!=='pass')result.status='blocked';await onProgress(result);
  // If a bounded open later returns, request its normal close. This late receipt
  // is separate; an earlier blocked operator result is never silently rewritten.
  if(pending&&launchPromise)void launchPromise.then(async()=>{if(cleanupStarted)await onProgress({...result,lateCleanup:await cleanup()});},async()=>{await onProgress({...result,lateCleanup:await cleanup()});}).catch(()=>{});
 }
 return result;
}
