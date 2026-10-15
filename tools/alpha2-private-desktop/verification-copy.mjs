// Operator/test-only authority. Not exported by SEP, installed by an updater,
// or selected by an environment flag. The original P2 module is never changed.
import {readFile,writeFile,mkdir,mkdtemp,lstat,realpath,readdir} from 'node:fs/promises';
import {join,resolve,relative,dirname,parse,sep,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL,fileURLToPath} from 'node:url';
const sha=b=>createHash('sha256').update(b).digest('hex');
const key=p=>process.platform==='win32'?resolve(p).toLowerCase():resolve(p);
const fail=code=>{throw Object.assign(Error(code),{code});};
const domains=['dsh_enhancement_suite_v1','dsh_four_layer_memory_v1','dsh_four_layer_archive_v1'];
const heads=['head.json','adoption-control/head.json','document-control/head.json'];
const selected=[...domains.map(n=>n+'.json'),'.suite-memory/p2/journal.jsonl','.suite-memory/p2/storage-location.json',...heads.map(n=>'.suite-memory/p2/'+n)];
const grants=new Map();
const inside=(a,b)=>{const r=relative(a,b);return r!==''&&r!=='..'&&!r.startsWith('..'+sep)&&!isAbsolute(r);};
async function directory(path){
 if(!isAbsolute(path??''))fail('VERIFICATION_ALIAS');path=resolve(path);let part=parse(path).root;
 for(const name of relative(part,path).split(sep).filter(Boolean)){part=join(part,name);const s=await lstat(part,{bigint:true});if(!s.isDirectory()||s.isSymbolicLink()||s.ino===0n||key(await realpath(part))!==key(part))fail('VERIFICATION_ALIAS');}
 const s=await lstat(path,{bigint:true});return {path,fileId:`${s.dev}:${s.ino}`,birthtimeNs:String(s.birthtimeNs)};
}
async function file(path,{missing=false}={}){
 let a;try{await directory(dirname(path));a=await lstat(path,{bigint:true});}catch(e){if(missing&&e.code==='ENOENT')return null;throw e;}
 if(!a.isFile()||a.isSymbolicLink()||a.nlink!==1n||!a.ino||a.size>64n*1024n*1024n)fail('VERIFICATION_ALIAS');
 const bytes=await readFile(path),b=await lstat(path,{bigint:true});if(['dev','ino','size','mtimeNs','ctimeNs'].some(k=>a[k]!==b[k]))fail('VERIFICATION_SOURCE_CHANGED');return bytes;
}
async function witness(root){const result={};for(const name of selected){const bytes=await file(join(root,name),{missing:true});result[name]=bytes===null?null:sha(bytes);}return result;}
async function assertWitness(root,expected){if(JSON.stringify(await witness(root))!==JSON.stringify(expected))fail('VERIFICATION_SOURCE_CHANGED');}
async function assertTree(root){await directory(root);for(const entry of await readdir(root,{withFileTypes:true})){const path=join(root,entry.name);if(entry.isDirectory())await assertTree(path);else await file(path);}}
async function chain(root){
 const bytes=await file(join(root,'.suite-memory/p2/journal.jsonl'));if(!bytes?.length||bytes.at(-1)!==10)fail('VERIFICATION_CHAIN_INVALID');
 let events;try{events=bytes.toString('utf8').slice(0,-1).split('\n').map(JSON.parse);}catch{fail('VERIFICATION_CHAIN_INVALID');}
 let previous=null,barrier=true;const pending=new Set();
 for(const [i,e]of events.entries()){
  const{hash,...body}=e;if(e.seq!==i+1||e.previous!==previous||e.identity!==events[0].identity||hash!==sha(JSON.stringify(body)))fail('VERIFICATION_CHAIN_INVALID');previous=hash;
  if(e.type==='initialized')barrier=false;if(e.type==='adoption_initialized')barrier=true;if(e.type==='barrier')barrier=e.payload.closed;
  if(['business_intent','maintenance_intent','adoption_intent'].includes(e.type))pending.add(e.payload.operationId);
  if(['business_complete','maintenance_complete','adoption_complete'].includes(e.type))pending.delete(e.payload.operationId);
  if(e.type==='recovered_intents')for(const id of e.payload.operationIds)pending.delete(id);
 }
 if(!['initialized','adoption_initialized'].includes(events[0].type)||barrier!==false||pending.size)fail('VERIFICATION_SOURCE_NOT_QUIESCENT');
 const found=[];for(const name of heads){const b=await file(join(root,'.suite-memory/p2',name),{missing:true});if(b!==null)found.push(JSON.parse(b));}
 if(found.length!==1||found[0].identity!==events[0].identity||found[0].seq!==events.length||found[0].hash!==previous)fail('VERIFICATION_CHAIN_INVALID');
 return {identity:events[0].identity,head:{seq:events.length,hash:previous},bytes};
}
export function authorizedIdentity({storageRoot,locationKey,root}){
 const grant=grants.get(key(storageRoot));if(!grant||grant.fileId!==locationKey||key(root)!==key(join(storageRoot,'.suite-memory/p2')))fail('VERIFICATION_AUTHORITY_REQUIRED');return grant.identity;
}
// Read-only identity proof for the isolated owned launcher. It does not grant
// a P2 lease or authorize any recovery, deletion, relocation or production use.
export async function verificationIdentity({planPath,expectedPlanHash,storageRoot,locationKey,root}){
 let plan;try{plan=JSON.parse(await file(planPath));}catch{fail('VERIFICATION_PLAN_MISMATCH');}
 if(plan.schema!==1||plan.kind!=='isolated-verification-copy'||plan.productionAdoption!==false||sha(JSON.stringify(plan))!==expectedPlanHash)fail('VERIFICATION_PLAN_MISMATCH');
 if(key(storageRoot)!==key(plan.target.path)||locationKey!==plan.target.fileId||key(root)!==key(join(storageRoot,'.suite-memory/p2')))fail('VERIFICATION_TARGET_MISMATCH');
 for(const item of [plan.source,plan.capture,plan.target,plan.parent])if(JSON.stringify(await directory(item.path))!==JSON.stringify(item))fail('VERIFICATION_TARGET_MISMATCH');
 if(sha(await file(plan.implementation.path))!==plan.implementation.sha256||sha(await file(plan.control.source))!==plan.control.sourceSha256||sha(await file(plan.control.path))!==plan.control.resultSha256)fail('VERIFICATION_PROGRAM_CHANGED');
 await assertWitness(plan.source.path,plan.seed);await assertWitness(plan.capture.path,plan.seed);
 const journal=await file(join(storageRoot,'.suite-memory/p2/journal.jsonl')),original=await file(join(plan.capture.path,'.suite-memory/p2/journal.jsonl'));
 if(journal.length<original.length||!journal.subarray(0,original.length).equals(original))fail('VERIFICATION_CHAIN_INVALID');
 return plan.origin.identity;
}
async function materializeControl({host,out}){
 const source=join(host,'node_modules/dsh-sep-bundle/bundle/modules/system-enhancement-package/src/p2/control.js');
 const input=await readFile(source,'utf8'),transforms=[];let result=input;
 for(const m of [...input.matchAll(/from (['"])(\.\.?\/[^'"]+)\1/g)]){
  const to=m[2]==='./storage-location.js'?`from '${import.meta.url}'`:`from '${pathToFileURL(resolve(dirname(source),m[2])).href}'`;
  const actual=to;
  if(result.split(m[0]).length!==2)fail('VERIFICATION_ORIGIN_ANCHOR');result=result.replace(m[0],actual);transforms.push({from:m[0],to:actual});
 }
 const anchor="import {storageIdentity} from '"+import.meta.url+"';";
 if(result.split(anchor).length!==2)fail('VERIFICATION_ORIGIN_ANCHOR');
 const replacement="import {authorizedIdentity as storageIdentity} from '"+import.meta.url+"';";result=result.replace(anchor,replacement);transforms.push({from:anchor,to:replacement});
 await mkdir(out);const path=join(out,'control.mjs');await writeFile(path,result,{flag:'wx'});
 return {source,sourceSha256:sha(input),path,resultSha256:sha(result),transforms};
}
export async function prepareVerificationCopy({sourceRoot,capturedRoot,targetParent,host}){
 const source=await directory(sourceRoot),capture=await directory(capturedRoot),parent=await directory(targetParent);
 if([source.path,capture.path].some(p=>key(p)===key(parent.path)||inside(p,parent.path)||inside(parent.path,p)))fail('VERIFICATION_TARGET_MISMATCH');
 const before=await witness(source.path);await assertWitness(capture.path,before);const origin=await chain(capture.path);
 const normal=await import(pathToFileURL(join(host,'node_modules/dsh-sep-bundle/bundle/modules/system-enhancement-package/src/p2/storage-location.js')));
 if(await normal.storageIdentity({storageRoot:source.path,locationKey:source.fileId,root:join(source.path,'.suite-memory/p2')})!==origin.identity)fail('VERIFICATION_SOURCE_CHANGED');
 const storageRoot=await mkdtemp(join(parent.path,'memory-'));
 for(const name of selected){const bytes=await file(join(capture.path,name),{missing:true});if(bytes===null)continue;const path=join(storageRoot,name);await mkdir(dirname(path),{recursive:true});await writeFile(path,bytes,{flag:'wx',mode:0o600});}
 await assertWitness(source.path,before);await assertWitness(capture.path,before);await assertWitness(storageRoot,before);
 const target=await directory(storageRoot),originControl=await materializeControl({host,out:join(parent.path,'control-'+target.fileId.replace(':','-'))});
 const plan={schema:1,kind:'isolated-verification-copy',productionAdoption:false,source,capture,target,parent,seed:before,origin:{identity:origin.identity,head:origin.head,journalBytes:origin.bytes.length},control:originControl,implementation:{path:fileURLToPath(import.meta.url),sha256:sha(await readFile(fileURLToPath(import.meta.url)))},scope:['read','governed-domain-put','synthetic-profile','reopen'],denied:['maintenance','rollback','update','adoption','document-delete','backup-purge','source-file-operation']};
 const planHash=sha(JSON.stringify(plan)),planPath=join(parent.path,'plan-'+planHash+'.json');await writeFile(planPath,JSON.stringify(plan,null,2)+'\n',{flag:'wx',mode:0o600});return {storageRoot,planPath,planHash};
}
export async function openVerificationControl({planPath,expectedPlanHash,storageRoot}){
 let plan;try{plan=JSON.parse(await file(planPath));}catch(e){if(e.code==='VERIFICATION_ALIAS')throw e;fail('VERIFICATION_PLAN_MISMATCH');}
 if(plan.schema!==1||plan.kind!=='isolated-verification-copy'||plan.productionAdoption!==false||sha(JSON.stringify(plan))!==expectedPlanHash)fail('VERIFICATION_PLAN_MISMATCH');
 if(key(storageRoot)!==key(plan.target.path)||!inside(plan.parent.path,storageRoot))fail('VERIFICATION_TARGET_MISMATCH');
 for(const item of [plan.source,plan.capture,plan.target,plan.parent])if(JSON.stringify(await directory(item.path))!==JSON.stringify(item))fail('VERIFICATION_TARGET_MISMATCH');
 if(sha(await file(plan.implementation.path))!==plan.implementation.sha256||sha(await file(plan.control.source))!==plan.control.sourceSha256||sha(await file(plan.control.path))!==plan.control.resultSha256)fail('VERIFICATION_PROGRAM_CHANGED');
 await assertWitness(plan.source.path,plan.seed);await assertWitness(plan.capture.path,plan.seed);await assertTree(storageRoot);
 const targetJournal=await file(join(storageRoot,'.suite-memory/p2/journal.jsonl')),captureJournal=await file(join(plan.capture.path,'.suite-memory/p2/journal.jsonl'));
 if(targetJournal.length<captureJournal.length||!targetJournal.subarray(0,captureJournal.length).equals(captureJournal))fail('VERIFICATION_CHAIN_INVALID');
 const relocation='.suite-memory/p2/storage-location.json';if(sha((await file(join(storageRoot,relocation),{missing:true}))??'absent')!==sha((await file(join(plan.capture.path,relocation),{missing:true}))??'absent'))fail('VERIFICATION_CHAIN_INVALID');
 const sourceChain=await chain(plan.capture.path);if(JSON.stringify(sourceChain.head)!==JSON.stringify(plan.origin.head)||sourceChain.identity!==plan.origin.identity)fail('VERIFICATION_CHAIN_INVALID');
 if(grants.has(key(storageRoot)))fail('VERIFICATION_BUSY');grants.set(key(storageRoot),{identity:plan.origin.identity,fileId:plan.target.fileId});let control;
 try{const module=await import(pathToFileURL(plan.control.path));control=await module.openControl({storageRoot,initialize:false});await control.withAccess(()=>{});}catch(e){await control?.close();throw e;}finally{grants.delete(key(storageRoot));}
 const deny=async()=>fail('VERIFICATION_SCOPE_DENIED');
 const blocked=['maintenance','setBarrier','adoptionWrite','reconcileAdoption','commitAdoption','acceptAdoptionBaseline','documentDeletion','recoverDocumentDeletions','completeDeletion','deletion'];
 const wrapped={...control,...Object.fromEntries(blocked.map(n=>[n,deny])),verificationCopy:Object.freeze({planHash:expectedPlanHash,productionAdoption:false}),
  async business(meta,fn){
   if(!meta||Object.keys(meta).some(k=>!['domain','table','key','operation'].includes(k))||!domains.includes(meta.domain)||meta.operation!=='put'||typeof meta.table!=='string'||typeof meta.key!=='string')fail('VERIFICATION_SCOPE_DENIED');
   await assertTree(storageRoot);return control.business(meta,fn);
  },event:async(type,payload)=>{if(!['inspection','audit'].includes(type))fail('VERIFICATION_SCOPE_DENIED');return control.event(type,payload);},
 };
 return Object.freeze(wrapped);
}
