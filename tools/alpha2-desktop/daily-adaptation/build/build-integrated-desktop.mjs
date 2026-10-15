import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {join,resolve} from 'node:path';
import {mkdir,readFile,writeFile,cp,symlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const base=process.env.SEP_BUNDLE_TEST_ROOT;
const merged=join(base,'source-r1/desktop-source');
const official='D:/AIData/ProjectWork/DSH/alpha2-desktop-continuation-20261012/source-r1/desktop-source';
const host=join(base,'alpha2-runtime-r2'),generation=process.argv[2];
if(!/^r[1-9][0-9]*$/.test(generation??''))throw Error('INVALID_GENERATION');
const output=join(base,'integrated-desktop-'+generation);await mkdir(output);
const require=createRequire(join(host,'package.json')),{build}=await import(pathToFileURL(require.resolve('esbuild')));
const inputs={},changes=[];const sha=value=>createHash('sha256').update(value).digest('hex');
const change=(text,from,to,label)=>{if(text.split(from).length!==2)throw Error('SEP_DAILY_DESKTOP_ORIGIN');changes.push({label,from,to});return text.replace(from,to);};
let main=await readFile(join(merged,'apps/desktop-host/src/index.ts'),'utf8');
main=change(main,"version !== '0.2.0-rc.2'","version !== '0.2.1-alpha.2'",'pin managed host alpha.1');
main=change(main,'  const lifetime = createHostLifecycle({managed})',`  let daily: Awaited<ReturnType<typeof startDailyInstallation>> | undefined
  const lifetime = createHostLifecycle({managed,beforeShutdown:async()=>{
    const receipt=await daily?.close();if(receipt&&receipt.status!=='pass')throw Object.assign(new Error('SEP_DAILY_SHUTDOWN_BLOCKED'),{code:'SEP_DAILY_SHUTDOWN_BLOCKED'});
  }})`,'close daily root before official process shutdown');
main=change(main,'lifetime.startApplication(() => runProfile({','lifetime.startApplication(async () => {\n  const running = await runProfile({','cover daily admission in startup lifetime');
main=change(main,'  }))\n  const control:',`  })
  try {
    lifetime.assertActive();
    const selection=await readDailySelection({path:process.env.SEP_DAILY_SELECTION_PATH,sha256:process.env.SEP_DAILY_SELECTION_SHA256});
    lifetime.assertActive();daily=await startDailyInstallation(running.ctx,selection);
    if(daily.status!=='pass')throw Object.assign(new Error('SEP_DAILY_INITIALIZATION_BLOCKED'),{code:daily.code});
    lifetime.assertActive();return running;
  } catch(error){await running.shutdown.shutdown(1);throw error;}
  })
  const control:`,'activate exact daily selection before publishing ready');
const startup=resolve(process.env.SEP_DAILY_ADAPTER_SOURCE,'lib/daily-startup.mjs');
// A physical path lets esbuild include this small trusted bootstrap. A file:
// URL would survive as an external source-tree dependency in the product.
main=`import {readDailySelection,startDailyInstallation} from ${JSON.stringify(startup)};\n`+main;
const desktopMainPath=join(merged,'apps/desktop/src/main.ts');
let desktopMain=await readFile(desktopMainPath,'utf8');
desktopMain=change(desktopMain,'    projectDir: activeProject, nodeExecutable: process.env.DSH_DESKTOP_NODE_BINARY,',`    projectDir: process.env.DSH_DESKTOP_DSH_DIR!, nodeExecutable: process.env.DSH_DESKTOP_NODE_BINARY,
    profileContext:{home:process.env.DSH_HOME!,profileRoot:activeProject,installAnchor:join(process.env.DSH_DESKTOP_DSH_DIR!,'node_modules/@deepseek-ai/dsh/package.json'),overlayFiles:[join(process.env.DSH_DESKTOP_DSH_DIR!,'node_modules/@deepseek-ai/dsh-desktop-host/lib/sep-policy.json')]},`,'separate mutable profile from immutable update inventory');
let lifecycle=await readFile(join(merged,'apps/desktop-host/src/sep-host-lifecycle.mjs'),'utf8');
lifecycle=change(lifecycle,'owner=process,shutdownTimeoutMs=40000','owner=process,beforeShutdown,shutdownTimeoutMs=40000','trusted pre-shutdown callback');
lifecycle=change(lifecycle,'if(result?.ok)await result.value?.shutdown.shutdown(failure?1:0);','if(result?.ok){await beforeShutdown?.();await result.value?.shutdown.shutdown(failure?1:0);}','join SEP close without claiming forced settlement');
const lifecyclePlugin={name:'daily-lifecycle',setup(build){build.onLoad({filter:/[\\/]sep-host-lifecycle\.mjs$/},async args=>({contents:lifecycle,loader:'js',resolveDir:join(merged,'apps/desktop-host/src')}));}};
async function compile(entry,outfile,extra={}){
 const result=await build({entryPoints:[join(merged,entry)],outfile:join(output,outfile),bundle:true,platform:'node',target:'es2024',format:'esm',packages:'external',metafile:true,tsconfigRaw:{compilerOptions:{target:'es2024'}},define:{'process.env.DSH_CLIENT_VERSION':'"0.2.1-alpha.2"'},...extra});
 for(const file of Object.keys(result.metafile.inputs)){if(file.startsWith('<')||file.endsWith('daily-managed-host.ts'))continue;const path=resolve(file);inputs[path]=sha(await readFile(path));}
}
await compile('apps/desktop/src/main.ts','app/lib/main.js',{external:['./sep-update/*'],tsconfigRaw:{compilerOptions:{target:'es2024'}},plugins:[{name:'daily-desktop-profile',setup(build){build.onLoad({filter:/[\\/]desktop[\\/]src[\\/]main\.ts$/},()=>({contents:desktopMain,loader:'ts',resolveDir:join(merged,'apps/desktop/src')}));}}]});
await compile('apps/desktop/src/command-manager-entry.ts','app/lib/command-manager-entry.js');
for(const name of ['preload-app','preload-welcome','preload-platform-account','preload-mandatory','preload-update-dialog'])await compile('apps/desktop/src/'+name+'.ts','app/lib/'+name+'.cjs',{format:'cjs'});
await compile('apps/desktop-host/src/index.ts','desktop-host/lib/index.js',{entryPoints:undefined,stdin:{contents:main,sourcefile:'daily-managed-host.ts',resolveDir:join(merged,'apps/desktop-host/src'),loader:'ts'},plugins:[lifecyclePlugin]});
await cp(join(merged,'apps/desktop-host/src/sep-policy.json'),join(output,'desktop-host/lib/sep-policy.json'));
await cp(join(merged,'apps/desktop/src/sep-update'),join(output,'app/lib/sep-update'),{recursive:true});
const versionHelper=resolve(process.env.SEP_DAILY_ADAPTER_SOURCE,'lib/installed-sep-version.mjs');
await cp(versionHelper,join(output,'app/lib/sep-update/installed-sep-version.mjs'));
const updaterPath=join(output,'app/lib/sep-update/update-desktop.mjs');
let updater=await readFile(updaterPath,'utf8');
updater=change(updater,"   const installed=await jsonFile(join(projectDir,'node_modules/dsh-system-enhancement-package/package.json'));", "   const installed={version:await readInstalledSepVersion(projectDir,jsonFile)};",'compare root bundle product version');
await writeFile(updaterPath,"import {readInstalledSepVersion} from './installed-sep-version.mjs';\n"+updater);
inputs[versionHelper]=sha(await readFile(versionHelper));
await cp(join(base,'native-desktop-r2/app/lib/welcome'),join(output,'app/lib/welcome'),{recursive:true});
await cp(join(merged,'apps/desktop/resources'),join(output,'app/resources'),{recursive:true});
await cp(join(merged,'apps/desktop/renderer'),join(output,'app/renderer'),{recursive:true});
await symlink(join(host,'node_modules'),join(output,'app/node_modules'),'junction');
await writeFile(join(output,'app/package.json'),JSON.stringify({name:'dsh-sep-desktop',productName:'DSH SEP',version:'0.2.1-alpha.2',private:true,type:'module',main:'lib/main.js'},null,2)+'\n');
await writeFile(join(output,'BUILD-INPUTS.json'),JSON.stringify({schema:1,status:'build-only',changes,inputs,generatedHostSha256:sha(main),generatedLifecycleSha256:sha(lifecycle)},null,2)+'\n');
console.log(JSON.stringify({output,inputFiles:Object.keys(inputs).length,changes:changes.length,status:'build-only'}));
