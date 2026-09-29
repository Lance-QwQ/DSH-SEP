import {spawnSync} from 'node:child_process';
import {mkdir,readFile,writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('./source/',import.meta.url));
if(!['linux','darwin'].includes(process.platform))throw Error('NATIVE_PLATFORM_REQUIRED');
const output=resolve(process.env.SEP_APPLICATION_OUTPUT??''),pnpm=process.env.SEP_APPLICATION_PNPM;
if(!process.env.SEP_APPLICATION_OUTPUT||!pnpm)throw Error('EXPLICIT_ISOLATED_PATHS_REQUIRED');
await mkdir(output,{recursive:true});await mkdir(join(output,'tmp'),{recursive:true});
const env={...process.env,CI:'true',TMPDIR:join(output,'tmp'),DSH_TELEMETRY_DISABLED:'1',DSH_CLIENT_COMMIT_HASH:process.env.GITHUB_SHA??'833eb30d014a9f8964eec462eff1ddcdc4122159',XDG_CACHE_HOME:join(output,'cache'),XDG_DATA_HOME:join(output,'share')};
const results=[];let failed=false;
for(const [name,args,timeout] of [
 ['install',[pnpm,'install','--frozen-lockfile','--ignore-scripts','--store-dir',join(output,'pnpm-store')],600000],
 ['native-dependencies',[pnpm,'rebuild','esbuild','node-pty','koffi'],300000],
 ['full-build',[pnpm,'run','build','--profile','official'],1200000],
 ['budget-settings',['--test','packages/client/ui-settings-memory/tests/budget-api.test.mjs','packages/client/ui-settings-memory/tests/budget-ui.test.mjs'],120000],
 ['sidebar-and-plugin-state',[pnpm,'exec','vitest','run','apps/desktop/tests/sep-sidebar-state.spec.ts','packages/client/ui-plugin-manager/tests/manager-store.client.spec.ts'],180000],
 ['real-web-startup',[pnpm,'exec','vitest','run','--config','vitest.expected.config.ts','apps/cli/tests/profiles/web/tests/web-best-effort-startup.expected.e2e.ts'],240000],
]){const start=Date.now();console.log('Starting '+name);const r=spawnSync(process.execPath,args,{cwd:root,env,encoding:'utf8',timeout,maxBuffer:32*1024*1024});await writeFile(join(output,name+'.log'),(r.stdout??'')+(r.stderr??''));results.push({name,status:r.status===0&&!r.error?'pass':'fail',exitCode:r.status,signal:r.signal,error:r.error?.code??null,durationMs:Date.now()-start});console.log(name+' '+results.at(-1).status);if(results.at(-1).status!=='pass'){console.log((r.stdout??'').slice(-5000)+(r.stderr??'').slice(-5000));failed=true;break;}}
const files=[];if(!failed)for(const p of ['apps/cli/lib/bin.js','apps/desktop/lib/main.js','apps/web/dist/index.html','packages/client/ui-settings-memory/lib/index.js','packages/client/ui-settings-memory/lib/client.js','packages/client/sep-brand/lib/client.js']){const b=await readFile(join(root,p));files.push({path:p,size:(await stat(join(root,p))).size,sha256:createHash('sha256').update(b).digest('hex')});}
await writeFile(join(output,'RESULT.json'),JSON.stringify({schema:1,platform:process.platform,arch:process.arch,node:process.version,sourceManifestSha256:createHash('sha256').update(await readFile(new URL('./SOURCE-MANIFEST.json',import.meta.url))).digest('hex'),results,artifacts:files,scope:'Source build + budget/settings regression + real built CLI/Web startup. No desktop installation, interactive desktop, complete SEP profile deployment, or application update was validated.',status:failed?'fail':'pass'},null,2));if(failed)process.exitCode=1;