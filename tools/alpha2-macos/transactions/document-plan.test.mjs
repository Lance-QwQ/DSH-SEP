// Actual document-deletion state machine with real SQLite. IO is a synthetic
// inventory boundary; this checks authorization, not APFS deletion mechanics.
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {documentCopies} from './document-copies.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
async function fixture({onEvent=()=>{}}={}){
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE generations(id INTEGER PRIMARY KEY,value TEXT); CREATE TABLE transactions(id TEXT PRIMARY KEY,value TEXT)');
 let entries=[{path:'a.txt',kind:'file',sha256:hash('synthetic'),size:9}],metadata={generation:1,sequence:0,pending:null},markers=[],deleted=0;
 const snapshot=()=>({entries:[...entries],sha256:hash(JSON.stringify(entries))});db.prepare('INSERT INTO generations VALUES(1,?)').run(JSON.stringify(snapshot()));
 const io={tree:async()=>snapshot(),directory:async()=>({close:async()=>{}}),syncDirectory:async()=>{},applyFile:async(_root,input)=>{assert.equal(input.path,'a.txt');assert.equal(input.delete,true);deleted++;entries=[];},eraseTree:async()=>{throw Error('unexpected candidate');}};
 const api=documentCopies({root:'/synthetic/managed',rootIdentity:'fixed',db,guard:async()=>{},meta:()=>metadata,setMeta:v=>{metadata=v;},atomic:fn=>fn(),save:()=>{},event:onEvent,io});
 const authority={identity:'synthetic-p2',read:async()=>markers};await api.bind(authority);const reviewed=await api.review('a.txt');
 markers=[{id:'delete-one',owner:'project:synthetic',status:'purged',documentPath:'a.txt',planHash:'1'.repeat(64),managedPlanHash:reviewed.planHash}];
 return {api,db,reviewed,marker:markers[0],authority,deleted:()=>deleted,setMarkers:v=>{markers=v;}};
}
for(const expectedPlanHash of [undefined,null,'',123,'f'.repeat(63)])test('fresh deletion refuses absent/malformed reviewed plan '+String(expectedPlanHash),async()=>{
 const f=await fixture();try{await assert.rejects(f.api.purge({marker:f.marker,expectedPlanHash}),{code:'SEP_PROJECT_DOCUMENT_PLAN_REQUIRED'});assert.equal(f.deleted(),0);assert.equal(f.db.prepare('SELECT count(*) AS n FROM document_deletions').get().n,0);}finally{f.db.close();}
});
test('fresh deletion refuses changed exact inventory hash before mutation',async()=>{
 const f=await fixture();try{await assert.rejects(f.api.purge({marker:f.marker,expectedPlanHash:'0'.repeat(64)}),{code:'SEP_PROJECT_DOCUMENT_PLAN_CHANGED'});assert.equal(f.deleted(),0);}finally{f.db.close();}
});
test('matching fresh deletion retains completed idempotent recovery without a new hash',async()=>{
 const f=await fixture();try{assert.equal((await f.api.purge({marker:f.marker,expectedPlanHash:f.reviewed.planHash})).status,'deleted');assert.equal(f.deleted(),1);assert.equal((await f.api.purge({marker:f.marker})).status,'deleted');assert.equal(f.deleted(),1);}finally{f.db.close();}
});
test('startup authority cannot invent a new plan when durable intent does not exist',async()=>{
 const f=await fixture();try{const {managedPlanHash,...marker}=f.marker;f.setMarkers([marker]);await assert.rejects(f.api.bind(f.authority),{code:'SEP_PROJECT_DOCUMENT_PLAN_REQUIRED'});assert.equal(f.deleted(),0);}finally{f.db.close();}
});
test('verified startup authority with bound plan can finish its exact deletion',async()=>{
 const f=await fixture();try{assert.equal((await f.api.bind(f.authority)).status,'pass');assert.equal(f.deleted(),1);}finally{f.db.close();}
});
test('already durable deletion intent resumes its known prefix without renewed confirmation',async()=>{
 let interrupt=true;const f=await fixture({onEvent:name=>{if(interrupt&&name==='document-copy-unlinked')throw Object.assign(Error('synthetic interruption'),{code:'SYNTHETIC_INTERRUPTION'});}});
 try{await assert.rejects(f.api.purge({marker:f.marker,expectedPlanHash:f.reviewed.planHash}),{code:'SYNTHETIC_INTERRUPTION'});assert.equal(f.deleted(),1);assert.equal(JSON.parse(f.db.prepare('SELECT value FROM document_deletions').get().value).status,'intent');interrupt=false;assert.equal((await f.api.purge({marker:f.marker})).status,'deleted');assert.equal(f.deleted(),1);}finally{f.db.close();}
});
