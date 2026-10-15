import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile,stat,symlink,link,access,readdir} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {install} from './install.mjs';
const output=process.env.SEP_WINDOWS_INSTALL_TEST_ROOT;if(!output||!/^D:[\\/]/i.test(output))throw Error('EXPLICIT_D_TEST_ROOT_REQUIRED');
const sha=b=>createHash('sha256').update(b).digest('hex');
const body=x=>JSON.stringify(x,null,2)+'\n';
const exists=async p=>{try{await access(p);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}};
const record=(path,bytes)=>({path,size:Buffer.byteLength(bytes),sha256:sha(bytes),mode:0o644});
const actualBudget=pathToFileURL('D:/AIData/ProjectWork/DSH/alpha2-desktop-continuation-20261012/alpha2-runtime-r6/node_modules/dsh-sep-bundle/bundle/modules/system-enhancement-package/src/budget-ledger.js').href;
const bindingSource='D:/AIData/ProjectWork/DSH/alpha2-windows-packages-20261015-r1/program/daily-adapter/project-binding.js';
// Execute the unmodified host binding's physical-directory admission. The
// authority is synthetic and providers deliberately absent: PROVIDER_REQUIRED
// proves only that the real path checks were crossed, not that a host started.
async function pathAdmission(config,selection){
 assert.equal(sha(await readFile(bindingSource)),'df926702d5632d3f819da0fb5324bceb21021e380b5813d81c919cd7392f2379');
 const {apply}=await import(pathToFileURL(bindingSource));let binding;
 const project=config.projects[0],effects=[];
 const ctx={recoveryHost:{listProjects:async()=>[project],withProject:async(id,work)=>{assert.equal(id,project.id);return work(project);}},get:()=>undefined,effect:fn=>effects.push(fn()),provide:(name,value)=>{assert.equal(name,'sepProjectBinding');binding=value;}};
 apply(ctx);try{return await binding.review(selection);}finally{for(const dispose of effects.reverse())await dispose();}
}
async function fixture(kind='full'){
 const root=join(output,randomUUID()),bundle=join(root,'bundle'),destination=join(root,'instance'),hostRoot=join(root,'official');await mkdir(bundle,{recursive:true});await mkdir(hostRoot);
 const files={
  'package.json':body({private:true,type:'module'}),
  'node_modules/dsh-sep-bundle/package.json':body({name:'dsh-sep-bundle',version:'0.2.1-beta.3-alpha2-adapter.1'}),
  'node_modules/dsh-sep-bundle/bundle/modules/system-enhancement-package/src/p2/control.js':"import {writeFile} from 'node:fs/promises';import {join} from 'node:path';export async function openControl({storageRoot,initialize,mode}){if(!initialize||mode!=='maintenance')throw Error('FIXTURE_INITIALIZE');await writeFile(join(storageRoot,'fixture-control.json'),JSON.stringify({initialized:true}));return{close:async()=>{}};}",
  'node_modules/dsh-sep-bundle/bundle/modules/system-enhancement-package/src/budget-ledger.js':`export {Budget} from ${JSON.stringify(actualBudget)};`,
  'node_modules/@deepseek-ai/dsh/package.json':body({name:'@deepseek-ai/dsh',version:'0.2.1-alpha.2'}),
  'node_modules/@deepseek-ai/dsh/lib/index.js':'// official fixture bytes\n',
  'daily-adapter/package.json':body({name:'dsh-sep-daily-alpha1-adapter',version:'0.1.0',dsh:'0.2.1-alpha.2',sep:'0.2.1-beta.3-alpha2-adapter.1'}),
  ...Object.fromEntries(['ORIGIN.json','native-settings-installation.js','settings-runtime.js','protected-profile.js','protected-file-tools.js','file-protection.js','project-binding.js'].map(name=>['daily-adapter/'+name,name.endsWith('json')?'{}\n':'// fixed adapter\n']))
 };
 const supportFiles={
  'runtime/desktop/electron.exe':'synthetic-executable',
  'runtime/node/node.exe':'synthetic-node',
  'runtime/pnpm/bin/pnpm.cjs':'// synthetic pnpm',
  'managed/bootstrap/launcher.mjs':'export async function run(){}\n'
 };
 const graph={schema:3,kind:'dsh-sep-materialized-graph',platform:'win32-x64',files:Object.entries(files).map(([p,b])=>record(p,b))};
 const graphBytes=body(graph),descriptorBytes=body({schema:1,synthetic:true});
 const required=kind==='sep'?graph.files.filter(f=>f.path.startsWith('node_modules/@deepseek-ai/dsh/')).map(f=>({...f,sourcePath:f.path})):[];
 const payload=graph.files.filter(f=>!required.some(r=>r.path===f.path));
 for(const [path,bytes]of Object.entries(files)){const at=join(required.some(r=>r.path===path)?hostRoot:join(bundle,'payload'),path);await mkdir(join(at,'..'),{recursive:true});await writeFile(at,bytes);}
 for(const [path,bytes]of Object.entries(supportFiles)){await mkdir(join(bundle,path,'..'),{recursive:true});await writeFile(join(bundle,path),bytes);}
 await writeFile(join(bundle,'graph.json'),graphBytes);await writeFile(join(bundle,'desktop-runtime.json'),descriptorBytes);
 const manifest={schema:3,kind,platform:'win32-x64',hostVersion:'0.2.1-alpha.2',sepVersion:'0.2.1-beta.3-alpha2-adapter.1',revision:'windows-package.2',graph:record('graph.json',graphBytes),descriptor:record('desktop-runtime.json',descriptorBytes),payload,required,support:Object.entries(supportFiles).map(([p,b])=>record(p,b)),desktop:{schema:1,platform:'win32-x64',version:'44.7.0',executable:'electron.exe',files:[record('electron.exe',supportFiles['runtime/desktop/electron.exe'])],links:[]}};
 const save=()=>writeFile(join(bundle,'manifest.json'),body(manifest));await save();return{root,bundle,destination,hostRoot,manifest,graph,save};
}
test('Full copies exact schema3 program and creates independent blank instance',async()=>{const f=await fixture();const r=await install(f);assert.equal(r.status,'pass');assert.equal(r.kind,'full');assert.equal(r.applicationStarted,false);assert.deepEqual(JSON.parse(await readFile(join(f.destination,'program/graph.json'))),f.graph);assert.equal(await exists(join(f.destination,'INSTALLING.json')),false);assert.equal((await stat(join(f.destination,'installed.json'))).isFile(),true);});
test('Only reads exact donor bytes without changing the donor',async()=>{const f=await fixture('sep');const before=await readFile(join(f.hostRoot,f.manifest.required[1].sourcePath));await install(f);assert.deepEqual(await readFile(join(f.hostRoot,f.manifest.required[1].sourcePath)),before);assert.deepEqual(await readFile(join(f.destination,'program',f.manifest.required[1].path)),before);});
test('Only wrong donor bytes fail before creating destination',async()=>{const f=await fixture('sep');await writeFile(join(f.hostRoot,f.manifest.required[1].sourcePath),'changed');await assert.rejects(install(f),{code:'RELEASE_FILE_CHANGED'});assert.equal(await exists(f.destination),false);});
test('missing donor fails before any instance write',async()=>{const f=await fixture('sep');await assert.rejects(install({...f,hostRoot:undefined}),{code:'RELEASE_SOURCE_REQUIRED'});assert.equal(await exists(f.destination),false);});
test('existing instance is never overwritten',async()=>{const f=await fixture();await mkdir(f.destination);await writeFile(join(f.destination,'private.txt'),'private sentinel');await assert.rejects(install(f),{code:'RELEASE_DESTINATION_EXISTS'});assert.equal(await readFile(join(f.destination,'private.txt'),'utf8'),'private sentinel');});
test('aliased target parent is refused',async()=>{const f=await fixture();const alias=join(f.root,'alias');await symlink(f.root,alias,'junction');await assert.rejects(install({...f,destination:join(alias,'new')}),{code:'RELEASE_DESTINATION_ALIAS'});assert.equal(await exists(join(f.root,'new')),false);});
test('payload traversal is refused before instance creation',async()=>{const f=await fixture();f.manifest.payload[0].path='../escape';await f.save();await assert.rejects(install(f),{code:'RELEASE_PATH_INVALID'});assert.equal(await exists(f.destination),false);});
test('Windows reserved names and alternate streams are refused',async()=>{for(const path of ['node_modules/NUL.txt','node_modules/file:stream']){const f=await fixture();f.manifest.payload[0].path=path;await f.save();await assert.rejects(install(f),{code:'RELEASE_PATH_INVALID'});}});
test('support cannot overlap immutable program or generated settings',async()=>{for(const path of ['program/package.json','.env','managed/profile/package.json']){const f=await fixture();f.manifest.support[0].path=path;await f.save();await assert.rejects(install(f),{code:'RELEASE_SUPPORT_SCOPE'});assert.equal(await exists(f.destination),false);}});
test('graph must be fully covered exactly once by payload and required',async()=>{const f=await fixture();f.manifest.payload.pop();await f.save();await assert.rejects(install(f),{code:'RELEASE_GRAPH_COVERAGE'});assert.equal(await exists(f.destination),false);});
test('hardlinked input is not silently trusted',async()=>{const f=await fixture();await link(join(f.bundle,'payload/package.json'),join(f.root,'linked.json'));await assert.rejects(install(f),{code:'RELEASE_FILE_IDENTITY'});assert.equal(await exists(f.destination),false);});
test('blank credentials and separate profile preserve user onboarding',async()=>{const f=await fixture();await install(f);assert.match(await readFile(join(f.destination,'.env'),'utf8'),/^DEEPSEEK_API_KEY=$/m);const c=JSON.parse(await readFile(join(f.destination,'deployment-rc2.json')));assert.equal(c.profileRoot,join(f.destination,'managed/profile'));assert.equal(c.credentialsPath,join(f.destination,'.env'));assert.equal(c.releaseRoot,join(f.destination,'program'));const selected=JSON.parse(await readFile(c.dailySelectionPath));assert.equal(selected.schema,2);assert.equal(selected.configuration.runtime.p1.initialSpentCny,0);assert.equal(selected.configuration.runtime.p1.limitCny,100);assert.equal(selected.configuration.runtime.business.capture,false);assert.equal((await readdir(join(c.home,'sessions'))).length,0);assert.match(await readFile(join(f.destination,'launch.mjs'),'utf8'),/await run\(/);assert.doesNotMatch(await readFile(join(f.destination,'launch.mjs'),'utf8'),/readCredential\s*:\s*false/);});
test('support hash mismatch fails without an output directory',async()=>{const f=await fixture();await writeFile(join(f.bundle,'runtime/node/node.exe'),'modified');await assert.rejects(install(f),{code:'RELEASE_FILE_CHANGED'});assert.equal(await exists(f.destination),false);});
test('desktop manifest must agree with support bytes',async()=>{const f=await fixture();f.manifest.desktop.files[0].sha256='a'.repeat(64);await f.save();await assert.rejects(install(f),{code:'RELEASE_DESKTOP_BINDING'});assert.equal(await exists(f.destination),false);});
test('source and destination overlap is refused',async()=>{const f=await fixture();await assert.rejects(install({...f,destination:join(f.bundle,'new')}),{code:'RELEASE_DESTINATION_OVERLAP'});});
test('relative destination is refused before resolution',async()=>{const f=await fixture();await assert.rejects(install({...f,destination:'.'}),{code:'RELEASE_DESTINATION_ABSOLUTE'});});
test('incomplete P2 initialization retains marker and refuses default launch',async()=>{
 const f=await fixture(),path='node_modules/dsh-sep-bundle/bundle/modules/system-enhancement-package/src/p2/control.js',bytes="export async function openControl(){throw Object.assign(Error('FIXTURE_P2_FAILURE'),{code:'FIXTURE_P2_FAILURE'});}";
 await writeFile(join(f.bundle,'payload',path),bytes);Object.assign(f.graph.files.find(r=>r.path===path),record(path,bytes));Object.assign(f.manifest.payload.find(r=>r.path===path),record(path,bytes));const gb=body(f.graph);await writeFile(join(f.bundle,'graph.json'),gb);f.manifest.graph=record('graph.json',gb);await f.save();
 await assert.rejects(install(f),{code:'FIXTURE_P2_FAILURE'});assert.equal(await exists(join(f.destination,'INSTALLING.json')),true);assert.equal(await exists(join(f.destination,'installed.json')),false);
 await assert.rejects(import(pathToFileURL(join(f.destination,'launch.mjs'))),{code:'RELEASE_INSTALLATION_INCOMPLETE'});
});
test('new installation creates a real empty v3 ledger with separate 100 CNY session and 5 CNY task guards',async()=>{const f=await fixture();await install(f);const c=JSON.parse(await readFile(join(f.destination,'deployment-rc2.json'))),s=JSON.parse(await readFile(c.dailySelectionPath)),path=s.configuration.runtime.profile.selection.budgetPath;assert.equal(s.configuration.runtime.p1.budgetPath,path);const {Budget}=await import(actualBudget),budget=new Budget(path,{limit:100,initialSpent:0,taskLimitCny:5});const state=await budget.read();assert.equal(state.version,3);assert.deepEqual(state.entries,[]);assert.equal(state.initialSpent,0);assert.deepEqual(await budget.sessionDefaultsSnapshot(),{limitCny:100,revision:0});assert.equal(budget.taskLimitCny,5);assert.equal(await exists(path),true);assert.equal(await exists(join(f.destination,'state/budget.json')),false);});

test('fresh profile passes the real binding path stage with an independent existing ledger parent',async()=>{const f=await fixture();await install(f);const c=JSON.parse(await readFile(join(f.destination,'deployment-rc2.json'))),s=JSON.parse(await readFile(c.dailySelectionPath)).configuration.runtime.profile.selection;assert.equal((await stat(dirname(s.budgetPath))).isDirectory(),true);await assert.rejects(pathAdmission(c,s),{code:'SEP_BINDING_PROVIDER_REQUIRED'});});

test('real binding still refuses the legacy ledger parent containing the lock directory',async()=>{const f=await fixture();await install(f);const c=JSON.parse(await readFile(join(f.destination,'deployment-rc2.json'))),s=JSON.parse(await readFile(c.dailySelectionPath)).configuration.runtime.profile.selection;await assert.rejects(pathAdmission(c,{...s,budgetPath:join(f.destination,'state/budget.json')}),{code:'SEP_BINDING_SCOPE_CONFLICT'});});
