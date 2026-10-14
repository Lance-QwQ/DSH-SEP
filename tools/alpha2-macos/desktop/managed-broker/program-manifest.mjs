import {readFile,lstat,realpath,open} from 'node:fs/promises';
import {basename,dirname,resolve,sep} from 'node:path';import {createHash} from 'node:crypto';
const fail=code=>{throw Object.assign(Error(code),{code});};
const roles=['node','business','ownerLease','helper','electron','asar'];
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('|')===[...keys].sort().join('|');
export function relativeProgramPath(p){if(typeof p!=='string'||p.length>4096||/[\\:\x00-\x1f\x7f]/.test(p)||p.split('/').some(x=>!x||x==='.'||x==='..'))fail('SEP_MAC_PROGRAM_PATH');return p;}
export function validateProgramShape(p){
 const application=p?.schema===4,parsers=p?.schema===3||application,images=p?.schema===2||parsers,keys=['schema','validationScope','dshVersion','bundleRoot','hostRoot','appRoot','entries',...images?['capabilities']:[],...parsers?['parserRoot']:[],...application?['layout']:[]];
 if(!exact(p,keys)||![1,2,3,4].includes(p.schema)||p.validationScope!=='isolated-macos-preview'||p.dshVersion!=='0.2.1-alpha.2'||!exact(p.entries,[...roles,...images?['attachmentHelper']:[],...parsers?['parserManifest']:[]]))fail('SEP_MAC_PROGRAM_MANIFEST');
 if(images&&(!Array.isArray(p.capabilities)||JSON.stringify(p.capabilities)!==JSON.stringify(['governed-images',...parsers?['trusted-parsers']:[]])))fail('SEP_MAC_PROGRAM_MANIFEST');
 for(const k of ['bundleRoot','hostRoot','appRoot',...parsers?['parserRoot']:[]])relativeProgramPath(p[k]);
 for(const k of Object.keys(p.entries)){const e=p.entries[k];if(!exact(e,['path','sha256'])||!/^[a-f0-9]{64}$/.test(e.sha256??''))fail('SEP_MAC_PROGRAM_MANIFEST');relativeProgramPath(e.path);}
 if(parsers&&p.entries.parserManifest.path!==p.parserRoot+'/manifest.json')fail('SEP_MAC_PROGRAM_MANIFEST');
 if(application){
  const app='Helpers/DSH SEP Desktop.app';
  if(p.layout!=='macos-app-v1'||p.appRoot!==app||p.hostRoot!=='Resources/product/payload/host'||p.bundleRoot!==p.hostRoot+'/sep-capture'||p.parserRoot!=='Resources/product/payload/parser-runtime')fail('SEP_MAC_PROGRAM_LAYOUT');
  const fixed={node:app+'/Contents/Resources/runtime/primary-runtime/dependencies/node/bin/node',electron:app+'/Contents/MacOS/DSH SEP',asar:app+'/Contents/Resources/app.asar'};
  for(const [role,path]of Object.entries(fixed))if(p.entries[role].path!==path)fail('SEP_MAC_PROGRAM_LAYOUT');
  for(const role of ['business','ownerLease','helper','attachmentHelper','parserManifest'])if(!p.entries[role].path.startsWith('Resources/product/'))fail('SEP_MAC_PROGRAM_LAYOUT');
 }
 return p;
}
const same=(a,b)=>a.dev===b.dev&&a.ino===b.ino&&a.size===b.size&&a.mtimeNs===b.mtimeNs&&a.ctimeNs===b.ctimeNs;
async function fileHash(path){const before=await lstat(path,{bigint:true});if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1n||await realpath(path)!==path)fail('SEP_MAC_PROGRAM_CHANGED');const h=await open(path,'r');try{if(!same(before,await h.stat({bigint:true})))fail('SEP_MAC_PROGRAM_CHANGED');const hash=createHash('sha256');for await(const b of h.createReadStream({autoClose:false}))hash.update(b);if(!same(before,await lstat(path,{bigint:true})))fail('SEP_MAC_PROGRAM_CHANGED');return hash.digest('hex');}finally{await h.close();}}
export async function loadProgram(path,expectedSha256){
 path=resolve(path);if(!/^[a-f0-9]{64}$/.test(expectedSha256??'')||await fileHash(path)!==expectedSha256)fail('SEP_MAC_PROGRAM_CHANGED');
 const s=await lstat(path);if(s.size>32768)fail('SEP_MAC_PROGRAM_MANIFEST');const bytes=await readFile(path);if(createHash('sha256').update(bytes).digest('hex')!==expectedSha256)fail('SEP_MAC_PROGRAM_CHANGED');let p;try{p=validateProgramShape(JSON.parse(bytes));}catch(e){if(e.code)throw e;fail('SEP_MAC_PROGRAM_MANIFEST');}
 // The application layout derives one fixed Contents root; no manifest value
 // may request an ancestor or provide an alternative root. Legacy layouts stay
 // rooted at their manifest directory.
 let root=dirname(path);
 if(p.schema===4){
  if(basename(path)!=='PROGRAM.json'||basename(root)!=='Resources'||basename(dirname(root))!=='Contents'||!basename(dirname(dirname(root))).endsWith('.app'))fail('SEP_MAC_PROGRAM_LAYOUT');
  root=dirname(root);
 }
 if(await realpath(root)!==root)fail('SEP_MAC_PROGRAM_PATH');const result={schema:p,root,manifestSha256:expectedSha256,entries:{}};
 async function location(relative){const x=resolve(root,relative);if(!x.startsWith(root+sep)||await realpath(x)!==x)fail('SEP_MAC_PROGRAM_PATH');return x;}
 for(const k of ['bundleRoot','hostRoot','appRoot',...[3,4].includes(p.schema)?['parserRoot']:[]]){const x=await location(p[k]);if(!(await lstat(x)).isDirectory())fail('SEP_MAC_PROGRAM_PATH');result[k]=x;}
 for(const k of Object.keys(p.entries)){const e=p.entries[k],path=await location(e.path);if(await fileHash(path)!==e.sha256)fail('SEP_MAC_PROGRAM_CHANGED');result.entries[k]={path,sha256:e.sha256};}
 return Object.freeze(result);
}
