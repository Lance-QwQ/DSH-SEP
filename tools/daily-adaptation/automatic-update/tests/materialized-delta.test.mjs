import assert from 'node:assert/strict';
import {test} from 'node:test';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
const U=process.env.SEP_UPDATE_RUNTIME;
const {validateDelta}=await import(pathToFileURL(join(U,'prepare-package.mjs')));
const {verifyMaterializedRootManifest}=await import(pathToFileURL(join(U,'materialized-package.mjs')));
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
const hash='a'.repeat(64),other='b'.repeat(64);
function fixture(){
 const base={schema:3,kind:'dsh-sep-materialized-graph',platform:process.platform+'-'+process.arch,
  roots:{'@deepseek-ai/dsh':'m0','dsh-sep-bundle':'m1','user-plugin':'m2'},
  packagePaths:{m0:'node_modules/@deepseek-ai/dsh',m1:'node_modules/dsh-sep-bundle',m2:'node_modules/user-plugin'},
  packages:[{id:'m0',name:'@deepseek-ai/dsh',version:'0.2.1-alpha.1',dependencies:{}},{id:'m1',name:'dsh-sep-bundle',version:'0.2.1-beta.3-bundle.24',dependencies:{}},{id:'m2',name:'user-plugin',version:'1.0.0',dependencies:{}}],
  files:['node_modules/@deepseek-ai/dsh/package.json','node_modules/dsh-sep-bundle/package.json','node_modules/dsh-sep-bundle/index.js','node_modules/user-plugin/index.js','daily-adapter/index.mjs'].map(path=>({path,sha256:hash,size:1,mode:420}))};
 const next=structuredClone(base);next.packages[1].version='0.2.1-beta.3-bundle.25';next.files[1].sha256=other;
 const release={version:'0.2.1-alpha.1',sepVersion:'0.2.1-beta.3-bundle.25'};
 const metadata={schema:2,kind:'sep-materialized-delta',platform:base.platform,hostVersion:release.version,fromSepVersion:base.packages[1].version,sepVersion:release.sepVersion};
 return {base,next,metadata,release};
}
test('schema 3 same-host SEP delta accepts explicit materialized paths without store aliases',()=>{
 const f=fixture(),result=validateDelta(f.base,f.next,f.metadata,f.release);
 assert.deepEqual(result.changed,['node_modules/dsh-sep-bundle/package.json']);assert.deepEqual([...result.payload],[other]);
});
test('materialized delta cannot replace an unrelated user plugin',()=>{
 const f=fixture();f.next.files[3].sha256=other;
 assert.throws(()=>validateDelta(f.base,f.next,f.metadata,f.release),/SEP_PACKAGE_PRESERVATION/);
});
test('materialized delta refuses path escape and dependency topology changes',()=>{
 for(const mutation of [f=>f.next.files.push({path:'node_modules/dsh-sep-bundle/../../private',size:1,sha256:hash,mode:420}),f=>f.next.packagePaths.m1='node_modules/user-plugin',f=>f.next.packages[1].dependencies={'user-plugin':'m2'},f=>f.next.files.push({...f.next.files[2],path:'NODE_MODULES/dsh-sep-bundle/index.js'})]){
  const f=fixture();mutation(f);assert.throws(()=>validateDelta(f.base,f.next,f.metadata,f.release),/SEP_PACKAGE_|UPDATE_GRAPH_LAYOUT_INVALID/);
 }
});
test('an owned parent package does not authorize replacing its nested third-party dependency',()=>{
 const f=fixture();for(const g of [f.base,f.next]){g.packages.push({id:'m3',name:'foreign-dep',version:'1.0.0',dependencies:{}});g.packagePaths.m3='node_modules/dsh-sep-bundle/node_modules/foreign-dep';g.files.push({path:g.packagePaths.m3+'/index.js',size:1,sha256:hash,mode:420});}
 f.next.files.at(-1).sha256=other;assert.throws(()=>validateDelta(f.base,f.next,f.metadata,f.release),/SEP_PACKAGE_PRESERVATION/);
});
test('Windows package roots cannot alias by case',()=>{
 const f=fixture();for(const g of [f.base,f.next]){g.packagePaths.m2='node_modules/DSH-SEP-BUNDLE';g.packages[2].name='DSH-SEP-BUNDLE';delete g.roots['user-plugin'];g.roots['DSH-SEP-BUNDLE']='m2';}
 assert.throws(()=>validateDelta(f.base,f.next,f.metadata,f.release),/SEP_PACKAGE_TOPOLOGY/);
});
test('graph dependency names must agree with their bound package identity',()=>{
 const f=fixture();for(const g of [f.base,f.next])g.packages[1].dependencies={'different-name':'m2'};
 assert.throws(()=>validateDelta(f.base,f.next,f.metadata,f.release),/SEP_PACKAGE_DEPENDENCY/);
});
test('root manifest permits only graph-derived existing dependency versions',async()=>{
 const root=await mkdtemp(join(process.env.SEP_BUNDLE_TEST_ROOT,'root-manifest-')),a=join(root,'old'),b=join(root,'next');await mkdir(a);await mkdir(b);
 const before={name:'synthetic',private:true,scripts:{start:'original'},dependencies:{'dsh-sep-bundle':'old','user-plugin':'1.0.0'}},g={roots:{'dsh-sep-bundle':'m1','user-plugin':'m2'},packages:[{id:'m1',version:'new'},{id:'m2',version:'1.0.0'}]};
 await writeFile(join(a,'package.json'),JSON.stringify(before));const expected=structuredClone(before);expected.dependencies['dsh-sep-bundle']='new';await writeFile(join(b,'package.json'),JSON.stringify(expected));await verifyMaterializedRootManifest(a,b,g);
 for(const mutation of [m=>m.scripts.start='downloaded code',m=>m.dependencies['new-plugin']='1.0.0',m=>m.dependencies['user-plugin']='2.0.0']){const next=structuredClone(expected);mutation(next);await writeFile(join(b,'package.json'),JSON.stringify(next));await assert.rejects(verifyMaterializedRootManifest(a,b,g),/SEP_PACKAGE_ROOT_MANIFEST/);}
});
