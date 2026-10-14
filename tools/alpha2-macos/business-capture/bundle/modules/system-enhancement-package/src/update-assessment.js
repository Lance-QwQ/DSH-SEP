import {DatabaseSync} from 'node:sqlite';
import {createHash,randomUUID} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const text=(value,max=512)=>typeof value==='string'&&value.length>0&&value.length<=max;
const fail=code=>{throw Object.assign(Error(code),{code});};
const states=new Set(['pass','fail','blocked','not_run']);
/** Retain only bounded static metadata; paths, configuration values and private content never enter a request. */
export function assessmentInput(raw){
 if(!raw||!text(raw.release?.version,80)||!/^[0-9A-Za-z.+-]+$/.test(raw.release.version)||!text(raw.release?.id,128)||!digest(raw.currentBinding)||!digest(raw.reportBinding)||!Array.isArray(raw.plugins)||raw.plugins.length>10000)fail('ASSESSMENT_INPUT');
 const plugins=raw.plugins.map(p=>{
  if(!text(p.name,214)||!/^(@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(p.name)||!text(p.version,100)||!digest(p.fingerprint)||!['unknown','incompatible','compatible'].includes(p.verdict))fail('ASSESSMENT_INPUT');
  const reasonCodes=Array.isArray(p.reasonCodes)?p.reasonCodes.filter(x=>['NO_CANDIDATE','STATIC_INCOMPATIBLE','RUNTIME_UNVERIFIED','BOUND_RUNTIME_EVIDENCE'].includes(x)):['RUNTIME_UNVERIFIED'];
  return {name:p.name,version:p.version,fingerprint:p.fingerprint,verdict:p.verdict,runtime:'not_run',reasonCodes};
 }).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 const input={release:{version:raw.release.version,id:raw.release.id,notes:typeof raw.release.notes==='string'?raw.release.notes.slice(0,12000):''},currentBinding:raw.currentBinding,reportBinding:raw.reportBinding,plugins};
 if(Buffer.byteLength(JSON.stringify(input))>600000)fail('ASSESSMENT_INPUT_LIMIT');
 return input;
}
function verdict(value){
 if(!value||!states.has(value.status)||!text(value.summary,4000)||!Array.isArray(value.conflicts)||value.conflicts.length>30||value.conflicts.some(v=>!text(v,1000)))fail('ASSESSMENT_RESPONSE');
 return {status:value.status,summary:value.summary,conflicts:value.conflicts};
}
/** SQLite transactions claim each immutable input before model dispatch, across processes and restarts. */
export function createUpdateAssessment({path,generate,now=Date.now,timeoutMs=60000}){
 mkdirSync(dirname(path),{recursive:true});const db=new DatabaseSync(path);try{const version=db.prepare('PRAGMA user_version').get().user_version;if(version!==0&&version!==1)fail('ASSESSMENT_STORAGE_VERSION');db.exec('PRAGMA busy_timeout=3000; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY CHECK(id=1), enabled INTEGER NOT NULL, latest TEXT); INSERT OR IGNORE INTO settings VALUES(1,0,NULL); CREATE TABLE IF NOT EXISTS runs(key TEXT PRIMARY KEY, body TEXT NOT NULL); PRAGMA user_version=1;');}catch(error){db.close();throw error;}
 const live=new Map();let closed=false;
 const settings=()=>db.prepare('SELECT * FROM settings WHERE id=1').get();
 const read=key=>{const row=db.prepare('SELECT body FROM runs WHERE key=?').get(key);return row?JSON.parse(row.body):null;};
 const save=run=>db.prepare('INSERT INTO runs VALUES(?,?) ON CONFLICT(key) DO UPDATE SET body=excluded.body').run(run.key,JSON.stringify(run));
 const tx=fn=>{db.exec('BEGIN IMMEDIATE');try{const value=fn();db.exec('COMMIT');return value;}catch(e){db.exec('ROLLBACK');throw e;}};
 function get(){const s=settings(),run=s.latest?read(s.latest):null;if(run?.phase==='running'&&now()>run.deadline){run.status='blocked';run.phase='interrupted';run.reason='ASSESSMENT_INTERRUPTED';}return {version:1,available:true,enabled:!!s.enabled,latest:run};}
 function configure(enabled){if(typeof enabled!=='boolean')fail('ASSESSMENT_INPUT');db.prepare('UPDATE settings SET enabled=? WHERE id=1').run(enabled?1:0);if(!enabled)for(const op of live.values())op.controller.abort();return get();}
 async function run(key,retry=false){
  if(closed)return;const record=tx(()=>{const s=settings(),r=read(key);if(!s.enabled||s.latest!==key||!r)return null;
   if(r.attempts&&!retry)return null;if(retry&&r.phase==='running'&&now()<r.deadline)fail('ASSESSMENT_BUSY');
   r.attempts++;r.attemptId=randomUUID();r.phase='running';r.status='not_run';r.deadline=now()+timeoutMs*2+5000;r.analysis={status:'not_run'};r.review={status:'not_run'};r.reason=null;save(r);return r;});
  if(!record)return;
  const controller=new AbortController();let resolveDone;const done=new Promise(r=>resolveDone=r);live.set(record.attemptId,{controller,done});
  // Preserve source metadata supplied by another owner while this attempt was in flight.
  const publish=()=>tx(()=>{const prior=read(key);if(prior?.attemptId!==record.attemptId)return;if(prior.sourceInput)record.sourceInput=prior.sourceInput;save(record);});
  const allowed=()=>!closed&&!controller.signal.aborted&&settings().enabled&&settings().latest===key&&read(key)?.attemptId===record.attemptId;
  try{
   for(const stage of ['analysis','review']){
    if(!allowed())fail('ASSESSMENT_CANCELLED_OR_STALE');
    record.stage=stage;publish();
    const deadline=new AbortController();let timer;
    const work=generate({stage,input:assessmentInput(record.input),analysis:stage==='review'?record.analysis:undefined,taskId:`background:sep-update:${key}:${record.attempts}`,signal:AbortSignal.any([controller.signal,deadline.signal])});
    let result;try{result=await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>{deadline.abort();reject(Object.assign(Error('ASSESSMENT_TIMEOUT'),{code:'ASSESSMENT_TIMEOUT'}));},timeoutMs);})]);}finally{clearTimeout(timer);}
    record[stage]=verdict(result);publish();
   }
   if(!allowed())fail('ASSESSMENT_CANCELLED_OR_STALE');
   record.status=record.analysis.status==='fail'||record.review.status==='fail'||record.review.conflicts.length||record.analysis.conflicts.length||record.input.plugins.some(p=>p.verdict==='incompatible')?'fail':record.analysis.status==='pass'&&record.review.status==='pass'?'pass':'blocked';record.phase='complete';
  }catch(error){record.status='blocked';record.phase='complete';record.reason=/^[A-Z][A-Z0-9_]{0,79}$/.test(error?.code??error?.message??'')?(error.code??error.message):'ASSESSMENT_FAILED';}
  finally{record.finishedAt=new Date(now()).toISOString();try{publish();}finally{live.delete(record.attemptId);resolveDone();}}
 }
 function select(raw,{sourceInput}={}){
  const input=assessmentInput(raw),key=hash(input),source=sourceInput===undefined?undefined:assessmentInput(sourceInput);
  if(source&&JSON.stringify(assessmentInput({...source,currentBinding:input.currentBinding}))!==JSON.stringify(input))fail('ASSESSMENT_SOURCE_BINDING');
  tx(()=>{
   const previous=settings().latest,existing=read(key);
   if(source&&existing?.sourceInput&&JSON.stringify(assessmentInput(existing.sourceInput))!==JSON.stringify(source))fail('ASSESSMENT_SOURCE_BINDING');
   if(previous!==key){for(const op of live.values())op.controller.abort();db.prepare('UPDATE settings SET latest=? WHERE id=1').run(key);}
   if(!existing)save({key,input,...source?{sourceInput:source}:{},status:'not_run',phase:'detected',attempts:0,analysis:{status:'not_run'},review:{status:'not_run'},installable:false,scope:'model-analysis-and-evidence-review; runtime verification not performed'});
   else if(source&&!existing.sourceInput){existing.sourceInput=source;save(existing);}
  });return key;
 }
 async function observe(raw,metadata){if(closed)fail('DISPOSED');const key=select(raw,metadata);await run(key);return get();}
 return {get,configure,observe,retry:async(raw,metadata)=>{if(closed)fail('DISPOSED');const key=raw===undefined?settings().latest:select(raw,metadata);if(!key)fail('ASSESSMENT_NO_INPUT');await run(key,true);return get();},async close(){if(closed)return;closed=true;for(const op of live.values())op.controller.abort();await Promise.allSettled([...live.values()].map(op=>op.done));db.close();}};
}
