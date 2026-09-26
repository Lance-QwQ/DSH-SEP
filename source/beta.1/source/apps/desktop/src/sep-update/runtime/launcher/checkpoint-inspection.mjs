import {readFile,writeFile,open,rename,unlink,lstat,stat,realpath,mkdir} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {isDeepStrictEqual} from 'node:util';

const sha=b=>createHash('sha256').update(b).digest('hex');
const fail=code=>{throw Object.assign(Error(code),{code});};
const demand=(v,c)=>{if(!v)fail(c);};
const key=p=>resolve(p).toLowerCase();
const domains=['dsh_enhancement_suite_v1','dsh_four_layer_memory_v1','dsh_four_layer_archive_v1'];
const json=async p=>JSON.parse(await readFile(p,'utf8'));
async function regular(p,limit=16*1024*1024){const before=await lstat(p,{bigint:true});demand(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1n&&before.size<=BigInt(limit)&&key(await realpath(p))===key(p),'DAILY_COLD_FILE');const b=await readFile(p),after=await lstat(p,{bigint:true});for(const k of ['dev','ino','size','mtimeNs','ctimeNs'])demand(after[k]===before[k],'DAILY_COLD_CHANGED');return b;}
async function directory(p){const s=await lstat(p,{bigint:true});demand(s.isDirectory()&&!s.isSymbolicLink()&&s.ino!==0n&&s.dev!==0n&&key(await realpath(p))===key(p),'DAILY_COLD_DIRECTORY');return {path:p,dev:String(s.dev),ino:String(s.ino),birthtimeNs:String(s.birthtimeNs)};}
async function absent(p){try{await lstat(p);}catch(e){if(e.code==='ENOENT')return true;throw e;}fail('DAILY_COLD_CONFLICT');}
async function durable(p,value,replace=false){const out=replace?p+'.'+randomUUID()+'.tmp':p,f=await open(out,'wx',0o600);try{await f.writeFile(JSON.stringify(value,null,2)+'\n');await f.sync();}finally{await f.close();}if(replace)await rename(out,p);}
function ownerPaths(c){return {center:join(c.controlRoot,'owner.lock.json'),guardian:join(c.controlRoot,'guardian/guardian/owner.json'),suite:join(c.lockDirectory,'dsh-system-enhancement-package-v1.lock'),p2:join(c.storageRoot,'.suite-memory/p2/owner.lock')};}
async function chain(p,{digest='hash',seq='seq',prev='previous',initial=null}={}){const b=await regular(p);demand(b.length>0&&b.at(-1)===10,'DAILY_COLD_JOURNAL');let previous=initial;const rows=b.toString().trimEnd().split('\n').map(JSON.parse);for(const [i,row]of rows.entries()){const value={...row};delete value[digest];demand(row[seq]===i+1&&row[prev]===previous&&row[digest]===sha(JSON.stringify(value)),'DAILY_COLD_JOURNAL');previous=row[digest];}return rows;}
async function journals(c){return {center:await chain(join(c.controlRoot,'journal.jsonl'),{initial:'0'.repeat(64)}),guardian:await chain(join(c.controlRoot,'guardian/guardian/journal.jsonl'),{digest:'digest',seq:'sequence',prev:'previousHash'})};}
async function binding(c,configPath){return {configPath,configHash:sha(await regular(configPath)),graphHash:sha(await regular(join(c.releaseRoot,'graph.json'))),directories:await Promise.all([c.dailyRoot,c.releaseRoot,c.storageRoot,c.controlRoot,c.lockDirectory,join(c.storageRoot,'.suite-memory/p2'),join(c.controlRoot,'guardian/guardian')].map(directory))};}
async function data(c){const out={};for(const n of domains){try{out[n]=sha(await regular(join(c.storageRoot,n+'.json'),64*1024*1024));}catch(e){if(e.code!=='ENOENT')throw e;out[n]=null;}}return out;}

