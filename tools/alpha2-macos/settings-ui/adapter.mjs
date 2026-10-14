import {readFile,writeFile,mkdir,lstat,realpath} from 'node:fs/promises';
import {join,dirname,resolve,isAbsolute,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const fail=code=>{throw Object.assign(Error(code),{code});},sha=b=>createHash('sha256').update(b).digest('hex');
export const settingsPackage='@deepseek-ai/dsh-client-ui-settings-memory';
export const sourceOrigin=Object.freeze({commit:'930d081b',officialCommit:'d743267388641bc76f17c45ce8b4c231aed1d32c',version:'0.2.1-alpha.2',files:{
 'LICENSE':'ebb4f09972aee8608be255debaf78451a68e95c290f55c240dec2ecfa16ea6be',
 'package.json':'0e56a02fc208c53a67efc7e86b1dad5c64a522533a8d3da818bf38711f904452',
 'README.md':'c4da450be48c149e78eb7aa8dc184d366aef46cd3af55a8cdd2eb7d95e89099d',
 'lib/index.js':'5d0db86c8ce69a8765e888b08716150a476a907e9c0eda9a1dc8bd323665ea06',
 'lib/client.js':'3b3d66ffc510e997ce215084eb43b7805a1926e008dd2edaa80b90817b624092'}});
const hostNames=['dsh','dsh-client-connection','dsh-client-locale','dsh-client-ui-settings','dsh-client-ui-slots'];
async function directory(path,code){if(!isAbsolute(path??''))fail(code);const p=resolve(path),s=await lstat(p);if(!s.isDirectory()||s.isSymbolicLink()||await realpath(p)!==p)fail(code);return p;}
async function bytes(path,code){try{const s=await lstat(path);if(!s.isFile()||s.isSymbolicLink()||s.size>1048576)fail(code);return await readFile(path);}catch{fail(code);}}
async function hostBinding(hostRoot){const root=await directory(hostRoot,'SEP_MAC_SETTINGS_HOST_PATH'),rows=[];for(const short of hostNames){const name='@deepseek-ai/'+short,path=join(root,'node_modules',name,'package.json'),actual=await realpath(path);if(!actual.startsWith(root+sep))fail('SEP_MAC_SETTINGS_HOST_PATH');const b=await bytes(path,'SEP_MAC_SETTINGS_HOST_CHANGED'),p=JSON.parse(b);if(p.name!==name||p.version!==sourceOrigin.version)fail('SEP_MAC_SETTINGS_HOST_VERSION');rows.push({name,version:p.version,sha256:sha(b)});}return rows;}
function derive(source){const p=JSON.parse(source);if(p.name!==settingsPackage||p.version!=='0.1.7-rc.1-sep.local.1')fail('SEP_MAC_SETTINGS_SOURCE_CHANGED');p.version='0.2.1-alpha.2-sep-mac.1';for(const name of Object.keys(p.peerDependencies)){if(name==='@deepseek-ai/dsh'||name.startsWith('@deepseek-ai/dsh-'))p.peerDependencies[name]=sourceOrigin.version;}return Buffer.from(JSON.stringify(p,null,2)+'\n');}
function installedRoot(hostRoot){return join(hostRoot,'node_modules',settingsPackage);}
/** Build-only derivation. Original capture and program implementation remain byte-identical. */
export async function prepareSettingsUi({hostRoot,bundleRoot}){
 const host=await hostBinding(hostRoot),source=join(await directory(bundleRoot,'SEP_MAC_SETTINGS_SOURCE_CHANGED'),'bundle/modules/ui-settings-memory'),inputs=new Map();
 for(const [name,expected]of Object.entries(sourceOrigin.files)){const b=await bytes(join(source,name),'SEP_MAC_SETTINGS_SOURCE_CHANGED');if(sha(b)!==expected)fail('SEP_MAC_SETTINGS_SOURCE_CHANGED');inputs.set(name,b);}
 const target=installedRoot(hostRoot);try{await lstat(target);return await verifySettingsUi({hostRoot});}catch(e){if(e.code!=='ENOENT')throw e;}
 const parent=dirname(target);await directory(parent,'SEP_MAC_SETTINGS_HOST_PATH');await mkdir(target,{mode:0o755});
 for(const [name,b]of inputs){const output=join(target,name==='package.json'?'SOURCE-PACKAGE.json':name);await mkdir(dirname(output),{recursive:true,mode:0o755});await writeFile(output,b,{flag:'wx',mode:0o444});}
 const manifest=derive(inputs.get('package.json'));await writeFile(join(target,'package.json'),manifest,{flag:'wx',mode:0o444});
 const receipt={schema:1,status:'pass',scope:'exact Alpha.2 settings peer adapter; server/client implementation unchanged',source:sourceOrigin,host,manifestSha256:sha(manifest),changes:['version: 0.1.7-rc.1-sep.local.1 -> 0.2.1-alpha.2-sep-mac.1','five DSH peer ranges: 0.2.0-rc.2 -> 0.2.1-alpha.2'],runtimeCertified:false};
 await writeFile(join(target,'ADAPTER.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o444});return await verifySettingsUi({hostRoot});
}
/** Read-only startup gate; never repairs or rewrites an existing installation. */
export async function verifySettingsUi({hostRoot}){
 const host=await hostBinding(hostRoot),target=installedRoot(hostRoot);let receipt;
 try{await directory(target,'SEP_MAC_SETTINGS_ADAPTER_INVALID');receipt=JSON.parse(await bytes(join(target,'ADAPTER.json'),'SEP_MAC_SETTINGS_ADAPTER_INVALID'));if(receipt.schema!==1||receipt.status!=='pass'||JSON.stringify(receipt.source)!==JSON.stringify(sourceOrigin))fail('SEP_MAC_SETTINGS_ADAPTER_INVALID');
 for(const [name,expected]of Object.entries(sourceOrigin.files)){if(sha(await bytes(join(target,name==='package.json'?'SOURCE-PACKAGE.json':name),'SEP_MAC_SETTINGS_ADAPTER_INVALID'))!==expected)fail('SEP_MAC_SETTINGS_ADAPTER_INVALID');}
 const wanted=derive(await bytes(join(target,'SOURCE-PACKAGE.json'),'SEP_MAC_SETTINGS_ADAPTER_INVALID')),actual=await bytes(join(target,'package.json'),'SEP_MAC_SETTINGS_ADAPTER_INVALID');if(!wanted.equals(actual)||sha(actual)!==receipt.manifestSha256)fail('SEP_MAC_SETTINGS_ADAPTER_INVALID');
 }catch{fail('SEP_MAC_SETTINGS_ADAPTER_INVALID');}
 if(JSON.stringify(receipt.host)!==JSON.stringify(host))fail('SEP_MAC_SETTINGS_HOST_CHANGED');
 return Object.freeze({status:'pass',entryUrl:pathToFileURL(join(target,'lib/index.js')).href,clientPath:join(target,'lib/client.js'),receipt});
}
