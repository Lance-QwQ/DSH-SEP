// Final-byte inventory for the fixed native bootstrap. This does not compile,
// activate or certify the application, and does not accept caller-supplied hashes.
import {lstat,realpath} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,basename,resolve} from 'node:path';
import {inventoryPackage} from './package-inventory.mjs';
import {loadProgram} from '../desktop/managed-broker/program-manifest.mjs';
import {BOOTSTRAP_PATHS,validateBootstrapManifest} from '../bootstrap/production-manifest.mjs';
const fail=code=>{throw Object.assign(Error(code),{code});};
async function digest(path,maxBytes){
 const before=await lstat(path,{bigint:true});
 if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1n||before.size>BigInt(maxBytes)||await realpath(path)!==path||(before.mode&0o022n)!==0n)fail('SEP_MAC_BOOTSTRAP_INPUT');
 const hash=createHash('sha256');let bytes=0;for await(const b of createReadStream(path)){bytes+=b.length;if(bytes>maxBytes)fail('SEP_MAC_BOOTSTRAP_INPUT');hash.update(b);}
 const after=await lstat(path,{bigint:true});if(bytes!==Number(before.size)||['dev','ino','size','mtimeNs','ctimeNs','mode','nlink'].some(k=>before[k]!==after[k]))fail('SEP_MAC_BOOTSTRAP_INPUT');return hash.digest('hex');
}
export async function buildBootstrapManifest(contents){
 if(resolve(contents)!==contents||basename(contents)!=='Contents'||await realpath(contents)!==contents)fail('SEP_MAC_BOOTSTRAP_ROOT');
 const programPath=join(contents,BOOTSTRAP_PATHS.program),programSha256=await digest(programPath,262144),program=await loadProgram(programPath,programSha256);
 if(program.root!==contents||program.schema.schema!==4)fail('SEP_MAC_BOOTSTRAP_ROOT');
 const runtime=join(contents,'Resources/product/runtime'),inventory=await inventoryPackage(runtime);
 if(inventory.totalBytes>64*1024*1024||inventory.entries.length>2048)fail('SEP_MAC_BOOTSTRAP_INPUT');
 const closure=[];
 for(const entry of inventory.entries){
  if(entry.kind==='directory'){if(entry.mode&0o022)fail('SEP_MAC_BOOTSTRAP_INPUT');continue;}
  if(entry.kind!=='file'||entry.size>4*1024*1024||entry.mode&0o022)fail('SEP_MAC_BOOTSTRAP_INPUT');
  const path='Resources/product/runtime/'+entry.path;
  // Recheck regular-file identity and permissions, including hard links.
  const sha256=await digest(join(contents,path),4*1024*1024);if(sha256!==entry.sha256)fail('SEP_MAC_BOOTSTRAP_INPUT');closure.push({path,sha256});
 }
 closure.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
 const controller=closure.find(v=>v.path===BOOTSTRAP_PATHS.controller);if(!controller)fail('SEP_MAC_BOOTSTRAP_INPUT');
 const node={path:BOOTSTRAP_PATHS.node,sha256:await digest(join(contents,BOOTSTRAP_PATHS.node),256*1024*1024)};
 if(node.sha256!==program.entries.node.sha256)fail('SEP_MAC_BOOTSTRAP_INPUT');
 return validateBootstrapManifest({schema:1,layout:'macos-app-v1',program:{path:BOOTSTRAP_PATHS.program,sha256:programSha256},node,controller,closure});
}
