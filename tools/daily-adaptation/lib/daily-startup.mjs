import {createHash} from 'node:crypto';
import {open,lstat,realpath,readdir} from 'node:fs/promises';
import {isAbsolute,join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const approved=new WeakMap();
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=code=>{throw Object.assign(Error(code),{code});};
const same=(a,b)=>process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b;
const keys=(value,names)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===names.length&&names.every(key=>Object.hasOwn(value,key));
const validHash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
function absolute(value){if(typeof value!=='string'||!isAbsolute(value)||value.startsWith('\\\\')||/[\x00-\x1f]/.test(value)||value.slice(2).includes(':'))fail('SEP_DAILY_PATH_INVALID');return resolve(value);}
function frozen(value){if(value&&typeof value==='object'){Object.values(value).forEach(frozen);Object.freeze(value);}return value;}
async function bytesAt(file,limit){
 const path=absolute(file);let handle;
 try{
  if(!same(await realpath(path),path))fail('SEP_DAILY_PATH_INVALID');
  const before=await lstat(path,{bigint:true});
  if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1n||!before.ino||!before.dev||before.size>BigInt(limit))fail('SEP_DAILY_PATH_INVALID');
  handle=await open(path,'r');const opened=await handle.stat({bigint:true});
  const identify=s=>[s.dev,s.ino,s.size,s.mtimeNs,s.ctimeNs].join(':');
  if(identify(opened)!==identify(before))fail('SEP_DAILY_PATH_INVALID');
  const buffer=Buffer.alloc(Number(before.size)+1);let length=0;
  while(length<buffer.length){const read=await handle.read(buffer,length,buffer.length-length,length);if(!read.bytesRead)break;length+=read.bytesRead;}
  const after=await lstat(path,{bigint:true});
  if(length!==Number(before.size)||identify(after)!==identify(before)||!same(await realpath(path),path))fail('SEP_DAILY_PATH_INVALID');
  return buffer.subarray(0,length);
 }finally{await handle?.close();}
}

/** Read a launcher-selected, hash-confirmed cold configuration. No data root,
 * credentials, ledger, process or Loader entry is initialized by this review.
 * The trusted launcher owns the persistent host lease and selects the hash
 * from its committed deployment, never from an Agent or a downloaded file.
 * Program bindings must cover the complete installed graph in a final plan;
 * this adapter only verifies the supplied bindings and makes no closure claim.
 * @param input - exact local selection path and externally approved hash.
 * @returns opaque reviewed selection; its capabilities are process-local. */
export async function readDailySelection(input){
 if(!keys(input,['path','sha256'])||!validHash(input.sha256))fail('SEP_DAILY_SELECTION_INVALID');
 const path=absolute(input.path),bytes=await bytesAt(path,1024*1024);
 if(sha(bytes)!==input.sha256)fail('SEP_DAILY_SELECTION_CHANGED');
 let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{fail('SEP_DAILY_SELECTION_INVALID');}
 const fields=['schema','dsh','sep','bundleRoot','nativeCompactionEntryKey','configuration','bindings'];
 if(value?.schema===2)fields.push('dailyAdapterRoot');
 if(!keys(value,fields)||![1,2].includes(value.schema)||value.dsh!=='0.2.1-alpha.1'||value.sep!=='0.2.1-beta.3-bundle.24'||typeof value.nativeCompactionEntryKey!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(value.nativeCompactionEntryKey)||!value.configuration||typeof value.configuration!=='object'||Array.isArray(value.configuration)||!value.configuration.runtime?.compaction||Object.hasOwn(value.configuration.runtime.compaction,'nativeEntryId')||!Array.isArray(value.bindings)||value.bindings.length<1||value.bindings.length>100000)fail('SEP_DAILY_SELECTION_INVALID');
 value.bundleRoot=absolute(value.bundleRoot);
 if(!same(await realpath(value.bundleRoot),value.bundleRoot))fail('SEP_DAILY_PATH_INVALID');
 const seen=new Set();for(const binding of value.bindings){
  if(!keys(binding,['path','sha256'])||!validHash(binding.sha256))fail('SEP_DAILY_SELECTION_INVALID');
  binding.path=absolute(binding.path);const key=process.platform==='win32'?binding.path.toLowerCase():binding.path;
  if(seen.has(key))fail('SEP_DAILY_SELECTION_INVALID');seen.add(key);
  if(sha(await bytesAt(binding.path,64*1024*1024))!==binding.sha256)fail('SEP_DAILY_PROGRAM_CHANGED');
 }
 const manifestPath=join(value.bundleRoot,'package.json');
 if(!value.bindings.some(binding=>same(binding.path,manifestPath)))fail('SEP_DAILY_SELECTION_INVALID');
 const manifest=JSON.parse(await bytesAt(manifestPath,1024*1024));
 if(manifest.name!=='dsh-sep-bundle'||manifest.version!==value.sep||manifest.exports?.['./native-settings-installation']!=='./bundle/lib/native-settings-installation.js')fail('SEP_DAILY_PROGRAM_CHANGED');
 let entryPath=join(value.bundleRoot,'bundle/lib/native-settings-installation.js');
 if(value.schema===2){
  value.dailyAdapterRoot=absolute(value.dailyAdapterRoot);
  if(!same(await realpath(value.dailyAdapterRoot),value.dailyAdapterRoot))fail('SEP_DAILY_PATH_INVALID');
  const required=['package.json','ORIGIN.json','native-settings-installation.js','settings-runtime.js','protected-profile.js','protected-file-tools.js','file-protection.js','project-binding.js'];
  const listed=await readdir(value.dailyAdapterRoot,{withFileTypes:true});
  if(listed.some(row=>row.name!=='node_modules'&&!required.includes(row.name))||required.some(name=>!listed.some(row=>row.name===name&&row.isFile())||!value.bindings.some(binding=>same(binding.path,join(value.dailyAdapterRoot,name)))))fail('SEP_DAILY_SELECTION_INVALID');
  const adapter=JSON.parse(await bytesAt(join(value.dailyAdapterRoot,'package.json'),1024*1024));
  if(adapter.name!=='dsh-sep-daily-alpha1-adapter'||adapter.version!=='0.1.0'||adapter.dsh!==value.dsh||adapter.sep!==value.sep||adapter.main!=='./native-settings-installation.js')fail('SEP_DAILY_PROGRAM_CHANGED');
  entryPath=join(value.dailyAdapterRoot,'native-settings-installation.js');
 }
 const result=frozen({configuration:value.configuration,nativeCompactionEntryKey:value.nativeCompactionEntryKey,dsh:value.dsh,sep:value.sep});
 approved.set(result,{path,hash:input.sha256,value,entryPath});return result;
}

