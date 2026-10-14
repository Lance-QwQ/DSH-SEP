import {lstat,realpath,readlink,open,readdir,mkdir,chmod,writeFile,readFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {posix} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const fail=code=>{throw Object.assign(Error(code),{code});},hash=x=>createHash('sha256').update(x).digest('hex');
const digest=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x),inside=(root,p)=>p===root||p.startsWith(root+'/');
const ident=s=>[s.dev,s.ino,s.size,s.mtimeNs,s.ctimeNs,s.mode,s.nlink].join(':');
const pins=Object.freeze({'parsers.js':'13ea4678c4554ee4e422eebff90af760452eeda701571b3686a66b8ccc5f6599','parser-worker.js':'f064624031f0d09511579f288d9fcbf370a2707f6883af0d46adaf973a2f0d6f','errors.js':'bbeb606e67ab37f26515e5ab5848a5120fa4cb1ba7afc12ca1f7c3e0db91bfb3'});
const entries=Object.freeze({'context_resolver.py':'a5ecf6c75e891d4973a1e5bf0395f9eb18a632c109e8c1ac3944b865b11bc38d','document-entry.mjs':'1c2c74f6f57006305969e0b5c51ff0f822861fe4906a3531695ef551bd4b6352'});
function path(p){if(process.platform==='win32'||typeof p!=='string'||!posix.isAbsolute(p)||p==='/'||posix.normalize(p)!==p||/[\x00-\x1f\x7f\\]/.test(p))fail('SEP_PARSER_PATH');return p;}
async function root(p,code='SEP_PARSER_INPUT_ALIAS'){path(p);const s=await lstat(p,{bigint:true});if(!s.isDirectory()||s.isSymbolicLink()||await realpath(p)!==p||s.uid!==BigInt(process.getuid()))fail(code);return s;}
async function readBound(p,{target,expected,installed=false,capture=false,maxBytes=536870912}={}){
 const before=await lstat(p,{bigint:true});if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1n||before.uid!==BigInt(process.getuid())||before.size>BigInt(maxBytes)||(before.mode&0o6000n)||await realpath(p)!==p)fail(installed?'SEP_PARSER_RUNTIME_CHANGED':'SEP_PARSER_INPUT_ALIAS');
 const f=await open(p,constants.O_RDONLY|constants.O_NOFOLLOW),h=createHash('sha256'),chunks=[];let out,total=0;
 try{if(ident(before)!==ident(await f.stat({bigint:true})))fail('SEP_PARSER_INPUT_CHANGED');if(target)out=await open(target,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  const buffer=Buffer.alloc(65536);while(total<=Number(before.size)){const {bytesRead}=await f.read(buffer,0,Math.min(buffer.length,Number(before.size)+1-total),total);if(!bytesRead)break;h.update(buffer.subarray(0,bytesRead));if(capture)chunks.push(Buffer.from(buffer.subarray(0,bytesRead)));if(out){let offset=0;while(offset<bytesRead){const w=await out.write(buffer,offset,bytesRead-offset,total+offset);if(!w.bytesWritten)fail('SEP_PARSER_WRITE_FAILED');offset+=w.bytesWritten;}}total+=bytesRead;}
  const sha256=h.digest('hex');if(total!==Number(before.size)||ident(before)!==ident(await f.stat({bigint:true}))||ident(before)!==ident(await lstat(p,{bigint:true}))||expected&&sha256!==expected)fail('SEP_PARSER_INPUT_CHANGED');
  if(out)await out.sync();return {bytes:total,sha256,mode:(before.mode&0o111n)?365:292,...capture?{body:Buffer.concat(chunks)}:{}};
 }finally{const results=await Promise.allSettled([out?.close(),f.close()]);if(results.some(r=>r.status==='rejected'))fail('SEP_PARSER_IO_CLOSE_UNCONFIRMED');}
}
/** Trusted release-input inventory, not a workspace access primitive. Internal
 * prefix symlinks are materialized; escaping aliases and hardlinks are refused. */
