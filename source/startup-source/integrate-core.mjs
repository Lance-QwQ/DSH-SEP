import fs from 'node:fs/promises';
import path from 'node:path';
import {guardianLifecycleTransform} from './managed/guardian-lifecycle-transform.mjs';
const project=await fs.realpath(path.resolve(import.meta.dirname,'../..'));
const baseline=path.join(project,'dsh-daily/releases/sep-alpha2-updatefix-20260924/store');
const target=path.join(import.meta.dirname,'core/test-runtime');
const overlay=path.join(import.meta.dirname,'core/overlay');
for(const id of ['p0500','p0501']){
 await fs.mkdir(path.join(target,id),{recursive:true});
 await fs.cp(path.join(baseline,id,'src'),path.join(target,id,'src'),{recursive:true});
 await fs.copyFile(path.join(baseline,id,'package.json'),path.join(target,id,'package.json'));
 await fs.symlink(path.join(baseline,id,'node_modules'),path.join(target,id,'node_modules'),'junction').catch(e=>{if(e.code!=='EEXIST')throw e;});
 await fs.mkdir(path.join(overlay,id,'src'),{recursive:true});
 const owner=await fs.readFile(path.join(import.meta.dirname,'ownership/owner-file.mjs'));
 for(const root of [target,overlay])await fs.writeFile(path.join(root,id,'src/owner-lease.mjs'),owner);
}
const valid=`Number.isInteger(prior.pid)&&prior.pid>0&&Number.isFinite(Date.parse(prior.createdAt))`;
const uuid=`typeof prior.token==='string'&&/^[a-f0-9]{8}-[a-f0-9-]{27}$/.test(prior.token)`;
async function patch(id,file,transform){
 let text=await fs.readFile(path.join(baseline,id,'src',file),'utf8');
 const replace=(old,next)=>{if(!text.includes(old))throw Error('missing '+file+': '+old.slice(0,90));text=text.replace(old,next);};
 transform(replace,()=>text);
 if(id==='p0500'&&file==='guardian.mjs')text=guardianLifecycleTransform(text);
 for(const root of [target,overlay]){await fs.mkdir(path.dirname(path.join(root,id,'src',file)),{recursive:true});await fs.writeFile(path.join(root,id,'src',file),text);}
}
await patch('p0500','controller.mjs',r=>{
 r("import fs from 'node:fs/promises';","import fs from 'node:fs/promises';\nimport {acquireOwnerFile} from './owner-lease.mjs';");
 r("const lockBytes=JSON.stringify({version:1,token:randomUUID(),pid:process.pid,createdAt:new Date().toISOString(),controlIdentity})+'\\n';\n  let lock;\n  try { lock=await fs.open(lockPath,'wx',0o600); } catch(error) { if(error.code==='EEXIST')fail('OWNER_LOCKED'); throw error; }",
 `let ownership;\n  try { ownership=await acquireOwnerFile({path:lockPath,payload:{version:1,token:randomUUID(),pid:process.pid,createdAt:new Date().toISOString(),controlIdentity},validatePrior:prior=>prior.version===1&&${uuid}&&${valid}&&prior.controlIdentity&&sameIdentity(prior.controlIdentity,controlIdentity)}); } catch(cause) {throw Object.assign(new Error('OWNER_LOCKED: '+(cause.code??'OWNER_UNKNOWN'),{cause}),{code:'OWNER_LOCKED',reason:cause.code});}\n  const lockBytes=ownership.bytes;`);
 r('async function own() {','async function own() {\n    await ownership.assertOwned();');
 r('try { await own(); await lock.close(); lock=null; await fs.unlink(lockPath); }\n    finally { if(lock)await lock.close().catch(()=>{}); if(journal)await journal.close().catch(()=>{}); }',
 'try { if(journal)await journal.close(); } finally { journal=null;await ownership.release({remove:!poisoned}); }');
 r('await lock.writeFile(lockBytes);await lock.sync();lockIdentity=await secureFile(lockPath);','lockIdentity=await secureFile(lockPath);');
});
await patch('p0500','guardian.mjs',r=>{
 r("import fs from 'node:fs/promises';","import fs from 'node:fs/promises';\nimport {acquireOwnerFile} from './owner-lease.mjs';");
 r("const ownerBytes = Buffer.from(JSON.stringify({ schema: 1, token, pid: process.pid, createdAt: new Date().toISOString() }) + '\\n');\n  let owner, journal;\n  try { owner = await fs.open(ownerPath, 'wx', 0o600); }\n  catch (error) { if (error.code === 'EEXIST') throw fault('GUARDIAN_OWNER_UNPROVEN'); throw error; }",
 `let ownership,journal;\n  try {ownership=await acquireOwnerFile({path:ownerPath,payload:{schema:1,token,pid:process.pid,createdAt:new Date().toISOString()},validatePrior:prior=>prior.schema===1&&${uuid}&&${valid}});}catch(cause){throw Object.assign(fault('GUARDIAN_OWNER_UNPROVEN'),{cause,reason:cause.code});}\n  const ownerBytes=Buffer.from(ownership.bytes);`);
 r('await owner.writeFile(ownerBytes); await owner.sync();','await ownership.assertOwned();');
 r('if (fatalError) throw fatalError;','if (fatalError) throw fatalError;\n      await ownership.assertOwned();');
 r('await journal.close(); journal = null;\n        await owner.close(); owner = null;\n        if (!fatalError && (await fs.readFile(ownerPath)).equals(ownerBytes)) await fs.unlink(ownerPath);',
 'try {await journal.close();} finally {journal=null;await ownership.release({remove:!fatalError});}');
 r("await journal?.close().catch(() => {}); await owner?.close().catch(() => {});\n    // This open attempt owns only the exact new token. Never remove a pre-existing or replaced owner.\n    if ((await fs.readFile(ownerPath).catch(() => null))?.equals(ownerBytes)) await fs.unlink(ownerPath);",
 'await journal?.close().catch(() => {}); await ownership.release().catch(() => {});');
});
await patch('p0501','store.js',r=>{
 r("import { mkdir, open, unlink } from 'node:fs/promises';","import { mkdir } from 'node:fs/promises';\nimport {acquireOwnerFile} from './owner-lease.mjs';");
 r("let lock;\n  try { lock = await open(lockPath,'wx'); } catch (e) { if (e.code === 'EEXIST') fail('DATA_LOCKED','Another instance or an unclean exit owns the data lock'); throw e; }",
 `let ownership;\n  const acquire=()=>acquireOwnerFile({path:lockPath,payload:{pid:process.pid,createdAt:new Date().toISOString()},validatePrior:prior=>${valid}});\n  try {ownership=facility.withAccess?await facility.withAccess(acquire):await acquire();}catch(cause){throw Object.assign(new Error('DATA_LOCKED: '+(cause.code??'OWNER_UNKNOWN'),{cause}),{code:'DATA_LOCKED',reason:cause.code});}`);
 r("await lock.writeFile(JSON.stringify({pid:process.pid,createdAt:new Date().toISOString()}));\n    await lock.sync();",'await ownership.assertOwned();');
 r('} catch(e) { await lock.close(); await unlink(lockPath); throw e; }','} catch(e) { await ownership.release().catch(()=>{}); throw e; }');
 r('await tail; await domain.close(); await lock.close(); await unlink(lockPath);','await tail; try {await domain.close();} finally {await ownership.release();}');
});
await patch('p0501','p2/control.js',(r,get)=>{
 r("import ","import {acquireOwnerFile} from '../owner-lease.mjs';\nimport ");
 const start=get().indexOf('  let lock,closed=false'),end=get().indexOf('  async function assertOwned()',start);
 if(start<0||end<0)throw Error('p2 bounds');
 r(get().slice(start,end),`  let matchedPrior=false;\n  let ownership,closed=false,tail=Promise.resolve();const token=randomUUID(),context=new AsyncLocalStorage();\n  // Legacy guard files remain a refusal: they carry no native ownership proof.\n  if(await exists(guardPath)||recoverLockToken&&(mode!=='maintenance'||!await exists(lockPath)))fail('P2_LOCKED');\n  try {ownership=await acquireOwnerFile({path:lockPath,payload:{token,identity,pid:process.pid,mode,createdAt:new Date().toISOString()},validatePrior:prior=>(matchedPrior=${uuid}&&${valid}&&prior.identity===identity&&['writer','maintenance'].includes(prior.mode)&&(!recoverLockToken||prior.token===recoverLockToken))});}catch(cause){throw Object.assign(new Error('P2_LOCKED: '+(cause.code??'OWNER_UNKNOWN'),{cause}),{code:'P2_LOCKED',reason:cause.code});}\n  if(await exists(guardPath)||recoverLockToken&&!matchedPrior){await ownership.release();fail('P2_LOCKED');}\n`);
 r("async function assertOwned(){if(closed)fail('P2_FENCE_LOST','Coordinator closed');","async function assertOwned(){if(closed)fail('P2_FENCE_LOST','Coordinator closed');await ownership.assertOwned();");
 r("if(closed)return;await tail;let ours=false;try{ours=JSON.parse(await readFile(lockPath,'utf8')).token===token;}catch{}closed=true;await lock.close();if(ours)await unlink(lockPath);","if(closed)return;await tail;closed=true;await ownership.release();");
});
await patch('p0500','server.mjs',r=>{
 r('let controller,blocked;','let controller,blocked,ownerReason;');
 r('blocked=error.code;}','blocked=error.code;ownerReason=error.reason;}');
 r("recoveryState:{state:'blocked',reason:blocked}","recoveryState:{state:'blocked',reason:blocked,ownerReason}");
});
console.log(JSON.stringify({target,overlay}));
