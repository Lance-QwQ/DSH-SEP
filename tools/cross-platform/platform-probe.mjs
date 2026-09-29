import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile,realpath,lstat} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
const source=await realpath(resolve(process.env.SEP_PLATFORM_SOURCE??fileURLToPath(new URL('./baseline',import.meta.url))));
const parent=await realpath(process.env.SEP_PLATFORM_WORK??tmpdir());
const base=await mkdtemp(join(parent,'sep-platform-'));
const results=[];
const load=p=>import(pathToFileURL(p));
async function check(id,fn){try{const observation=await fn();results.push({id,status:'pass',...(observation?{observation}:{})});}catch(e){results.push({id,status:'fail',error:e.code??e.message,detail:String(e.message).slice(0,160)});}}
await check('FILESYSTEM_CASE_BEHAVIOR',async()=>{await writeFile(join(base,'Case'),'a');await writeFile(join(base,'case'),'b');const sensitive=(await lstat(join(base,'Case'))).ino!==(await lstat(join(base,'case'))).ino;assert.equal(await readFile(join(base,'Case'),'utf8'),sensitive?'a':'b');return {caseSensitive:sensitive};});
await check('STARTUP_SQLITE_EXCLUSIVE_LEASE',async()=>{const {acquireStartupLease}=await load(join(source,'apps/desktop/src/sep-update/runtime/launcher/startup-lease.mjs'));const p=join(base,'startup.sqlite');const one=await acquireStartupLease(p);try{await assert.rejects(acquireStartupLease(p,{timeoutMs:0}),{code:'DAILY_START_IN_PROGRESS'});await one.assertOwned();}finally{one.close();}const two=await acquireStartupLease(p,{timeoutMs:0});two.close();});
await check('SOURCE_OWNER_FILE_LEASE',async()=>{const {acquireOwnerFile}=await load(join(source,'packages/sep/system-enhancement-package/src/owner-lease.mjs'));const lease=await acquireOwnerFile({path:join(base,'owner.lock'),payload:{pid:process.pid},validatePrior:()=>true});try{await lease.assertOwned();}finally{await lease.release();}});
await check('P2_EMPTY_GOVERNED_STORAGE',async()=>{const {openControl}=await load(join(source,'packages/sep/system-enhancement-package/src/p2/control.js'));const p=join(base,'storage');await mkdir(p);const c=await openControl({storageRoot:p,mode:'maintenance',initialize:true});try{assert.equal((await c.checkpoint()).pending.length,0);}finally{await c.close();}});
await check('RECOVERY_EMPTY_CONTROL',async()=>{const {openRecovery}=await load(join(source,'packages/sep/recovery/src/controller.mjs'));const c=await openRecovery({controlRoot:join(base,'recovery')});try{assert.equal(c.status().writerState,'open');}finally{await c.close();}});
const result={schema:1,at:new Date().toISOString(),platform:process.platform,arch:process.arch,node:process.version,results,scope:'Diagnostic native OS baseline of exact selected source. Not full application build, desktop acceptance, release or platform support certification.'};
const output=resolve(process.env.SEP_PLATFORM_RESULT??join(base,'platform-baseline.json'));await writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result,null,2));process.exitCode=results.some(r=>r.status==='fail')?1:0;
