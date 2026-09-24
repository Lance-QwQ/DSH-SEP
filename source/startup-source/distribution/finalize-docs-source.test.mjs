import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileHostAdaptations,finalizeDocsSource,publicBytes} from './finalize-docs-source.mjs';
import {mkdtemp,mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
test('finalization preserves old mappings and adds every new graph helper exactly once',()=>{
 const old=[{path:'store/p0500/src/managed.mjs',package:'recovery',scope:'historic',afterSha256:'old'}];
 const graph={packages:[{id:'p0500',name:'recovery'}],files:[{path:old[0].path,sha256:'new'},{path:'store/p0500/src/owner-lease.mjs',sha256:'helper'}]};
 const changed=graph.files;const result=reconcileHostAdaptations(old,graph,changed,'startup-r2');
 assert.equal(result.length,2);assert.equal(result[0].scope,'historic');assert.equal(result[0].afterSha256,'new');assert.equal(result[1].package,'recovery');assert.equal(result[1].scope,'startup-r2 Windows host/recovery adaptation');assert.equal(old[0].afterSha256,'old');
 assert.deepEqual(reconcileHostAdaptations(result,graph,changed,'startup-r2'),result);
});
test('adaptation mapping rejects absent or hash-drifted graph entries',()=>{
 const graph={packages:[{id:'p0500',name:'recovery'}],files:[{path:'store/p0500/src/a.mjs',sha256:'a'}]};
 assert.throws(()=>reconcileHostAdaptations([],graph,[{path:'store/p0500/src/a.mjs',sha256:'b'}]),/ADAPTATION_GRAPH/);
 assert.throws(()=>reconcileHostAdaptations([],graph,[{path:'store/p0501/src/a.mjs',sha256:'a'}]),/ADAPTATION_GRAPH/);
});
test('privacy check rejects local user paths without corrupting coincidental hash substrings',()=>{
 const profile=process.env.USERPROFILE;if(!profile)return;
 assert.throws(()=>publicBytes(Buffer.from(JSON.stringify({source:join(profile,'fixture.mjs')})),'source.json'),/PERSONAL_PATH/);
 const user=profile.split(/[\\/]/).at(-1),b=Buffer.from('hash-prefix'+user+'hash-suffix');assert.equal(publicBytes(b,'hash.json'),b);
});
test('finalizer curates actual authoring sources, binds evidence, preserves historical status and maps helpers',async()=>{
 const hash=b=>createHash('sha256').update(b).digest('hex'),candidate=await mkdtemp(join(tmpdir(),'sep-final-docs-'));
 const put=async(p,b)=>{await mkdir(dirname(p),{recursive:true});await writeFile(p,b);},jput=(p,b)=>put(p,JSON.stringify(b,null,2)+'\n');
 const graph={packages:[{id:'p0500',name:'recovery'}],files:[{path:'store/p0500/src/new.mjs',sha256:hash('new'),size:3}]},gb=JSON.stringify(graph),graphHash=hash(gb),sourceRoot=resolve(import.meta.dirname,'..');
 await jput(join(candidate,'BUILD-RESULT.json'),{status:'pass',baseGraphSha256:'8660c8d5ba2611ca676b0e6169705abd6843cce4a43cdccdea0bd0478a834e52',graphHash,revision:'test-startup',graphChanges:graph.files});
 for(const name of ['DSH-SEP-Full','DSH-SEP-Only']){const dir=join(candidate,name);await put(join(dir,'graph.json'),gb);await jput(join(dir,'manifest.json'),{support:[]});await jput(join(dir,'host-adaptations.json'),[]);await put(join(dir,'README.md'),'historical readme');await jput(join(dir,'RELEASE-STATUS.json'),{status:'old'});await jput(join(dir,'SOURCE-PROVENANCE.json'),{upstreamDsh:{version:'alpha.2'}});await put(join(dir,'docs/DOCS_INDEX.md'),'historic index');if(name.endsWith('Full'))for(const p of await readdir(join(sourceRoot,'bootstrap')))if(/\.(?:mjs|ps1|vbs)$/.test(p))await put(join(dir,'bootstrap',p),await readFile(join(sourceRoot,'bootstrap',p)));}
 const source=join(candidate,'DSH-SEP-Source');await jput(join(source,'SOURCE_FILES.json'),{files:[]});await jput(join(source,'SOURCE-PROVENANCE.json'),{historical:true});await put(join(source,'README.md'),'historical source');await put(join(source,'BUILD.md'),'historical build');
 const reportPath=join(candidate,'private-report.json');await jput(reportPath,{schema:1,status:'pass',graphHash,summary:{tests:1,passed:1},log:join(process.env.USERPROFILE??tmpdir(),'test.log'),apiKey:'synthetic-private-value'});
 const result=await finalizeDocsSource({candidate,reportPath,sourceRoot});assert.equal(result.status,'pass');
 const published=JSON.parse(await readFile(join(candidate,'DSH-SEP-Full/docs/evidence/startup-validation.json')));assert.equal(published.apiKey,'[redacted]');assert.equal(published.summary.tests,1);assert(published.log.startsWith('[local-path]'));
 const mapping=JSON.parse(await readFile(join(candidate,'DSH-SEP-Full/host-adaptations.json')));assert.equal(mapping[0].path,graph.files[0].path);
 assert.equal(await readFile(join(candidate,'DSH-SEP-Full/docs/history/20260921-mit-before-startup/README.md'),'utf8'),'historical readme');
 const sourceMap=JSON.parse(await readFile(join(source,'SOURCE_FILES.json')));assert(sourceMap.files.some(f=>f.path.endsWith('diagnostics/diagnostics.test.mjs')));assert(sourceMap.files.some(f=>f.path.endsWith('derive-repair-bundle.mjs')));
 for(const row of sourceMap.files)assert.equal(hash(await readFile(join(source,row.path))),row.sha256);
});
