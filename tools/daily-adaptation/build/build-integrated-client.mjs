import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {join,resolve} from 'node:path';
import {mkdir,readFile,writeFile,symlink,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const base=process.env.SEP_BUNDLE_TEST_ROOT;
const official='D:/AIData/ProjectWork/DSH/bundle-install-20261008/phase4/official-source/deepseek-harness-dsh-v0.2.1-alpha.1';
const merged=join(base,'desktop-source-r4'),host=join(base,'alpha1-runtime-r2');
const generation=process.argv[2];if(!/^r[1-9][0-9]*$/.test(generation??''))throw Error('INVALID_GENERATION');
const output=join(base,'integrated-client-'+generation);await mkdir(output);
const compilerConfig=join(output,'tsconfig.client.json');
// The source snapshot omits the monorepo-wide project references. Resolve
// package values from the materialized target graph, with the official JSX mode.
await writeFile(compilerConfig,JSON.stringify({compilerOptions:{target:'es2024',module:'esnext',moduleResolution:'bundler',jsx:'react-jsx',esModuleInterop:true}})+'\n');
const require=createRequire(join(host,'package.json'));
const upstreamRequire=createRequire('D:/AIData/ProjectWork/DSH/dsh-020rc2-20260929/upstream/package.json');
const tsdown=upstreamRequire.resolve('tsdown'),lightningcss=upstreamRequire.resolve('lightningcss');
const {build:compile}=await import(pathToFileURL(require.resolve('esbuild')));
const {build}=await import(pathToFileURL(tsdown));
try{await lstat(join(merged,'node_modules'));}catch(error){if(error.code!=='ENOENT')throw error;await symlink(join(host,'node_modules'),join(merged,'node_modules'),'junction');}
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),inputs={},results=[];
for(const [group,name] of [['client','ui-settings-general'],['client','ui-settings-account'],['client','ui-chat'],['client','ui-settings'],['api','remotes']]){
 const packageRoot=join(merged,'packages',group,name),entry=join(packageRoot,'tsdown.config.ts'),configOut=join(output,name+'.config.mjs');
 const result=await compile({entryPoints:[entry],outfile:configOut,bundle:true,platform:'node',format:'esm',target:'es2024',packages:'external',metafile:true,
  define:{'import.meta.url':JSON.stringify(pathToFileURL(entry).href)},plugins:[{name:'official-client-preset',setup(b){
   b.onResolve({filter:/tsdown\.client\.ts$/},()=>({path:join(official,'packages/client/tsdown.client.ts')}));
   b.onResolve({filter:/^(tsdown|lightningcss)$/},args=>({path:pathToFileURL(args.path==='tsdown'?tsdown:lightningcss).href,external:true}));
   b.onLoad({filter:/[\\/]tsdown\.client\.ts$/},async args=>{
    const input=await readFile(args.path,'utf8'),from="const REPOSITORY_ROOT = fileURLToPath(new URL('../..', import.meta.url))";
    if(input.split(from).length!==2)throw Error('OFFICIAL_PRESET_ORIGIN');
    return {contents:input.replace(from,'const REPOSITORY_ROOT = '+JSON.stringify(merged)),loader:'ts',resolveDir:join(official,'packages/client')};
   });
  }}]});
 for(const path of Object.keys(result.metafile.inputs)){if(path.startsWith('<'))continue;inputs[resolve(path)]=sha(await readFile(resolve(path)));}
 const {default:configuration}=await import(pathToFileURL(configOut));
 const configs=configuration({env:{}});const client=configs.find(row=>row.name?.endsWith('/client'));
 if(!client)throw Error('OFFICIAL_CLIENT_CONFIG_MISSING');
 const packageRequire=createRequire('D:/AIData/ProjectWork/DSH/dsh-020rc2-20260929/upstream/packages/'+group+'/'+name+'/package.json');
 await build({...client,config:false,cwd:packageRoot,tsconfig:compilerConfig,outDir:join(output,name),report:false,plugins:[...(client.plugins??[]),{
  name:'daily-build-dependency-closure',
  resolveId(source){if(['big.js','@tanstack/react-virtual'].includes(source))return packageRequire.resolve(source);},
  async generateBundle(_options,bundle){for(const chunk of Object.values(bundle))if(chunk.type==='chunk')for(const key of Object.keys(chunk.modules)){
   let path=key;if(path.startsWith('\0dsh-'))path=path.slice(path.indexOf(':')+1,-4);else if(path.startsWith('\0'))continue;
   path=resolve(path);inputs[path]=sha(await readFile(path));
  }}
 }]});
 const manifest=JSON.parse(await readFile(join(packageRoot,'package.json')));
 const allowed=new Set(['react','react/jsx-runtime','react-dom','react-dom/client','@deepseek-ai/cordis','@deepseek-ai/dsh-client-store','@deepseek-ai/dsh-client-ui-slots','@deepseek-ai/dsh-client-ui-primitives','@deepseek-ai/dsh-client-ui-dockkit',...(manifest.dsh?.client?.external??[])]);
 const content=await readFile(join(output,name,'client.js'),'utf8');
 for(const call of content.matchAll(/\brequire\(["']([^"']+)["']\)/g))if(!allowed.has(call[1]))throw Error('UNDECLARED_CLIENT_EXTERNAL: '+call[1]);
 results.push({name,sha256:sha(await readFile(join(output,name,'client.js')))});
}
await writeFile(join(output,'BUILD-INPUTS.json'),JSON.stringify({schema:1,status:'build-only',compiler:{tsdown,sha256:sha(await readFile(tsdown)),lightningcss},officialPreset:join(official,'packages/client/tsdown.client.ts'),rootRebase:merged,inputs,results},null,2)+'\n');
console.log(JSON.stringify({output,status:'build-only',results}));
