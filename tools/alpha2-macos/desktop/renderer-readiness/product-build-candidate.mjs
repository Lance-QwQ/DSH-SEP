import {readFile,writeFile,mkdir,realpath,lstat} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {createHash} from 'node:crypto';
import {deriveProductMain} from './product-derive.mjs';
import {deriveProductWelcomeGate} from './product-gate-derive.mjs';
const[inputArg,outArg]=process.argv.slice(2);
if(process.argv.length!==4)throw Error('SEP_PRODUCT_CANDIDATE_ARGUMENTS');
const input=await realpath(inputArg),out=resolve(outArg),st=await lstat(input);
if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||await realpath(dirname(out))!==dirname(out))throw Error('SEP_PRODUCT_CANDIDATE_PATH');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const derived=deriveProductMain(await readFile(input));
const helper=await readFile(new URL('./product-window-actions.mjs',import.meta.url));
const welcome=deriveProductWelcomeGate(await readFile(new URL('./welcome-gate.mjs',import.meta.url)));
await mkdir(out,{mode:0o700});
const rows=[['main.js','lib/main.js',derived.bytes],['sep-product-window-actions.mjs','lib/sep-product-window-actions.mjs',helper],['sep-welcome-readiness.mjs','lib/sep-welcome-readiness.mjs',welcome.bytes]];
for(const[file,,bytes]of rows)await writeFile(join(out,file),bytes,{flag:'wx',mode:0o600});
for(const[file,origin]of [['main.origin.json',derived.origin],['welcome-helper.origin.json',welcome.origin]])await writeFile(join(out,file),JSON.stringify(origin,null,2)+'\n',{flag:'wx',mode:0o600});
const sources=[];
for(const file of ['product-derive.mjs','product-window-actions.mjs','product-gate-derive.mjs','product-derive.test.mjs','product-window-actions.test.mjs','product-activation-composition.test.mjs','product-build-candidate.mjs','product-ci-steps.yml','PRODUCT-README.md','application-inputs.mjs','application-inputs.test.mjs','apply-to-application.mjs']){
 const bytes=await readFile(new URL(file,import.meta.url));sources.push({file,bytes:bytes.length,sha256:sha(bytes)});
}
const result={schema:1,status:'pass',scope:'independent product main adapter candidate only',outputs:rows.map(([,path,bytes])=>({path,sha256:sha(bytes),bytes:bytes.length})),sources,externalRequired:['lib/sep-product-control/electron.cjs','lib/sep-product-control/fixed-program.cjs','lib/sep-product-control/transport.cjs'],notRun:['actual private fd3 endpoint in product','actual Electron window ready/activate/quit','ASAR rebuild and signing','Finder launch'],productChanged:false};
await writeFile(join(out,'CANDIDATE.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify({status:result.status,scope:result.scope,outputs:result.outputs}));
