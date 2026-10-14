// Build-time capture for this reviewed static-ESM source set, not a general JS
// parser. Unsupported dynamic/external dependencies fail before copying bytes.
import{readFile,lstat,realpath}from'node:fs/promises';import{join,relative,resolve,dirname,isAbsolute,sep}from'node:path';import{createHash}from'node:crypto';import{builtinModules}from'node:module';
const fail=()=>{throw Object.assign(Error('SEP_INSTALLER_CLOSURE'),{code:'SEP_INSTALLER_CLOSURE'});};
const sha=b=>createHash('sha256').update(b).digest('hex'),same=(a,b)=>['dev','ino','size','mode','nlink','mtimeNs','ctimeNs'].every(k=>a[k]===b[k]);
function valid(p){return typeof p==='string'&&p.length<=1024&&!/[^\x21-\x7e]|[\\:%?#]/.test(p)&&p.split('/').every(x=>x&&x!=='.'&&x!=='..'&&!/[. ]$/.test(x)&&!['test','tests','testing.mjs','run-native.mjs'].includes(x.toLowerCase())&&!/^fixture[.-]/i.test(x)&&!x.toLowerCase().includes('.test.'));}
export async function captureInstallerRuntime(input){
 try{
  if(typeof input!=='string'||!isAbsolute(input)||resolve(input)!==input||await realpath(input)!==input)fail();const root=input,records=new Map(),builtins=new Set(builtinModules.map(s=>s.replace(/^node:/,'')));let total=0;
  async function visit(path){
   const p=relative(root,path).split(sep).join('/');if(!valid(p)||!path.startsWith(root+sep)||!p.endsWith('.mjs'))fail();if(records.has(p))return;if(records.size>=1024)fail();
   const before=await lstat(path,{bigint:true});if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1n||before.size>4194304n||await realpath(path)!==path)fail();const bytes=await readFile(path);if(!same(before,await lstat(path,{bigint:true}))||bytes.length!==Number(before.size))fail();total+=bytes.length;if(total>67108864)fail();
   const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);if(/\b(?:import|require)(?:\s|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*(?:\r?\n|$))*\(/.test(text))fail();records.set(p,{path:p,sha256:sha(bytes),bytes});
   const imports=[...text.matchAll(/\b(?:import|export)\s*(?:[^'";]*?\bfrom\s*)?['"]([^'"\r\n]+)['"]/g)].map(m=>m[1]);
   for(const spec of imports){if(spec.startsWith('node:')){if(!builtins.has(spec.slice(5)))fail();continue;}if(!/^\.\.?\//.test(spec)||/[\\:%?#\x00-\x20\x7f]/.test(spec))fail();await visit(resolve(dirname(path),spec));}
  }
  await visit(join(root,'installer-ui/controller-main.mjs'));return [...records.values()].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0).map(Object.freeze);
 }catch{fail();}
}
