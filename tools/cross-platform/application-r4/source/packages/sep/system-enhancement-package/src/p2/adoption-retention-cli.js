#!/usr/bin/env node
import {lstat,open} from 'node:fs/promises';
import {isAbsolute,resolve} from 'node:path';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const HASH=/^[a-f0-9]{64}$/,MAX=16*1024*1024;
const fail=suffix=>{const code='P2_ADOPTION_RETENTION_'+suffix;throw Object.assign(new Error(code),{code});};
const bounded=e=>typeof e?.code==='string'&&e.code.length<=100&&/^(?:P2_|ADOPTION_)[A-Z_]+$/.test(e.code)?e.code:'P2_ADOPTION_RETENTION_IO';
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
async function readRequest(path){
  let handle;
  try{
    const before=await lstat(path,{bigint:true});if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1n||before.size>BigInt(MAX))fail('INPUT_JSON');
    handle=await open(path,'r');const opened=await handle.stat({bigint:true});if(opened.dev!==before.dev||opened.ino!==before.ino||opened.nlink!==1n||opened.size>BigInt(MAX))fail('INPUT_JSON');
    const bytes=await handle.readFile(),after=await lstat(path,{bigint:true});if(bytes.length>MAX||after.dev!==before.dev||after.ino!==before.ino||after.nlink!==1n||after.size!==before.size||after.mtimeNs!==before.mtimeNs||after.ctimeNs!==before.ctimeNs)fail('INPUT_JSON');
    return JSON.parse(bytes.toString('utf8'));
  }catch{fail('INPUT_JSON');}finally{await handle?.close();}
}
function validate(command,value){
  const keys=command==='watch'?['storageRoot','intervalMs']:command==='recover-metadata'?['storageRoot','recover']:['storageRoot'];
  if(!object(value)||Object.keys(value).some(k=>!keys.includes(k))||!isAbsolute(value.storageRoot??'')||value.storageRoot.includes('\0'))fail('REQUEST');
  if(command==='watch'&&value.intervalMs!==undefined&&(!Number.isSafeInteger(value.intervalMs)||value.intervalMs<1000||value.intervalMs>3600000))fail('REQUEST');
  if(command==='recover-metadata'){
    const r=value.recover,tokens=['copyRecoverToken','admissionRecoverToken','controlRecoverToken'];
    if(!object(r)||Object.keys(r).some(k=>!['transactionId',...tokens].includes(k))||!UUID.test(r.transactionId??'')||tokens.some(k=>r[k]!==undefined&&!UUID.test(r[k])))fail('REQUEST');
  }
  return {...value,storageRoot:resolve(value.storageRoot)};
}
function rows(values){return (Array.isArray(values)?values:[]).map(v=>{
  const status=['active','cleaned','cleanup_pending','retained','pinned','retired','pending'].includes(v?.status)?v.status:'pending',row={status};
  if(UUID.test(v?.transactionId??''))row.transactionId=v.transactionId;
  if(v?.code!==undefined)row.code=bounded(v);
  for(const k of ['expiresAt','eligibleAt'])if(v?.[k]===null||Number.isSafeInteger(v?.[k])&&v[k]>=0)row[k]=v[k];
  for(const k of ['expired','recoveryRequired'])if(typeof v?.[k]==='boolean')row[k]=v[k];
  if(HASH.test(v?.receiptHash??''))row.receiptHash=v.receiptHash;
  return row;
});}
function summary(result){
  const metadata=result?.metadata,complete=result?.complete===true&&(metadata===undefined||metadata.complete===true);
  return {status:complete?'complete':'incomplete',complete,results:rows(result?.results),...metadata===undefined?{}:{metadata:{complete:metadata.complete===true,metadataOnly:true,results:rows(metadata.results)}},sourceFiles:'retained',sourcePermissions:'unchanged',modelCalls:0};
}
const emit=value=>process.stdout.write(JSON.stringify(value)+'\n');

try{
  const [command,path,...extra]=process.argv.slice(2);if(!['run','watch','recover-metadata'].includes(command)||!path||extra.length)fail('USAGE');
  const input=validate(command,await readRequest(path)),{sweepAdoptionMetadata}=await import('./adoption-metadata-retention.js');
  if(command==='recover-metadata'){
    const result=await sweepAdoptionMetadata({storageRoot:input.storageRoot,recover:input.recover}),out=summary({complete:result.complete,results:[],metadata:result});emit({event:'run',...out});if(!out.complete)process.exitCode=2;
  }else{
    const {createAdoptionRetention}=await import('./adoption-retention.js');let announced=false,stopping=false,lastKey,finish,stopWork;
    const stopped=new Promise(resolve=>{finish=resolve;});
    const service=createAdoptionRetention({storageRoot:input.storageRoot,intervalMs:input.intervalMs??60000,afterRun:async result=>{
      let metadata;try{metadata=await sweepAdoptionMetadata({storageRoot:input.storageRoot});}catch(error){metadata={complete:false,metadataOnly:true,results:[{status:'pending',code:bounded(error)}]};}
      if(command==='watch'&&announced&&!stopping){const out=summary({...result,metadata}),key=JSON.stringify(out);if(key!==lastKey){lastKey=key;emit({event:'changed',...out});}}
      return metadata;
    }});
    if(command==='run'){try{const out=summary(await service.run());emit({event:'run',...out});if(!out.complete)process.exitCode=2;}finally{await service.stop();}}
    else{
      // Signal listeners request a drain; they never cancel an in-flight unlink
      // or journal append. Windows external signal delivery is host-dependent.
      const stop=()=>{if(stopping)return;stopping=true;stopWork=service.stop().then(result=>{if(announced)emit({event:'stopped',...summary(result)});finish();},error=>{emit({status:'error',code:bounded(error)});process.exitCode=1;finish();});};
      process.on('SIGINT',stop);process.on('SIGTERM',stop);
      try{const first=await service.start();if(!stopping){const out=summary(first);lastKey=JSON.stringify(out);announced=true;emit({event:'watching',...out});}await stopped;await stopWork;}
      finally{process.off('SIGINT',stop);process.off('SIGTERM',stop);await service.stop();}
    }
  }
}catch(error){emit({status:'error',code:bounded(error)});process.exitCode=1;}
