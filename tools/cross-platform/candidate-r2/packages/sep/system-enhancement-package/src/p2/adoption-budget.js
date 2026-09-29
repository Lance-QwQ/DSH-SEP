import {open,lstat,realpath,readdir,readFile,rename,unlink} from 'node:fs/promises';
import {isAbsolute,resolve,dirname,basename,parse,join,sep} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {p1Config} from '../p1.js';
import {automationConfig} from '../automatic-memory.js';
import {TEXT_MODELS,VISION_MODELS,RATES} from '../deepseek.js';
import {parseBudgetLedger,summarizeBudget,money} from '../budget-ledger.js';

const fail=suffix=>{const code=`P2_ADOPTION_BUDGET_${suffix}`;throw Object.assign(new Error(code),{code});};
const sha=value=>createHash('sha256').update(value).digest('hex');
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
const samePath=(a,b)=>process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b;
const nonnegative=z.number().nonnegative();
const models=new Set(Object.keys(RATES));
const moduleSchema=z.object({rag:z.boolean().default(true),memory:z.boolean().default(true),media:z.boolean().default(false)}).strict();
const visionSchema=z.object({model:z.enum(VISION_MODELS).default('deepseek-flash'),credentialRef:z.literal('DEEPSEEK_API_KEY').default('DEEPSEEK_API_KEY'),budgetPath:z.string(),limitCny:z.number().positive().max(100),initialSpentCny:nonnegative.default(0)}).strict();

function configuration(config,budgetPath){
  try{
    if(!config||config.enabled!==true||!isAbsolute(budgetPath??''))fail('CONFIG');
    const p1=p1Config.parse(config.p1),modules=moduleSchema.parse(config.modules??{});
    if(!p1.enabled)fail('CONFIG');
    const active=[p1];
    const automatic=config.memoryAutomation===undefined?null:automationConfig.parse(config.memoryAutomation);
    const vision=config.vision===undefined?null:visionSchema.parse(config.vision);
    if(modules.memory&&automatic?.capture)active.push(automatic);
    if(modules.media&&vision)active.push(vision);
    for(const item of active)if(!isAbsolute(item.budgetPath??'')||!samePath(resolve(item.budgetPath),resolve(budgetPath)))fail('CONFIG');
    return {active,p1,configSha256:sha(JSON.stringify(stable(config)))};
  }catch{fail('CONFIG');}
}

async function checkedPath(path){
  const root=parse(path).root;let current=root;
  for(const part of path.slice(root.length).split(sep).filter(Boolean)){
    current=join(current,part);const info=await lstat(current,{bigint:true});
    if(info.isSymbolicLink())fail('PATH');
  }
  const info=await lstat(path,{bigint:true});
  if(!info.isFile()||info.nlink!==1n||info.ino===0n||info.size>16n*1024n*1024n||!samePath(await realpath(path),path))fail('PATH');
  return info;
}
async function idle(path,assertOwned){
  const name=basename(path),entries=await readdir(dirname(path));
  if(entries.some(entry=>samePath(entry,name+'.lock.recovery')||entry.toLowerCase().startsWith((name+'.').toLowerCase())&&entry.toLowerCase().endsWith('.tmp')))fail('BUSY');
  if(assertOwned)await assertOwned();else if(entries.some(entry=>samePath(entry,name+'.lock')))fail('BUSY');
}
const unchanged=(a,b)=>a.dev===b.dev&&a.ino===b.ino&&a.size===b.size&&a.mtimeNs===b.mtimeNs&&a.ctimeNs===b.ctimeNs&&b.nlink===1n;
async function readLedger(path,assertOwned){
  const before=await checkedPath(path);await idle(path,assertOwned);const handle=await open(path,'r');
  try{
    if(!unchanged(before,await handle.stat({bigint:true})))fail('CHANGED');
    const bytes=await handle.readFile(),after=await handle.stat({bigint:true});
    if(!unchanged(before,after)||!unchanged(before,await checkedPath(path)))fail('CHANGED');
    await idle(path,assertOwned);
    return {bytes,fingerprint:{path,identity:{canonicalPath:path,exists:true,anchorPath:path,device:before.dev.toString(),inode:before.ino.toString()},exists:true,sha256:sha(bytes),size:bytes.length}};
  }finally{await handle.close();}
}