export async function inspectInputTree(input,{copyTo,installed=false,excludeManifest=false}={}){
 const start=await root(input,installed?'SEP_PARSER_RUNTIME_CHANGED':undefined),records=[],seen=new Set();let total=0,count=0;const deadline=Date.now()+300000;
 async function visit(p,rel,depth){if(depth>32||Date.now()>deadline||++count>50000)fail('SEP_PARSER_RUNTIME_LIMIT');let before=await lstat(p,{bigint:true}),resolved=p,alias;
  if(before.isSymbolicLink()){if(installed)fail('SEP_PARSER_RUNTIME_CHANGED');alias=await readlink(p);try{resolved=await realpath(p);}catch{fail('SEP_PARSER_INPUT_ALIAS');}if(!inside(input,resolved))fail('SEP_PARSER_INPUT_ALIAS');}
  const s=await lstat(resolved,{bigint:true});if(s.uid!==BigInt(process.getuid()))fail('SEP_PARSER_INPUT_ALIAS');
  if(s.isDirectory()){
   const key=[s.dev,s.ino].join(':');if(seen.has(key))fail('SEP_PARSER_INPUT_ALIAS');seen.add(key);if(installed&&(s.mode&0o777n)!==0o555n)fail('SEP_PARSER_RUNTIME_CHANGED');
   if(rel){records.push({path:rel,kind:'directory',mode:365});if(copyTo)await mkdir(posix.join(copyTo,rel),{mode:0o700});}
   const names=await readdir(resolved);names.sort();for(const name of names){if(name==='.'||name==='..'||/[\x00-\x1f\x7f\\]/.test(name))fail('SEP_PARSER_INPUT_ALIAS');if(excludeManifest&&!rel&&name==='manifest.json')continue;await visit(posix.join(resolved,name),rel?rel+'/'+name:name,depth+1);}
   if(ident(s)!==ident(await lstat(resolved,{bigint:true})))fail('SEP_PARSER_INPUT_CHANGED');seen.delete(key);
  }else{
   if(!s.isFile())fail('SEP_PARSER_INPUT_ALIAS');const r=await readBound(resolved,{target:copyTo?posix.join(copyTo,rel):undefined,installed});total+=r.bytes;if(total>2147483648)fail('SEP_PARSER_RUNTIME_LIMIT');if(installed&&Number(s.mode&0o777n)!==r.mode)fail('SEP_PARSER_RUNTIME_CHANGED');records.push({path:rel,kind:'file',...r});if(copyTo)await chmod(posix.join(copyTo,rel),r.mode);
  }
  if(alias!==undefined&&(await readlink(p)!==alias||ident(before)!==ident(await lstat(p,{bigint:true}))))fail('SEP_PARSER_INPUT_CHANGED');
 }
 await visit(input,'',0);if(ident(start)!==ident(await lstat(input,{bigint:true})))fail('SEP_PARSER_INPUT_CHANGED');records.sort((a,b)=>a.path.localeCompare(b.path,'en'));return {sha256:hash(JSON.stringify(records)),entries:records,bytes:total};
}
export async function assembleParserRuntime({destination,inputs}){
 path(destination);await root(posix.dirname(destination));if(!inputs||!['node','owner','helper'].every(k=>inputs[k]&&digest(inputs[k].sha256))||!['python','dependencies'].every(k=>inputs[k]&&digest(inputs[k].sha256)))fail('SEP_PARSER_INPUT_CHANGED');
 const paths=[inputs.node.path,inputs.owner.path,inputs.helper.path,inputs.python.root,inputs.dependencies.root,inputs.capturedRoot];for(const p of paths){path(p);if(inside(p,destination)||inside(destination,p))fail('SEP_PARSER_PATH');}
 for(const k of ['node','owner','helper'])await readBound(inputs[k].path,{expected:inputs[k].sha256});
 for(const k of ['python','dependencies'])if((await inspectInputTree(inputs[k].root)).sha256!==inputs[k].sha256)fail('SEP_PARSER_INPUT_CHANGED');
 for(const [name,sha256]of Object.entries(pins))await readBound(posix.join(inputs.capturedRoot,name),{expected:sha256});
 try{await mkdir(destination,{mode:0o700});}catch(e){if(e.code==='EEXIST')fail('SEP_PARSER_DESTINATION_EXISTS');throw e;}
 for(const p of ['native','tool-runtime','tool-runtime/python','tool-runtime/node_modules','tool-runtime/suite'])await mkdir(posix.join(destination,p),{mode:0o700});
 for(const [k,name]of [['node','tool-runtime/node'],['owner','native/task-owner'],['helper','native/native-tree']]){await readBound(inputs[k].path,{target:posix.join(destination,name),expected:inputs[k].sha256});await chmod(posix.join(destination,name),0o555);}
 for(const [k,name]of [['python','python'],['dependencies','node_modules']])if((await inspectInputTree(inputs[k].root,{copyTo:posix.join(destination,'tool-runtime',name)})).sha256!==inputs[k].sha256)fail('SEP_PARSER_INPUT_CHANGED');
 for(const [name,sha256]of Object.entries(pins)){const target=posix.join(destination,'tool-runtime/suite',name);await readBound(posix.join(inputs.capturedRoot,name),{target,expected:sha256});await chmod(target,0o444);}
 for(const [name,sha256]of Object.entries(entries)){const target=posix.join(destination,'tool-runtime',name);await readBound(fileURLToPath(new URL('../parser/'+name,import.meta.url)),{target,expected:sha256});await chmod(target,0o444);}
 await writeFile(posix.join(destination,'tool-runtime/package.json'),'{"type":"module"}\n',{flag:'wx',mode:0o444});
 const inventory=await inspectInputTree(destination);for(const row of [...inventory.entries].reverse())if(row.kind==='directory')await chmod(posix.join(destination,row.path),0o555);
 const manifest={schema:1,kind:'sep-macos-trusted-parser-runtime',platform:{version:'15.7.9',build:'24G830',darwin:'24.6.0',arch:'arm64',node:'24.21.0',python:'3.12.14'},sourceHashes:Object.fromEntries(['node','owner','helper','python','dependencies'].map(k=>[k,inputs[k].sha256])),entries:inventory.entries};
 const text=JSON.stringify(manifest,null,2)+'\n';await writeFile(posix.join(destination,'manifest.json'),text,{flag:'wx',mode:0o444});await chmod(destination,0o555);const manifestSha256=hash(text);await verifyParserRuntime({runtimeRoot:destination,manifestSha256});return {manifestSha256,manifestPath:posix.join(destination,'manifest.json')};
}
export async function verifyParserRuntime({runtimeRoot,manifestSha256}){
 if(!digest(manifestSha256))fail('SEP_PARSER_MANIFEST_CHANGED');try{const s=await root(runtimeRoot,'SEP_PARSER_RUNTIME_CHANGED');if((s.mode&0o777n)!==0o555n)fail('SEP_PARSER_RUNTIME_CHANGED');}catch{fail('SEP_PARSER_RUNTIME_CHANGED');}
 const p=posix.join(runtimeRoot,'manifest.json');let bytes;try{const m=await lstat(p,{bigint:true});if(m.size>16777216n||(m.mode&0o777n)!==0o444n)fail('SEP_PARSER_MANIFEST_CHANGED');const r=await readBound(p,{installed:true,capture:true,maxBytes:16777216});bytes=r.body;if(r.sha256!==manifestSha256)fail('SEP_PARSER_MANIFEST_CHANGED');}catch{fail('SEP_PARSER_MANIFEST_CHANGED');}
 let manifest;try{manifest=JSON.parse(bytes);}catch{fail('SEP_PARSER_MANIFEST_CHANGED');}if(manifest.schema!==1||manifest.kind!=='sep-macos-trusted-parser-runtime'||!Array.isArray(manifest.entries))fail('SEP_PARSER_MANIFEST_CHANGED');
 try{const actual=await inspectInputTree(runtimeRoot,{installed:true,excludeManifest:true});if(JSON.stringify(actual.entries)!==JSON.stringify(manifest.entries))fail('SEP_PARSER_RUNTIME_CHANGED');}catch{fail('SEP_PARSER_RUNTIME_CHANGED');}return Object.freeze(manifest);
}
