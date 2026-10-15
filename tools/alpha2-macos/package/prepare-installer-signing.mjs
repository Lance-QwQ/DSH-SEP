// Build operator boundary, never a runtime entry. Preserve the resource build
// report outside the app; Apple reserves Contents for standard bundle entries.
import assert from 'node:assert/strict';
import {lstat,realpath,readdir,open,copyFile,unlink} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join,dirname,resolve,basename} from 'node:path';
import {createHash} from 'node:crypto';
const id=s=>[s.dev,s.ino,s.mode,s.uid,s.nlink,s.size,s.mtimeNs,s.ctimeNs].join(':');
const fail=()=>{throw Object.assign(Error('SEP_INSTALLER_SIGNING_LAYOUT'),{code:'SEP_INSTALLER_SIGNING_LAYOUT'});};
const exact=['Info.plist','MacOS','RESOURCES-BUILD.json','Resources'];
async function directory(path){const s=await lstat(path);if(!s.isDirectory()||s.isSymbolicLink()||await realpath(path)!==path)fail();}
export async function prepareInstallerSigning({contents,evidencePath,resource}){
 if(typeof contents!=='string'||typeof evidencePath!=='string'||resolve(contents)!==contents||resolve(evidencePath)!==evidencePath||basename(contents)!=='Contents'||dirname(evidencePath)!==dirname(dirname(contents)))fail();
 await directory(contents);await directory(dirname(evidencePath));
 if(JSON.stringify((await readdir(contents)).sort())!==JSON.stringify(exact))fail();
 await directory(join(contents,'Resources'));await directory(join(contents,'MacOS'));
 const source=join(contents,'RESOURCES-BUILD.json'),before=await lstat(source,{bigint:true});if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1n||before.size>4194304n||await realpath(source)!==source)fail();
 const f=await open(source,constants.O_RDONLY|constants.O_NOFOLLOW);let bytes;
 try{if(id(await f.stat({bigint:true}))!==id(before))fail();bytes=await f.readFile();if(id(await f.stat({bigint:true}))!==id(before)||id(await lstat(source,{bigint:true}))!==id(before))fail();}finally{await f.close();}
 assert.deepEqual(bytes,Buffer.from(JSON.stringify(resource,null,2)+'\n'));
 // COPYFILE_EXCL preserves a byte-identical external copy without replacing a
 // previous evidence file. This fresh build tree is private to this operator.
 await copyFile(source,evidencePath,constants.COPYFILE_EXCL);
 const external=await open(evidencePath,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{const s=await external.stat();if(!s.isFile()||s.nlink!==1)fail();assert.deepEqual(await external.readFile(),bytes);}finally{await external.close();}
 if(id(await lstat(source,{bigint:true}))!==id(before)||await realpath(source)!==source)fail();await unlink(source);
 if(JSON.stringify((await readdir(contents)).sort())!==JSON.stringify(['Info.plist','MacOS','Resources']))fail();
 return{status:'pass',preservedOutsideApplication:true,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,contents:['Info.plist','MacOS','Resources']};
}