/** Read-only admission evidence for the explicitly selected, already existing
 * shared Budget ledger. Uses the shared pure parser and accounting summary,
 * never Budget lifecycle or migration methods.
 * The caller must quiesce paid writers and recheck this fingerprint under its
 * publication lock. This snapshot is not a continuing lock or proof of startup.
 * config is the exact target suite JSON before health-only projections.
 * No request IDs, original entry fields or parser errors escape this boundary.
 * @param {{budgetPath:string,config:Object}} input
 */
export async function inspectAdoptionBudget(input={}){return inspectBudget(input);}
async function inspectBudget({budgetPath,config}={},assertOwned){
  const configured=configuration(config,budgetPath),path=resolve(budgetPath);
  try{
    const {bytes,fingerprint}=await readLedger(path,assertOwned);let ledger;
    try{ledger=parseBudgetLedger(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));}catch{fail('INVALID');}
    let settledCount=0,reservedCount=0,releasedCount=0;
    for(const entry of ledger.entries){
      // Admission remains limited to the implementation's supported provider models.
      if(entry.model!==undefined&&!models.has(entry.model))fail('INVALID');
      if(entry.status==='settled')settledCount++;
      else if(entry.status==='reserved')reservedCount++;
      else if(entry.status==='released')releasedCount++;
    }
    if(configured.active.some(item=>item.limitCny!==ledger.limit||item.initialSpentCny!==ledger.initialSpent))fail('CONFIG');
    const {accountedCny,settledCny,reservedCny,legacyUnverifiedCny}=summarizeBudget(ledger);
    if(![accountedCny,settledCny,reservedCny,legacyUnverifiedCny].every(Number.isFinite))fail('INVALID');
    // A cost correction does not establish that an outstanding request finished.
    // Released pre-dispatch entries cost zero; reserved entries still block admission.
    if(reservedCount)fail('UNRESOLVED');
    if(accountedCny>=ledger.limit)fail('EXHAUSTED');
    // A second read also detects atomic ledger replacement during parsing.
    const checked=await readLedger(path,assertOwned);
    if(JSON.stringify(checked.fingerprint)!==JSON.stringify(fingerprint))fail('CHANGED');
    return {version:1,ledgerVersion:ledger.version,status:'verified',metadataOnly:true,budgetPath:path,fingerprint,configSha256:configured.configSha256,
      limitCny:ledger.limit,initialSpentCny:ledger.initialSpent,settledCny,reservedCny,legacyUnverifiedCny,accountedCny,remainingCny:money(ledger.limit-accountedCny),
      counts:{entries:ledger.entries.length,reserved:reservedCount,settled:settledCount},releasedCount,reconciliationCount:ledger.reconciliations?.length??0,
      profileInterception:{enabled:true,implementationScope:'current-p1-profile-hook',provider:'deepseek-official',models:[...TEXT_MODELS],maxTokens:configured.p1.profileLimits.maxOutputTokens,taskLimitCny:configured.p1.taskLimitCny},modelCalls:0};
  }catch(error){
    if(/^P2_ADOPTION_BUDGET_(?:CONFIG|PATH|BUSY|CHANGED|INVALID|UNRESOLVED|EXHAUSTED|FENCE_LOST)$/.test(error?.code??''))throw error;
    fail(error?.code==='ENOENT'?'MISSING':'IO');
  }
}

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const sameFile=(a,b)=>a.dev===b.dev&&a.ino===b.ino;
async function physicalIdentity(path){
  const file=await checkedPath(path),parent=await lstat(dirname(path),{bigint:true});
  return sha(JSON.stringify({path:process.platform==='win32'?path.toLowerCase():path,device:String(file.dev),inode:String(file.ino),parentDevice:String(parent.dev),parentInode:String(parent.ino)}));
}
async function readOwner(path){
  const before=await lstat(path,{bigint:true});
  if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1n||before.size>4096n)fail('LOCKED');
  const bytes=await readFile(path),after=await lstat(path,{bigint:true});if(!unchanged(before,after))fail('LOCKED');
  let value;try{value=JSON.parse(bytes);}catch{fail('LOCKED');}
  if(!value||typeof value!=='object'||Object.keys(value).sort().join(',')!=='identity,kind,pid,token,transactionId,version'||value.version!==1||value.kind!=='adoption-budget-lease-v1'||
    !UUID.test(value.token??'')||!UUID.test(value.transactionId??'')||!Number.isSafeInteger(value.pid)||value.pid<=0||!/^[a-f0-9]{64}$/.test(value.identity??''))fail('LOCKED');
  return {value,stat:after};
}
async function absent(path){try{await lstat(path);return false;}catch(error){if(error.code==='ENOENT')return true;throw error;}}
function dead(pid){try{process.kill(pid,0);}catch(error){if(error.code==='ESRCH')return;}fail('LOCKED');}

