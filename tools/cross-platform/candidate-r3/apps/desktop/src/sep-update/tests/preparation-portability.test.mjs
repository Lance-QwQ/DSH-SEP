import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,lstat,realpath,symlink} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {zipBytes} from './preparation-fixtures.mjs';
import {preparePackage,validateDelta} from '../prepare-package.mjs';
import {assertInstallationIdle} from '../prepare-offline.mjs';
import {processIdentity} from '../update-process-identity.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const platform=process.platform+'-'+process.arch;
const scratch=async()=>realpath(await mkdtemp(join(tmpdir(),'SEP preparation 中文 ')));
async function fixture(){
 const root=await scratch(),currentRoot=join(root,'current');await mkdir(currentRoot);
 const old='export const version=1;\n',next='export const version=2;\n';
 const base={kind:'dsh-sep-local-offline-graph',roots:{'@deepseek-ai/dsh':'host','dsh-system-enhancement-package':'sep'},packages:[{id:'host',name:'@deepseek-ai/dsh',version:'0.1.7-rc.2',dependencies:{}},{id:'sep',name:'dsh-system-enhancement-package',version:'0.2.0-test.1',dependencies:{}}],files:[{path:'store/sep/run.mjs',size:Buffer.byteLength(old),sha256:sha(old),...(process.platform==='win32'?{}:{mode:0o755})}]};
 await mkdir(join(currentRoot,'store/sep'),{recursive:true});await writeFile(join(currentRoot,'store/sep/run.mjs'),old,{mode:0o755});
 await mkdir(join(currentRoot,'store/host'),{recursive:true});await writeFile(join(currentRoot,'store/host/package.json'),'{}');base.files.push({path:'store/host/package.json',size:2,sha256:sha('{}'),...(process.platform==='win32'?{}:{mode:0o644})});
 const target=structuredClone(base);target.packages[1].version='0.2.0-test.2';target.files[0]={...target.files[0],size:Buffer.byteLength(next),sha256:sha(next)};
 const baseBytes=JSON.stringify(base),targetBytes=JSON.stringify(target);await writeFile(join(currentRoot,'graph.json'),baseBytes);
 const release={version:'0.1.7-rc.2',sepVersion:'0.2.0-test.2'},metadata={schema:1,kind:'sep-program-delta',platform,hostVersion:release.version,sepVersion:release.sepVersion,fromSepVersion:'0.2.0-test.1',baseGraphHash:sha(baseBytes),targetGraphHash:sha(targetBytes)};
 const entries=[{name:'sep-package.json',body:JSON.stringify(metadata)},{name:'base-graph.json',body:baseBytes},{name:'target-graph.json',body:targetBytes},{name:'payload/'+sha(next),body:next,deflate:true}];
 const archive=join(root,'candidate.zip');await writeFile(archive,zipBytes(entries));
 return {root,base,target,release,metadata,entries,options:{archive,currentRoot,workRoot:join(root,'work'),release,bundleSha256:sha(await readFile(archive))}};
}
async function extract(entries,options={}){const root=await scratch(),archive=join(root,'test.zip'),destination=join(root,'out');await writeFile(archive,zipBytes(entries));const m=await import('../extract-sep.mjs');return {root,destination,result:await m.extractSepArchive({archive,destination,...options})};}
const required=()=>['sep-package.json','base-graph.json','target-graph.json'].map(name=>({name}));
test('accepts exact native-platform delta',async()=>{const f=await fixture();assert.equal(validateDelta(f.base,f.target,f.metadata,f.release).changed.length,1);});
test('rejects another platform before preparing a native candidate',async()=>{const f=await fixture();assert.throws(()=>validateDelta(f.base,f.target,{...f.metadata,platform:'not-native'},f.release),/SEP_PACKAGE_METADATA/);});
test('actual ZIP to unselected program preserves bytes, graph, dependency links and POSIX mode',async()=>{const f=await fixture(),r=await preparePackage(f.options);assert.equal(r.status,'program-prepared');assert.equal(await readFile(join(r.root,'store/sep/run.mjs'),'utf8'),'export const version=2;\n');assert.equal(await realpath(join(r.root,'node_modules/dsh-system-enhancement-package')),join(r.root,'store/sep'));if(process.platform!=='win32')assert.equal((await lstat(join(r.root,'store/sep/run.mjs'))).mode&0o777,0o755);assert.equal(sha(await readFile(join(r.root,'graph.json'))),f.metadata.targetGraphHash);});
test('changed source yields no ready receipt',async()=>{const f=await fixture();await writeFile(join(f.options.currentRoot,'store/sep/run.mjs'),'changed');await assert.rejects(preparePackage(f.options),/SEP_PACKAGE_SOURCE_CHANGED/);await assert.rejects(readFile(join(f.options.workRoot,'program-prepared.json')),{code:'ENOENT'});});
test('rejects privileged or unbound executable permission',async()=>{const f=await fixture();f.target.files[0].mode=0o4755;assert.throws(()=>validateDelta(f.base,f.target,f.metadata,f.release),/SEP_PACKAGE_MODE/);});
test('extracts stored and deflated entries',async()=>{const r=await extract([...required(),{name:'payload/'+'a'.repeat(64),body:'hello',deflate:true}]);assert.equal(await readFile(join(r.destination,'payload/'+'a'.repeat(64)),'utf8'),'hello');assert.equal(r.result.files,4);});
for(const [title,extra,code]of [
 ['traversal',{name:'../escape'},'SEP_ARCHIVE'],['backslash',{name:'payload\\evil'},'SEP_ARCHIVE'],['duplicate',{name:'sep-package.json'},'SEP_ARCHIVE_DUPLICATE'],['symlink',{name:'payload/'+'b'.repeat(64),attributes:0xa1ff0000},'SEP_ARCHIVE_LINK'],['directory attribute',{name:'payload/'+'b'.repeat(64),attributes:16},'SEP_ARCHIVE_ATTRIBUTES'],['crc mismatch',{name:'payload/'+'b'.repeat(64),body:'abcdef',crc:1},'SEP_ARCHIVE_CRC'],['declared expansion',{name:'payload/'+'b'.repeat(64),body:'a'.repeat(1000),deflate:true,size:1},'SEP_ARCHIVE']])test('rejects '+title,async()=>{await assert.rejects(extract([...required(),extra]),new RegExp(code));});