// Conservative read-only admission, followed by the real P2 validator after
// maintenance ownership. This automatic path covers governed-empty-origin
// stores only; adoption and unknown future event types require review.
export async function inspectColdCheckpoint(c){
 const root=join(c.storageRoot,'.suite-memory/p2'),paths=['head.json','adoption-control/head.json','document-control/head.json'].map(n=>join(root,n)),heads=[];
 for(const p of paths)try{heads.push({path:p,value:JSON.parse(await regular(p))});}catch(e){if(e.code!=='ENOENT')throw e;}
 demand(heads.length===1,'DAILY_COLD_HEAD');const rows=await chain(join(root,'journal.jsonl')),head=heads[0].value;
 demand(rows[0].type==='initialized'&&head.seq===rows.length&&head.hash===rows.at(-1).hash,'DAILY_COLD_HEAD');
 const s=await stat(c.storageRoot,{bigint:true});const {storageIdentity}=await import(pathToFileURL(join(c.releaseRoot,'node_modules/dsh-system-enhancement-package/src/p2/storage-location.js')));
 const identity=await storageIdentity({storageRoot:c.storageRoot,locationKey:s.dev+':'+s.ino,root});demand(head.identity===identity&&rows.every(r=>r.identity===identity),'DAILY_COLD_IDENTITY');
 const inert=new Set(['audit','inspection','backup_rotation','committed','confirmed','file_published','plan_invalidated','prepared','switching','validated','verifying','rolled_back']);
 let barrier={closed:false},fingerprints=rows[0].payload.dataFingerprints,businessSeq=0,maintenanceSeq=0;const pending=new Map(),deletions=new Map();
 for(const [i,r]of rows.entries()){
  const p=r.payload;demand(p&&typeof p==='object','DAILY_COLD_JOURNAL');
  if(r.type==='initialized'){demand(i===0,'DAILY_COLD_JOURNAL');continue;}
  if(r.type==='barrier'){demand(typeof p.closed==='boolean','DAILY_COLD_JOURNAL');barrier=p;continue;}
  if(['business_intent','maintenance_intent'].includes(r.type)){demand(typeof p.operationId==='string'&&!pending.has(p.operationId),'DAILY_COLD_JOURNAL');if(r.type==='business_intent')demand(p.businessSeq===++businessSeq,'DAILY_COLD_JOURNAL');else demand(p.maintenanceSeq===++maintenanceSeq,'DAILY_COLD_JOURNAL');pending.set(p.operationId,{...p,kind:r.type});continue;}
  if(['business_complete','maintenance_complete'].includes(r.type)){demand(pending.get(p.operationId)?.kind===r.type.replace('_complete','_intent'),'DAILY_COLD_JOURNAL');pending.delete(p.operationId);fingerprints=p.dataFingerprints;continue;}
  if(r.type==='recovered_intents'){demand(Array.isArray(p.operationIds)&&p.operationIds.every(id=>pending.get(id)?.kind==='maintenance_intent'),'DAILY_COLD_JOURNAL');for(const id of p.operationIds)pending.delete(id);continue;}
  if(r.type==='deletion_intent'){demand(Number.isSafeInteger(p.deletionSeq)&&!deletions.has(p.deletionSeq),'DAILY_COLD_JOURNAL');deletions.set(p.deletionSeq,{cleanup:'pending'});continue;}
  if(r.type==='deletion_complete'){demand(deletions.has(p.deletionSeq),'DAILY_COLD_JOURNAL');deletions.set(p.deletionSeq,{cleanup:'complete'});continue;}
  demand(inert.has(r.type),'DAILY_COLD_EVENT_UNSUPPORTED');
 }
 demand(isDeepStrictEqual(Object.keys(fingerprints).sort(),[...domains].sort()),'DAILY_COLD_DATA');
 const currentFingerprints=await data(c);demand(!barrier.closed&&pending.size===0&&[...deletions.values()].every(d=>d.cleanup==='complete')&&isDeepStrictEqual(fingerprints,currentFingerprints),'DAILY_COLD_PENDING_OR_DRIFT');
 return {verified:true,identity,pending:[],barrier,deletions:[...deletions.values()],dataFingerprints:fingerprints,currentFingerprints,head:{seq:head.seq,hash:head.hash}};
}
