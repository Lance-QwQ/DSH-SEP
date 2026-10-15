import{fstatSync}from'node:fs';import{readFile,realpath}from'node:fs/promises';import{Socket}from'node:net';import{createHash}from'node:crypto';import{fileURLToPath,pathToFileURL}from'node:url';import{resolve}from'node:path';
import{launchFull}from'../desktop/managed-broker/launch-full.mjs';
import{accountControllerLocations}from'../desktop/product-control/controller-paths.mjs';
import{createControllerBridge}from'../desktop/product-control/controller-bridge.mjs';
const code=e=>/^SEP_[A-Z0-9_]{1,90}$/.test(e?.code??'')?e.code:'SEP_PRODUCT_CONTROLLER_FAILED';
export async function runControllerLaunch({bridge,launch,options,diagnostic}){
 const app=await launch(options),exit=app.status==='running'?0:1;
 if(exit)diagnostic({status:app.status==='failed'?'fail':'blocked',code:code(app)});
 const receipt=await app.whenClosed();await bridge.complete(receipt);return exit;
}
async function main(){
 if(process.argv.length!==2||process.platform!=='darwin'||process.arch!=='arm64')throw Object.assign(Error('SEP_PRODUCT_CONTROLLER_ENTRY'),{code:'SEP_PRODUCT_CONTROLLER_ENTRY'});
 const controllerPath=fileURLToPath(import.meta.url),locations=accountControllerLocations(controllerPath);
 if(await realpath(controllerPath)!==controllerPath||await realpath(process.execPath)!==locations.nodePath||!fstatSync(3).isSocket())throw Object.assign(Error('SEP_PRODUCT_CONTROLLER_BINDING'),{code:'SEP_PRODUCT_CONTROLLER_BINDING'});
 const programSha256=createHash('sha256').update(await readFile(locations.programPath)).digest('hex'),stream=new Socket({fd:3,readable:true,writable:true});
 const bridge=createControllerBridge({stream,programSha256});
 try{
  await bridge.initialized;
  // Only launchFull's durable closed marker, host/RPC receipts and released
  // lease resolve this promise. A transport hello or EOF cannot substitute.
  process.exitCode=await runControllerLaunch({bridge,launch:launchFull,options:{programPath:locations.programPath,programSha256,dataRoot:locations.dataRoot,control:bridge.control},diagnostic:value=>process.stderr.write(JSON.stringify(value)+'\n')});
 }catch(e){
  process.stderr.write(JSON.stringify({status:'blocked',code:code(e)})+'\n');process.exitCode=1;
  // An acquired launch owns its own keepalive. Do not kill it or discard an
  // unknown cleanup merely because its outer AppKit channel failed.
  if(!bridge.status().owned)stream.destroy();
 }
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){main().catch(e=>{process.stderr.write(JSON.stringify({status:'blocked',code:code(e)})+'\n');process.exitCode=78;});}
