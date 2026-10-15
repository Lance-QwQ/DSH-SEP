// Real body-free plan file validation and factory forwarding. The captured
// P2 manager is a seam so a resumed durable marker can be supplied directly.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {SourceTextModule,SyntheticModule} from 'node:vm';
import {hash} from './bounded-read.mjs';
async function fixture(){
 const base=await mkdtemp(join(resolve(process.env.SEP_MAC_LOW_TEST_ROOT),'document-plan-')),source=join(base,'original'),root=join(base,'control');await mkdir(root);await mkdir(join(root,'document-plans'));
 const body={identity:'synthetic-control',projectRoot:source,owner:'project:'+hash(source),path:'a.txt',deleteSource:false,source:{managedCopies:{sourcePolicy:'imported-source-retained; all-managed-generations-and-candidates-governed',planHash:'a'.repeat(64)}}};
 const bytes=JSON.stringify(body),planHash=hash(bytes),marker={id:'synthetic-marker',owner:body.owner,status:'purged',documentPath:'a.txt',planHash};await writeFile(join(root,'document-plans',planHash+'.json'),bytes);
 const control={root,identity:body.identity,withAccess:fn=>fn(),documentDeletions:()=>[marker]},calls=[];
 const module=new SourceTextModule(await readFile(new URL('./documents.mjs',import.meta.url),'utf8'));
 await module.link(async name=>{const values=name==='./bundle-modules.mjs'?{owned:async()=>({createDocumentManager:options=>({execute:async()=>{await options.facility.applyDocumentDeletion(marker);return {status:'deleted'};}})})}:name==='./bounded-read.mjs'?await import('./bounded-read.mjs'):await import(name);return new SyntheticModule(Object.keys(values),function(){for(const [k,v]of Object.entries(values))this.setExport(k,v);});});await module.evaluate();
 const factory=module.namespace.macDocumentFactory({source,local:{getStore:()=>({documentOps:{delete:async input=>{calls.push(['managed',input]);}}})},syncDirectory:async()=>{}});
 const api=factory({control,scope:{projects:[{key:hash(source)}]},facility:{applyDocumentDeletion:async input=>{calls.push(['data',input]);}}});return {api,body,root,marker,calls};
}
test('resuming after P2 marker persists binds the original reviewed managed hash',async()=>{
 const f=await fixture();assert.equal((await f.api.execute({}, {action:'resume'},{})).status,'deleted');assert.equal(f.calls.length,2);assert.equal(f.calls[1][1].expectedPlanHash,'a'.repeat(64));assert.equal(f.calls[1][1].marker,f.marker);
});
test('missing persisted review cannot mutate data or take a replacement inventory',async()=>{
 const f=await fixture();await rm(join(f.root,'document-plans',f.marker.planHash+'.json'));await assert.rejects(f.api.execute({}, {action:'resume'},{}),{code:'SEP_MAC_DOCUMENT_PLAN_UNVERIFIED'});assert.deepEqual(f.calls,[]);
});
test('changed persisted review cannot mutate either data domain',async()=>{
 const f=await fixture();await writeFile(join(f.root,'document-plans',f.marker.planHash+'.json'),JSON.stringify({...f.body,projectRoot:'wrong'}));await assert.rejects(f.api.execute({}, {action:'resume'},{}),{code:'SEP_MAC_DOCUMENT_PLAN_UNVERIFIED'});assert.deepEqual(f.calls,[]);
});