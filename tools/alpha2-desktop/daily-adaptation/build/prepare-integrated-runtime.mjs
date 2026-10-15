import {cp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildDailyRecovery} from './daily-recovery.mjs';
const base=process.env.SEP_BUNDLE_TEST_ROOT,out=join(base,'alpha2-runtime-r4');await mkdir(out);
await cp(join(base,'alpha2-runtime-r2'),out,{recursive:true});
const core=join(out,'node_modules/dsh-sep-bundle'),recovery=join(out,'node_modules/@deepseek-ai/dsh-recovery');
await buildDailyRecovery({coreRoot:core,out:recovery,leaseSource:resolve(process.env.SEP_DAILY_ADAPTER_SOURCE,'lib/project-write-lease.mjs')});
await cp(join(base,'integrated-desktop-r1/desktop-host/lib'),join(out,'node_modules/@deepseek-ai/dsh-desktop-host/lib'),{recursive:true});
// The helper is supplied by the verified previous materialization. It uses the
// official runtime file policy/tree implementation; this is a new local graph.
const {writeDesktopRuntime,verifyDesktopRuntime}=await import(pathToFileURL(join(out,'build-runtime-helper.mjs')));
const original=JSON.parse(await readFile(join(base,'alpha2-runtime-r2/desktop-runtime.json')));
writeDesktopRuntime(out,original.release,[...original.sharedPackages.map(row=>row.name),'@deepseek-ai/dsh-recovery'],{platform:'win32',arch:'x64'});await verifyDesktopRuntime(out,'0.2.1-alpha.2',{platform:'win32',arch:'x64'});
await writeFile(join(base,'INTEGRATED-RUNTIME-r4.json'),JSON.stringify({status:'built-not-deployable',root:out,desktop:join(base,'integrated-desktop-r1/app'),notVerified:['managed host start and closure','updated UI modules','full private continuation','final approved deployment plan']},null,2)+'\n');
console.log(JSON.stringify({out,status:'built-not-deployable'}));
