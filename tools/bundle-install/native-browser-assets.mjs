import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {join,resolve} from 'node:path';
import {writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const P=resolve(process.env.SEP_PHASE_ROOT),H=join(P,'official-harness'),require=createRequire(join(H,'package.json'));
const {build}=await import(pathToFileURL(require.resolve('esbuild')));
const stub=resolve(process.env.SEP_OFFICIAL_SOURCE,'apps/web/src/node-module-stub.ts');
const contents=`import {AppWebEntry} from '@deepseek-ai/dsh-client-web';
window.frontendErrors=[];window.addEventListener('error',e=>frontendErrors.push(e.message));window.addEventListener('unhandledrejection',e=>frontendErrors.push(String(e.reason)));
window.entry=new AppWebEntry(document.getElementById('root'));
await entry.run(error=>{window.bootFailure=String(error);window.bootFailureStack=error?.stack;});window.bootSettled=true;
`;
const input=join(H,'owned-native-browser-entry.mjs');await writeFile(input,contents);
const result=await build({entryPoints:[input],absWorkingDir:H,outfile:join(P,'assets/kernel.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',metafile:true,nodePaths:[join(H,'node_modules')],loader:{'.woff':'dataurl','.woff2':'dataurl','.ttf':'dataurl'},alias:{'node:module':stub},define:{'process.env.NODE_ENV':'"development"','process.versions.node':'"0.0.0"','process.execArgv':'[]','process.env.CORDIS_SHARED':'undefined'}});
const inputs={};for(const path of Object.keys(result.metafile.inputs)){if(path.startsWith('<'))continue;const file=resolve(H,path);inputs[file]=createHash('sha256').update(await readFile(file)).digest('hex');}
await writeFile(join(P,'assets/BUILD-INPUTS.json'),JSON.stringify({scope:'official published AppWebEntry bundled for the owned test carrier; official browser node:module alias; no transport or boot seams',inputs,outputs:result.metafile.outputs},null,2)+'\n');
console.log('KERNEL INPUTS',Object.keys(inputs).length);
for(const name of ['@deepseek-ai/dsh-settings','@deepseek-ai/dsh-config-editor']){try{console.log('RESOLVED',name,require.resolve(name));}catch{console.log('MISSING',name);}}
