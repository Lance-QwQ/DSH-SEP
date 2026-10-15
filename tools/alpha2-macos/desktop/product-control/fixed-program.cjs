'use strict';
const path=require('node:path'),{createHash}=require('node:crypto');
const fail=code=>{throw Object.assign(Error(code),{code});};
exports.readElectronProgram=function({executable,physicalFs:fs}){
 const tail=path.join('Helpers','DSH SEP Desktop.app','Contents','MacOS','DSH SEP');
 if(typeof executable!=='string'||!path.isAbsolute(executable)||path.resolve(executable)!==executable||!executable.endsWith(path.sep+tail))fail('SEP_PRODUCT_LAYOUT');
 const contents=executable.slice(0,-tail.length-1),resources=path.join(contents,'Resources'),programPath=path.join(resources,'PROGRAM.json');
 if(path.basename(contents)!=='Contents'||!path.basename(path.dirname(contents)).endsWith('.app'))fail('SEP_PRODUCT_LAYOUT');
 const same=(a,b)=>a.dev===b.dev&&a.ino===b.ino&&a.size===b.size&&a.mtimeMs===b.mtimeMs&&a.ctimeMs===b.ctimeMs;
 function file(p){const before=fs.lstatSync(p);if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1||fs.realpathSync(p)!==p)fail('SEP_PRODUCT_PROGRAM_CHANGED');const fd=fs.openSync(p,'r');try{if(!same(before,fs.fstatSync(fd)))fail('SEP_PRODUCT_PROGRAM_CHANGED');const hash=createHash('sha256'),chunk=Buffer.alloc(65536);let count;while((count=fs.readSync(fd,chunk,0,chunk.length,null))>0)hash.update(chunk.subarray(0,count));if(!same(before,fs.lstatSync(p)))fail('SEP_PRODUCT_PROGRAM_CHANGED');return hash.digest('hex');}finally{fs.closeSync(fd);}}
 try{
  const digest=file(programPath);if(fs.statSync(programPath).size>32768)fail('SEP_PRODUCT_PROGRAM_CHANGED');const bytes=fs.readFileSync(programPath);if(createHash('sha256').update(bytes).digest('hex')!==digest)fail('SEP_PRODUCT_PROGRAM_CHANGED');const p=JSON.parse(bytes);
  const fixed={electron:'Helpers/DSH SEP Desktop.app/Contents/MacOS/DSH SEP',asar:'Helpers/DSH SEP Desktop.app/Contents/Resources/app.asar'};
  if(p.schema!==4||p.layout!=='macos-app-v1')fail('SEP_PRODUCT_LAYOUT');
  for(const[role,relative]of Object.entries(fixed)){const e=p.entries?.[role];if(!e||e.path!==relative||!/^[a-f0-9]{64}$/.test(e.sha256??''))fail('SEP_PRODUCT_LAYOUT');if(file(path.join(contents,...relative.split('/')))!==e.sha256)fail('SEP_PRODUCT_PROGRAM_CHANGED');}
  return Object.freeze({programSha256:digest});
 }catch(e){if(e.code?.startsWith('SEP_PRODUCT_'))throw e;fail('SEP_PRODUCT_PROGRAM_CHANGED');}
};
