// Internal private parent/child session. This does not authenticate a public
// input channel: trusted fixed-bundle admission must supply these private pipes.
import {decodeRequest,createResponseReader} from './protocol.mjs';
const fail=code=>{throw Object.assign(Error(code),{code});};
const safe=e=>/^SEP_[A-Z0-9_]{1,90}$/.test(e?.code??'')?e.code:'SEP_INSTALLER_SESSION_OPERATION';
const released=r=>r?.status==='pass'&&r.resourcesReleased===true;
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const clone=v=>JSON.parse(JSON.stringify(v));
export function runInstallerSession({controller,nonce,input,output,fixedInventory,closeDeadlineMs=5000}){
 if(!digest(nonce)||!input||!output||!['preview','cancel','confirm','resume','listRecovery','close','whenClosed'].every(k=>typeof controller?.[k]==='function')||!Number.isSafeInteger(closeDeadlineMs)||closeDeadlineMs<20||closeDeadlineMs>30000||!Array.isArray(fixedInventory?.entries)||fixedInventory.entries.length<1||fixedInventory.entries.length>100000||!Number.isSafeInteger(fixedInventory.totalBytes)||fixedInventory.totalBytes<0||fixedInventory.totalBytes>8589934592)fail('SEP_INSTALLER_SESSION_CONFIG');
 const inventory=Object.freeze({entries:fixedInventory.entries.length,totalBytes:fixedInventory.totalBytes});
 let nextSequence=1,pending=Buffer.alloc(0),admission=true,phase='open',active=null,preview=null,suppress=false,transportOpen=true,outputOpen=true,closing=null,writeTail=Promise.resolve(),resolveClosed,closeReply=null;
 const closed=new Promise(r=>{resolveClosed=r;}),keeper=setInterval(()=>{},3600000);keeper.unref();
 const bounded=async work=>{let timer;try{return await Promise.race([work,new Promise(r=>{timer=setTimeout(()=>r({status:'blocked',resourcesReleased:false,code:'SEP_INSTALLER_SESSION_CLOSE_DEADLINE'}),closeDeadlineMs);})]);}finally{clearTimeout(timer);}};
 const blockReceipt=code=>({status:'blocked',resourcesReleased:false,code});
 function encode(sequence,fields){const value={protocol:1,nonce,sequence,...fields},bytes=Buffer.from(JSON.stringify(value)+'\n');const reader=createResponseReader({nonce,sequence});reader.push(bytes);reader.finish();return bytes;}
 function send(sequence,fields){
  const bytes=encode(sequence,fields);
  const work=writeTail.then(()=>new Promise(resolve=>{
   if(!outputOpen||output.destroyed||output.writableEnded)return resolve(false);
   try{output.write(bytes,e=>{if(e){outputOpen=false;transportFault();resolve(false);}else resolve(true);});}catch{outputOpen=false;transportFault();resolve(false);}
  }));writeTail=work.catch(()=>false);return work;
 }
 function close(){
  admission=false;pending=Buffer.alloc(0);preview=null;if(phase==='closed')return Promise.resolve({status:'pass',resourcesReleased:true});
  if(phase!=='blocked')phase='closing';keeper.ref();
  if(!closing){
   const inFlight=active;
   const attempt=(async()=>{
    if(inFlight)await inFlight;
    const first=await controller.close();if(!released(first))return blockReceipt(safe(first));
    const last=await controller.whenClosed();if(!released(last))return blockReceipt('SEP_INSTALLER_CLEANUP_UNCONFIRMED');
    if(closeReply&&!closeReply.claimed){closeReply.claimed=true;await send(closeReply.sequence,{status:'pass',phase:'closed',resourcesReleased:true});}
    await writeTail;
    phase='closed';clearInterval(keeper);input.off('data',onData);input.off('end',onEnd);input.off('close',onInputClose);
    const receipt={status:'pass',resourcesReleased:true};resolveClosed(receipt);return receipt;
   })().catch(e=>blockReceipt(safe(e)));
   closing=attempt;
   void attempt.then(r=>{if(!released(r)){phase='blocked';if(closing===attempt)closing=null;}});
  }
  return bounded(closing).then(r=>{if(!released(r)&&phase!=='closed')phase='blocked';return r;});
 }
 function transportFault(){if(!transportOpen)return;transportOpen=false;suppress=true;admission=false;void close();}
 function reject(sequence,code){
  suppress=true;admission=false;preview=null;
  if(outputOpen)try{void send(sequence,{status:'blocked',phase:'blocked',code}).finally(()=>{void close();});}catch{void close();}
  else void close();
 }
 async function dispatch(r){
  if(r.operation==='preview'){
   const value=await controller.preview();if(value?.status!=='pass'||value.phase!=='preview'||value.planHash!==value.plan?.planHash)fail('SEP_INSTALLER_SESSION_RESULT');
   const plan=value.plan,summary={planHash:plan.planHash,transactionId:plan.transactionId,target:plan.target,dataRoot:plan.dataRoot,entries:inventory.entries,totalBytes:inventory.totalBytes,createApplications:plan.actions?.createApplications};
   encode(r.sequence,{status:'pass',phase:'preview',preview:summary});preview=clone(summary);return {status:'pass',phase:'preview',preview:summary};
  }
  if(r.operation==='confirm'||r.operation==='cancel'){
   if(!preview||preview.planHash!==r.input.planHash)fail('SEP_INSTALLER_CONFIRMATION_MISMATCH');
   const approved=preview;preview=null; // Consumed before any asynchronous dispatch.
   const value=await controller[r.operation]({planHash:approved.planHash});
   if(r.operation==='cancel'){if(value?.status!=='pass'||value.phase!=='cancelled')fail('SEP_INSTALLER_SESSION_RESULT');return {status:'pass',phase:'cancelled'};}
   if(value?.transactionId!==approved.transactionId||value?.target!==approved.target||value?.planHash!==approved.planHash)fail('SEP_INSTALLER_SESSION_RESULT');
   return committed(value);
  }
  if(r.operation==='resume'){
   preview=null;const value=await controller.resume({transactionId:r.input.transactionId});if(value?.transactionId!==r.input.transactionId)fail('SEP_INSTALLER_SESSION_RESULT');return committed(value);
  }
  const result=await controller.listRecovery();if(result?.status!=='pass'||!Array.isArray(result.entries)||result.entries.length>64)fail('SEP_INSTALLER_SESSION_RESULT');
  const recoveries=result.entries.map(row=>{
   if(row?.status==='blocked'&&row.recoverable===false)return {transactionId:row.transactionId,phase:'blocked',code:row.code};
   if(row?.status!=='pass'||row.recoverable!==true||!['planned','executing','committed'].includes(row.phase))fail('SEP_INSTALLER_SESSION_RESULT');
   return {transactionId:row.transactionId,phase:row.phase};
  });return {status:'pass',phase:'recovery-list',recoveries};
 }
 function committed(value){if(value?.status!=='pass'||value.phase!=='committed'||value.applicationStarted!==false)fail('SEP_INSTALLER_SESSION_RESULT');return {status:'pass',phase:'committed',installation:{target:value.target,transactionId:value.transactionId,applicationStarted:false}};}
 function accept(r){
  if(r.operation==='close'){
   admission=false;preview=null;closeReply={sequence:r.sequence,claimed:false};
   // The request itself is not entered into active: close waits only previously
   // accepted controller work, never on its own response promise.
   void close().then(receipt=>{if(!released(receipt)&&!closeReply.claimed){closeReply.claimed=true;return send(r.sequence,{status:'blocked',phase:'blocked',code:safe(receipt)});}}).catch(()=>transportFault());return;
  }
  const operation=(async()=>{
   try{const fields=await dispatch(r);if(!suppress)await send(r.sequence,fields);}catch(e){if(!suppress)await send(r.sequence,{status:'blocked',phase:'blocked',code:safe(e)});}
  })();active=operation;
  void operation.catch(()=>transportFault()).finally(()=>{if(active===operation)active=null;});
 }
 function onData(chunk){
  if(!admission)return;
  if(!Buffer.isBuffer(chunk)||pending.length+chunk.length>4096){reject(nextSequence,'SEP_INSTALLER_UI_PROTOCOL');return;}
  pending=Buffer.concat([pending,chunk]);const end=pending.indexOf(10);if(end===-1)return;
  // Pipelined requests are not queued, including two frames in one OS chunk.
  let r;try{r=decodeRequest(pending,{nonce,sequence:nextSequence});}catch(e){pending=Buffer.alloc(0);reject(nextSequence,safe(e));return;}
  pending=Buffer.alloc(0);nextSequence++;
  if(active){reject(r.sequence,'SEP_INSTALLER_SESSION_BUSY');return;}
  accept(r);
 }
 function onEnd(){transportFault();}function onInputClose(){if(phase!=='closed')transportFault();}
 input.on('data',onData);input.once('end',onEnd);input.once('close',onInputClose);input.on('error',transportFault);output.on('error',()=>{outputOpen=false;transportFault();});output.once('close',()=>{outputOpen=false;if(phase!=='closed')transportFault();});
 return Object.freeze({close,whenClosed:()=>closed,status:()=>({phase,admission,accepted:active!==null,transportOpen,resourcesReleased:phase==='closed'})});
}
