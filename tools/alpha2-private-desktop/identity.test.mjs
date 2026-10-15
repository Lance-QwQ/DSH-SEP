import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,cp,readFile,writeFile,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import * as api from './verification-copy.mjs';
const host=process.env.SEP_OFFICIAL_HARNESS,base=process.env.SEP_BUNDLE_TEST_ROOT;
const {openControl}=await import(pathToFileURL(join(host,'node_modules/dsh-sep-bundle/bundle/modules/system-enhancement-package/src/p2/control.js')));
async function fixture(){
 const root=await mkdtemp(join(base,'identity-')),source=join(root,'source'),capture=join(root,'capture'),parent=join(root,'target');await mkdir(parent);const c=await openControl({storageRoot:source,initialize:true});await c.close();await cp(source,capture,{recursive:true});
 const f=await api.prepareVerificationCopy({sourceRoot:source,capturedRoot:capture,targetParent:parent,host}),s=await lstat(f.storageRoot,{bigint:true});
 return {...f,source,capture,input:{planPath:f.planPath,expectedPlanHash:f.planHash,storageRoot:f.storageRoot,root:join(f.storageRoot,'.suite-memory/p2'),locationKey:`${s.dev}:${s.ino}`}};
}
test('copy identity is available to the owned managed launcher while the real host holds P2, with no second lease',async()=>{
 assert.equal(typeof api.verificationIdentity,'function','IDENTITY_BRIDGE_MISSING');const f=await fixture();const p=JSON.parse(await readFile(f.planPath));const c=await api.openVerificationControl(f.input);try{assert.equal(await api.verificationIdentity(f.input),p.origin.identity);assert.equal((await c.checkpoint()).barrier.closed,false);}finally{await c.close();}
});
test('copy identity refuses wrong plan, physical directory and unchanged-source violations',async()=>{
 assert.equal(typeof api.verificationIdentity,'function','IDENTITY_BRIDGE_MISSING');const f=await fixture();
 await assert.rejects(api.verificationIdentity({...f.input,expectedPlanHash:'0'.repeat(64)}),{code:'VERIFICATION_PLAN_MISMATCH'});
 for(const change of [{locationKey:'0:0'},{root:f.source},{storageRoot:f.source}])await assert.rejects(api.verificationIdentity({...f.input,...change}),{code:'VERIFICATION_TARGET_MISMATCH'});
 await writeFile(join(f.source,'dsh_enhancement_suite_v1.json'),'changed');await assert.rejects(api.verificationIdentity(f.input),{code:'VERIFICATION_SOURCE_CHANGED'});
});
