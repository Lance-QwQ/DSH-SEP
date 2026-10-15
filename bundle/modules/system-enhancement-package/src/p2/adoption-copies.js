import {mkdir,open,readFile,readdir,lstat,realpath,rename,unlink} from 'node:fs/promises';
import {resolve,join,isAbsolute,dirname} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';

const DAY=86400000,MAX_BODY=32*1024*1024,MAX_LOG=16*1024*1024;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const HASH=/^[a-f0-9]{64}$/,ID=/^[A-Za-z0-9_.:-]{1,256}$/;
const REASONS=new Set(['cancelled','deleted','withdrawn','authorization-revoked','superseded','committed','expired','failed','source-changed','target-changed','plan-changed']);
const groups=['capture','review','staging'];
const sha=b=>createHash('sha256').update(b).digest('hex');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const canonical=p=>process.platform==='win32'?p.toLowerCase():p;
function fail(code){throw Object.assign(new Error(code),{code});}
function sanitize(e){if(typeof e?.code==='string'&&e.code.startsWith('ADOPTION_'))return e;return Object.assign(new Error('ADOPTION_IO'),{code:'ADOPTION_IO'});}
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>keys.includes(k));
const timeOK=n=>Number.isSafeInteger(n)&&n>=0;
const fsIdentity=s=>`${s.dev}:${s.ino}`;
async function maybe(path){try{return await lstat(path,{bigint:true});}catch(e){if(e.code==='ENOENT')return null;throw e;}}
function bodyName(relative){
  if(typeof relative!=='string'||relative.length>220||! /^(capture|review|staging)\/[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(relative))fail('ADOPTION_INPUT');
  const name=relative.split('/')[1];if(/[. ]$/.test(name)||/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(name)||name.includes('..'))fail('ADOPTION_INPUT');return relative;
}
function metadata(input,relative){
  if(!exact(input,['category','captureVersion','sourceRefs'])||input.category!==relative.split('/')[0]||input.captureVersion!==undefined&&!ID.test(input.captureVersion)||!Array.isArray(input.sourceRefs)||!input.sourceRefs.length||input.sourceRefs.length>2048)fail('ADOPTION_INPUT');
  for(const r of input.sourceRefs)if(!exact(r,['sourceId','sha256','owner','recordId'])||!ID.test(r.sourceId??'')||r.sha256!==undefined&&!HASH.test(r.sha256)||['owner','recordId'].some(k=>r[k]!==undefined&&!ID.test(r[k])))fail('ADOPTION_INPUT');
  return structuredClone(input);
}
async function regularDirectory(path){const s=await lstat(path,{bigint:true});if(!s.isDirectory()||s.isSymbolicLink()||s.ino===0n||canonical(await realpath(path))!==canonical(path))fail('ADOPTION_PATH');return fsIdentity(s);}
async function syncFile(path,bytes,flags='wx'){const h=await open(path,flags,0o600);try{await h.writeFile(bytes);await h.sync();}finally{await h.close();}}
async function syncDirectory(path){if(process.platform==='win32')return;const h=await open(path,'r');try{await h.sync();}finally{await h.close();}}
async function publish(path,value){const temp=join(dirname(path),`head.${randomUUID()}.tmp`);await syncFile(temp,JSON.stringify(value));for(let i=0;;i++){try{await rename(temp,path);break;}catch(e){if(!['EPERM','EBUSY'].includes(e.code)||i===3)throw e;await delay(25*(i+1));}}await syncDirectory(dirname(path));}
async function jsonFile(path,max=MAX_LOG){const s=await lstat(path,{bigint:true});if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1n||s.size>BigInt(max))fail('ADOPTION_JOURNAL_INVALID');try{return JSON.parse(await readFile(path,'utf8'));}catch{fail('ADOPTION_JOURNAL_INVALID');}}
function ownerValid(v,identity){return exact(v,['token','identity','pid'])&&UUID.test(v.token??'')&&v.identity===identity&&Number.isInteger(v.pid)&&v.pid>0;}

