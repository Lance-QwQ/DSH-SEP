import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {join,resolve,dirname} from 'node:path';
import {mkdir,readFile,writeFile,cp,symlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const base='D:/AIData/ProjectWork/DSH/alpha2-desktop-continuation-20261012';
const host=join(base,'alpha2-runtime-r2');
const source='D:/AIData/ProjectWork/DSH/alpha2-desktop-continuation-20261012/source-r1/desktop-source';
const output=join(base,'native-desktop-r2');
const require=createRequire(join(host,'package.json'));
const {build}=await import(pathToFileURL(require.resolve('esbuild')));
await mkdir(output);const app=join(output,'app');await mkdir(app);
await symlink(join(host,'node_modules'),join(app,'node_modules'),'junction');
const inputs={};
async function compile(entry,outfile,options={}){
 const result=await build({entryPoints:[join(source,entry)],outfile:join(output,outfile),bundle:true,platform:'node',target:'es2024',format:'esm',packages:'external',metafile:true,define:{'process.env.DSH_CLIENT_VERSION':'"0.2.1-alpha.2"'},...options});
 for(const file of Object.keys(result.metafile.inputs)){if(file.startsWith('<'))continue;const path=resolve(file);inputs[path]=createHash('sha256').update(await readFile(path)).digest('hex');}
}
await compile('apps/desktop/src/main.ts','app/lib/main.js');
await compile('apps/desktop/src/command-manager-entry.ts','app/lib/command-manager-entry.js');
for(const name of ['preload-app','preload-welcome','preload-platform-account','preload-mandatory','preload-update-dialog'])await compile('apps/desktop/src/'+name+'.ts','app/lib/'+name+'.cjs',{format:'cjs'});
await compile('apps/desktop-host/src/index.ts','desktop-host/lib/index.js');
await compile('apps/desktop-host/src/cli.ts','desktop-host/lib/cli.js');
await compile('apps/desktop/src/client/welcome.tsx','app/lib/welcome/welcome.js',{platform:'browser',format:'iife',packages:undefined,jsx:'automatic',nodePaths:[join(host,'node_modules')],alias:{'@deepseek-ai/dsh-client-ui-primitives/src':join(source,'packages/client/ui-primitives/src'),'@deepseek-ai/dsh-client-ui-theme/src':join(source,'packages/client/ui-theme/src')},define:{'process.env.NODE_ENV':'"production"'},loader:{'.woff':'dataurl','.woff2':'dataurl','.svg':'dataurl'}});
await cp(join(source,'apps/desktop/resources'),join(app,'resources'),{recursive:true});
await cp(join(source,'apps/desktop/renderer'),join(app,'renderer'),{recursive:true});
await writeFile(join(app,'package.json'),JSON.stringify({name:'dsh-sep-desktop-isolated',productName:'DSH SEP',version:'0.2.1-alpha.2',private:true,type:'module',main:'lib/main.js'},null,2)+'\n');
const desktopHost=JSON.parse(await readFile(join(source,'apps/desktop-host/package.json')));await writeFile(join(output,'desktop-host/package.json'),JSON.stringify(desktopHost,null,2)+'\n');
await writeFile(join(output,'BUILD-INPUTS.json'),JSON.stringify({schema:1,status:'build-only',officialCommit:'d743267388641bc76f17c45ce8b4c231aed1d32c',notVerified:['complete installed runtime','daily lifecycle wiring','all SEP desktop patches'],inputs},null,2)+'\n');
console.log(JSON.stringify({output,inputFiles:Object.keys(inputs).length,status:'build-only'}));
