import './prepare-linux-desktop.mjs';
import {readFile,writeFile,mkdir,cp,lstat,unlink} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {bundleRoot} from './bundle-modules.mjs';
const root=resolve(process.env.SEP_BUNDLE_TEST_ROOT),f=JSON.parse(await readFile(join(root,'DESKTOP-FIXTURE.json'))),memory=join(root,'sep-memory'),locks=join(root,'sep-locks'),budgetPath=join(root,'sep-budget/ledger.json');
for(const path of [memory,locks,join(root,'sep-budget')])await mkdir(path,{mode:0o700});
const settings=join(f.runtime,'node_modules/@deepseek-ai/dsh-client-ui-settings-memory');
try{if(!(await lstat(settings)).isSymbolicLink())throw Error('SETTINGS_DESTINATION_NOT_NEW');await unlink(settings);}catch(error){if(error.code!=='ENOENT')throw error;}
await cp(join(bundleRoot,'bundle/modules/ui-settings-memory'),settings,{recursive:true,errorOnExist:true});
const manifest=JSON.parse(await readFile(join(settings,'package.json'))),before=structuredClone(manifest.peerDependencies);
for(const name of Object.keys(manifest.peerDependencies))if(name.startsWith('@deepseek-ai/dsh-'))manifest.peerDependencies[name]=JSON.parse(await readFile(join(process.env.SEP_PORTABLE_ROOT,'host/node_modules',name,'package.json'))).version;
// Official compatibility also compares the DSH release against every dsh-*
// peer. invariants intentionally retains rc.2 package metadata in Alpha.2.
manifest.peerDependencies['@deepseek-ai/dsh-invariants']='0.2.0-rc.2 || 0.2.1-alpha.2';
manifest.version='0.2.1-alpha.2-sep-linux.1';
await writeFile(join(settings,'package.json'),JSON.stringify(manifest,null,2)+'\n');
await writeFile(join(root,'SETTINGS-ADAPTER.json'),JSON.stringify({scope:'isolated Linux Alpha.2 candidate only; implementation bytes unchanged',from:before,to:manifest.peerDependencies},null,2)+'\n');
const patch=JSON.parse(await readFile(join(f.profile,'cordis.patch.yml')));
patch.push({id:'storage-json',config:{root:memory}});
// This dedicated synthetic Profile explicitly chooses one root-plane native
// compaction owner. Web-app normally moves compaction into agent presets;
// preset-specific compaction compatibility is not certified by this fixture.
patch.push({id:'compaction-basic',disabled:false,config:{auto:true,thresholdRatio:0.8,retainRatio:0.4,maxTokens:64,compactionRetries:0,maxOverflowRetries:1}});
patch.push({insert:[{id:'linux-sep-business',name:new URL('./linux-sep-runtime.mjs',import.meta.url).href,config:{source:f.source,memory,locks,budgetPath,initialize:true,business:{sources:['.'],capture:false,recall:true,media:true,pluginGroup:true},p1:{enabled:true,budgetPath},compaction:{nativeEntryId:'compaction-basic'}}},{id:'linux-sep-settings',name:pathToFileURL(join(settings,'lib/index.js')).href,config:{enabled:true}}]});
await writeFile(join(f.profile,'cordis.patch.yml'),JSON.stringify(patch,null,2)+'\n');
await writeFile(join(root,'DESKTOP-FIXTURE.json'),JSON.stringify({...f,linuxSep:true,memory,locks,budgetPath},null,2)+'\n');
