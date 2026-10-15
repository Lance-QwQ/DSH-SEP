// Test-only dependency resolution: existing pinned host, no file/link mutation.
import {registerHooks,createRequire} from 'node:module';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {resolve,sep} from 'node:path';
import {readFileSync} from 'node:fs';
const host=resolve(process.env.SEP_OFFICIAL_HARNESS),repo=resolve(process.env.SEP_MAC_LOW_REPOSITORY),capture=resolve(process.env.SEP_MAC_BUNDLE_ROOT);
const manifest=JSON.parse(readFileSync(resolve(host,'node_modules/@deepseek-ai/dsh/package.json')));if(manifest.name!=='@deepseek-ai/dsh'||manifest.version!=='0.2.1-alpha.2')throw Error('TEST_HOST_VERSION');
const fallback=pathToFileURL(resolve(host,'package.json')).href,hostRequire=createRequire(fallback);
registerHooks({resolve(specifier,context,next){
 try{return next(specifier,context);}catch(error){
  if(!['ERR_MODULE_NOT_FOUND','MODULE_NOT_FOUND'].includes(error.code)||specifier.startsWith('.')||specifier.startsWith('/')||specifier.includes(':')||!context.parentURL?.startsWith('file:'))throw error;
  const parent=resolve(fileURLToPath(context.parentURL));if(![repo,capture].some(root=>parent.startsWith(root+sep)))throw error;
  if(context.conditions?.includes('require'))return {url:pathToFileURL(hostRequire.resolve(specifier)).href,shortCircuit:true};
  return next(specifier,{...context,parentURL:fallback});
 }
}});