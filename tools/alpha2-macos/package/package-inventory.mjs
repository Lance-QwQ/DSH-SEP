import {constants} from 'node:fs';
import {lstat,open,readdir,readlink,realpath} from 'node:fs/promises';
import {resolve,join,relative,isAbsolute,dirname} from 'node:path';
import {createHash} from 'node:crypto';
const fail=code=>{throw Object.assign(Error(code),{code});};
const hash=value=>createHash('sha256').update(value).digest('hex');
const identity=s=>[s.dev,s.ino,s.size,s.mode,s.nlink,s.mtimeNs,s.ctimeNs].join(':');
const same=(a,b)=>identity(a)===identity(b);
const inside=(root,path)=>path===root||path.startsWith(root+'/');
/** Artifact inventory only: the authenticated release/checkpoint binds this
 * receipt. It is not a replacement for runtime sandbox or process ownership. */
export async function inventoryPackage(input){
 if(typeof input!=='string'||!isAbsolute(input)||resolve(input)!==input)fail('SEP_MAC_PACKAGE_ROOT');
 const root=input,initial=await lstat(root,{bigint:true});
 if(!initial.isDirectory()||initial.isSymbolicLink()||await realpath(root)!==root)fail('SEP_MAC_PACKAGE_ROOT');
 const entries=[];let totalBytes=0;
 async function visit(path,depth){
  if(depth>64||entries.length>100000)fail('SEP_MAC_PACKAGE_LIMIT');
  const before=await lstat(path,{bigint:true}),name=relative(root,path).split('\\').join('/');
  if(before.isSymbolicLink()){
   const target=await readlink(path);if(isAbsolute(target)||target.includes('\\')||/[\x00-\x1f\x7f]/u.test(target)||!inside(root,resolve(dirname(path),target)))fail('SEP_MAC_PACKAGE_LINK');
   let actual;try{actual=await realpath(path);}catch{fail('SEP_MAC_PACKAGE_LINK');}
   if(!inside(root,actual)||!same(before,await lstat(path,{bigint:true})))fail('SEP_MAC_PACKAGE_LINK');
   entries.push({path:name,kind:'link',target});return;
  }
  if(await realpath(path)!==path)fail('SEP_MAC_PACKAGE_CHANGED');
  if(before.isDirectory()){
   if(name)entries.push({path:name,kind:'directory',mode:Number(before.mode&0o7777n)});
   const names=(await readdir(path)).sort();for(const child of names){if(/[\x00-\x1f\x7f\\]/u.test(child))fail('SEP_MAC_PACKAGE_PATH');await visit(join(path,child),depth+1);}
   if(!same(before,await lstat(path,{bigint:true}))||JSON.stringify(names)!==JSON.stringify((await readdir(path)).sort()))fail('SEP_MAC_PACKAGE_CHANGED');return;
  }
  if(!before.isFile()||before.size>2147483648n||before.size<0n)fail('SEP_MAC_PACKAGE_TYPE');
  totalBytes+=Number(before.size);if(totalBytes>8589934592)fail('SEP_MAC_PACKAGE_LIMIT');
  const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW),digest=createHash('sha256');let size=0;
  try{
   if(!same(before,await file.stat({bigint:true})))fail('SEP_MAC_PACKAGE_CHANGED');
   const buffer=Buffer.alloc(65536);while(true){const {bytesRead}=await file.read(buffer,0,buffer.length,size);if(!bytesRead)break;size+=bytesRead;if(size>Number(before.size))fail('SEP_MAC_PACKAGE_CHANGED');digest.update(buffer.subarray(0,bytesRead));}
   if(size!==Number(before.size)||!same(before,await file.stat({bigint:true}))||!same(before,await lstat(path,{bigint:true})))fail('SEP_MAC_PACKAGE_CHANGED');
  }finally{await file.close();}
  entries.push({path:name,kind:'file',size,mode:Number(before.mode&0o7777n),executable:!!(before.mode&0o111n),sha256:digest.digest('hex')});
 }
 await visit(root,0);if(!same(initial,await lstat(root,{bigint:true})))fail('SEP_MAC_PACKAGE_CHANGED');
 return {schema:1,entries,totalBytes,treeSha256:hash(JSON.stringify(entries))};
}
export async function verifyPackage(root,receipt){
 if(receipt?.schema!==1||!Array.isArray(receipt.entries)||receipt.entries.length>100000||!Number.isSafeInteger(receipt.totalBytes)||receipt.totalBytes<0||!(/^[a-f0-9]{64}$/u.test(receipt.treeSha256??''))||hash(JSON.stringify(receipt.entries))!==receipt.treeSha256)fail('SEP_MAC_PACKAGE_RECEIPT');
 const actual=await inventoryPackage(root);if(actual.treeSha256!==receipt.treeSha256||actual.totalBytes!==receipt.totalBytes)fail('SEP_MAC_PACKAGE_CHANGED');return {status:'pass',treeSha256:actual.treeSha256,entries:actual.entries.length,totalBytes:actual.totalBytes};
}
