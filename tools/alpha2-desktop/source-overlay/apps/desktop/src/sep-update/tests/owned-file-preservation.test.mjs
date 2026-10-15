import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,symlink} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';import {pathToFileURL} from 'node:url';
import {inventory} from '../update-inventory.mjs';import {hash} from '../update-core.mjs';import {verifyPreparedPolicy} from '../prepare-preservation.mjs';
async function sample(){
 const area=await mkdtemp(join(tmpdir(),'sep-owned-file-')),home=join(area,'home');await mkdir(home);const fixtures=[];
 for(const [dir,version]of [['old','1.0.0'],['new','1.1.0']]){
  const root=join(area,dir),graph={roots:{'@deepseek-ai/dsh':'h','dsh-system-enhancement-package':'s'},packages:[],files:[]};await mkdir(join(root,'node_modules'),{recursive:true});
  for(const [id,name,v]of [['h','@deepseek-ai/dsh','0.1.7-rc.2'],['s','dsh-system-enhancement-package',version]]){
   const pkg=join(root,'store',id);await mkdir(pkg,{recursive:true});graph.packages.push({id,name,version:v,dependencies:{}});
   for(const [path,body]of Object.entries({'package.json':JSON.stringify({name,version:v}),'index.mjs':'throw Error("INVENTORY_MUST_NOT_EXECUTE")'})){await writeFile(join(pkg,path),body);graph.files.push({path:'store/'+id+'/'+path,size:Buffer.byteLength(body),sha256:hash(body)});}
   await mkdir(join(root,'node_modules',name,'..'),{recursive:true});await symlink(pkg,join(root,'node_modules',name),'junction');
  }
  await writeFile(join(root,'package.json'),JSON.stringify({dsh:{profile:{bundles:[]}}}));await writeFile(join(root,'graph.json'),JSON.stringify(graph));
  await writeFile(join(root,'cordis.patch.yml'),JSON.stringify([{insert:[{id:'file-entry',name:pathToFileURL(join(root,'node_modules/dsh-system-enhancement-package/index.mjs')).href}]}]));
  const context={home,installAnchor:join(root,'package.json'),overlayFiles:[]},inv=await inventory(root,{profileContext:context});fixtures.push({root,graph,context,inv});
 }
 const [a,b]=fixtures,metadata={schema:1,kind:'sep-program-delta',platform:'win32-x64',hostVersion:'0.1.7-rc.2',fromSepVersion:'1.0.0',sepVersion:'1.1.0',baseGraphHash:a.inv.graphHash,targetGraphHash:b.inv.graphHash};
 return {policy:{schema:2,kind:'sep-program-delta-policy',currentRoot:a.root,targetRoot:b.root,currentBinding:a.inv.binding,targetBinding:b.inv.binding,metadata},current:a.inv,candidate:b.inv,currentRoot:a.root,targetRoot:b.root,currentContext:a.context,targetContext:b.context,release:{version:'0.1.7-rc.2',sepVersion:'1.1.0'}};
}
test('an unchanged owned file entry follows an explicitly approved owner manifest update',async()=>{const f=await sample();assert.notEqual(f.current.plugins.at(-1).fingerprint,f.candidate.plugins.at(-1).fingerprint);assert.deepEqual(await verifyPreparedPolicy(f),[]);});
test('file-entry owner association never waives activation preservation',async()=>{const f=await sample();f.candidate.plugins.at(-1).enabled=false;await assert.rejects(verifyPreparedPolicy(f),/SEP_PRESERVATION_ACTIVATION/);});
