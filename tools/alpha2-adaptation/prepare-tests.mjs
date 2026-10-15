import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
const [repo,base]=process.argv.slice(2);
await mkdir(join(base,'tests'),{recursive:true});
let fixture=await readFile(join(repo,'tools/bundle-install/tests/native-settings-fixture.mjs'),'utf8');
const before="for(const name of ['@deepseek-ai/dsh-subagent','@deepseek-ai/dsh-subagent-spawn-in-process','@deepseek-ai/dsh-user-approval']){const module=await load(name);await ctx.plugin(module.default??module);}";
const after="// Alpha.2 subagents depend on workingDirectory, which waits for the protected fs.\n  for(const name of ['@deepseek-ai/dsh-working-directory','@deepseek-ai/dsh-subagent','@deepseek-ai/dsh-subagent-spawn-in-process']){const module=await load(name);ctx.plugin(module.default??module);}\n  {const module=await load('@deepseek-ai/dsh-user-approval');await ctx.plugin(module.default??module);}";
if(fixture.split(before).length!==2)throw Error('FIXTURE_ANCHOR');
fixture=fixture.replace(before,after);
fixture=fixture.replace("assert(f.api,'SEP_CONTROLLED_INSTALLATION_MISSING');","if(!f.api)console.error('SYNTHETIC_FIXTURE_DIAGNOSTIC',JSON.stringify({entries:[...f.ctx.loader.entries()].map(e=>({id:e.options.id,state:e.fiber?.state,error:e.fiber?._error?.stack})),services:Object.fromEntries(['tools','systemPrompt','sessions','storageDomain','recoveryHost','llm','tokenMeter','agents','approval','connection','workingDirectory','subagents','fs'].map(n=>[n,!!f.ctx.get(n)]))}));assert(f.api,'SEP_CONTROLLED_INSTALLATION_MISSING');");
await writeFile(join(base,'tests/fixture.mjs'),fixture);
for(const name of ['native-settings.test.mjs','shared-consumers.test.mjs']){
 const value=(await readFile(join(repo,'tools/bundle-install/tests',name),'utf8')).replaceAll('./native-settings-fixture.mjs','./fixture.mjs');
 await writeFile(join(base,'tests',name),value);
}
for(const [from,to] of [['tools/daily-adaptation/lib/daily-presets.mjs','daily-presets.mjs'],['tools/daily-adaptation/lib/daily-startup.mjs','daily-startup.mjs'],['tools/daily-adaptation/tests/profile-worker.mjs','profile-worker.mjs'],['tools/daily-adaptation/tests/full-profile.test.mjs','full-profile.test.mjs']]){
 let value=await readFile(join(repo,from),'utf8');
 value=value.replaceAll('0.2.1-alpha.1','0.2.1-alpha.2').replaceAll('0.2.1-beta.3-bundle.24','0.2.1-beta.3-alpha2-adapter.1').replaceAll('alpha.1 desktop','alpha.2 desktop').replaceAll('../lib/daily-startup.mjs','./daily-startup.mjs').replaceAll('../lib/daily-presets.mjs','./daily-presets.mjs');
 if(to==='full-profile.test.mjs')value=value.replace("await import(pathToFileURL(join(repo,'tools/bundle-install/tests/native-settings-fixture.mjs')))","await import('./fixture.mjs')");
 await writeFile(join(base,'tests',to),value);
}
