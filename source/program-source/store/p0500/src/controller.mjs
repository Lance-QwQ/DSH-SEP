import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';

const sha = value => createHash('sha256').update(value).digest('hex');
const clone = value => structuredClone(value);
const equalPath = (a,b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
const contained = (root, target) => { const rel = path.relative(root,target); return !rel || (!rel.startsWith('..'+path.sep) && rel !== '..' && !path.isAbsolute(rel)); };
const fail = (code, message=code) => { throw Object.assign(new Error(message),{code}); };
const identifier = value => { if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value)) fail('INVALID_ID'); return value; };
const defaults = {maxRecords:10000,maxBytes:16*1024*1024,maxRecordBytes:64*1024,maxProjects:128,maxOperations:4096,maxPlans:256,maxContinuations:256,maxAudit:128};

function safeAbsolute(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || /[\x00-\x1f]/.test(value) || value.startsWith('\\\\') || value.startsWith('//')) fail('UNSAFE_PATH');
  const root=path.resolve(value), drive=path.parse(root).root;
  if (equalPath(root,drive) || contained(root,os.homedir()) || path.relative(drive,root).split(path.sep).length < 2) fail('UNSAFE_PATH');
  return root;
}

async function directoryIdentity(value) {
  const root=safeAbsolute(value);
  const drive=path.parse(root).root;
  let current=drive;
  for (const part of path.relative(drive,root).split(path.sep)) {
    current=path.join(current,part);
    const stat=await fs.lstat(current,{bigint:true});
    if (!stat.isDirectory() || stat.isSymbolicLink() || stat.ino === 0n || stat.dev === 0n) fail('UNSAFE_PATH');
    const actual=await fs.realpath(current);
    if (!equalPath(path.resolve(actual),path.resolve(current))) fail('UNSAFE_PATH');
  }
  const stat=await fs.lstat(root,{bigint:true});
  return {realpath:await fs.realpath(root),dev:String(stat.dev),ino:String(stat.ino),birthtimeNs:String(stat.birthtimeNs)};
}
const sameIdentity = (a,b) => a.dev===b.dev && a.ino===b.ino && a.birthtimeNs===b.birthtimeNs && equalPath(a.realpath,b.realpath);
async function secureFile(file) {
  const s=await fs.lstat(file,{bigint:true});
  if (!s.isFile() || s.isSymbolicLink() || s.nlink !== 1n || !s.ino || !s.dev) fail('UNSAFE_FILE');
  return {dev:String(s.dev),ino:String(s.ino),size:Number(s.size)};
}

