import{readFile,lstat}from'node:fs/promises';import{join,isAbsolute,resolve}from'node:path';import{createHash}from'node:crypto';import{fail}from'../errors.js';
const sha=b=>createHash('sha256').update(b).digest('hex');
const key=p=>process.platform==='win32'?resolve(p).toLowerCase():resolve(p);
// An explicit, offline rename receipt preserves the original journal identity.
// It cannot admit a copied/recreated directory: the original identity must still
// equal SHA256(original path + the current physical dev/ino), and the pinned
// approval record must remain in the unchanged, fully verified journal chain.
export async function storageIdentity({storageRoot,locationKey,root}){
  const normal=sha(`${key(storageRoot)}\n${locationKey}`),file=join(root,'storage-location.json');let before;
  try{before=await lstat(file,{bigint:true});}catch(e){if(e.code==='ENOENT')return normal;throw e;}
  try{
    if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1n||before.size>16384n)throw Error();
    const bytes=await readFile(file),after=await lstat(file,{bigint:true});
    if(['dev','ino','size','mtimeNs','ctimeNs'].some(k=>before[k]!==after[k]))throw Error();
    const r=JSON.parse(bytes),keys=['schema','kind','fromRoot','toRoot','fileId','identity','approvedHead'];
    if(Object.keys(r).length!==keys.length||keys.some(k=>!Object.hasOwn(r,k))||r.schema!==1||r.kind!=='same-directory-rename'||!isAbsolute(r.fromRoot??'')||!isAbsolute(r.toRoot??'')||key(r.toRoot)!==key(storageRoot)||key(r.fromRoot)===key(r.toRoot)||r.fileId!==locationKey||!/^[a-f0-9]{64}$/.test(r.identity??'')||sha(`${key(r.fromRoot)}\n${locationKey}`)!==r.identity)throw Error();
    if(!Number.isSafeInteger(r.approvedHead?.seq)||r.approvedHead.seq<1||!/^[a-f0-9]{64}$/.test(r.approvedHead.hash??''))throw Error();
    const lines=(await readFile(join(root,'journal.jsonl'),'utf8')).trimEnd().split('\n'),line=JSON.parse(lines[r.approvedHead.seq-1]??'null');
    if(!line||line.seq!==r.approvedHead.seq||line.hash!==r.approvedHead.hash||line.identity!==r.identity)throw Error();
    const{hash,...body}=line;if(sha(JSON.stringify(body))!==hash)throw Error();
    return r.identity;
  }catch{fail('P2_STORAGE_RELOCATION_INVALID','Approved storage rename does not match this directory and journal');}
}
