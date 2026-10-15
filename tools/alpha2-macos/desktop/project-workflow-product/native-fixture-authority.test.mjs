// Test-only real P2 + SQLite/project replay. POSIX helper is not Mac certification.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {openTrustedProject} from '../../project-workflow/derived-transaction-store.mjs';
import {wrapManagedProject} from '../../project-workflow/derived-lifecycle.mjs';
import {createProjectTree} from '../../apfs-tree/project-tree.mjs';
import {macDocumentAuthority} from '../../business/documents.mjs';
import {owned} from '../../business/bundle-modules.mjs';
const {openControl}=await owned('modules/system-enhancement-package/src/p2/control.js');
const {withExisting}=await import(pathToFileURL(process.env.SEP_PROJECT_FIXTURE_DATA_MODULE));
const base=process.env.SEP_PROJECT_FIXTURE_TEST_ROOT,helperPath=process.env.SEP_MAC_TREE_HELPER;
assert(base&&helperPath);await mkdir(base,{recursive:true,mode:0o700});
const hash=b=>createHash('sha256').update(b).digest('hex'),helperSha256=hash(await readFile(helperPath));
async function fixture(){
 const root=await mkdtemp(join(base,'authority-')),businessRoot=join(root,'business'),source=join(root,'source'),managed=join(businessRoot,'managed'),memory=join(businessRoot,'memory');
 for(const p of[businessRoot,source,managed,memory])await mkdir(p,{mode:0o700});await writeFile(join(source,'a.txt'),'original\n',{mode:0o600});
 const actualProject=()=>openTrustedProject({root:managed,source,io:createProjectTree({helperPath,helperSha256,lockPath:join(managed,'.native.lock')})});
 const control=await openControl({storageRoot:memory,initialize:true,recoverDocumentDeletion:true});let project;
 try{project=wrapManagedProject(await actualProject());await control.recoverDocumentDeletions();await project.bindDocumentAuthority(macDocumentAuthority(control,source));assert.equal((await project.current()).generation,1);}
 finally{if(project)assert.equal((await project.close()).resourcesConfirmedReleased,true);await control.close();}
 const config={businessRoot,source,p:{bundleRoot:process.env.SEP_MAC_BUNDLE_ROOT,entries:{helper:{path:helperPath,sha256:helperSha256}}},module:async path=>path==='project-workflow/project-factory.mjs'?{openWorkflowProject:actualProject}:import(new URL('../../'+path,import.meta.url))};
 return {root,businessRoot,source,memory,config,input:{outputRoot:root,round:1},actualProject};
}
test('closed actual product project reopens with its same real P2 authority before profile inspection',async()=>{
 const f=await fixture();const result=await withExisting(f.input,f.config,async({project,profile})=>({generation:(await project.current()).generation,pending:(await profile.controller.plans()).length}));
 assert.deepEqual(result,{generation:1,pending:0});assert.equal((JSON.parse(await readFile(join(f.root,'FIXTURE-CLEANUP-inspect.json')))).receipt.resourcesConfirmedReleased,true);
 const control=await openControl({storageRoot:f.memory,initialize:false,recoverDocumentDeletion:true});await control.assertOwned();await control.close();
 assert.equal(await readFile(join(f.source,'a.txt'),'utf8'),'original\n');
});
test('same-authority fixture can stage reviewed setup commit, then reopen without changing imported source',async()=>{
 const f=await fixture();await withExisting(f.input,f.config,async({project,profile,exec})=>{await profile.execute('read',{file_path:'a.txt'},exec);await profile.execute('write',{file_path:'a.txt',content:'committed fixture\n'},exec);const plan=await profile.controller.review();await profile.controller.commit({planHash:plan.planHash});assert.equal((await project.current()).generation,2);});
 const second=join(f.root,'second');await mkdir(second,{mode:0o700});await withExisting({...f.input,outputRoot:second},f.config,async({project,profile})=>{const current=await project.current();assert.equal(current.generation,2);assert.equal(await readFile(join(current.path,'a.txt'),'utf8'),'committed fixture\n');assert.equal((await profile.controller.plans()).length,0);});
 assert.equal(await readFile(join(f.source,'a.txt'),'utf8'),'original\n');
});
test('different real P2 identity remains refused and its lease is released after known project cleanup',async()=>{
 const f=await fixture(),other=join(f.root,'other');await mkdir(other,{mode:0o700});const otherMemory=join(other,'memory');await mkdir(otherMemory,{mode:0o700});const init=await openControl({storageRoot:otherMemory,initialize:true,recoverDocumentDeletion:true});await init.close();
 await assert.rejects(withExisting(f.input,{...f.config,businessRoot:other},async()=>assert.fail('wrong identity admitted')),{code:'SEP_PROJECT_DOCUMENT_AUTHORITY_INVALID'});
 const after=await openControl({storageRoot:otherMemory,initialize:false,recoverDocumentDeletion:true});await after.assertOwned();await after.close();
 const old=wrapManagedProject(await f.actualProject());await assert.rejects(old.current(),{code:'SEP_PROJECT_DOCUMENT_AUTHORITY_REQUIRED'});assert.equal((await old.close()).resourcesConfirmedReleased,true);
});