/** Own the exact lock used by native Budget.reserve/settle until publication
 * finishes. Acquisition is not budget approval: inspect() must still succeed.
 * Only a matching abandoned lease may be recovered; ordinary Budget locks and
 * unknown recovery guards are preserved. No ledger bytes are written.
 * @param {{budgetPath:string,config:Object,transactionId:string,recoverLockToken?:string}} input
 */
export async function acquireAdoptionBudgetLease({budgetPath,config,transactionId,recoverLockToken}={}){
  configuration(config,budgetPath);
  if(!UUID.test(transactionId??'')||recoverLockToken!==undefined&&!UUID.test(recoverLockToken))fail('CONFIG');
  const path=resolve(budgetPath),lockPath=path+'.lock',guardPath=lockPath+'.recovery',token=randomUUID();
  let handle,lockStat,owner,closed=false,tail=Promise.resolve();
  async function assertOwned(){
    try{
      if(closed||await physicalIdentity(path)!==owner.identity)fail('FENCE_LOST');
      const current=await readOwner(lockPath);
      if(!sameFile(current.stat,lockStat)||JSON.stringify(current.value)!==JSON.stringify(owner))fail('FENCE_LOST');
    }catch{fail('FENCE_LOST');}
  }
  async function close(){
    if(closed)return;await tail;let ours=false;
    try{const current=await readOwner(lockPath);ours=sameFile(current.stat,lockStat)&&JSON.stringify(current.value)===JSON.stringify(owner);}catch{}
    closed=true;await handle?.close();if(ours)try{await unlink(lockPath);}catch(error){if(error.code!=='ENOENT')fail('IO');}
  }
  try{
    const identity=await physicalIdentity(path);owner={version:1,kind:'adoption-budget-lease-v1',token,pid:process.pid,transactionId,identity};
    if(!await absent(guardPath))fail('LOCKED');
    if(recoverLockToken){
      let prior;try{prior=await readOwner(lockPath);}catch{fail('LOCKED');}
      if(prior.value.token!==recoverLockToken||prior.value.transactionId!==transactionId||prior.value.identity!==identity)fail('LOCKED');dead(prior.value.pid);
      let guard;try{guard=await open(guardPath,'wx',0o600);}catch{fail('LOCKED');}
      try{
        const checked=await readOwner(lockPath);if(!sameFile(prior.stat,checked.stat)||JSON.stringify(prior.value)!==JSON.stringify(checked.value)||await physicalIdentity(path)!==identity)fail('LOCKED');dead(prior.value.pid);
        await rename(lockPath,`${lockPath}.abandoned-${prior.value.token}.json`);
        try{handle=await open(lockPath,'wx',0o600);}catch{fail('LOCKED');}
      }finally{await guard.close();await unlink(guardPath);}
    }else{
      try{handle=await open(lockPath,'wx',0o600);}catch(error){if(error.code==='EEXIST')fail('LOCKED');throw error;}
    }
    lockStat=await handle.stat({bigint:true});await handle.writeFile(JSON.stringify(owner));await handle.sync();
    if(!await absent(guardPath))fail('LOCKED');await assertOwned();
    return {token,inspect(){const result=tail.then(async()=>{await assertOwned();return inspectBudget({budgetPath:path,config},assertOwned);});tail=result.catch(()=>{});return result;},close};
  }catch(error){
    await close();if(/^P2_ADOPTION_BUDGET_(?:CONFIG|PATH|LOCKED|FENCE_LOST)$/.test(error?.code??''))throw error;
    fail(error?.code==='ENOENT'?'MISSING':'IO');
  }
}