export async function openRecovery({controlRoot,limits:requested={}}={}) {
  const limits={...defaults,...requested};
  for (const [key,value] of Object.entries(limits)) if (!(key in defaults) || !Number.isSafeInteger(value) || value<1 || value>defaults[key]) fail('INVALID_LIMIT');
  controlRoot=safeAbsolute(controlRoot);
  // Validate every existing ancestor before creating only the requested control directory.
  await directoryIdentity(path.dirname(controlRoot));
  await fs.mkdir(controlRoot).catch(error=>{if(error.code!=='EEXIST')throw error;});
  const controlIdentity=await directoryIdentity(controlRoot);
  const lockPath=path.join(controlRoot,'owner.lock.json');
  const journalPath=path.join(controlRoot,'journal.jsonl');
  const lockBytes=JSON.stringify({version:1,token:randomUUID(),pid:process.pid,createdAt:new Date().toISOString(),controlIdentity})+'\n';
  let lock;
  try { lock=await fs.open(lockPath,'wx',0o600); } catch(error) { if(error.code==='EEXIST')fail('OWNER_LOCKED'); throw error; }
  let lockIdentity, journal, journalIdentity, closed=false, poisoned=false;
  let seq=0, bytes=0, previous='0'.repeat(64), queue=Promise.resolve();
  const projects=new Map(), operations=new Map(), plans=new Map(), continuations=new Map(), audit=[];
  const historicalRoots=new Set(),historicalIdentities=new Set();
  const identityKey=i=>`${i.dev}:${i.ino}:${i.birthtimeNs}`;
  let generation=1,maintenance=null;
  function apply(type,payload) {
    // Rebuilt from the existing durable journal, including every prior rebind.
    // Automatic discovery must not mint a new owner for a retired path or for
    // the same physical directory moved elsewhere.
    if(type==='project-added'||type==='project-rebound'){
      historicalRoots.add(payload.project.root);
      historicalIdentities.add(identityKey(payload.project.identity));
    }
    switch(type) {
      case 'maintenance-closed': case 'maintenance-bound': maintenance=payload.maintenance; break;
      case 'maintenance-opened': maintenance=null; break;
      case 'project-added': projects.set(payload.project.id,payload.project); break;
      case 'project-paused': {
        projects.set(payload.project.id,payload.project); generation++;
        for (const op of operations.values()) if(op.projectId===payload.project.id && op.status==='dispatched') op.status='unknown';
        break;
      }
      case 'rebind-planned': plans.set(payload.plan.planId,payload.plan); break;
      case 'project-rebound': {
        projects.set(payload.project.id,payload.project); plans.delete(payload.planId); generation++;
        for(const op of operations.values())if(op.projectId===payload.project.id&&op.status==='dispatched')op.status='unknown';
        break;
      }
      case 'operation-began': operations.set(payload.operation.operationId,payload.operation); break;
      case 'operation-finished': case 'operation-reconciled': operations.set(payload.operation.operationId,payload.operation); break;
      case 'continuation-admitted': case 'continuation-completed': continuations.set(payload.continuation.requestId,payload.continuation); break;
      case 'session-recovered': case 'operations-interrupted': {
        for(const id of payload.operations) {const op=operations.get(id); if(!op)fail('JOURNAL_CORRUPT');op.status='unknown';}
        for(const id of payload.projects) {const p=projects.get(id);if(!p)fail('JOURNAL_CORRUPT');p.generation++;}
        generation++; break;
      }
      case 'stale-callback': break;
      default: fail('JOURNAL_CORRUPT');
    }
    if(type==='stale-callback' || type==='session-recovered' || type==='operations-interrupted' || type==='project-paused') {
      audit.push({kind:type,...clone(payload)}); if(audit.length>limits.maxAudit)audit.shift();
    }
  }
  async function own() {
    if(!sameIdentity(await directoryIdentity(controlRoot),controlIdentity))fail('CONTROL_CHANGED');
    const actual=await secureFile(lockPath);
    if(actual.dev!==lockIdentity.dev || actual.ino!==lockIdentity.ino || await fs.readFile(lockPath,'utf8')!==lockBytes)fail('OWNER_CHANGED');
  }
  async function release() {
    if(closed)return;
    closed=true;
    try { await own(); await lock.close(); lock=null; await fs.unlink(lockPath); }
    finally { if(lock)await lock.close().catch(()=>{}); if(journal)await journal.close().catch(()=>{}); }
  }
  async function append(type,payload,beforeCommit) {
    if(closed)fail('CLOSED'); if(poisoned)fail('WRITER_POISONED');
    await own();
    const current=await secureFile(journalPath);
    if(current.dev!==journalIdentity.dev || current.ino!==journalIdentity.ino || current.size!==bytes) {poisoned=true;fail('JOURNAL_CHANGED');}
    const body={version:1,seq:seq+1,at:new Date().toISOString(),previous,type,payload};
    const hash=sha(JSON.stringify(body));
    const record=Buffer.from(JSON.stringify({...body,hash})+'\n');
    if(seq>=limits.maxRecords || bytes+record.length>limits.maxBytes || record.length>limits.maxRecordBytes)fail('JOURNAL_LIMIT');
    if(beforeCommit&&!beforeCommit())fail('CONTINUATION_HOST_CHANGED');
    try {
      let offset=0;
      while(offset<record.length) {const result=await journal.write(record,offset,record.length-offset,null);if(!result.bytesWritten)fail('IO_NO_PROGRESS');offset+=result.bytesWritten;}
      await journal.sync();
    } catch(error) {poisoned=true;throw error;}
    bytes+=record.length;seq++;previous=hash;apply(type,clone(payload));
  }
  function serialized(fn) {const result=queue.then(()=>{if(closed)fail('CLOSED');if(poisoned)fail('WRITER_POISONED');return fn();});queue=result.catch(()=>{});return result;}
  function businessOpen(){if(maintenance)fail('RECOVERY_MAINTENANCE_CLOSED');}
  function lease(id){identifier(id);if(!maintenance||maintenance.id!==id)fail('RECOVERY_MAINTENANCE_CONFLICT');return clone(maintenance);}
  function getProject(id) {identifier(id);const p=projects.get(id);if(!p)fail('PROJECT_NOT_FOUND');return p;}
  function getOperation(id) {identifier(id);const op=operations.get(id);if(!op)fail('OPERATION_NOT_FOUND');return op;}
  function compatibleRoot(root, exceptId) {
    if(contained(controlRoot,root) || contained(root,controlRoot))fail('UNSAFE_PATH');
    for(const p of projects.values()) if(p.id!==exceptId && (contained(p.root,root)||contained(root,p.root)))fail('PROJECT_OVERLAP');
  }
  async function inspect(id) {
    const p=getProject(id);let reason=null;
    try {if(!sameIdentity(await directoryIdentity(p.root),p.identity))reason='IDENTITY_CHANGED';}
    catch(error) {reason=(error.code==='ENOENT'||error.code==='ENOTDIR')?'WORKSPACE_MISSING':'WORKSPACE_UNVERIFIABLE';}
    if(reason && (p.state!=='paused'||p.reason!==reason)) await append('project-paused',{project:{...p,state:'paused',reason,generation:p.generation+1}});
    return clone(getProject(id));
  }
  function resume(taskId) {
    identifier(taskId);
    const list=[...operations.values()].filter(op=>op.taskId===taskId).map(op=>({operationId:op.operationId,effect:op.effect,status:op.status,projectId:op.projectId,generation:op.generation,decision:op.status==='succeeded'?'retain':op.status==='failed'&&op.effect==='read'?'retry-after-review':'review'}));
    if(!list.length)fail('TASK_NOT_FOUND');
    const body={taskId,revision:seq,canResume:list.every(op=>op.status==='succeeded'&&getProject(op.projectId).state==='ready'),operations:list};
    return {...body,confirmationHash:sha(JSON.stringify(body))};
  }
  function continuationFingerprint(taskId,projectId) {
    return sha(JSON.stringify({taskId,operations:[...operations.values()].filter(op=>op.taskId===taskId),project:getProject(projectId)}));
  }
  function continuationRequest({taskId,confirmationHash,requestId}={}) {
    identifier(taskId);identifier(requestId);
    if(typeof confirmationHash!=='string'||!/^[a-f0-9]{64}$/.test(confirmationHash))fail('CONFIRMATION_MISMATCH');
    const receipt=continuations.get(requestId);
    if(receipt&&(receipt.taskId!==taskId||receipt.confirmationHash!==confirmationHash))fail('CONTINUATION_REQUEST_CONFLICT');
    return receipt;
  }
  async function checkContinuation(request) {
    const receipt=continuationRequest(request);if(!receipt)fail('CONTINUATION_NOT_ADMITTED');
    // Completed requests are metadata lookups only, regardless of later journal activity.
    if(receipt.status==='completed')return clone(receipt);
    const p=await inspect(receipt.projectId);
    if(seq!==receipt.admissionRevision||p.state!=='ready'||continuationFingerprint(receipt.taskId,p.id)!==receipt.authorityHash)fail('CONTINUATION_PLAN_CHANGED');
    return clone(receipt);
  }
  try {
    await lock.writeFile(lockBytes);await lock.sync();lockIdentity=await secureFile(lockPath);
    try {await secureFile(journalPath);}catch(error) {if(error.code!=='ENOENT')throw error;const initial=await fs.open(journalPath,'wx',0o600);await initial.sync();await initial.close();}
    journalIdentity=await secureFile(journalPath);
    if(journalIdentity.size>limits.maxBytes)fail('JOURNAL_LIMIT');
    const raw=await fs.readFile(journalPath);
    if(raw.length && raw.at(-1)!==10)fail('JOURNAL_CORRUPT');
    const text=raw.toString('utf8');if(!Buffer.from(text).equals(raw))fail('JOURNAL_CORRUPT');
    for(const line of text.split('\n').filter(Boolean)) {
      if(Buffer.byteLength(line)+1>limits.maxRecordBytes || seq>=limits.maxRecords)fail('JOURNAL_LIMIT');
      let record;try {record=JSON.parse(line);}catch {fail('JOURNAL_CORRUPT');}
      const {hash,...body}=record;
      if(body.version!==1 || body.seq!==seq+1 || body.previous!==previous || hash!==sha(JSON.stringify(body)))fail('JOURNAL_CORRUPT');
      try {apply(body.type,body.payload);}catch {fail('JOURNAL_CORRUPT');}
      seq++;previous=hash;
    }
    bytes=raw.length;journal=await fs.open(journalPath,'a');
    const pending=[...operations.values()].filter(op=>op.status==='dispatched');
    if(pending.length)await append('session-recovered',{operations:pending.map(op=>op.operationId),projects:[...new Set(pending.map(op=>op.projectId))]});
    for(const p of projects.values())await inspect(p.id);
  } catch(error) {await release().catch(()=>{});throw error;}
  return {
    status() {return clone({schemaVersion:1,revision:seq,generation,maintenance,projects:[...projects.values()],operations:[...operations.values()],plans:[...plans.values()],continuations:[...continuations.values()],audit,limits,writerState:poisoned?'poisoned':closed?'closed':'open'});},
    assertBusinessOpen(){return serialized(()=>{businessOpen();return true;});},
    beginMaintenance({id}={}){return serialized(async()=>{identifier(id);if(maintenance)return lease(id);const next={id,transactionId:null,planHash:null,closedAt:new Date().toISOString()};await append('maintenance-closed',{maintenance:next});return clone(next);});},
    bindMaintenance({id,transactionId,planHash}={}){return serialized(async()=>{const current=lease(id);identifier(transactionId);if(!/^[a-f0-9]{64}$/.test(planHash??''))fail('RECOVERY_MAINTENANCE_CONFLICT');if(current.planHash){if(current.planHash!==planHash||current.transactionId!==transactionId)fail('RECOVERY_MAINTENANCE_CONFLICT');return current;}const next={...current,transactionId,planHash,boundProjects:clone([...projects.values()])};await append('maintenance-bound',{maintenance:next});return clone(next);});},
    assertMaintenance({id}={}){return serialized(async()=>{const current=lease(id);await own();for(const p of projects.values())await inspect(p.id);return {...current,projects:clone([...projects.values()])};});},
    // Only trusted local orchestration supplies verifyDecision; this function is
    // never exposed as a JSON/RPC command. 健康检查或用户 JSON 不能替代 P2 决定。
    finishMaintenance({id}={},verifyDecision){return serialized(async()=>{const current=lease(id);if(!current.planHash||typeof verifyDecision!=='function')fail('RECOVERY_MAINTENANCE_DECISION_REQUIRED');const proof=await verifyDecision(clone(current));if(!['committed','rolled_back'].includes(proof?.status)||proof.transactionId!==current.transactionId||proof.planHash!==current.planHash||proof.legacyReadOnly===true)fail('RECOVERY_MAINTENANCE_DECISION_REQUIRED');await append('maintenance-opened',{id,transactionId:current.transactionId,planHash:current.planHash,status:proof.status});return {status:'open',decision:proof.status};});},
    close() {const result=queue.then(release);queue=result.catch(()=>{});return result;},
    addProject({root,memoryKey,id=randomUUID(),automatic=false}={}) {return serialized(async()=>{
      businessOpen();
      identifier(id);if(projects.has(id))fail('PROJECT_EXISTS');if(projects.size>=limits.maxProjects)fail('PROJECT_LIMIT');
      root=safeAbsolute(root);compatibleRoot(root);const identity=await directoryIdentity(root);
      if(automatic&&(historicalIdentities.has(identityKey(identity))||[...historicalRoots].some(old=>contained(old,root)||contained(root,old))))fail('RECOVERY_REBIND_REQUIRED');
      if(memoryKey!==undefined && (typeof memoryKey!=='string'||!memoryKey||memoryKey.length>256||/[\x00-\x1f]/.test(memoryKey)))fail('INVALID_MEMORY_KEY');
      const project={id,root,originRoot:identity.realpath,identity,memoryKey:memoryKey??sha(process.platform==='win32'?identity.realpath.toLowerCase():identity.realpath),generation:1,state:'ready',reason:null};
      await append('project-added',{project});return clone(project);
    });},
    inspectProject(id) {return serialized(()=>inspect(id));},
    planRebind({projectId,newRoot}={}) {return serialized(async()=>{
      businessOpen();
      const p=getProject(projectId);if(plans.size>=limits.maxPlans)fail('PLAN_LIMIT');newRoot=safeAbsolute(newRoot);compatibleRoot(newRoot,projectId);
      const identity=await directoryIdentity(newRoot);
      const body={planId:randomUUID(),projectId,oldRoot:p.root,newRoot,identity,projectGeneration:p.generation,memoryKey:p.memoryKey,revision:seq+1,scope:'new execution contexts only; existing operation roots retained'};
      const plan={...body,confirmationHash:sha(JSON.stringify(body))};await append('rebind-planned',{plan});return clone(plan);
    });},
    commitRebind({planId,confirmationHash}={}) {return serialized(async()=>{
      businessOpen();
      identifier(planId);const plan=plans.get(planId);if(!plan)fail('PLAN_NOT_FOUND');if(plan.confirmationHash!==confirmationHash)fail('CONFIRMATION_MISMATCH');
      const p=getProject(plan.projectId);if(plan.revision!==seq||plan.projectGeneration!==p.generation||plan.memoryKey!==p.memoryKey)fail('PLAN_CHANGED');
      let identity;try {identity=await directoryIdentity(plan.newRoot);compatibleRoot(plan.newRoot,p.id);}catch {fail('PLAN_CHANGED');}
      if(!sameIdentity(identity,plan.identity))fail('PLAN_CHANGED');
      const project={...p,root:plan.newRoot,identity,generation:p.generation+1,state:'ready',reason:null};
      await append('project-rebound',{project,planId});return clone(project);
    });},
    beginOperation({projectId,taskId,operationId,effect,summary}={}) {return serialized(async()=>{
      businessOpen();
      identifier(taskId);identifier(operationId);if(!['read','write','external'].includes(effect))fail('INVALID_EFFECT');
      if(summary!==undefined && (typeof summary!=='string'||Buffer.byteLength(summary)>4096))fail('INVALID_SUMMARY');
      if(operations.has(operationId))fail('OPERATION_EXISTS');if(operations.size>=limits.maxOperations)fail('OPERATION_LIMIT');
      const p=await inspect(projectId);if(p.state!=='ready')fail('PROJECT_PAUSED');
      const operation={operationId,projectId,taskId,generation:p.generation,effect,status:'dispatched',root:p.root,dispatchedAt:new Date().toISOString(),...(summary===undefined?{}:{summaryHash:sha(summary)})};
      await append('operation-began',{operation});return clone(operation);
    });},
    finishOperation({operationId,generation:callbackGeneration,outcome,resultHash}={}) {return serialized(async()=>{
      const op=getOperation(operationId);if(!['succeeded','failed','unknown'].includes(outcome))fail('INVALID_OUTCOME');
      if(!Number.isSafeInteger(callbackGeneration)||callbackGeneration<1)fail('INVALID_GENERATION');
      if(resultHash!==undefined&&!/^[a-f0-9]{64}$/.test(resultHash))fail('INVALID_RESULT_HASH');
      const p=await inspect(op.projectId);
      if(callbackGeneration!==op.generation||callbackGeneration!==p.generation||p.state!=='ready') {
        await append('stale-callback',{operationId,generation:callbackGeneration,currentGeneration:p.generation,outcome});return {accepted:false,reason:'STALE_GENERATION'};
      }
      if(op.status!=='dispatched')fail('OPERATION_SETTLED');
      const operation={...op,status:outcome,finishedAt:new Date().toISOString(),...(resultHash?{resultHash}:{})};
      await append('operation-finished',{operation});return {accepted:true,operation:clone(operation)};
    });},
    interruptOperations({projectId,operationIds,reason}={}) {return serialized(async()=>{
      if(!['host-exit','cancelled','guardian-restart'].includes(reason))fail('INVALID_INTERRUPT_REASON');
      if(projectId!==undefined)getProject(projectId);
      if(operationIds!==undefined) {
        if(!Array.isArray(operationIds)||operationIds.length>limits.maxOperations)fail('INVALID_OPERATION_IDS');
        for(const id of operationIds)getOperation(id);
      }
      const requested=operationIds===undefined?null:new Set(operationIds);
      const pending=[...operations.values()].filter(op=>op.status==='dispatched'&&(projectId===undefined||op.projectId===projectId)&&(!requested||requested.has(op.operationId)));
      const affected=[...new Set(pending.map(op=>op.projectId))];
      // One generation fence invalidates every outstanding callback in the same project.
      const allAffected=[...operations.values()].filter(op=>op.status==='dispatched'&&affected.includes(op.projectId));
      if(allAffected.length)await append('operations-interrupted',{operations:allAffected.map(op=>op.operationId),projects:affected,reason});
      return {operationIds:allAffected.map(op=>op.operationId),projectIds:affected,reason};
    });},
    planResume({taskId}={}) {return serialized(async()=>{
      const affected=[...new Set([...operations.values()].filter(op=>op.taskId===taskId).map(op=>op.projectId))];
      for(const id of affected)await inspect(id);return clone(resume(taskId));
    });},
    admitContinuation(request={}) {return serialized(async()=>{
      businessOpen();
      const existing=continuationRequest(request);if(existing)return checkContinuation(request);
      const {taskId,requestId,confirmationHash}=request;
      const ids=[...new Set([...operations.values()].filter(op=>op.taskId===taskId).map(op=>op.projectId))];
      for(const id of ids)await inspect(id);
      const plan=resume(taskId);if(plan.confirmationHash!==confirmationHash)fail('CONFIRMATION_MISMATCH');
      if(!plan.canResume)fail('CONTINUATION_BLOCKED');if(ids.length!==1)fail('CONTINUATION_MULTI_PROJECT');
      if(continuations.size>=limits.maxContinuations)fail('CONTINUATION_LIMIT');
      const p=getProject(ids[0]);
      const continuation={requestId,taskId,confirmationHash,sessionId:randomUUID(),projectId:p.id,root:p.root,projectGeneration:p.generation,projectIdentity:clone(p.identity),memoryKey:p.memoryKey,authorityHash:continuationFingerprint(taskId,p.id),sourceRevision:seq,admissionRevision:seq+1,status:'admitted',createdAt:new Date().toISOString()};
      await append('continuation-admitted',{continuation});return clone(continuation);
    });},
    checkContinuation(request={}) {return serialized(()=>checkContinuation(request));},
    completeContinuation(request={}, {authorityCheck}={}) {return serialized(async()=>{
      if(authorityCheck!==undefined&&typeof authorityCheck!=='function')fail('CONTINUATION_HOST_CHANGED');
      if(typeof request.headerHash!=='string'||!/^[a-f0-9]{64}$/.test(request.headerHash))fail('INVALID_RESULT_HASH');
      const receipt=await checkContinuation(request);
      if(receipt.sessionId!==request.sessionId)fail('CONTINUATION_SESSION_MISMATCH');
      if(receipt.status==='completed') {if(receipt.headerHash!==request.headerHash)fail('CONTINUATION_SESSION_MISMATCH');return receipt;}
      const continuation={...receipt,status:'completed',headerHash:request.headerHash,completionRevision:seq+1,completedAt:new Date().toISOString()};
      await append('continuation-completed',{continuation},authorityCheck);return clone(continuation);
    });},
    reconcileOperation({operationId,confirmationHash,outcome,resultHash}={}) {return serialized(async()=>{
      const op=getOperation(operationId);if(op.status!=='unknown')fail('OPERATION_NOT_UNKNOWN');if(!['succeeded','failed','unknown'].includes(outcome))fail('INVALID_OUTCOME');
      if(resultHash!==undefined&&!/^[a-f0-9]{64}$/.test(resultHash))fail('INVALID_RESULT_HASH');
      await inspect(op.projectId);if(resume(op.taskId).confirmationHash!==confirmationHash)fail('CONFIRMATION_MISMATCH');
      const operation={...op,status:outcome,reconciledAt:new Date().toISOString(),...(resultHash?{resultHash}:{})};await append('operation-reconciled',{operation});return clone(operation);
    });},
  };
}
