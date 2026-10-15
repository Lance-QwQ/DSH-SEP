import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {join,relative} from 'node:path';
import {mkdir,readFile,writeFile,cp,readdir,lstat} from 'node:fs/promises';
const base='D:/AIData/ProjectWork/DSH/alpha2-desktop-continuation-20261012';
const source='D:/AIData/ProjectWork/DSH/alpha2-desktop-continuation-20261012/source-r1/desktop-source';
const generation=process.argv[2]??'r1';if(!/^r[1-9][0-9]*$/.test(generation))throw Error('INVALID_GENERATION');
const installed=join(base,'alpha2-hoisted-'+generation),output=join(base,'alpha2-runtime-'+generation);
const require=createRequire(join(installed,'package.json'));
const {build}=await import(pathToFileURL(require.resolve('esbuild')));
await mkdir(output);
const helper=join(output,'build-runtime-helper.mjs');
await build({stdin:{contents:`export {writeDesktopRuntime,verifyDesktopRuntime} from ${JSON.stringify(join(source,'apps/desktop/src/runtime-tree.ts'))};export {desktopRuntimeFileExclusion} from ${JSON.stringify(join(source,'apps/desktop/scripts/runtime-file-policy.ts'))};`,resolveDir:source},outfile:helper,bundle:true,platform:'node',format:'esm',packages:'external',alias:{semver:require.resolve('semver')}});
const {writeDesktopRuntime,verifyDesktopRuntime,desktopRuntimeFileExclusion}=await import(pathToFileURL(helper));
const modules=join(installed,'node_modules'),target={platform:'win32',arch:'x64'};
const versions={};
for(const name of await readdir(join(modules,'@deepseek-ai'))){
 try{const p=JSON.parse(await readFile(join(modules,'@deepseek-ai',name,'package.json')));versions[p.name]=p.version;}catch(error){if(error.code!=='ENOENT')throw error;}
}
const unexpected=Object.entries(versions).filter(([name,version])=>name.startsWith('@deepseek-ai/dsh')&&version!=='0.2.1-alpha.2'&&!(name==='@deepseek-ai/dsh-invariants'&&version==='0.2.0-rc.2'));
if(unexpected.length)throw Error('UNEXPECTED_HOST_VERSIONS: '+JSON.stringify(unexpected));
await cp(modules,join(output,'node_modules'),{recursive:true,dereference:true,filter:path=>desktopRuntimeFileExclusion(relative(modules,path),target,'win32-x64')===undefined});
const privateHost=join(output,'node_modules/@deepseek-ai/dsh-desktop-host');
await cp(join(base,'native-desktop-r2/desktop-host'),privateHost,{recursive:true});
const hostManifest=JSON.parse(await readFile(join(privateHost,'package.json')));
for(const [name,version] of Object.entries(hostManifest.dependencies))if(version.startsWith('workspace:')){
 const dependency=JSON.parse(await readFile(join(output,'node_modules',name,'package.json')));hostManifest.dependencies[name]=dependency.version;
}
delete hostManifest.devDependencies;
await writeFile(join(privateHost,'package.json'),JSON.stringify(hostManifest,null,2)+'\n');
const manifest=JSON.parse(await readFile(join(installed,'package.json')));
manifest.name='dsh-sep-alpha2-daily-runtime';delete manifest.pnpm;
manifest.dependencies['@deepseek-ai/dsh-desktop-host']='0.2.1-alpha.2';
manifest.dependencies['dsh-sep-bundle']='0.2.1-beta.3-alpha2-adapter.1';
await writeFile(join(output,'package.json'),JSON.stringify(manifest,null,2)+'\n');
for(const name of ['brand-font.css','montserrat-regular.woff2','montserrat-light.woff2','montserrat-medium.woff2','Montserrat-OFL.txt'])await cp(join(source,'packages/client/ui-theme/src/styles',name),join(base,'native-desktop-r2/app/lib/welcome',name));
const shared=[...Object.keys(versions),'@deepseek-ai/dsh-desktop-host'];
const descriptor=writeDesktopRuntime(output,{schemaVersion:1,version:'0.2.1-alpha.2',hostProtocolVersion:4,nodeVersion:'24.18.1',pnpmVersion:'11.7.0'},shared,target);
await verifyDesktopRuntime(output,'0.2.1-alpha.2',target);
await writeFile(join(base,'RUNTIME-MATERIALIZATION-'+generation+'.json'),JSON.stringify({schema:1,status:'pass',scope:'immutable Windows runtime graph only; not daily deployment approval',output,files:descriptor.files.length,sharedPackages:descriptor.sharedPackages.length,versions,knownPeerException:{'@deepseek-ai/dsh-invariants':'0.2.0-rc.2'},unsigned:true},null,2)+'\n');
console.log(JSON.stringify({status:'pass',files:descriptor.files.length,sharedPackages:descriptor.sharedPackages.length}));
