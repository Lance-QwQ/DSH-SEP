import {lstat,realpath,open,mkdir,writeFile} from 'node:fs/promises';
import {join,resolve,dirname,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const fail=code=>{throw Object.assign(Error(code),{code});};
const hash=b=>createHash('sha256').update(b).digest('hex');
const key=p=>process.platform==='win32'?resolve(p).toLowerCase():resolve(p);
const same=(a,b)=>key(a)===key(b);
const inside=(parent,child)=>key(child).startsWith(key(parent)+(process.platform==='win32'?'\\':'/'));
export function validateRows(files) {
 if(!Array.isArray(files)||!files.length||files.length>100000)fail('PACKAGE_FILE_RECORD_INVALID');
 const seen=new Set();
 for(const row of files){
  const path=row?.path;
  if(typeof path!=='string'||path.includes('\\')||path.includes(':')||/[\x00-\x1f\x7f]/.test(path)||path.split('/').some(x=>!x||x==='.'||x==='..'||/[. ]$/.test(x)||/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(x)))fail('PACKAGE_PATH_INVALID');
  if(!Number.isSafeInteger(row.size)||row.size<0||row.size>268435456||!/^[a-f0-9]{64}$/.test(row.sha256??'')||row.mode!==420)fail('PACKAGE_FILE_RECORD_INVALID');
  if(seen.has(path.toLowerCase()))fail('PACKAGE_DUPLICATE_PATH');seen.add(path.toLowerCase());
 }
 for(const path of seen){const parts=path.split('/');for(let i=1;i<parts.length;i++)if(seen.has(parts.slice(0,i).join('/')))fail('PACKAGE_DUPLICATE_PATH');}
 return files;
}
export function portableImports(input,fromRoot) {
 let text=input;const transforms=[];
 for(const match of input.matchAll(/from '(file:[^']+)'/g)){
  let path;try{path=fileURLToPath(match[1]);}catch{fail('PACKAGE_EXTERNAL_IMPORT');}
  if(!inside(fromRoot,path))fail('PACKAGE_EXTERNAL_IMPORT');
  const local=relative(fromRoot,path).replaceAll('\\','/');
  if(!local.startsWith('node_modules/dsh-sep-bundle/bundle/'))fail('PACKAGE_EXTERNAL_IMPORT');
  const to="from '../"+local+"'",from=match[0];
  if(text.split(from).length!==2)fail('PACKAGE_EXTERNAL_IMPORT');
  text=text.replace(from,to);transforms.push({from,to});
 }
 if(/file:\/\//i.test(text))fail('PACKAGE_EXTERNAL_IMPORT');
 return {text,transforms};
}
function checkFile(st){if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1n||st.ino===0n)fail('PACKAGE_SOURCE_IDENTITY');}
function identity(a,b){return ['dev','ino','size','mtimeNs','ctimeNs','nlink'].every(k=>a[k]===b[k]);}
export async function stableBytes(path,row){
 const before=await lstat(path,{bigint:true});checkFile(before);
 if(!same(await realpath(path),path))fail('PACKAGE_SOURCE_IDENTITY');
 if(before.size!==BigInt(row.size))fail('PACKAGE_SOURCE_CHANGED');
 const fd=await open(path,'r');
 try{
  const opened=await fd.stat({bigint:true});checkFile(opened);if(!identity(before,opened))fail('PACKAGE_SOURCE_CHANGED');
  const bytes=Buffer.alloc(row.size+1);let used=0;
  while(used<bytes.length){const {bytesRead}=await fd.read(bytes,used,bytes.length-used,used);if(!bytesRead)break;used+=bytesRead;}
  const after=await fd.stat({bigint:true}),named=await lstat(path,{bigint:true});checkFile(after);checkFile(named);
  if(used!==row.size||!identity(before,after)||!identity(after,named)||!same(await realpath(path),path)||hash(bytes.subarray(0,used))!==row.sha256)fail('PACKAGE_SOURCE_CHANGED');
  return bytes.subarray(0,used);
 }finally{await fd.close();}
}
export async function copyVerifiedProgram({source,out,files}) {
 validateRows(files);
 if(!isAbsolute(source)||!isAbsolute(out)||same(source,out)||inside(source,out)||inside(out,source))fail('PACKAGE_DESTINATION_INVALID');
 if(!same(await realpath(source),source)||!same(await realpath(dirname(out)),dirname(out)))fail('PACKAGE_DESTINATION_INVALID');
 try{await lstat(out);fail('PACKAGE_DESTINATION_INVALID');}catch(e){if(e.code!=='ENOENT')throw e;}
 await mkdir(out);let bytes=0;
 for(const row of files){
  const body=await stableBytes(join(source,row.path),row),target=join(out,row.path);
  await mkdir(dirname(target),{recursive:true});if(!same(await realpath(dirname(target)),dirname(target)))fail('PACKAGE_DESTINATION_INVALID');
  await writeFile(target,body,{flag:'wx',mode:row.mode});bytes+=body.length;
 }
 return {files:files.length,bytes};
}
