import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile,mkdir,symlink,readFile} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {setup,homeTree,recordRoot} from './fixture.mjs';
import {openTestInstallerController} from './testing.mjs';
async function installed(){const f=await setup(),app=await openTestInstallerController(f.config),p=await app.preview();await app.confirm({planHash:p.planHash});return {f,app,p};}
async function finish(app){assert.equal((await app.close()).status,'pass');}

test('recovery list with no governance returns an empty summary without creating directories',async()=>{
 const f=await setup(),before=await homeTree(f),app=await openTestInstallerController(f.config);
 try{const r=await app.listRecovery();assert.deepEqual(r,{status:'pass',entries:[]});assert.deepEqual(await homeTree(f),before);}finally{await finish(app);}
});
test('recovery list exposes bounded identifiers and state only, never stored plan or local paths',async()=>{
 const {f,app,p}=await installed();try{const r=await app.listRecovery();assert.equal(r.status,'pass');assert.equal(r.entries.length,1);assert.deepEqual(r.entries[0],{transactionId:p.plan.transactionId,status:'pass',phase:'committed',recoverable:true});const bytes=JSON.stringify(r);assert.ok(bytes.length<16384);assert.equal(bytes.includes(f.home),false);assert.equal(bytes.includes(f.source),false);assert.equal(bytes.includes('confirmationSha256'),false);}finally{await finish(app);}
});
test('corrupt recorded confirmation remains a visible blocked entry rather than disappearing',async()=>{
 const {f,app,p}=await installed();try{await writeFile(join(recordRoot(f,p.plan.transactionId),'confirmation.json'),'{invalid');const r=await app.listRecovery();assert.equal(r.entries.length,1);assert.deepEqual(r.entries[0],{transactionId:p.plan.transactionId,status:'blocked',phase:'unknown',code:'SEP_INSTALLER_JOURNAL',recoverable:false});}finally{await finish(app);}
});
test('an aliased transaction directory fails the whole list without following its external target',async()=>{
 const {f,app,p}=await installed(),outside=join(f.root,'external-list');await mkdir(outside,{mode:0o700});await writeFile(join(outside,'keep'),'untouched');await symlink(outside,join(dirname(recordRoot(f,p.plan.transactionId)),'f'.repeat(32)));
 try{await assert.rejects(app.listRecovery(),{code:'SEP_INSTALLER_JOURNAL'});assert.equal(await readFile(join(outside,'keep'),'utf8'),'untouched');}finally{await finish(app);}
});
