import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
const source=resolve(process.env.SEP_NATIVE_SOURCE);
const require=createRequire(join(source,'packages/boot/app-boot/package.json'));
const semver=require('semver');
const manifest=async p=>JSON.parse(await readFile(join(source,p,'package.json'),'utf8'));
const host=(await manifest('apps/cli')).version;
for(const path of ['packages/api/remotes','packages/boot/plugin-manager','packages/client/sep-brand'])test(path+' declares compatible host peers',async()=>{
 const pkg=await manifest(path);
 for(const [name,range] of Object.entries(pkg.peerDependencies??{}))if(name==='@deepseek-ai/dsh'||name.startsWith('@deepseek-ai/dsh-'))assert.ok(['workspace:*','workspace:^','workspace:~'].includes(range)||semver.satisfies(host,range,{includePrerelease:true}),name+' '+range+' rejects '+host);
});
test('managed environment binds client version without inheriting another installation',async()=>{
 const {buildEnvironment}=await import(pathToFileURL(join(source,'apps/desktop/src/sep-update/runtime/launcher/launcher.mjs')));
 const root=resolve('synthetic-instance'),c=Object.fromEntries(['dailyRoot','releaseRoot','runtimeUser','home','nodeExecutable','pnpmEntry'].map(k=>[k,join(root,k)]));
 const env=buildEnvironment(c,{DSH_CLIENT_VERSION:'wrong-instance',DSH_PRODUCT_ANALYTICS_OTLP_URL:'https://invalid.example'});
 assert.equal(env.DSH_CLIENT_VERSION,host);assert.equal(env.DSH_PRODUCT_ANALYTICS_OTLP_URL,undefined);
});
test('managed policy preserves disabled product analytics after upstream adds the service',async()=>{
 const rows=JSON.parse(await readFile(join(source,'apps/desktop-host/src/sep-policy.json'),'utf8'));
 assert.equal(rows.find(r=>r.id==='product-analytics')?.config?.enabled,false);
});
