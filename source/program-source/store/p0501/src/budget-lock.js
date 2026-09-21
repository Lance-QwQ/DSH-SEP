import {DatabaseSync} from 'node:sqlite';
import {open,lstat,readFile,realpath,rename,unlink} from 'node:fs/promises';
import {dirname,basename,join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {setTimeout as pause} from 'node:timers/promises';
import {fail} from './errors.js';

const same=(a,b)=>a.dev===b.dev&&a.ino===b.ino;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
function ordinary(value){
 if(!value||Array.isArray(value)||typeof value!=='object'||!Number.isSafeInteger(value.pid)||value.pid<=0||typeof value.createdAt!=='string'||!Number.isFinite(Date.parse(value.createdAt)))return false;
 const keys=Object.keys(value).sort().join(',');
 return keys==='createdAt,pid'||keys==='createdAt,kind,pid,token,version'&&value.kind==='suite-budget-lock'&&value.version===1&&uuid.test(value.token);
}
function dead(pid){try{process.kill(pid,0);return false;}catch(e){return e.code==='ESRCH';}}
async function inspect(path){
 const before=await lstat(path,{bigint:true});
 if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1n||before.size>4096n)fail('BUDGET_LOCKED','Lock identity or format cannot be verified; controlled inspection required');
 const bytes=await readFile(path),after=await lstat(path,{bigint:true});
 if(!same(before,after)||before.size!==after.size||before.mtimeNs!==after.mtimeNs||before.ctimeNs!==after.ctimeNs)fail('BUDGET_LOCKED','Lock changed during inspection');
 let value;try{value=JSON.parse(bytes);}catch{fail('BUDGET_LOCKED','Incomplete lock metadata; not safe to recover automatically');}
 return {bytes,stat:after,value};
}
async function guardAbsent(path){try{await lstat(path);fail('BUDGET_LOCKED','Budget transaction recovery is in progress');}catch(e){if(e.code!=='ENOENT')throw e;}}

// A permanent, local SQLite sidecar supplies an OS-backed cross-process mutex.
// It contains no budget data. Never unlink it: doing so could split the mutex.
// Process death releases the SQLite transaction; a second stale sentinel is
// therefore not introduced. The legacy .lock remains the shared exclusion
// boundary for older Budget writers and P2 adoption leases.
export async function acquireBudgetLock(budgetPath){
 const path=join(await realpath(dirname(budgetPath)),basename(budgetPath))+'.lock';
 const guardPath=path+'.guard.sqlite3',started=Date.now();let db,transaction=false,handle,identity,ownerBytes;
 async function wait(){if(Date.now()-started>=5000)fail('BUDGET_LOCKED','Budget writer is active or its owner cannot be confirmed dead');await pause(25);}
 try{
  try{const f=await open(guardPath,'wx',0o600);await f.close();}catch(e){if(e.code!=='EEXIST')throw e;}
  const g=await lstat(guardPath,{bigint:true});if(!g.isFile()||g.isSymbolicLink()||g.nlink!==1n||g.size>65536n)fail('BUDGET_LOCKED','Invalid budget coordination file');
  db=new DatabaseSync(guardPath);db.exec('PRAGMA busy_timeout=0');
  while(!transaction){try{db.exec('BEGIN IMMEDIATE');transaction=true;}catch(e){if((e.errcode&255)!==5&&(e.errcode&255)!==6)throw e;await wait();}}
  if(!same(g,await lstat(guardPath,{bigint:true})))fail('BUDGET_LOCKED','Budget coordination file changed');
  while(!handle){
   await guardAbsent(path+'.recovery');
   try{handle=await open(path,'wx',0o600);}catch(e){
    if(e.code!=='EEXIST')throw e;
    let prior;try{prior=await inspect(path);}catch(error){if(error.code==='ENOENT')continue;throw error;}
    if(!ordinary(prior.value))fail('BUDGET_LOCKED','Not an ordinary budget lock; use the owning transaction recovery flow');
    if(!dead(prior.value.pid)){await wait();continue;}
    // All automatic ordinary recovery contenders hold the SQLite mutex. A
    // legacy live writer cannot acquire this still-existing .lock, and P2
    // recovery refuses the ordinary record shape.
    const checked=await inspect(path);await guardAbsent(path+'.recovery');
    if(!same(prior.stat,checked.stat)||!prior.bytes.equals(checked.bytes)||!dead(checked.value.pid))fail('BUDGET_LOCKED','Owner changed before recovery');
    const hash=createHash('sha256').update(prior.bytes).digest('hex');
    await rename(path,`${path}.abandoned-${hash}-${randomUUID()}.json`);
    continue;
   }
  }
  identity=await handle.stat({bigint:true});
  ownerBytes=Buffer.from(JSON.stringify({version:1,kind:'suite-budget-lock',token:randomUUID(),pid:process.pid,createdAt:new Date().toISOString()}));
  await handle.writeFile(ownerBytes);await handle.sync();
  async function assertOwned(){
   try{const current=await inspect(path);if(!same(identity,current.stat)||!ownerBytes.equals(current.bytes)||!same(g,await lstat(guardPath,{bigint:true})))throw Error('changed');await guardAbsent(path+'.recovery');}
   catch{fail('BUDGET_LOCK_LOST','Budget lock ownership changed; no further ledger publication permitted');}
  }
  await assertOwned();let released=false;
  return {assertOwned,async release(){
   if(released)return;released=true;let ours=false;
   try{await assertOwned();ours=true;}finally{
    try{await handle.close();if(ours)await unlink(path);}finally{try{db.exec('ROLLBACK');}finally{db.close();}}
   }
  }};
 }catch(e){
  // Incomplete/unverified owner metadata is intentionally preserved. Do not
  // turn an initialization failure into permission to remove another lock.
  try{await handle?.close();}finally{if(db){try{if(transaction)db.exec('ROLLBACK');}finally{db.close();}}}
  if(e.code?.startsWith('BUDGET_'))throw e;
  fail('BUDGET_LOCKED','Budget lock coordination unavailable; no ledger write was admitted');
 }
}
