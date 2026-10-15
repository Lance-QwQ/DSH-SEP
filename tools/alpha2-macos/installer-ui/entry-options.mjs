import{fileURLToPath}from'node:url';import{join,dirname,resolve,isAbsolute}from'node:path';
const fail=()=>{throw Object.assign(Error('SEP_INSTALLER_ENTRY'),{code:'SEP_INSTALLER_ENTRY'});};
export function fixedEntryOptions(value){
 try{
  if(!value||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).sort().join(',')!=='argv,execPath,moduleUrl'||!Array.isArray(value.argv)||value.argv.length!==4||typeof value.moduleUrl!=='string')fail();
  const url=new URL(value.moduleUrl);if(url.protocol!=='file:'||url.hostname||url.search||url.hash)fail();const module=fileURLToPath(url),contents=resolve(dirname(module),'../../..');
  if(!isAbsolute(module)||resolve(module)!==module||module!==join(contents,'Resources/runtime/installer-ui/controller-main.mjs')||value.execPath!==join(contents,'Resources/node/node')||value.argv[0]!==value.execPath||value.argv[1]!==module)fail();
  for(const s of value.argv.slice(2))if(typeof s!=='string'||!/^[a-f0-9]{64}$/.test(s))fail();
  return Object.freeze({contents,nonce:value.argv[2],manifestSha256:value.argv[3]});
 }catch{fail();}
}
