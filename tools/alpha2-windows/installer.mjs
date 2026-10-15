import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {install} from './installer/install.mjs';
export {install};
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const args=process.argv.slice(2),options={bundle:import.meta.dirname};
  if(!args.length||args.includes('--help')){console.log('Usage: runtime\\node\\node.exe installer.mjs --destination <absolute new directory> [--host-root <verified official source>]');}
  else{if(args.length%2)throw Object.assign(Error('RELEASE_ARGUMENT'),{code:'RELEASE_ARGUMENT'});for(let i=0;i<args.length;i+=2){const k={'--destination':'destination','--host-root':'hostRoot'}[args[i]];if(!k||options[k])throw Object.assign(Error('RELEASE_ARGUMENT'),{code:'RELEASE_ARGUMENT'});options[k]=args[i+1];}console.log(JSON.stringify(await install(options),null,2));}
 }catch(error){console.error(JSON.stringify({status:'blocked',code:/^[A-Z][A-Z0-9_]{1,100}$/.test(error?.code??'')?error.code:'RELEASE_INSTALL_FAILED',incompleteInstallationMustNotBeStarted:true}));process.exitCode=1;}
}
