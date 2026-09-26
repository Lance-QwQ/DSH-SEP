import {DatabaseSync} from 'node:sqlite';
import {lstat,realpath} from 'node:fs/promises';
import {resolve,dirname,isAbsolute} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
const fail=code=>{throw Object.assign(Error(code),{code});};
const key=p=>resolve(p).toLowerCase();
// SQLite's byte-range locks belong to the process and are released by Windows
// after an abrupt exit. A stale JSON owner file is never this admission lock.
export async function acquireStartupLease(path,{timeoutMs=15000}={}){
 if(!isAbsolute(path)||!Number.isInteger(timeoutMs)||timeoutMs<0||timeoutMs>30000)fail('DAILY_LEASE_INVALID');
 if(key(await realpath(dirname(path)))!==key(dirname(path)))fail('DAILY_LEASE_PATH');
 try{const s=await lstat(path);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1)fail('DAILY_LEASE_PATH');}catch(e){if(e.code!=='ENOENT')throw e;}
 const db=new DatabaseSync(path);let owned=false,closed=false;
 try{
  db.exec('PRAGMA busy_timeout=0');const start=Date.now();
  for(;;){try{db.exec('BEGIN IMMEDIATE');owned=true;break;}catch(e){if(!/locked|busy/i.test(e.message))throw e;if(Date.now()-start>=timeoutMs)fail('DAILY_START_IN_PROGRESS');await delay(25);}}
  const s=await lstat(path);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||key(await realpath(path))!==key(path))fail('DAILY_LEASE_PATH');
  const identity={dev:s.dev,ino:s.ino};
  return {async assertOwned(){if(closed||!owned)fail('DAILY_LEASE_LOST');const current=await lstat(path);if(!current.isFile()||current.isSymbolicLink()||current.nlink!==1||current.dev!==identity.dev||current.ino!==identity.ino)fail('DAILY_LEASE_LOST');db.prepare('SELECT 1').get();},close(){if(closed)return;closed=true;try{db.exec('ROLLBACK');}finally{owned=false;db.close();}}};
 }catch(e){if(owned)try{db.exec('ROLLBACK');}catch{}db.close();throw e;}
}
