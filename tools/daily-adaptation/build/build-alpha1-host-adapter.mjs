import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {join,resolve} from 'node:path';
import {mkdir,readFile,writeFile,cp} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const base='D:/AIData/ProjectWork/DSH/bundle24-daily-deployment-20261011';
const source='D:/AIData/ProjectWork/DSH/bundle-install-20261008/phase4/official-source/deepseek-harness-dsh-v0.2.1-alpha.1';
const generation=process.argv[2]??'r1';if(!/^r[1-9][0-9]*$/.test(generation))throw Error('INVALID_GENERATION');
const host=join(base,'alpha1-runtime-r2'),output=join(base,'daily-host-adapter-'+generation);await mkdir(output);
const require=createRequire(join(host,'package.json'));
const {build}=await import(pathToFileURL(require.resolve('esbuild')));
let input=await readFile(join(source,'apps/desktop-host/src/index.ts'),'utf8');
const changes=[];
function change(from,to,label){if(input.split(from).length!==2)throw Error('HOST_ADAPTER_SOURCE_CHANGED');input=input.replace(from,to);changes.push({label,from,to});}
change("  const { ctx } = await application","  const { ctx } = await application\n  console.info('SEP_DAILY_PROFILE_BOOTED')\n  const selected = await readDailySelection({path: process.env.SEP_DAILY_SELECTION_PATH, sha256: process.env.SEP_DAILY_SELECTION_SHA256})\n  console.info('SEP_DAILY_SELECTION_VERIFIED')\n  const startupNotice = setTimeout(() => console.info('SEP_DAILY_ROOT_PENDING', JSON.stringify(ctx.get('sepControlledInstallation')?.status() ?? {phase: 'not-published'})), 15000)\n  try { daily = await startDailyInstallation(ctx, selected) } finally { clearTimeout(startupNotice) }\n  if (daily.status !== 'pass') throw Object.assign(new Error('SEP_DAILY_INITIALIZATION_BLOCKED'), {code: daily.code})\n  console.info('SEP_DAILY_ROOT_ACTIVE')\n  await ctx.loader.await()",'confirm and activate before reporting desktop ready');
change('  await ctx.plugin(desktopOffice, {',"  console.info('SEP_DAILY_OFFICE_STARTING')\n  await ctx.plugin(desktopOffice, {",'classify desktop resource startup');
change('  installPlatformSessionPublisher(ctx, (session) => {',"  console.info('SEP_DAILY_DESKTOP_READY')\n  installPlatformSessionPublisher(ctx, (session) => {",'classify desktop ready');
change('  let stopping: Promise<void> | undefined','  let daily: Awaited<ReturnType<typeof startDailyInstallation>> | undefined\n  let stopping: Promise<void> | undefined','retain owned root for shutdown');
change('    await running?.shutdown.shutdown(0)',"    if (daily) {\n      const receipt = await daily.close()\n      if (receipt.status !== 'pass') {\n        console.error('SEP_DAILY_SHUTDOWN_BLOCKED', JSON.stringify(receipt))\n        stopping = undefined\n        return\n      }\n    }\n    await running?.shutdown.shutdown(0)",'confirm SEP settlement before official shutdown completion');
const adapterSource=resolve(process.env.SEP_DAILY_ADAPTER_SOURCE??'daily-adaptation-src');
input=`import {readDailySelection,startDailyInstallation} from ${JSON.stringify(pathToFileURL(join(adapterSource,'lib/daily-startup.mjs')).href)};\n`+input;
await build({stdin:{contents:input,resolveDir:join(source,'apps/desktop-host/src'),sourcefile:'sep-daily-host-adapter.ts',loader:'ts'},outfile:join(output,'index.js'),bundle:true,platform:'node',format:'esm',target:'es2024',packages:'external',metafile:true}).then(async result=>{
 const inputs={};for(const path of Object.keys(result.metafile.inputs)){if(path.startsWith('<')||path.endsWith('sep-daily-host-adapter.ts'))continue;inputs[resolve(path)]=createHash('sha256').update(await readFile(path)).digest('hex');}
 await writeFile(join(output,'HOST-ADAPTER-ORIGIN.json'),JSON.stringify({schema:1,officialCommit:'5badb15009ae1756c3afe0ae0cef1faafc290ccc',baseSha256:createHash('sha256').update(await readFile(join(source,'apps/desktop-host/src/index.ts'))).digest('hex'),resultSha256:createHash('sha256').update(await readFile(join(output,'index.js'))).digest('hex'),changes,inputs,scope:'candidate adapter; not a daily switching approval'},null,2)+'\n');
});
console.log(JSON.stringify({output,changes:changes.length}));
