import test from 'node:test';
import assert from 'node:assert/strict';
import {createLayeredMemory} from '../src/layered-memory.js';
import {digest} from '../src/errors.js';
// In-memory KV is the storage seam; all catalog validation and governance is real.
async function fixture(){
 const domains=new Map();
 const facility={async open(spec){let tables=domains.get(spec.name);if(!tables){tables=new Map(Object.keys(spec.tables).map(k=>[k,new Map()]));domains.set(spec.name,tables);}return {table(name){const rows=tables.get(name);return {get:key=>structuredClone(rows.get(key)),put:async(key,value)=>{spec.tables[name].valueSchema.parse(value);rows.set(key,structuredClone(value));}};},close:async()=>{}};}};
 const project={key:'synthetic-project',root:'D:/synthetic-project'};
 const manager=await createLayeredMemory({facility,scope:{projects:[project],isDocumentExcluded:()=>false},legacy:{read:()=>({memories:[]})}});
 return {project,manager,catalog:()=>domains.get('dsh_four_layer_memory_v1').get('active').get('catalog'),archive:()=>domains.get('dsh_four_layer_archive_v1').get('archives')};
}
const document={path:'guide.txt',sha256:'a'.repeat(64),parts:[{id:'p1',text:'Synthetic document body',locator:{lineStart:1}}],warnings:[]};
const message={sessionId:'root',messageId:'u1',textHash:digest('Synthetic user message')};
test('archiving an unrelated removed document does not prevent session history expansion',async t=>{
 const f=await fixture();t.after(()=>f.manager.close());
 await f.manager.archiveSources(f.project,{previous:[document],current:[]},{signal:new AbortController().signal});
 assert.doesNotThrow(()=>f.manager.assertHistoryReadable(f.project,{metadata:true}));
 assert.doesNotThrow(()=>f.manager.assertHistoryReadable(f.project,message));
 assert.equal(f.archive().size,1,'The document archive must still be retained');
});
test('unverified memory archives continue to block history',async t=>{
 const f=await fixture();t.after(()=>f.manager.close());
 await f.manager.archiveSources(f.project,{previous:[document],current:[]},{});
 const meta=Object.values(f.catalog().archives)[0];meta.sourceType='memory';
 assert.throws(()=>f.manager.assertHistoryReadable(f.project,message),{code:'HISTORY_GOVERNANCE_UNRESOLVED'});
});
test('document-looking metadata with a mismatched or absent payload is not treated as verified document history',async t=>{
 const f=await fixture();t.after(()=>f.manager.close());
 await f.manager.archiveSources(f.project,{previous:[document],current:[]},{});
 const meta=Object.values(f.catalog().archives)[0];f.archive().get(meta.archiveId).document.sha256='b'.repeat(64);
 assert.throws(()=>f.manager.assertHistoryReadable(f.project,message),{code:'HISTORY_GOVERNANCE_UNRESOLVED'});
 f.archive().delete(meta.archiveId);
 assert.throws(()=>f.manager.assertHistoryReadable(f.project,message),{code:'HISTORY_GOVERNANCE_UNRESOLVED'});
});
test('a verified document archive cannot hide an exact withdrawn user source',async t=>{
 const f=await fixture();t.after(()=>f.manager.close());
 await f.manager.archiveSources(f.project,{previous:[document],current:[]},{});
 f.catalog().owners['project:synthetic-project']={records:[],events:{},markers:[{historyProvenance:{version:1,complete:true,refs:[message]}}]};
 assert.throws(()=>f.manager.assertHistoryReadable(f.project,message),{code:'HISTORY_SOURCE_BLOCKED'});
 assert.throws(()=>f.manager.assertHistoryReadable(f.project,{...message,textHash:'b'.repeat(64)}),{code:'HISTORY_SOURCE_CHANGED'});
 assert.doesNotThrow(()=>f.manager.assertHistoryReadable(f.project,{...message,messageId:'u2'}));
});