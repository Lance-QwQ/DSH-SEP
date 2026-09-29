import {readFile,readdir,lstat,realpath,mkdir,open,unlink} from 'node:fs/promises';
import {join,resolve,dirname,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {channel} from 'node:diagnostics_channel';
import {z} from 'zod';
import {canonicalIdentity} from './artifacts.js';
import {assertPreparationPlan,assertPreparationEvent} from './adoption-metadata.js';
import {openAdoptionCopies} from './adoption-copies.js';
import {acquireAdoptionAdmission} from './adoption-admission.js';
import {openControl,DATA_DOMAINS} from './control.js';

const PERIOD=30*86400000,MAX=16*1024*1024;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,HASH=/^[a-f0-9]{64}$/;
const sha=b=>createHash('sha256').update(b).digest('hex');
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const digest=v=>sha(JSON.stringify(stable(v))),same=(a,b)=>digest(a)===digest(b),sealed=v=>({...v,hash:digest(v)});
const fail=s=>{const code='P2_ADOPTION_METADATA_RETENTION_'+s;throw Object.assign(new Error(code),{code});};
const bounded=e=>/^(?:P2_|ADOPTION_)[A-Z_]+$/.test(e?.code??'')&&e.code.length<110?e.code:'P2_ADOPTION_METADATA_RETENTION_IO';
const id=s=>`${s.dev}:${s.ino}`,pathEqual=(a,b)=>process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b;
const diagnostics=channel('dsh.adoption.metadata-retention');
const object=s=>z.object(s).strict(),hash=z.string().regex(HASH),uuid=z.string().regex(UUID),count=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const path=z.string().min(1).max(32768).refine(v=>isAbsolute(v)&&!/[\x00-\x1f\x7f]/.test(v));
const identity=z.string().regex(/^\d+:\d+$/),head=object({seq:count.min(1),hash});
const file=object({relative:z.string().regex(/^(?:binding\.json|events\.jsonl|head\.json|head\.[a-f0-9-]{36}\.tmp|plans\/[a-f0-9]{64}\.json)$/),sha256:hash,size:count,fileIdentity:identity});
const intentSchema=object({version:z.literal(1),kind:z.literal('adoption-metadata-retirement'),metadataOnly:z.literal(true),storageRoot:path,transactionId:uuid,
  directories:z.array(object({path,identity})).min(7).max(32),copyIdentity:hash,copyHead:head,copyCleanupAt:count,originalBindingHash:hash,originalHead:head,
  terminalAt:count,eligibleAt:count,startedAt:count,files:z.array(file).min(3).max(4096),hash});
const progressSchema=object({identity:hash,seq:count.min(1),previous:hash.nullable(),type:z.enum(['started','removed','complete']),index:count.nullable(),at:count,hash});
const receiptSchema=object({version:z.literal(1),kind:z.literal('adoption-metadata-retirement-receipt'),intentHash:hash,completedAt:count,journalHead:head,hash});
function valid(v,schema){if(!schema.safeParse(v).success)fail('EVIDENCE_INVALID');const {hash,...body}=v;if(digest(body)!==hash)fail('EVIDENCE_INVALID');return v;}
function locator(v){if(!isAbsolute(v?.storageRoot??'')||!UUID.test(v?.transactionId??''))fail('INPUT');return {storageRoot:resolve(v.storageRoot),transactionId:v.transactionId};}
const paths=v=>{const p2=join(v.storageRoot,'.suite-memory','p2'),original=join(p2,'adoption-plans',v.transactionId),root=join(p2,'adoption-metadata-retention',v.transactionId);return {p2,original,plans:join(original,'plans'),root,intent:join(root,'intent.json'),journal:join(root,'journal.jsonl'),receipt:join(root,'receipt.json')};};
async function maybe(p){try{return await lstat(p,{bigint:true});}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function directory(p){const s=await lstat(p,{bigint:true});if(!s.isDirectory()||s.isSymbolicLink()||s.ino===0n||!pathEqual(await realpath(p),p))fail('PATH');return id(s);}
async function chain(p){for(let q=p;;q=dirname(q)){const s=await lstat(q);if(!s.isDirectory()||s.isSymbolicLink())fail('PATH');if(dirname(q)===q)break;}return directory(p);}
async function bytes(p){
  const before=await lstat(p,{bigint:true});if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1n||before.ino===0n||before.size>BigInt(MAX))fail('FILE');
  const h=await open(p,'r');try{if(id(await h.stat({bigint:true}))!==id(before))fail('CHANGED');const value=await h.readFile(),after=await lstat(p,{bigint:true});
    if(id(after)!==id(before)||after.size!==before.size||after.mtimeNs!==before.mtimeNs||value.length!==Number(before.size))fail('CHANGED');return {value,sha256:sha(value),size:value.length,fileIdentity:id(before)};
  }finally{await h.close();}
}
async function json(p){try{return JSON.parse((await bytes(p)).value);}catch(e){if(e.code?.startsWith('P2_'))throw e;fail('EVIDENCE_INVALID');}}
async function durable(p,value,flags='wx'){const h=await open(p,flags,0o600);try{await h.writeFile(value);await h.sync();}finally{await h.close();}}
async function checkedDirectories(list){for(const p of list)if(await directory(p.path)!==p.identity)fail('CHANGED');}
async function inventory(root){
  const result=[];
  for(const name of (await readdir(root)).sort()){
    if(name==='plans'){await directory(join(root,name));for(const sub of (await readdir(join(root,name))).sort()){if(!/^[a-f0-9]{64}\.json$/.test(sub))fail('UNKNOWN');result.push('plans/'+sub);}continue;}
    if(!['binding.json','events.jsonl','head.json'].includes(name)&&!/^head\.[a-f0-9-]{36}\.tmp$/.test(name))fail('UNKNOWN');result.push(name);
  }
  return result;
}
async function copyProof(v){
  const root=join(paths(v).p2,'adoptions',v.transactionId,'control'),binding=await json(join(root,'identity.json'));
  const {checksum,...body}=binding;if(checksum!==sha(JSON.stringify(body))||body.transactionId!==v.transactionId||!HASH.test(body.identity??'')||!body.paths)fail('COPY_PROOF');
  const txRoot=dirname(root),expectedPaths=[v.storageRoot,join(v.storageRoot,'.suite-memory'),paths(v).p2,dirname(txRoot),txRoot,root,...['capture','review','staging'].map(g=>join(txRoot,g))];
  if(!same(Object.keys(body.paths),expectedPaths))fail('COPY_PROOF');
  for(const [p,expected]of Object.entries(body.paths))if(await directory(p)!==expected)fail('COPY_PROOF');
  const data=(await bytes(join(root,'journal.jsonl'))).value.toString();if(!data.endsWith('\n'))fail('COPY_PROOF');const events=data.trimEnd().split('\n').map(JSON.parse);let previous=null;
  for(const [i,e]of events.entries()){const {hash,...entry}=e;if(entry.seq!==i+1||entry.previous!==previous||entry.identity!==body.identity||hash!==sha(JSON.stringify(entry)))fail('COPY_PROOF');previous=hash;}
  const h=await json(join(root,'head.json'));if(!same(h,{identity:body.identity,seq:events.length,hash:previous}))fail('COPY_PROOF');
  const cleanup=events.findLast(e=>e.type==='cleanup_complete');if(!cleanup)fail('COPY_PROOF');
  return {identity:body.identity,head:{seq:events.length,hash:previous},cleanupAt:cleanup.at,events};
}
async function originalMetadata(v,cp,now){
  const p=paths(v);await chain(p.original);await directory(p.plans);
  const names=await inventory(p.original),binding=await json(join(p.original,'binding.json'));
  const expected={transactionId:v.transactionId,copyIdentity:cp.identity,root:await canonicalIdentity(p.original),plans:await canonicalIdentity(p.plans)};
  if(!same(binding,sealed(expected)))fail('EVIDENCE_INVALID');
  const text=(await bytes(join(p.original,'events.jsonl'))).value.toString();if(!text.endsWith('\n'))fail('EVIDENCE_INVALID');const events=text.trimEnd().split('\n').map(JSON.parse);let previous=null,lastAt=0;
  for(const [i,e]of events.entries()){assertPreparationEvent(e);const {hash,...body}=e;if(e.identity!==binding.hash||e.seq!==i+1||e.previous!==previous||digest(body)!==hash||e.at<lastAt)fail('EVIDENCE_INVALID');previous=hash;lastAt=e.at;}
  if(!events.length||events[0].type!=='preparing'||now<lastAt)fail('EVIDENCE_INVALID');
  const h=await json(join(p.original,'head.json'));if(!same(h,{identity:binding.hash,seq:events.length,hash:previous}))fail('EVIDENCE_INVALID');
  const reserved=new Map(events.filter(e=>e.type==='plan_reserved').map(e=>[e.payload.planHash,e.payload.phase]));
  // A missing reserved plan may be the only record of a requested DACL
  // retirement. Original metadata may tolerate an interrupted reservation;
  // the collector cannot infer that the missing evidence was ordinary.
  if([...reserved.keys()].some(hash=>!names.includes(`plans/${hash}.json`)))fail('EVIDENCE_INVALID');
  let retirement=events.some(e=>e.type==='retired'||e.type.startsWith('maintenance_end_')||e.payload?.result?.retirement?.retired||e.payload?.result?.sourceProof?.retirement);
  const files=[];for(const relative of names){const got=await bytes(join(p.original,relative));
    if(relative.startsWith('plans/')){const plan=JSON.parse(got.value);assertPreparationPlan(plan);const {hash,...body}=plan;
      if(digest(body)!==hash||relative!==`plans/${hash}.json`||plan.transactionId!==v.transactionId||plan.storageRoot!==v.storageRoot||reserved.get(hash)!==plan.phase)fail('EVIDENCE_INVALID');
      retirement ||= plan.request.retireKnownWriters||Boolean(plan.retirementPlan)||Boolean(plan.source.retirement);
    }else if(relative.startsWith('head.')&&relative!=='head.json'){const temp=JSON.parse(got.value);if(!same(temp,{identity:binding.hash,seq:temp.seq,hash:events[temp.seq-1]?.hash}))fail('EVIDENCE_INVALID');}
    files.push({relative,sha256:got.sha256,size:got.size,fileIdentity:got.fileIdentity});
  }
  return {files,retirement,lastAt,bindingHash:binding.hash,head:{seq:events.length,hash:previous}};
}
// Only known P2 metadata containers are consulted. No domain payload, source
// library, profile, user history or snapshot payload is traversed here.
async function references(v,cp){
  const p=paths(v),contains=value=>JSON.stringify(value).includes(v.transactionId);
  if(!cp){
    const traces=[...DATA_DOMAINS.map(name=>join(v.storageRoot,name+'.json')),...['journal.jsonl','head.json','owner.lock','recovery.guard','adoption-control','document-control'].map(name=>join(p.p2,name))];
    for(const trace of traces)if(await maybe(trace))fail('RECOVERY_REQUIRED');
  }
  if(cp&&(cp.pending.length||cp.barrier.closed||cp.deletions.some(d=>d.cleanup!=='complete')))return 'unresolved-control';
  if(cp&&contains(cp))return 'control-reference';
  const base=join(p.p2,'adoption-publications');if(await maybe(base)){
    await directory(base);for(const tx of await readdir(base)){if(!UUID.test(tx))fail('REFERENCES_UNKNOWN');const dir=join(base,tx);await directory(dir);if(tx===v.transactionId)return 'publication-reference';
      for(const name of await readdir(dir)){if(!/^[a-f0-9]{64}\.json$/.test(name))fail('REFERENCES_UNKNOWN');const pp=await json(join(dir,name)),{hash,...body}=pp;
        if(pp.kind!=='adoption-publication-v1'||hash!==digest(body)||name!==hash+'.json'||pp.transactionId!==tx||pp.storageRoot!==v.storageRoot)fail('REFERENCES_UNKNOWN');
        assertPreparationPlan(pp.preparation);if(pp.preparation.transactionId!==tx||pp.preparation.hash!==pp.preparationHash)fail('REFERENCES_UNKNOWN');if(contains(pp))return 'publication-reference';
      }
    }
  }
  for(const [group,filename]of [['updates','plan.json'],['backups','manifest.json']]){const base=join(p.p2,group);if(!await maybe(base))continue;await directory(base);
    for(const name of await readdir(base)){if(!UUID.test(name))fail('REFERENCES_UNKNOWN');const dir=join(base,name);await directory(dir);if(!await maybe(join(dir,filename)))fail('REFERENCES_UNKNOWN');const value=await json(join(dir,filename));
      if(group==='updates'){const {hash,...body}=value;if(value.version!==1||hash!==sha(JSON.stringify(body)))fail('REFERENCES_UNKNOWN');}
      else{const {checksum,...body}=value;if(value.version!==1||value.complete!==true||checksum!==sha(JSON.stringify(body)))fail('REFERENCES_UNKNOWN');}
      if(contains(value))return group+'-reference';
    }
  }
  return null;
}
async function readIntent(v){
  const p=paths(v);if(!await maybe(p.root))return null;await chain(p.root);
  const members=await readdir(p.root);if(members.some(n=>!['intent.json','journal.jsonl','receipt.json'].includes(n)))fail('EVIDENCE_INVALID');
  if(!await maybe(p.intent)){if(members.length)fail('EVIDENCE_INVALID');return null;}
  const intent=valid(await json(p.intent),intentSchema);if(intent.storageRoot!==v.storageRoot||intent.transactionId!==v.transactionId||intent.eligibleAt!==intent.terminalAt+PERIOD||intent.startedAt<intent.eligibleAt||intent.terminalAt<intent.copyCleanupAt)fail('EVIDENCE_INVALID');
  const expected=[v.storageRoot,join(v.storageRoot,'.suite-memory'),p.p2,dirname(p.original),p.original,p.plans,dirname(p.root),p.root];
  if(!same(intent.directories.map(d=>d.path),expected)||new Set(intent.files.map(f=>f.relative)).size!==intent.files.length||!['binding.json','events.jsonl','head.json'].every(n=>intent.files.some(f=>f.relative===n)))fail('EVIDENCE_INVALID');
  await checkedDirectories(intent.directories);
  const proof=await copyProof(v);if(proof.identity!==intent.copyIdentity||!same(proof.head,intent.copyHead)||proof.cleanupAt!==intent.copyCleanupAt)fail('COPY_PROOF');
  return intent;
}
async function progress(v,intent){
  const p=paths(v);if(!await maybe(p.journal))return [];
  const text=(await bytes(p.journal)).value.toString();if(!text.endsWith('\n'))fail('EVIDENCE_INVALID');const events=text.trimEnd().split('\n').map(JSON.parse);let previous=null,lastAt=intent.startedAt,removed=0;
  for(const [i,e]of events.entries()){valid(e,progressSchema);if(e.identity!==intent.hash||e.seq!==i+1||e.previous!==previous||e.at<lastAt||i===0&&(e.type!=='started'||e.index!==null)||i>0&&e.type==='started')fail('EVIDENCE_INVALID');
    if(e.type==='removed'){if(e.index!==removed++)fail('EVIDENCE_INVALID');}if(e.type==='complete'&&(removed!==intent.files.length||e.index!==null||i!==events.length-1))fail('EVIDENCE_INVALID');previous=e.hash;lastAt=e.at;
  }return events;
}
async function remaining(v,intent){
  const p=paths(v);await checkedDirectories(intent.directories);const actual=await inventory(p.original),known=new Map(intent.files.map(f=>[f.relative,f]));
  for(const name of actual){const expected=known.get(name);if(!expected)fail('UNKNOWN');const got=await bytes(join(p.original,name));if(!same(expected,{relative:name,sha256:got.sha256,size:got.size,fileIdentity:got.fileIdentity}))fail('CHANGED');}
  return new Set(actual);
}
function summary(intent,events,receipt){return {status:receipt?'retired':'retiring',metadataOnly:true,transactionId:intent.transactionId,storageRoot:intent.storageRoot,intentHash:intent.hash,
  originalBindingHash:intent.originalBindingHash,originalHead:intent.originalHead,copyIdentity:intent.copyIdentity,copyHead:intent.copyHead,terminalAt:intent.terminalAt,eligibleAt:intent.eligibleAt,
  files:intent.files,removedCount:events.filter(e=>e.type==='removed').length,...receipt?{completedAt:receipt.completedAt,receiptHash:receipt.hash}:{}};}

/** Read the independently retained, body-free terminal proof. A missing original
 * metadata file is never treated as a retirement receipt by itself. */
export async function readAdoptionMetadataRetirement(input){
  const v=locator(input),intent=await readIntent(v);if(!intent)return null;const events=await progress(v,intent),left=await remaining(v,intent),p=paths(v);let receipt;
  for(const e of events.filter(e=>e.type==='removed'))if(left.has(intent.files[e.index].relative))fail('CHANGED');
  if(await maybe(p.receipt)){receipt=valid(await json(p.receipt),receiptSchema);const last=events.at(-1);if(receipt.intentHash!==intent.hash||last?.type!=='complete'||receipt.completedAt!==last.at||!same(receipt.journalHead,{seq:last.seq,hash:last.hash})||left.size)fail('EVIDENCE_INVALID');}
  return summary(intent,events,receipt);
}

/** Ordinary diagnostic metadata expires 30 days after BOTH durable body cleanup
 * and its last original metadata event. The immutable retirement intent and
 * append-only progress preserve the original chain hashes, never rewrite them.
 * Empty original directory shells, copy governance and all reference authorities
 * remain. Process-crash recovery may supply exact dead-owner tokens; ordinary
 * sweeps never force locks. This is not a sudden-power-loss durability claim. */
export async function sweepAdoptionMetadata({storageRoot,clock=Date.now,control:borrowed,recover}={}){
  if(!isAbsolute(storageRoot??'')||typeof clock!=='function')fail('INPUT');storageRoot=resolve(storageRoot);
  if(recover&&(!UUID.test(recover.transactionId??'')||Object.keys(recover).some(k=>!['transactionId','copyRecoverToken','admissionRecoverToken','controlRecoverToken'].includes(k))||['copyRecoverToken','admissionRecoverToken','controlRecoverToken'].some(k=>recover[k]!==undefined&&!UUID.test(recover[k]))))fail('INPUT');
  if(borrowed&&(resolve(borrowed.storageRoot??'')!==storageRoot||typeof borrowed.withCheckpoint!=='function'||typeof borrowed.assertOwned!=='function'))fail('INPUT');
  const base=join(storageRoot,'.suite-memory/p2/adoption-plans'),results=[];await chain(storageRoot);if(!await maybe(base))return {complete:true,metadataOnly:true,results};const baseId=await chain(base);
  for(const tx of (await readdir(base)).sort()){
    if(!UUID.test(tx)){results.push({status:'pending',code:'P2_ADOPTION_METADATA_RETENTION_UNKNOWN'});continue;}
    const v={storageRoot,transactionId:tx},p=paths(v),recovery=recover?.transactionId===tx?recover:{};let copies,admission,ownedControl,result;
    try{
      if(await directory(base)!==baseId)fail('CHANGED');await directory(p.original);
      copies=await openAdoptionCopies({...v,clock,allowBlocked:true,recoverLockToken:recovery.copyRecoverToken});
      admission=await acquireAdoptionAdmission({...v,recoverLockToken:recovery.admissionRecoverToken});
      if(!borrowed&&await maybe(join(p.p2,'journal.jsonl')))ownedControl=await openControl({storageRoot,mode:'maintenance',recoverLockToken:recovery.controlRecoverToken});
      const guard=borrowed??ownedControl;
      const run=async cp=>{
        const at=clock();if(!Number.isSafeInteger(at)||at<0)fail('CLOCK');const c=await copies.checkpoint();await admission.assertOwned();
        if(!c.invalidated||c.cleanup!=='complete'||c.pending.length||Object.values(c.entries).some(e=>e.state!=='removed'))return {status:'pinned',reason:'body-or-transaction-pending'};
        const reference=await references(v,cp);if(reference)return {status:'pinned',reason:reference};
        let intent=await readIntent(v);
        if(!intent){const original=await originalMetadata(v,c,at);if(original.retirement)return {status:'pinned',reason:'retirement-authority'};
          const proof=await copyProof(v),terminalAt=Math.max(original.lastAt,proof.cleanupAt,c.invalidated.at);if(at<terminalAt)fail('CLOCK');if(at<terminalAt+PERIOD)return {status:'retained',eligibleAt:terminalAt+PERIOD};
          for(const dir of [dirname(p.root),p.root]){try{await mkdir(dir);}catch(e){if(e.code!=='EEXIST')throw e;}await directory(dir);}
          if((await readdir(p.root)).length)fail('EVIDENCE_INVALID');
          const directories=[];for(const path of [storageRoot,join(storageRoot,'.suite-memory'),p.p2,dirname(p.original),p.original,p.plans,dirname(p.root),p.root])directories.push({path,identity:await directory(path)});
          // Plans first, original event chain last. The independent intent is
          // durable before any original evidence can be removed.
          const files=original.files.sort((a,b)=>(a.relative.startsWith('plans/')?0:a.relative==='events.jsonl'?2:1)-(b.relative.startsWith('plans/')?0:b.relative==='events.jsonl'?2:1)||a.relative.localeCompare(b.relative));
          intent=sealed({version:1,kind:'adoption-metadata-retirement',metadataOnly:true,...v,directories,copyIdentity:c.identity,copyHead:c.head,copyCleanupAt:proof.cleanupAt,
            originalBindingHash:original.bindingHash,originalHead:original.head,terminalAt,eligibleAt:terminalAt+PERIOD,startedAt:at,files});valid(intent,intentSchema);
          await durable(p.intent,JSON.stringify(intent));diagnostics.publish({phase:'intent-durable',transactionId:tx});
        }
        let events=await progress(v,intent);
        const check=async()=>{await admission.assertOwned();await copies.checkpoint();await guard?.assertOwned();if(await references(v,cp))fail('REFERENCES_CHANGED');await readIntent(v);return remaining(v,intent);};
        const append=async(type,index=null)=>{const at=clock();if(!Number.isSafeInteger(at)||at<(events.at(-1)?.at??intent.startedAt))fail('CLOCK');const e=sealed({identity:intent.hash,seq:events.length+1,previous:events.at(-1)?.hash??null,type,index,at});valid(e,progressSchema);await durable(p.journal,JSON.stringify(e)+'\n',events.length?'a':'wx');events.push(e);};
        if(!events.length)await append('started');
        const left=await check();for(const e of events.filter(e=>e.type==='removed'))if(left.has(intent.files[e.index].relative))fail('CHANGED');
        if(events.at(-1)?.type!=='complete'){
          for(let i=events.filter(e=>e.type==='removed').length;i<intent.files.length;i++){
            const remainingFiles=await check(),file=intent.files[i];if(remainingFiles.has(file.relative))await unlink(join(p.original,file.relative));
            diagnostics.publish({phase:'file-removed',transactionId:tx,fileIndex:i});await append('removed',i);
          }
          if((await check()).size)fail('CHANGED');await append('complete');diagnostics.publish({phase:'complete-durable',transactionId:tx});
        }
        if(!await maybe(p.receipt)){const e=events.at(-1);await durable(p.receipt,JSON.stringify(sealed({version:1,kind:'adoption-metadata-retirement-receipt',intentHash:intent.hash,completedAt:e.at,journalHead:{seq:e.seq,hash:e.hash}})));}
        const receipt=await readAdoptionMetadataRetirement(v);diagnostics.publish({phase:'retired',transactionId:tx});return {status:'retired',receiptHash:receipt.receiptHash};
      };
      result=guard?await guard.withCheckpoint(run):await run(null);
    }catch(e){result={status:'pending',code:bounded(e)};}
    finally{for(const lease of [ownedControl,admission,copies]){try{await lease?.close();}catch(e){result={status:'pending',code:bounded(e)};}}}
    results.push({transactionId:tx,...result});
  }
  return {complete:results.every(r=>r.status!=='pending'),metadataOnly:true,results};
}