/** Mount the already-reviewed cold root through its real official Loader.
 * Fresh inner plan hashes are reviewed and consumed in this process only;
 * they never replace the persistent outer deployment confirmation. No live
 * providers are silently removed and no empty ledger or P2 root is minted.
 * A blocked cleanup retains the non-admitting owner for controlled recovery.
 * @param ctx - explicitly dedicated alpha.1 host with prepared prerequisites.
 * @param selection - opaque result of readDailySelection.
 * @returns active controls or a blocked, non-admitting cleanup receipt. */
export async function startDailyInstallation(ctx,selection){
 const record=approved.get(selection);if(!record)fail('SEP_DAILY_SELECTION_INVALID');
 if(!ctx?.loader||ctx.get('sepControlledInstallation')||ctx.get('suiteEnhancements')||ctx.agents.list().length||ctx.sessions.list().length)fail('SEP_DAILY_HOST_NOT_COLD');
 const revalidate=()=>readDailySelection({path:record.path,sha256:record.hash});
 await revalidate();
 // Loader Entry IDs are process-local. Persist the reviewed logical row key,
 // then bind exactly one current row; never persist a previous process's ID.
 const natives=[...ctx.loader.entries()].filter(entry=>entry.options.id===selection.nativeCompactionEntryKey);
 if(natives.length!==1)fail('SEP_DAILY_NATIVE_ROW_UNAVAILABLE');
 const configuration=structuredClone(selection.configuration);configuration.runtime.compaction.nativeEntryId=natives[0].id;
 const entryId='sep-daily-controlled-root';
 if([...ctx.loader.entries()].some(entry=>entry.options.id===entryId))fail('SEP_DAILY_HOST_NOT_COLD');
 let entry,installation;
 async function close(){
  if(!installation){await entry?.fiber?.dispose();return {status:'pass',resourcesRetained:false};}
  const receipt=await installation.close();
  if(receipt.status==='pass')await entry?.fiber?.dispose();
  return receipt;
 }
 try{
  await ctx.loader.create({id:entryId,name:pathToFileURL(record.entryPath).href,config:configuration});
  await ctx.loader.await();entry=ctx.loader.resolve(entryId);installation=ctx.get('sepControlledInstallation');
  if(installation?.status().phase!=='ready')fail('SEP_DAILY_INITIALIZATION_BLOCKED');
  await revalidate();const plan=await installation.review();await installation.activate({planHash:plan.planHash});
  if(installation.status().phase!=='active')fail('SEP_DAILY_INITIALIZATION_BLOCKED');
  return Object.freeze({status:'pass',businessAdmitted:true,entry,installation,close});
 }catch(error){
  installation??=ctx.get('sepControlledInstallation');entry??=[...ctx.loader.entries()].find(row=>row.options.id===entryId);
  const initialization=installation?.status();
  const cleanup=await close();
  return Object.freeze({status:'blocked',businessAdmitted:false,code:/^[A-Z][A-Z0-9_]{0,79}$/.test(error?.code??'')?error.code:'SEP_DAILY_INITIALIZATION_BLOCKED',initialization,cleanup,entry,installation,close});
 }
}
