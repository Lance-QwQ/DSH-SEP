import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,realpath} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
const project=await realpath(resolve(import.meta.dirname,'../..'));
const baseline=join(project,'deliverables/DSH-SEP-Windows-Alpha-20260921-MIT/DSH-SEP-Full/payload/store');
const old=join(project,'dsh-daily/releases/sep-alpha2-updatefix-20260924/store');
const subject=process.env.SEP_OWNER_PATCH_ROOT?await realpath(process.env.SEP_OWNER_PATCH_ROOT):old;
const out=join(import.meta.dirname,'synthetic');await mkdir(out,{recursive:true});
const factory=String.raw`
export const facility={async open(){return {table(){return {get(){},entries(){return []},async put(){},async delete(){}}},async close(){}}}};
`;
await writeFile(join(out,'facility.mjs'),factory);
const load=(id,file,root=subject)=>import(pathToFileURL(join(root,id,'src',file)));
async function crash(kind,dir,source=old){
 const childFile=join(dir,'child.mjs');
 const body={center:`const {openRecovery}=await import(${JSON.stringify(pathToFileURL(join(old,'p0500/src/controller.mjs')).href)});await openRecovery({controlRoot:process.argv[2]});`,
 guardian:`const {openGuardian}=await import(${JSON.stringify(pathToFileURL(join(old,'p0500/src/guardian.mjs')).href)});await openGuardian({controlRoot:process.argv[2],command:{file:process.execPath,args:[],cwd:process.argv[2]}});`,
 p2:`const {openControl}=await import(${JSON.stringify(pathToFileURL(join(old,'p0501/src/p2/control.js')).href)});await openControl({storageRoot:process.argv[2],initialize:true});`,
 suite:`const {facility}=await import(${JSON.stringify(pathToFileURL(join(out,'facility.mjs')).href)});const {openStore}=await import(${JSON.stringify(pathToFileURL(join(old,'p0501/src/store.js')).href)});await openStore(facility,process.argv[2]);`}[kind];
 await writeFile(childFile,body.replaceAll(pathToFileURL(old).href,pathToFileURL(source).href)+`process.send({ready:true,pid:process.pid});setInterval(()=>{},1000);`);
 const child=spawn(process.execPath,[childFile,dir],{windowsHide:true,stdio:['ignore','ignore','pipe','ipc']});let stderr='';child.stderr.on('data',b=>stderr+=b);
 try{await Promise.race([once(child,'message'),once(child,'exit').then(()=>{throw Error(stderr)})]);}catch(e){child.kill();throw e;}
 const done=once(child,'exit');child.kill();await done;return child.pid;
}
for(const kind of ['center','guardian','p2','suite'])test('legacy '+kind+' owner left by a dead process does not permanently prevent restart',async()=>{
 const dir=await mkdtemp(join(out,kind+'-'));await crash(kind,dir);let handle;
 if(kind==='center'){const {openRecovery}=await load('p0500','controller.mjs');handle=await openRecovery({controlRoot:dir});assert.equal(handle.status().writerState,'open');}
 if(kind==='guardian'){const {openGuardian}=await load('p0500','guardian.mjs');handle=await openGuardian({controlRoot:dir,command:{file:process.execPath,args:[],cwd:dir}});assert.equal(handle.status().phase,'idle');}
 if(kind==='p2'){const {openControl}=await load('p0501','p2/control.js');handle=await openControl({storageRoot:dir});assert.equal((await handle.checkpoint()).pending.length,0);}
 if(kind==='suite'){const {openStore}=await load('p0501','store.js'),{facility}=await import(pathToFileURL(join(out,'facility.mjs')));handle=await openStore(facility,dir);assert.ok(handle);}
 await handle.close();
});

for(const kind of ['center','guardian','p2','suite'])test('native '+kind+' lease releases after force termination across three generations',async()=>{
 const dir=await mkdtemp(join(out,'native-'+kind+'-'));
 for(let round=0;round<3;round++)await crash(kind,dir,subject);
 let handle;
 if(kind==='center'){const {openRecovery}=await load('p0500','controller.mjs');handle=await openRecovery({controlRoot:dir});}
 if(kind==='guardian'){const {openGuardian}=await load('p0500','guardian.mjs');handle=await openGuardian({controlRoot:dir,command:{file:process.execPath,args:[],cwd:dir}});}
 if(kind==='p2'){const {openControl}=await load('p0501','p2/control.js');handle=await openControl({storageRoot:dir});}
 if(kind==='suite'){const {openStore}=await load('p0501','store.js'),{facility}=await import(pathToFileURL(join(out,'facility.mjs')));handle=await openStore(facility,dir);}
 await handle.close();
});

test('a second suite writer cannot steal a live owner',async()=>{
 const dir=await mkdtemp(join(out,'concurrent-'));const {openStore}=await load('p0501','store.js'),{facility}=await import(pathToFileURL(join(out,'facility.mjs')));
 const first=await openStore(facility,dir);try{await assert.rejects(openStore(facility,dir),{code:'DATA_LOCKED'});}finally{await first.close();}
});

test('explicit legacy P2 token recovery refuses when no matching owner exists',async()=>{
 const dir=await mkdtemp(join(out,'explicit-token-'));const {openControl}=await load('p0501','p2/control.js');const first=await openControl({storageRoot:dir,initialize:true});const token=first.token;await first.close();
 await assert.rejects(openControl({storageRoot:dir,mode:'maintenance',recoverLockToken:token}),{code:'P2_LOCKED'});
});

test('malformed legacy owner remains refused and unchanged',async()=>{
 const dir=await mkdtemp(join(out,'corrupt-'));const file=join(dir,'dsh-system-enhancement-package-v1.lock');await writeFile(file,'{"pid":');
 const {openStore}=await load('p0501','store.js'),{facility}=await import(pathToFileURL(join(out,'facility.mjs')));await assert.rejects(openStore(facility,dir),{code:'DATA_LOCKED'});assert.equal(await readFile(file,'utf8'),'{"pid":');
});

test('unresolved business write remains blocked after ownership recovery',async()=>{
 const dir=await mkdtemp(join(out,'pending-'));const {openControl}=await load('p0501','p2/control.js');let control=await openControl({storageRoot:dir,initialize:true});
 await assert.rejects(control.business({operation:'synthetic-write'},async()=>{throw Error('effect interrupted')}),/effect interrupted/);await control.close();
 await assert.rejects(openControl({storageRoot:dir}),{code:'P2_RECOVERY_REQUIRED'});
 control=await openControl({storageRoot:dir,mode:'maintenance'});assert.equal((await control.checkpoint()).pending.length,1);await control.close();
});
test('suite domain disposal failure still releases only its own native ownership',async()=>{
 const dir=await mkdtemp(join(out,'dispose-'));const {openStore}=await load('p0501','store.js'),{facility}=await import(pathToFileURL(join(out,'facility.mjs')));
 const throwing={async open(...args){const domain=await facility.open(...args);return {...domain,async close(){throw Error('injected domain dispose failure')}}}};
 const first=await openStore(throwing,dir);await assert.rejects(first.close(),/injected domain dispose failure/);const second=await openStore(facility,dir);await second.close();
});
