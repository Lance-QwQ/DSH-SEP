// Build operator, excluded from installer runtime. Copies only manifest-bound
// public runtime members; it neither starts a program nor selects a daily build.
import {mkdir,writeFile,lstat,realpath,copyFile,constants} from 'node:fs/promises';
import {join,dirname,resolve,isAbsolute,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import {stableFile,verifyRecord,safePath,listRegularFiles} from '../verification/bundle-audit.mjs';
const fail=code=>{throw Object.assign(Error(code),{code});};
const demand=(v,c)=>{if(!v)fail(c);};
const same=(a,b)=>['dev','ino','size','mtimeNs','ctimeNs','nlink'].every(k=>a[k]===b[k]);
const key=p=>resolve(p).toLowerCase();
const inside=(a,b)=>{const r=relative(a,b);return r===''||!isAbsolute(r)&&r!=='..'&&!r.startsWith('..\\')&&!r.startsWith('../');};
export async function prepareSupport({oldRoot,desktopRoot,desktopManifest,output,receiptPath}){
 for(const path of [oldRoot,desktopRoot,desktopManifest,output,receiptPath])demand(isAbsolute(path),'SUPPORT_ABSOLUTE_PATH');
 for(const root of [oldRoot,desktopRoot]){demand(key(await realpath(root))===key(root),'SUPPORT_SOURCE_ALIAS');demand(!inside(root,output)&&!inside(output,root),'SUPPORT_OVERLAP');}
 demand(key(await realpath(dirname(output)))===key(dirname(output)),'SUPPORT_OUTPUT_ALIAS');
 try{await lstat(output);fail('SUPPORT_OUTPUT_EXISTS');}catch(e){if(e.code!=='ENOENT')throw e;}
 const oldManifest=await stableFile(join(oldRoot,'manifest.json'),{maxBytes:32*1024*1024,capture:true}),desktopBytes=await stableFile(desktopManifest,{maxBytes:4*1024*1024,capture:true});
 const old=JSON.parse(oldManifest.bytes),desktop=JSON.parse(desktopBytes.bytes);demand(Array.isArray(old.support),'SUPPORT_MANIFEST');
 demand(desktop.schema===1&&desktop.platform==='win32-x64'&&desktop.version==='44.7.0'&&desktop.executable==='electron.exe'&&Array.isArray(desktop.links)&&desktop.links.length===0&&Array.isArray(desktop.files),'SUPPORT_DESKTOP_MANIFEST');
 const selected=old.support.filter(f=>/^runtime\/(?:node|pnpm|primary-runtime|office-skills)\//.test(f.path));
 for(const name of ['node','pnpm','primary-runtime','office-skills'])demand(selected.some(f=>f.path.startsWith('runtime/'+name+'/')),'SUPPORT_RUNTIME_MISSING');
 const inputs=[...selected.map(row=>({root:oldRoot,source:row,target:row.path})),...desktop.files.map(row=>({root:desktopRoot,source:row,target:'runtime/desktop/'+row.path}))];
 const names=new Set();for(const row of inputs){safePath(row.target);demand(!names.has(row.target.toLowerCase()),'SUPPORT_DUPLICATE');names.add(row.target.toLowerCase());await verifyRecord(row.root,row.source);}
 demand(JSON.stringify(await listRegularFiles(desktopRoot))===JSON.stringify(desktop.files.map(f=>f.path).sort()),'SUPPORT_DESKTOP_MEMBERS');
 await mkdir(output);const files=[];
 for(const input of inputs){
  const source=join(input.root,input.source.path),target=join(output,input.target),before=await lstat(source,{bigint:true});
  demand(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1n&&key(await realpath(source))===key(source),'SUPPORT_SOURCE_IDENTITY');
  await mkdir(dirname(target),{recursive:true});await copyFile(source,target,constants.COPYFILE_EXCL);
  demand(same(before,await lstat(source,{bigint:true}))&&key(await realpath(source))===key(source),'SUPPORT_SOURCE_CHANGED');
  const copied=await verifyRecord(output,{...input.source,path:input.target});files.push({path:input.target,...copied,mode:input.source.mode});
  if(files.length%1000===0)console.log(JSON.stringify({phase:'verified-support-copy',files:files.length,total:inputs.length}));
 }
 demand((await stableFile(join(oldRoot,'manifest.json'))).sha256===oldManifest.sha256&&(await stableFile(desktopManifest)).sha256===desktopBytes.sha256,'SUPPORT_MANIFEST_CHANGED');
 const receipt={schema:1,status:'pass',scope:'Fixed public runtime files only, no application startup, no private configuration.',oldRoot,oldManifestSha256:oldManifest.sha256,desktopRoot,desktopManifestSha256:desktopBytes.sha256,desktopVersion:desktop.version,output,files,totalBytes:files.reduce((n,f)=>n+f.size,0)};
 await writeFile(receiptPath,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});return receipt;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [oldRoot,desktopRoot,desktopManifest,output,receiptPath]=process.argv.slice(2);const result=await prepareSupport({oldRoot,desktopRoot,desktopManifest,output,receiptPath});console.log(JSON.stringify({status:result.status,files:result.files.length,totalBytes:result.totalBytes,output,receiptPath}));
}
