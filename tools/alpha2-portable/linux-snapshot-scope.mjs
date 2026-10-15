// Trusted readers use the same verified candidate as the namespace tools.
// File identity is the real snapshot inode; directory presentation stays at
// the logical workspace so Scope and P1 retain a stable project memory key.
import {open,lstat} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve,relative,isAbsolute,join,dirname,basename} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {owned} from './bundle-modules.mjs';
const {Scope}=await owned('modules/system-enhancement-package/src/scope.js');
const fail=code=>{throw Object.assign(Error(code),{code});};
const version=s=>`${s.dev}:${s.ino}:${s.size}:${s.mtimeNs}:${s.ctimeNs}`;
export async function createSnapshotScope({source,view,sources,workingDirectory,userProfile}){
 const targets=new WeakMap();
 const get=target=>{const saved=targets.get(target);if(!saved)fail('UNAUTHORIZED');return saved;};
 async function fresh(target,signal){signal?.throwIfAborted();const saved=get(target);if((await view()).version!==saved.view.version)fail('SOURCE_CHANGED');return saved;}
 const fs={
  async resolve(input,{signal}={}){signal?.throwIfAborted();const displayPath=resolve(source,input),part=relative(source,displayPath);if(part==='..'||part.startsWith('../')||isAbsolute(part))fail('UNAUTHORIZED');const snapshot=await view(),row=part?snapshot.entries.find(x=>x.path===part):{kind:'directory'};const physical=join(snapshot.path,part);const target=Object.freeze({displayPath,targetKey:row?.kind==='file'?physical:displayPath});targets.set(target,{part,view:snapshot,row,physical});return target;},
  processPath(target){const s=get(target);return s.row?.kind==='file'?s.physical:target.displayPath;},
  fileUrl(target){return pathToFileURL(fs.processPath(target)).href;},
  contains(a,b){get(a);get(b);const r=relative(a.displayPath,b.displayPath);return r===''||r!=='..'&&!r.startsWith('../')&&!isAbsolute(r);},
  async stat(target,signal){const s=await fresh(target,signal);if(!s.row)return undefined;if(s.row.kind!=='file')return {type:'directory',version:s.view.version};const stat=await lstat(s.physical,{bigint:true});if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1n||stat.size!==BigInt(s.row.size))fail('SOURCE_CHANGED');return {type:'file',size:Number(stat.size),version:version(stat)};},
  async lstat(input,opts,signal){return fs.stat(await fs.resolve(input,{...opts,signal}),signal);},
  async listDir(target,signal){const s=await fresh(target,signal);return Promise.all(s.view.entries.filter(row=>dirname(row.path)===(s.part||'.')).map(async row=>({name:basename(row.path),type:row.kind==='file'?'file':'directory',target:await fs.resolve(join(target.displayPath,basename(row.path)),{signal})})));},
  async readBytes(target,signal,maxBytes){const s=await fresh(target,signal);if(s.row?.kind!=='file')fail('NOT_A_FILE');if(s.row.size>maxBytes)fail('TOO_LARGE');const before=await lstat(s.physical,{bigint:true}),h=await open(s.physical,constants.O_RDONLY|constants.O_NOFOLLOW);try{const held=await h.stat({bigint:true});if(version(before)!==version(held)||held.nlink!==1n)fail('SOURCE_CHANGED');const bytes=await h.readFile();if(version(held)!==version(await lstat(s.physical,{bigint:true}))||createHash('sha256').update(bytes).digest('hex')!==s.row.sha256)fail('SOURCE_CHANGED');await fresh(target,signal);return bytes;}finally{await h.close();}},
 };
 const scope=new Scope(fs,[{root:source,sources,...userProfile?{userProfile}:{}}],{workingDirectory});await scope.init();return scope;
}