/** Owns only the adoption-copy transaction, never the shared P2 business lock.
 * The trusted maintenance service must hold this lease while external helpers
 * use reserved paths. This is process-crash durability, not Windows power-loss
 * durability or a boundary against a same-account administrator. */
export async function openAdoptionCopies({storageRoot,transactionId,initialize=false,clock=Date.now,recoverLockToken,allowBlocked=false}={}){
  if(!isAbsolute(storageRoot??'')||!UUID.test(transactionId??'')||typeof clock!=='function'||typeof initialize!=='boolean'||typeof allowBlocked!=='boolean'||initialize&&allowBlocked||recoverLockToken!==undefined&&!UUID.test(recoverLockToken))fail('ADOPTION_INPUT');
  storageRoot=resolve(storageRoot);let lock,lockId,closed=false,poisoned=false,tail=Promise.resolve(),lastTime=0;
  const root=join(storageRoot,'.suite-memory','p2','adoptions',transactionId),control=join(root,'control'),ownerPath=join(control,'owner.lock'),journalPath=join(control,'journal.jsonl'),headPath=join(control,'head.json'),identityPath=join(control,'identity.json'),token=randomUUID();
  let binding,identity,journalHashes=[];
  const now=()=>{const n=clock();if(!timeOK(n)||n<lastTime)fail('ADOPTION_CLOCK');lastTime=n;return n;};
  async function assertOwned(){
    if(closed)fail('ADOPTION_CLOSED');if(poisoned)fail('ADOPTION_RECOVERY_REQUIRED');
    for(const [path,id]of Object.entries(binding.paths))if(await regularDirectory(path)!==id)fail('ADOPTION_IDENTITY');
    const {checksum,...stored}=await jsonFile(identityPath);if(checksum!==sha(JSON.stringify(stored))||!same(stored,binding))fail('ADOPTION_IDENTITY');
    const o=await jsonFile(ownerPath,4096),s=await lstat(ownerPath,{bigint:true});if(!ownerValid(o,identity)||o.token!==token||fsIdentity(s)!==lockId)fail('ADOPTION_FENCE_LOST');
  }
  function reduce(events){
    const state={identity,transactionId,createdAt:null,expiresAt:null,entries:{},invalidated:null,cleanup:'not_started',head:{seq:events.length,hash:events.at(-1)?.hash??null}};
    for(const [i,e]of events.entries()){
      const p=e.payload;if(!timeOK(e.at)||e.at<(events[i-1]?.at??0))fail('ADOPTION_JOURNAL_INVALID');lastTime=Math.max(lastTime,e.at);
      if(e.type==='initialized'){if(i!==0||!exact(p,['createdAt'])||p.createdAt!==e.at)fail('ADOPTION_JOURNAL_INVALID');state.createdAt=p.createdAt;}
      else if(e.type==='reserved'){
        try{bodyName(p.relative);metadata(p.meta,p.relative);}catch{fail('ADOPTION_JOURNAL_INVALID');}
        if(!exact(p,['relative','meta','createdAt','expiresAt'])||p.createdAt!==e.at||!timeOK(p.expiresAt)||p.expiresAt!==(state.expiresAt??e.at+DAY)||state.entries[p.relative]||state.invalidated||state.expiresAt!==null&&e.at>=state.expiresAt)fail('ADOPTION_JOURNAL_INVALID');
        if(Object.keys(state.entries).some(k=>k.toLowerCase()===p.relative.toLowerCase()))fail('ADOPTION_JOURNAL_INVALID');state.expiresAt=p.expiresAt;state.entries[p.relative]={relative:p.relative,...p.meta,createdAt:p.createdAt,expiresAt:p.expiresAt,state:'reserved'};
      }else if(e.type==='completed'){
        if(!exact(p,['relative','sha256','bytes','fileIdentity'])||state.entries[p.relative]?.state!=='reserved'||!HASH.test(p.sha256??'')||!Number.isSafeInteger(p.bytes)||p.bytes<0||p.bytes>MAX_BODY||! /^\d+:\d+$/.test(p.fileIdentity??''))fail('ADOPTION_JOURNAL_INVALID');Object.assign(state.entries[p.relative],p,{state:'complete'});
      }else if(e.type==='invalidated'){
        if(!exact(p,['reason'])||!REASONS.has(p.reason)||state.invalidated)fail('ADOPTION_JOURNAL_INVALID');state.invalidated={reason:p.reason,at:e.at};
      }else if(e.type==='cleanup_started'){
        if(!exact(p,[])||!state.invalidated&&!(state.expiresAt!==null&&e.at>=state.expiresAt))fail('ADOPTION_JOURNAL_INVALID');state.cleanup='pending';
      }else if(e.type==='copy_removed'){
        if(!exact(p,['relative'])||!state.entries[p.relative]||state.cleanup!=='pending')fail('ADOPTION_JOURNAL_INVALID');state.entries[p.relative].state='removed';
      }else if(e.type==='cleanup_pending'){
        if(!exact(p,[])||state.cleanup!=='pending')fail('ADOPTION_JOURNAL_INVALID');
      }else if(e.type==='cleanup_complete'){
        if(!exact(p,[])||state.cleanup!=='pending'||Object.values(state.entries).some(v=>v.state!=='removed'))fail('ADOPTION_JOURNAL_INVALID');state.cleanup='complete';
      }else fail('ADOPTION_JOURNAL_INVALID');
    }
    if(events[0]?.type!=='initialized')fail('ADOPTION_JOURNAL_INVALID');return state;
  }
  async function journal({reconcile=false}={}){
    let body,head;try{const s=await lstat(journalPath,{bigint:true});if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1n||s.size>BigInt(MAX_LOG))fail('ADOPTION_JOURNAL_INVALID');body=await readFile(journalPath,'utf8');head=await jsonFile(headPath,4096);}catch(e){if(reconcile&&e.code==='ENOENT'&&body!==undefined)head=null;else fail('ADOPTION_JOURNAL_INVALID');}
    if(!body.endsWith('\n'))fail('ADOPTION_JOURNAL_INVALID');let events;try{events=body.slice(0,-1).split('\n').map(JSON.parse);}catch{fail('ADOPTION_JOURNAL_INVALID');}
    let previous=null;for(let i=0;i<events.length;i++){const {hash,...e}=events[i];if(!exact(e,['seq','previous','identity','type','payload','at'])||e.seq!==i+1||e.previous!==previous||e.identity!==identity||hash!==sha(JSON.stringify(e)))fail('ADOPTION_JOURNAL_INVALID');previous=hash;}
    const state=reduce(events),expected={identity,seq:events.length,hash:previous};journalHashes=events.map(e=>e.hash);
    if(!same(head,expected)){
      const validPrefix=head===null?events.length===1:exact(head,['identity','seq','hash'])&&head.identity===identity&&Number.isInteger(head.seq)&&head.seq>=1&&head.seq<events.length&&events[head.seq-1]?.hash===head.hash;
      if(!reconcile||!validPrefix)fail('ADOPTION_JOURNAL_INVALID');
      await inventory(state,{metadataOnly:true});await publish(headPath,expected);
    }
    return {state,events};
  }
  async function readBody(relative){
    const path=join(root,relative),before=await lstat(path,{bigint:true});if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1n||before.ino===0n||before.size>BigInt(MAX_BODY)||canonical(await realpath(path))!==canonical(path))fail('ADOPTION_PATH');
    const h=await open(path,'r');try{const s=await h.stat({bigint:true});if(fsIdentity(s)!==fsIdentity(before)||s.nlink!==1n)fail('ADOPTION_PATH');const bytes=await h.readFile();const after=await lstat(path,{bigint:true});if(bytes.length>MAX_BODY||fsIdentity(after)!==fsIdentity(before)||after.size!==before.size||after.mtimeNs!==before.mtimeNs)fail('ADOPTION_COPY_CHANGED');return {bytes,sha256:sha(bytes),fileIdentity:fsIdentity(before)};}finally{await h.close();}
  }
  async function inventory(state,{metadataOnly=false}={}){
    const rootEntries=await readdir(root,{withFileTypes:true});if(rootEntries.some(e=>!['control',...groups].includes(e.name)))fail('ADOPTION_UNKNOWN_FILE');
    for(const entry of await readdir(control,{withFileTypes:true})){
      if(!entry.isFile()||entry.isSymbolicLink())fail('ADOPTION_PATH');
      if(['identity.json','journal.jsonl','head.json','owner.lock'].includes(entry.name))continue;
      if(/^head\.[a-f0-9-]{36}\.tmp$/.test(entry.name)){
        const v=await jsonFile(join(control,entry.name),4096);if(!exact(v,['identity','seq','hash'])||v.identity!==identity||!Number.isInteger(v.seq)||v.seq<1||v.seq>state.head.seq||journalHashes[v.seq-1]!==v.hash)fail('ADOPTION_JOURNAL_INVALID');continue;
      }
      if(/^abandoned-[a-f0-9-]{36}\.json$/.test(entry.name)){if(!ownerValid(await jsonFile(join(control,entry.name),4096),identity))fail('ADOPTION_JOURNAL_INVALID');continue;}
      fail('ADOPTION_UNKNOWN_FILE');
    }
    if(metadataOnly)return;
    await bodyInventory(state);
  }
  async function bodyInventory(state){
    for(const group of groups){for(const entry of await readdir(join(root,group),{withFileTypes:true})){
      if(!entry.isFile()||entry.isSymbolicLink())fail('ADOPTION_PATH');const relative=`${group}/${entry.name}`,record=state.entries[relative];if(!record||record.state==='removed')fail('ADOPTION_UNKNOWN_FILE');const s=await lstat(join(root,relative),{bigint:true});if(s.nlink!==1n)fail('ADOPTION_PATH');
    }}
    for(const entry of Object.values(state.entries)){
      const s=await maybe(join(root,entry.relative));if(!s){if(entry.state==='complete'&&!state.invalidated&&!(state.expiresAt!==null&&now()>=state.expiresAt))fail('ADOPTION_COPY_CHANGED');continue;}
      if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1n)fail('ADOPTION_PATH');
      if(entry.state==='complete'){const got=await readBody(entry.relative);if(got.sha256!==entry.sha256||got.bytes.length!==entry.bytes||got.fileIdentity!==entry.fileIdentity)fail('ADOPTION_COPY_CHANGED');}
    }
  }
  async function checkpoint({allowBodyBlocked=false}={}){
    await assertOwned();const {state}=await journal();await inventory(state,{metadataOnly:true});const at=now(),cp={...state,expired:state.expiresAt!==null&&at>=state.expiresAt,pending:Object.values(state.entries).filter(v=>v.state==='reserved').map(v=>v.relative),usable:!state.invalidated&&!(state.expiresAt!==null&&at>=state.expiresAt)&&state.cleanup!=='complete'};
    try{await bodyInventory(state);}catch(e){if(!allowBodyBlocked)throw e;return {...cp,usable:false,blocked:true,code:sanitize(e).code};}return cp;
  }
  function writable(){if(allowBlocked)fail('ADOPTION_INSPECTION_ONLY');}
  function usable(cp){if(cp.expired)fail('ADOPTION_EXPIRED');if(cp.invalidated||cp.cleanup==='complete')fail('ADOPTION_INVALIDATED');}
  async function append(type,payload,state){
    await assertOwned();const at=now(),e={seq:state.head.seq+1,previous:state.head.hash,identity,type,payload:typeof payload==='function'?payload(at):payload,at},event={...e,hash:sha(JSON.stringify(e))};
    try{await syncFile(journalPath,JSON.stringify(event)+'\n','a');await publish(headPath,{identity,seq:event.seq,hash:event.hash});}catch(e){poisoned=true;throw e;}
  }
  function queue(fn){const work=tail.then(async()=>{try{return await fn();}catch(e){throw sanitize(e);}});tail=work.catch(()=>{});return work;}
  async function reserve(relative,input){writable();bodyName(relative);const meta=metadata(input,relative),cp=await checkpoint();usable(cp);const prior=cp.entries[relative];
    if(Object.keys(cp.entries).some(p=>p!==relative&&p.toLowerCase()===relative.toLowerCase()))fail('ADOPTION_INPUT');
    if(prior){const before=Object.fromEntries(['category','captureVersion','sourceRefs'].filter(k=>prior[k]!==undefined).map(k=>[k,prior[k]]));if(!same(before,meta))fail('ADOPTION_INPUT');return join(root,relative);}
    if(Object.keys(cp.entries).length>=256)fail('ADOPTION_INPUT');await append('reserved',at=>{if(cp.expiresAt!==null&&at>=cp.expiresAt)fail('ADOPTION_EXPIRED');return {relative,meta,createdAt:at,expiresAt:cp.expiresAt??at+DAY};},cp);return join(root,relative);
  }
  async function complete(relative){writable();bodyName(relative);const cp=await checkpoint();usable(cp);const prior=cp.entries[relative];if(!prior)fail('ADOPTION_UNREGISTERED');if(prior.state==='complete')return structuredClone(prior);if(prior.state!=='reserved')fail('ADOPTION_INVALIDATED');const got=await readBody(relative);const value={relative,sha256:got.sha256,bytes:got.bytes.length,fileIdentity:got.fileIdentity};await append('completed',value,cp);return {...prior,...value,state:'complete'};}
  const service={root,storageRoot,transactionId,token,inspectionOnly:allowBlocked,
    reserve:(relative,meta)=>queue(()=>reserve(relative,meta)),complete:relative=>queue(()=>complete(relative)),
    write:(relative,bytes,meta)=>queue(async()=>{writable();if(!(Buffer.isBuffer(bytes)||bytes instanceof Uint8Array)||bytes.length>MAX_BODY)fail('ADOPTION_INPUT');const path=await reserve(relative,meta);if(await maybe(path))fail('ADOPTION_COPY_EXISTS');await syncFile(path,bytes);return complete(relative);}),
    read:relative=>queue(async()=>{writable();bodyName(relative);const cp=await checkpoint();usable(cp);if(cp.entries[relative]?.state!=='complete')fail('ADOPTION_INCOMPLETE');return (await readBody(relative)).bytes;}),
    confirm:()=>queue(async()=>{writable();const cp=await checkpoint();usable(cp);if(!Object.keys(cp.entries).length||cp.pending.length||Object.values(cp.entries).some(v=>v.state!=='complete'))fail('ADOPTION_INCOMPLETE');return cp;}),
    checkpoint:()=>queue(checkpoint),inspect:()=>queue(async()=>{try{return await checkpoint({allowBodyBlocked:true});}catch(e){return {blocked:true,code:sanitize(e).code,transactionId};}}),
    invalidate:reason=>queue(async()=>{
      if(!REASONS.has(reason))fail('ADOPTION_INPUT');await assertOwned();const {state}=await journal();await inventory(state,{metadataOnly:true});
      // An unexpected body prevents cleanup but must not erase a cancellation.
      // Only verified identity/lease/journal are needed to record this intent.
      if(!state.invalidated)await append('invalidated',{reason},state);
      return checkpoint({allowBodyBlocked:true});
    }),
    cleanup:options=>queue(async()=>{
      if(!exact(options,['recoveryRequired'])||typeof options.recoveryRequired!=='boolean')fail('ADOPTION_INPUT');let cp=await checkpoint({allowBodyBlocked:allowBlocked});if(!cp.invalidated&&!cp.expired)fail('ADOPTION_ACTIVE');
      if(cp.blocked){if(cp.cleanup!=='pending')await append('cleanup_started',{},cp);return {complete:false,status:'cleanup_pending',blocked:true,code:cp.code};}
      if(cp.cleanup==='complete')return {complete:true,status:'cleaned'};
      if(cp.cleanup!=='pending'){await append('cleanup_started',{},cp);cp=await checkpoint();}
      if(options.recoveryRequired)return {complete:false,status:'cleanup_pending',recoveryRequired:true};
      let failed=false;for(const entry of Object.values(cp.entries)){if(entry.state==='removed')continue;await assertOwned();try{await unlink(join(root,entry.relative));}catch(e){if(e.code!=='ENOENT'){failed=true;continue;}}await append('copy_removed',{relative:entry.relative},cp);cp=await checkpoint();}
      await inventory(cp);if(failed){await append('cleanup_pending',{},cp);return {complete:false,status:'cleanup_pending'};}await append('cleanup_complete',{},cp);return {complete:true,status:'cleaned'};
    }),
    async close(){if(closed)return;await tail;let ours=false;try{const value=await jsonFile(ownerPath,4096),s=await maybe(ownerPath);ours=value.token===token&&s&&fsIdentity(s)===lockId;}catch{}closed=true;await lock?.close();if(ours)try{await unlink(ownerPath);}catch(e){if(e.code!=='ENOENT')throw sanitize(e);}}
  };
  try{
    if(initialize)await mkdir(storageRoot,{recursive:true});const storageId=await regularDirectory(storageRoot);
    const dirs=[join(storageRoot,'.suite-memory'),join(storageRoot,'.suite-memory','p2'),join(storageRoot,'.suite-memory','p2','adoptions'),root,control,...groups.map(g=>join(root,g))];
    const paths={[storageRoot]:storageId};for(const path of dirs){if(initialize)try{await mkdir(path);}catch(e){if(e.code!=='EEXIST')throw e;}paths[path]=await regularDirectory(path);}
    identity=sha(JSON.stringify({storageRoot:canonical(storageRoot),transactionId,paths}));binding={version:1,transactionId,identity,paths};
    if(recoverLockToken){
      const guardPath=join(control,'recovery.guard');let guard;try{guard=await open(guardPath,'wx',0o600);}catch{fail('ADOPTION_LOCKED');}
      try{const prior=await jsonFile(ownerPath,4096);if(!ownerValid(prior,identity)||prior.token!==recoverLockToken)fail('ADOPTION_LOCKED');try{process.kill(prior.pid,0);fail('ADOPTION_LOCKED');}catch(e){if(e.code!=='ESRCH')fail('ADOPTION_LOCKED');}if(!same(await jsonFile(ownerPath,4096),prior))fail('ADOPTION_LOCKED');await rename(ownerPath,join(control,`abandoned-${prior.token}.json`));}finally{await guard.close();await unlink(guardPath);}
    }
    try{lock=await open(ownerPath,'wx',0o600);}catch(e){if(e.code==='EEXIST')fail('ADOPTION_LOCKED');throw e;}lockId=fsIdentity(await lock.stat({bigint:true}));await lock.writeFile(JSON.stringify({token,identity,pid:process.pid}));await lock.sync();
    const found=await maybe(identityPath);
    if(!found){
      if(!initialize)fail('ADOPTION_UNINITIALIZED');if((await readdir(control)).some(n=>n!=='owner.lock')||(await Promise.all(groups.map(g=>readdir(join(root,g))))).some(v=>v.length))fail('ADOPTION_UNKNOWN_FILE');await syncFile(identityPath,JSON.stringify({...binding,checksum:sha(JSON.stringify(binding))}));
      await append('initialized',at=>({createdAt:at}),{head:{seq:0,hash:null}});
    }else{const {checksum,...stored}=await jsonFile(identityPath);if(checksum!==sha(JSON.stringify(stored))||!same(stored,binding))fail('ADOPTION_IDENTITY');await journal({reconcile:true});}
    await checkpoint({allowBodyBlocked:allowBlocked});return service;
  }catch(e){await service.close();throw sanitize(e);}
}
