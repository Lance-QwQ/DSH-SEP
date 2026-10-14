// Test/operator only: replay the existing source derivation, without editing an app.
import {readFile,writeFile,mkdir,realpath} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {prepareApplicationEdits,CONTROL_INPUTS} from '../renderer-readiness/application-inputs.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
export async function prepareBaseline({outputRoot,inputsRoot,captureRoot}){
 const pins=JSON.parse(await readFile(new URL('./BASELINE.json',import.meta.url),'utf8'));
 const inputs={};for(const [key,file]of Object.entries({main:'main.js',preload:'preload.cjs',frontend:'frontend.js','ui-renderer':'ui-renderer.js'}))inputs[key]=await readFile(join(inputsRoot,file));
 for(const [key,file]of Object.entries({'welcome-preload':'lib/preload-welcome.cjs','welcome-script':'lib/welcome/welcome.js','welcome-html':'renderer/welcome.html'}))inputs[key]=await readFile(join(captureRoot,file));
 const controls={};for(const name of Object.keys(CONTROL_INPUTS))controls[name]=await readFile(new URL('../product-control/'+name,import.meta.url));
 const result=await prepareApplicationEdits({inputs,controls});
 for(const [key,pin]of Object.entries(pins.entries)){const actual=result.edits.find(r=>r.key===key);if(actual?.sha256!==pin.sha256||actual.path!==pin.path||actual.domain!==pin.domain)throw Error('SEP_PROJECT_PRODUCT_BASELINE');}
 outputRoot=resolve(outputRoot);await mkdir(outputRoot,{mode:0o700});if(await realpath(outputRoot)!==outputRoot)throw Error('SEP_PROJECT_PRODUCT_OUTPUT');
 const rows=[];for(const row of result.edits){const file=row.key.replaceAll('/','-')+(row.key==='preload'?'.cjs':'.js');await writeFile(join(outputRoot,file),row.bytes,{flag:'wx'});rows.push({...row,file,bytes:row.bytes.length});}
 const receipt={schema:1,status:'pass',scope:'byte-identical r44 main/preload/renderer reproduction, not an app execution',baselineSha256:sha(await readFile(new URL('./BASELINE.json',import.meta.url))),inputs:Object.entries(inputs).map(([key,bytes])=>({key,bytes:bytes.length,sha256:sha(bytes)})),outputs:rows};
 await writeFile(join(outputRoot,'ORIGIN.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});return receipt;
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){if(process.argv.length!==5)throw Error('usage: prepare-baseline outputRoot inputsRoot captureRoot');await prepareBaseline({outputRoot:process.argv[2],inputsRoot:process.argv[3],captureRoot:process.argv[4]});}
