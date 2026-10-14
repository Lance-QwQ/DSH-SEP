import {validateProgramShape} from '../desktop/managed-broker/program-manifest.mjs';
const fail=()=>{throw Object.assign(Error('SEP_MAC_APP_LAYOUT_INPUT'),{code:'SEP_MAC_APP_LAYOUT_INPUT'});};
/** A pure path plan. The assembler must hash every final entry after moving,
 * deriving and signing it; these retained old hashes are not a new release. */
export function deriveAppLayout(input){
 validateProgramShape(input);
 if(input.schema!==3||input.appRoot!=='DSH SEP.app'||input.hostRoot!=='payload/host'||input.bundleRoot!=='payload/host/sep-capture'||input.parserRoot!=='payload/parser-runtime')fail();
 function remap(path){
  if(path.startsWith(input.appRoot+'/'))return 'Helpers/DSH SEP Desktop.app/'+path.slice(input.appRoot.length+1);
  if(path.startsWith('payload/mac/'))return 'Resources/product/runtime/'+path.slice('payload/mac/'.length);
  if(path.startsWith('payload/'))return 'Resources/product/'+path;
  fail();
 }
 return validateProgramShape({...input,schema:4,layout:'macos-app-v1',appRoot:'Helpers/DSH SEP Desktop.app',hostRoot:remap(input.hostRoot),bundleRoot:remap(input.bundleRoot),parserRoot:remap(input.parserRoot),capabilities:[...input.capabilities],entries:Object.fromEntries(Object.entries(input.entries).map(([role,entry])=>[role,{...entry,path:remap(entry.path)}]))});
}