test('rejects missing metadata',async()=>{await assert.rejects(extract([{name:'sep-package.json'}]),/SEP_ARCHIVE_METADATA_MISSING/);});
test('entry count and cumulative size bounded',async()=>{await assert.rejects(extract(required(),{maxEntries:2}),/SEP_ARCHIVE_COUNT/);await assert.rejects(extract(required(),{maxBytes:5}),/SEP_ARCHIVE_SIZE/);});
test('cancel before extraction creates no destination',async()=>{await assert.rejects(extract(required(),{signal:AbortSignal.abort()}),e=>e.name==='AbortError');});
test('refuses existing destination and aliased parent',{skip:process.platform==='win32'},async()=>{const root=await scratch(),archive=join(root,'a.zip');await writeFile(archive,zipBytes(required()));const {extractSepArchive}=await import('../extract-sep.mjs');const destination=join(root,'existing');await mkdir(destination);await assert.rejects(extractSepArchive({archive,destination}),/SEP_ARCHIVE_DESTINATION_EXISTS/);const alias=join(root,'alias');await symlink(destination,alias);await assert.rejects(extractSepArchive({archive,destination:join(alias,'out')}),/SEP_ARCHIVE_REDIRECTED/);});
test('refuses a hardlinked archive',{skip:process.platform==='win32'},async()=>{const root=await scratch(),archive=join(root,'a.zip');await writeFile(archive,zipBytes(required()));const {link}=await import('node:fs/promises');await link(archive,join(root,'b.zip'));const {extractSepArchive}=await import('../extract-sep.mjs');await assert.rejects(extractSepArchive({archive,destination:join(root,'out')}),/SEP_ARCHIVE_IDENTITY/);});
test('idle scan refuses owned live app, accepts exact allowed identity, then accepts exit',{timeout:25000},async()=>{const dailyRoot=await scratch();const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)',dailyRoot],{stdio:'ignore',windowsHide:true});const closed=once(child,'close');try{await once(child,'spawn');const identity=await processIdentity(child.pid);await assert.rejects(assertInstallationIdle({dailyRoot}),/SEP_PLAN_APP_RUNNING/);await assertInstallationIdle({dailyRoot},[identity]);}finally{child.kill();await closed;}await assertInstallationIdle({dailyRoot});});
import {createNativeProgramAdapter} from '../runtime/native-program.mjs';
import {acquireOwnerFile} from '../../../../../packages/sep/system-enhancement-package/src/owner-lease.mjs';
import {chmod} from 'node:fs/promises';
test('POSIX publication and restoration preserve plan-bound executable modes',{skip:process.platform==='win32'},async()=>{
 const root=await scratch(),homeRoot=join(root,'home'),profileRoot=join(root,'program');await mkdir(homeRoot);await mkdir(profileRoot);await writeFile(join(profileRoot,'package.json'),'{}');
 const path=join(root,'start.sh'),oldSource=join(root,'old.sh'),candidateSource=join(root,'next.sh');
 await writeFile(path,'old',{mode:0o755});await writeFile(oldSource,'old',{mode:0o755});await writeFile(candidateSource,'next',{mode:0o700});
 const adapter=await createNativeProgramAdapter({homeRoot,profileRoot,oldHostRoot:profileRoot,candidateHostRoot:profileRoot,transactionDirectory:root,publicFiles:[{path,oldSource,candidateSource,oldMode:0o755,candidateMode:0o700}],beforeAliases:[],candidateAliases:[],acquireOwnerFile});
 const release=await adapter.native.acquire();try{await adapter.program.publish({direction:'candidate'});assert.equal((await lstat(path)).mode&0o777,0o700);await adapter.program.publish({direction:'old'});assert.equal((await lstat(path)).mode&0o777,0o755);await chmod(candidateSource,0o644);await assert.rejects(adapter.program.publish({direction:'candidate'}),/NP_SOURCE_CHANGED/);}finally{await release();}
});
import {matchingProcessIds} from '../prepare-idle.mjs';
test('process inventory parsing rejects malformed rows; POSIX paths stay case sensitive',()=>{assert.throws(()=>matchingProcessIds('not-a-pid command',['/a']),/SEP_PLAN_PROCESS_QUERY/);assert.deepEqual(matchingProcessIds('123 node /Other\n124 node /other',['/Other']),[123]);});
import {auditInstalledGraph} from '../runtime/audit-graph.mjs';
test('installed graph audit rejects executable permission drift',{skip:process.platform==='win32'},async()=>{const f=await fixture(),p=await preparePackage(f.options);await auditInstalledGraph(p.root,p.graphHash);await chmod(join(p.root,'store/sep/run.mjs'),0o644);await assert.rejects(auditInstalledGraph(p.root,p.graphHash));});
