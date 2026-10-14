// Private parent/child transport contract. No HTTP or public model entry.
const fail=(code='SEP_INSTALLER_UI_PROTOCOL')=>{throw Object.assign(Error(code),{code});};
const exact=(v,keys)=>v&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).sort().join('\0')===[...keys].sort().join('\0');
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const transaction=v=>typeof v==='string'&&/^[a-f0-9]{32}$/.test(v);
const sequence=v=>Number.isSafeInteger(v)&&v>=1&&v<=10000;
const code=v=>typeof v==='string'&&/^SEP_[A-Z0-9_]{1,90}$/.test(v);
const path=v=>typeof v==='string'&&v.startsWith('/')&&v.length<=2048&&!/[\x00-\x1f\x7f]/u.test(v);
function binding(value,expected){
 if(value.protocol!==1||!digest(value.nonce)||!sequence(value.sequence))fail();
 if(expected&&(!digest(expected.nonce)||!sequence(expected.sequence)||value.nonce!==expected.nonce||value.sequence!==expected.sequence))fail('SEP_INSTALLER_UI_BINDING');
}
function request(value){
 if(!exact(value,['protocol','nonce','sequence','operation','input']))fail();binding(value);
 if(['preview','listRecovery','close'].includes(value.operation)){if(!exact(value.input,[]))fail();}
 else if(['confirm','cancel'].includes(value.operation)){if(!exact(value.input,['planHash'])||!digest(value.input.planHash))fail();}
 else if(value.operation==='resume'){if(!exact(value.input,['transactionId'])||!transaction(value.input.transactionId))fail();}
 else fail();return value;
}
function parse(bytes,max){
 if(!Buffer.isBuffer(bytes)||bytes.length===0||bytes.length>max||bytes.at(-1)!==10||bytes.indexOf(10)!==bytes.length-1)fail();
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(0,-1)));}catch{fail();}
}
export function encodeRequest(value){const bytes=Buffer.from(JSON.stringify(request(value))+'\n');if(bytes.length>4096)fail();return bytes;}
export function decodeRequest(bytes,expected){if(!exact(expected,['nonce','sequence']))fail('SEP_INSTALLER_UI_BINDING');const value=request(parse(bytes,4096));binding(value,expected);return value;}
function response(value,expected){
 const base=['protocol','nonce','sequence','status','phase'];
 if(!value||!['pass','blocked','fail'].includes(value.status))fail();binding(value,expected);
 if(value.status!=='pass'){
  if(!exact(value,[...base,'code'])||value.phase!=='blocked'||!code(value.code))fail();return value;
 }
 if(value.phase==='cancelled'){if(!exact(value,base))fail();}
 else if(value.phase==='closed'){if(!exact(value,[...base,'resourcesReleased'])||value.resourcesReleased!==true)fail();}
 else if(value.phase==='preview'){
  const p=value.preview;if(!exact(value,[...base,'preview'])||!exact(p,['planHash','transactionId','target','dataRoot','entries','totalBytes','createApplications'])||!digest(p.planHash)||!transaction(p.transactionId)||!path(p.target)||!path(p.dataRoot)||!Number.isSafeInteger(p.entries)||p.entries<1||p.entries>100000||!Number.isSafeInteger(p.totalBytes)||p.totalBytes<0||p.totalBytes>8589934592||typeof p.createApplications!=='boolean')fail();
 }else if(value.phase==='committed'){
  const p=value.installation;if(!exact(value,[...base,'installation'])||!exact(p,['target','transactionId','applicationStarted'])||!path(p.target)||!transaction(p.transactionId)||p.applicationStarted!==false)fail();
 }else if(value.phase==='recovery-list'){
  if(!exact(value,[...base,'recoveries'])||!Array.isArray(value.recoveries)||value.recoveries.length>64)fail();const seen=new Set();
  for(const row of value.recoveries){if(!row||!exact(row,row.phase==='blocked'?['transactionId','phase','code']:['transactionId','phase'])||!transaction(row.transactionId)||seen.has(row.transactionId)||!['confirmed','planned','executing','committed','blocked'].includes(row.phase)||(row.phase==='blocked'&&!code(row.code)))fail();seen.add(row.transactionId);}
 }else fail();return value;
}
export function createResponseReader(expected){
 if(!exact(expected,['nonce','sequence'])||!digest(expected.nonce)||!sequence(expected.sequence))fail('SEP_INSTALLER_UI_BINDING');
 expected=Object.freeze({nonce:expected.nonce,sequence:expected.sequence});
 let pending=Buffer.alloc(0),complete=false,poisoned=false;
 return Object.freeze({
  push(chunk){
   try{
    if(poisoned||complete||!Buffer.isBuffer(chunk)||pending.length+chunk.length>16384)fail();
    pending=Buffer.concat([pending,chunk]);if(pending.indexOf(10)===-1)return null;
    const value=response(parse(pending,16384),expected);complete=true;pending=Buffer.alloc(0);return value;
   }catch(e){poisoned=true;pending=Buffer.alloc(0);throw e;}
  },
  finish(){if(poisoned)fail();if(!complete||pending.length){poisoned=true;pending=Buffer.alloc(0);fail('SEP_INSTALLER_UI_INCOMPLETE');}return true;},
 });
}
