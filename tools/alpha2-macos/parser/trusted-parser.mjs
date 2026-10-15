import {readFile,lstat,realpath,open,mkdtemp} from 'node:fs/promises';
import {constants} from 'node:fs';
import {posix} from 'node:path';
import {createHash} from 'node:crypto';
import {createParserWorker} from './parser-worker.mjs';
const fail=code=>{throw Object.assign(Error(code),{code});};
const hash=x=>createHash('sha256').update(x).digest('hex');
const entries=Object.freeze({'context-python':'a5ecf6c75e891d4973a1e5bf0395f9eb18a632c109e8c1ac3944b865b11bc38d','document-node':'1c2c74f6f57006305969e0b5c51ff0f822861fe4906a3531695ef551bd4b6352'});
const identity=s=>[s.dev,s.ino,s.size,s.mtimeNs,s.ctimeNs,s.nlink,s.mode].join(':');
const inside=(a,b)=>a===b||b.startsWith(a+'/');
const shape=v=>typeof v==='string'&&v.startsWith('/')&&v!=='/'&&posix.normalize(v)===v&&!/[\x00-\x1f\x7f"\\]/u.test(v);
const unknown=e=>/(?:CLEANUP_UNCONFIRMED|RECORD_UNCONFIRMED)$/.test(e?.code??'');
/** Composition-only. Callers cannot supply code, arguments, env or a script.
 * The fixed parser consumes already-authorized data through stdin. */
export async function createTrustedParser(config,io){
 const keys=['kind','runtimeRoot','scratchRoot','authorityRoot','ownerPath','ownerSha256','executable','executableSha256','parserPath','parserSha256'];
 if(!config||Object.getPrototypeOf(config)!==Object.prototype||Object.keys(config).sort().join(',')!==keys.sort().join(',')||!Object.hasOwn(entries,config.kind)||!io||io.lockPath!==posix.join(config.authorityRoot??'','.native.lock')||!['tree','applyFile','directory'].every(k=>typeof io[k]==='function'))fail('SEP_MAC_PARSER_CONFIG');
 for(const name of ['runtimeRoot','scratchRoot','authorityRoot','ownerPath','executable','parserPath'])if(!shape(config[name]))fail('SEP_MAC_PARSER_CONFIG');
 for(const name of ['ownerSha256','executableSha256','parserSha256'])if(!/^[a-f0-9]{64}$/.test(config[name]))fail('SEP_MAC_PARSER_CONFIG');
 if(!inside(config.runtimeRoot,config.parserPath)||!inside(config.runtimeRoot,config.executable))fail('SEP_MAC_PARSER_CONFIG');
 const roots=[config.runtimeRoot,config.scratchRoot,config.authorityRoot];for(let i=0;i<roots.length;i++)for(let j=i+1;j<roots.length;j++)if(inside(roots[i],roots[j])||inside(roots[j],roots[i]))fail('SEP_MAC_PARSER_CONFIG');
 async function verifyEntry(){
  if(config.parserSha256!==entries[config.kind]||await realpath(config.parserPath)!==config.parserPath)fail('SEP_MAC_PARSER_ENTRY_CHANGED');
  const f=await open(config.parserPath,constants.O_RDONLY|constants.O_NOFOLLOW);try{const before=await f.stat({bigint:true});if(!before.isFile()||before.nlink!==1n||before.uid!==BigInt(process.getuid())||(before.mode&0o222n)||before.size>524288n)fail('SEP_MAC_PARSER_ENTRY_CHANGED');const body=await f.readFile();if(hash(body)!==config.parserSha256||identity(before)!==identity(await f.stat({bigint:true}))||identity(before)!==identity(await lstat(config.parserPath,{bigint:true})))fail('SEP_MAC_PARSER_ENTRY_CHANGED');}finally{await f.close();}
 }
 async function directory(path){const held=await io.directory(path,true);let failure,value;try{const s=await held.stat({bigint:true});value=[s.dev,s.ino].join(':');}catch(e){failure=e;}try{await held.close();}catch(e){if(!failure||unknown(e))failure=e;}if(failure)throw failure;return value;}
 await verifyEntry();const scratchIdentity=await directory(config.scratchRoot),authorityIdentity=await directory(config.authorityRoot);
 let closing=false,quarantined=false,tail=Promise.resolve(),closeAttempt,closedReceipt,closedResolve;const abort=new AbortController(),pending=new Set(),closed=new Promise(resolve=>{closedResolve=resolve;});
 const status=()=>Object.freeze({active:pending.size,admissionOpen:!closing&&!quarantined,phase:closedReceipt?'closed':closing?'closing':quarantined?'quarantined':'ready',resourcesConfirmedReleased:Boolean(closedReceipt)});
 function settle(token){pending.delete(token);if(closing&&!pending.size&&!closedReceipt){closedReceipt=Object.freeze({status:'pass',resourcesConfirmedReleased:true,retainedWork:true});closedResolve(closedReceipt);}}
 function rawInput(value){
  if(!value||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).some(k=>!['input','signal'].includes(k))||typeof value.input!=='string'||!value.input.isWellFormed()||value.signal!==undefined&&!(value.signal instanceof AbortSignal))fail('CONTEXT_INVALID_INPUT');
  if(Buffer.byteLength(value.input)>10*1024*1024)fail('CONTEXT_INPUT_LIMIT');return value;
 }
 function documentInput(value){
  if(!value||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).some(k=>!['bytes','extension','signal'].includes(k))||!(value.bytes instanceof Uint8Array)||!['.txt','.md','.csv','.json','.pdf','.docx'].includes(value.extension)||value.signal!==undefined&&!(value.signal instanceof AbortSignal))fail('INVALID_INPUT');
  if(value.bytes.byteLength>8*1024*1024)fail('TOO_LARGE');return {input:JSON.stringify({bytes:Buffer.from(value.bytes).toString('base64'),extension:value.extension}),signal:value.signal};
 }
 function parse(raw){
  let value;try{value=config.kind==='context-python'?rawInput(raw):documentInput(raw);if(closing||quarantined)fail('SEP_MAC_PARSER_CLOSED');if(pending.size>=4)fail('SEP_MAC_PARSER_BUSY');if(value.signal?.aborted)fail(config.kind==='context-python'?'CONTEXT_CANCELLED':'ABORTED');}catch(e){return Promise.reject(e);}
  const token={};pending.add(token);let uncertain=false;
  const operation=tail.then(async()=>{
   if(closing||quarantined)fail('SEP_MAC_PARSER_CLOSED');const signal=AbortSignal.any([abort.signal,...value.signal?[value.signal]:[]]);if(signal.aborted)fail(config.kind==='context-python'?'CONTEXT_CANCELLED':'ABORTED');
   await verifyEntry();if(await directory(config.scratchRoot)!==scratchIdentity||await directory(config.authorityRoot)!==authorityIdentity)fail('SEP_MAC_PARSER_SCOPE_CHANGED');
   const workRoot=await mkdtemp(posix.join(config.scratchRoot,'parse-'));
   if(await directory(config.scratchRoot)!==scratchIdentity)fail('SEP_MAC_PARSER_SCOPE_CHANGED');
   const worker=await createParserWorker({workRoot,runtimeRoot:config.runtimeRoot,authorityRoot:config.authorityRoot,ownerPath:config.ownerPath,ownerSha256:config.ownerSha256,executable:config.executable,executableSha256:config.executableSha256},io);
   const args=config.kind==='context-python'?['-I','-B',config.parserPath]:['--max-old-space-size=192',config.parserPath];
   const receipt=await worker.run({args,stdin:value.input,signal,timeoutMs:config.kind==='context-python'?10000:15000,maxOutputBytes:12*1024*1024,mode:'single'});
   if(!receipt.resourcesConfirmedReleased){uncertain=true;quarantined=true;void worker.whenClosed().then(()=>settle(token));fail('SEP_MAC_PARSER_CLEANUP_UNCONFIRMED');}
   if(receipt.status!=='pass'){
    if(receipt.code==='SEP_MAC_PARSER_CANCELLED')fail(config.kind==='context-python'?'CONTEXT_CANCELLED':'ABORTED');
    if(receipt.code==='SEP_MAC_PARSER_TIMEOUT')fail(config.kind==='context-python'?'CONTEXT_TIMEOUT':'TIMEOUT');
    if(receipt.code==='SEP_MAC_PARSER_OUTPUT_LIMIT')fail(config.kind==='context-python'?'CONTEXT_OUTPUT_LIMIT':'TOO_LARGE');
    const diagnostic=receipt.stderr.trim();if(config.kind==='context-python'&&/^CONTEXT_[A-Z_]{1,72}$/.test(diagnostic))fail(diagnostic);
    if(config.kind==='document-node'&&new Set(['TOO_LARGE','INVALID_INPUT','DAMAGED_PDF','DAMAGED_DOCX','DAMAGED_DOCUMENT','NEEDS_OCR_OR_EMPTY_PDF','PASSWORD_REQUIRED','TOO_MANY_PAGES','INVALID_UTF8','BINARY_TEXT','NO_TEXT','UNSUPPORTED','UNSAFE_XML','TOO_DEEP','TIMEOUT']).has(diagnostic))fail(diagnostic);
    fail(config.kind==='context-python'?'CONTEXT_PARSER_FAILED':'PARSER_FAILED');
   }
   let parsed;try{parsed=JSON.parse(receipt.stdout);}catch{fail(config.kind==='context-python'?'CONTEXT_PARSER_RESPONSE':'PARSER_FAILED');}
   return config.kind==='context-python'?receipt.stdout:parsed;
  });
  tail=operation.catch(()=>{});return operation.catch(e=>{if(unknown(e)){uncertain=true;quarantined=true;}throw e;}).finally(()=>{if(!uncertain)settle(token);});
 }
 function close(){
  closing=true;abort.abort();if(!pending.size)settle(undefined);if(closedReceipt)return Promise.resolve(closedReceipt);if(closeAttempt)return closeAttempt;
  let timer;const attempt=Promise.race([closed,new Promise(resolve=>{timer=setTimeout(()=>resolve(Object.freeze({status:'blocked',code:'SEP_MAC_PARSER_CLOSE_DEADLINE',resourcesConfirmedReleased:false,retainedWork:true,pending:pending.size})),5000);})]).finally(()=>{clearTimeout(timer);if(closeAttempt===attempt)closeAttempt=undefined;});closeAttempt=attempt;return attempt;
 }
 return Object.freeze({[config.kind==='context-python'?'parseContext':'parseDocument']:parse,close,whenClosed:()=>closed,status});
}
