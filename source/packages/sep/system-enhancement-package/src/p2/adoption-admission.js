import {mkdir,open,readFile,readdir,lstat,realpath,rename,unlink} from 'node:fs/promises';
import {resolve,join,isAbsolute,dirname} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const fail=code=>{throw Object.assign(new Error(code),{code});};
const normalized=p=>process.platform==='win32'?p.toLowerCase():p;
const id=s=>`${s.dev}:${s.ino}`;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
async function exists(path){try{return await lstat(path,{bigint:true});}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function directory(path,canonical=true){const s=await lstat(path,{bigint:true});if(!s.isDirectory()||s.isSymbolicLink()||s.ino===0n||canonical&&normalized(await realpath(path))!==normalized(path))fail('P2_ADOPTION_ADMISSION_PATH');return id(s);}
async function record(path){
  const s=await lstat(path,{bigint:true});if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1n||s.ino===0n||s.size>4096n)fail('P2_ADOPTION_ADMISSION_LOCKED');
  const h=await open(path,'r');try{if(id(await h.stat({bigint:true}))!==id(s))fail('P2_ADOPTION_ADMISSION_LOCKED');const bytes=await h.readFile(),after=await lstat(path,{bigint:true});if(id(after)!==id(s)||after.size!==s.size||after.mtimeNs!==s.mtimeNs)fail('P2_ADOPTION_ADMISSION_LOCKED');return {value:JSON.parse(bytes),fileIdentity:id(s)};}finally{await h.close();}
}
function validOwner(v,identity){return exact(v,['version','token','transactionId','pid','identity'])&&v.version===1&&UUID.test(v.token??'')&&UUID.test(v.transactionId??'')&&Number.isSafeInteger(v.pid)&&v.pid>0&&v.identity===identity;}

/** Serializes creation of preparations with publication/deletion cleanup.
 * This is an exclusive cooperative service lease, not an OS ACL boundary.
 * Abrupt process exit leaves its durable owner; only an exact dead owner can
 * be recovered. Partial or unfamiliar evidence is deliberately retained. */
export async function acquireAdoptionAdmission({storageRoot,transactionId,recoverLockToken}={}){
  if(typeof storageRoot!=='string'||!isAbsolute(storageRoot)||storageRoot.includes('\0')||!UUID.test(transactionId??'')||recoverLockToken!==undefined&&!UUID.test(recoverLockToken))fail('P2_ADOPTION_ADMISSION_INPUT');
  storageRoot=resolve(storageRoot);const root=join(storageRoot,'.suite-memory','p2','adoption-admission'),ownerPath=join(root,'owner.lock'),guardPath=join(root,'recovery.guard'),token=randomUUID();
  const paths={},ancestors=new Set();let lock,lockId,owned,closed=false,identity;
  async function perimeter(){for(const[path,identity]of Object.entries(paths))if(await directory(path,!ancestors.has(path))!==identity)fail('P2_ADOPTION_ADMISSION_PATH');}
  async function inventory(){for(const e of await readdir(root,{withFileTypes:true})){
    if(e.name==='owner.lock')continue;
    if(!/^abandoned-[a-f0-9-]{36}\.json$/.test(e.name))fail('P2_ADOPTION_ADMISSION_LOCKED');
    const v=(await record(join(root,e.name))).value;if(!validOwner(v,identity)||e.name!==`abandoned-${v.token}.json`)fail('P2_ADOPTION_ADMISSION_LOCKED');
  }}
  async function assertOwned(){
    if(closed)fail('P2_ADOPTION_ADMISSION_CLOSED');
    try{await perimeter();await inventory();const r=await record(ownerPath);if(r.fileIdentity!==lockId||!same(r.value,owned))fail('P2_ADOPTION_ADMISSION_FENCE_LOST');return true;}
    catch(e){if(e.code==='P2_ADOPTION_ADMISSION_PATH')throw e;fail('P2_ADOPTION_ADMISSION_FENCE_LOST');}
  }
  async function close(){
    if(closed)return;let ours=false;
    try{await perimeter();const r=await record(ownerPath);ours=r.fileIdentity===lockId&&same(r.value,owned);}catch{}
    closed=true;await lock?.close();if(ours)await unlink(ownerPath);return {closed:true};
  }
  try{
    const chain=[];for(let p=storageRoot;;p=dirname(p)){chain.unshift(p);if(dirname(p)===p)break;}
    for(const p of chain){if(p!==storageRoot)ancestors.add(p);paths[p]=await directory(p,!ancestors.has(p));}
    for(const p of [join(storageRoot,'.suite-memory'),join(storageRoot,'.suite-memory','p2'),root]){await perimeter();try{await mkdir(p);}catch(e){if(e.code!=='EEXIST')throw e;}paths[p]=await directory(p);}
    identity=digest({storageRoot:normalized(storageRoot),paths});await perimeter();await inventory();
    if(recoverLockToken){
      let guard,guardId;
      try{guard=await open(guardPath,'wx',0o600);guardId=id(await guard.stat({bigint:true}));}catch{fail('P2_ADOPTION_ADMISSION_LOCKED');}
      try{
        await guard.writeFile(JSON.stringify({version:1,token,transactionId,pid:process.pid,identity}));await guard.sync();await perimeter();
        const prior=await record(ownerPath);
        if(!validOwner(prior.value,identity)||prior.value.token!==recoverLockToken||prior.value.transactionId!==transactionId)fail('P2_ADOPTION_ADMISSION_LOCKED');
        try{process.kill(prior.value.pid,0);fail('P2_ADOPTION_ADMISSION_LOCKED');}catch(e){if(e.code!=='ESRCH')fail('P2_ADOPTION_ADMISSION_LOCKED');}
        if(!same(await record(ownerPath),prior)||await exists(join(root,`abandoned-${prior.value.token}.json`)))fail('P2_ADOPTION_ADMISSION_LOCKED');
        await rename(ownerPath,join(root,`abandoned-${prior.value.token}.json`));
        lock=await open(ownerPath,'wx',0o600);lockId=id(await lock.stat({bigint:true}));owned={version:1,token,transactionId,pid:process.pid,identity};await lock.writeFile(JSON.stringify(owned));await lock.sync();
      }finally{
        await guard.close();const s=await exists(guardPath);if(s&&id(s)===guardId)await unlink(guardPath);
      }
    }else{
      try{lock=await open(ownerPath,'wx',0o600);}catch(e){if(e.code==='EEXIST')fail('P2_ADOPTION_ADMISSION_LOCKED');throw e;}
      lockId=id(await lock.stat({bigint:true}));owned={version:1,token,transactionId,pid:process.pid,identity};await lock.writeFile(JSON.stringify(owned));await lock.sync();
    }
    await assertOwned();return {root,storageRoot,transactionId,token,assertOwned,close};
  }catch(e){await close();if(e.code?.startsWith('P2_ADOPTION_ADMISSION_'))throw e;fail('P2_ADOPTION_ADMISSION_LOCKED');}
}
