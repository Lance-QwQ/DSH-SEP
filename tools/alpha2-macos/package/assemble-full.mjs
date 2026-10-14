// Native build operator. Produces a relocatable isolated preview, never an
// in-place updater. The exact source checkout and carrier are CI-bound inputs.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,copyFile,chmod,realpath,lstat,rename} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {join,resolve,dirname,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {runOwnedCommand} from '../desktop/run-command.mjs';
import {inventoryPackage,verifyPackage} from './package-inventory.mjs';
import {installCapture} from './install-capture.mjs';
import {validateProgramShape} from '../desktop/managed-broker/program-manifest.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
async function fileHash(path){const h=createHash('sha256');for await(const b of createReadStream(path))h.update(b);return h.digest('hex');}
assert.equal(process.platform,'darwin');assert.equal(process.arch,'arm64');
const [overlayArg,repositoryArg,sourceArg,helperArg,asarArg,outArg]=process.argv.slice(2);assert(outArg);
assert([undefined,'0','1'].includes(process.env.SEP_MAC_IMAGE_PACKAGE));const images=process.env.SEP_MAC_IMAGE_PACKAGE==='1';
assert([undefined,'0','1'].includes(process.env.SEP_MAC_DOCUMENT_PACKAGE));const documents=process.env.SEP_MAC_DOCUMENT_PACKAGE==='1';assert(!documents||images,'document composition requires the governed image/settings variant');
const temp=await realpath(process.env.RUNNER_TEMP),overlay=await realpath(overlayArg),repository=await realpath(repositoryArg),source=await realpath(sourceArg),helper=await realpath(helperArg),asarPath=await realpath(asarArg),out=resolve(outArg);
for(const p of [overlay,helper,asarPath,out])assert(p.startsWith(temp+'/'));assert.equal(await realpath(dirname(out)),dirname(out));
await mkdir(out,{mode:0o700});process.umask(0o077);
const result={schema:1,status:'fail',scope:'isolated macOS ARM64 integrated preview',fullMacCertification:'blocked',dshVersion:'0.2.1-alpha.2',commands:[]};
async function run(label,file,args,timeoutMs=300000){const r=await runOwnedCommand({file,args,cwd:out,env:Object.fromEntries(Object.entries(process.env).filter(([k])=>!/(TOKEN|SECRET|PASSWORD|API_KEY|^APPLE_|^CSC_)/i.test(k))),logPath:join(out,label+'.log'),timeoutMs});result.commands.push({label,...r,tail:undefined});assert.equal(r.status,'pass','SEP_MAC_PACKAGE_'+label.toUpperCase());}
try{
 const carrier=JSON.parse(await readFile(join(overlay,'RESULT.json'),'utf8'));assert.equal(carrier.status,'pass');
 const inputApp=join(overlay,'DSH SEP.app');assert.equal(await fileHash(join(inputApp,'Contents/Resources/app.asar')),carrier.resultAsarSha256);
 const packageRoot=join(out,'DSH-SEP-macOS-Alpha2-preview');await mkdir(packageRoot,{mode:0o755});
 const app=join(packageRoot,'DSH SEP.app');await run('copy-app','/usr/bin/ditto',[inputApp,app]);
 const resources=join(app,'Contents/Resources'),asar=await import(pathToFileURL(asarPath)),extract=join(out,'extracted-carrier');asar.extractAll(join(resources,'app.asar'),extract);
 const payload=join(packageRoot,'payload');await mkdir(payload,{mode:0o755});const host=join(payload,'host');await rename(join(extract,'dsh'),host);
 const hostManifest=JSON.parse(await readFile(join(host,'node_modules/@deepseek-ai/dsh/package.json'),'utf8'));assert.equal(hostManifest.version,'0.2.1-alpha.2');
 const captured=join(host,'sep-capture');await installCapture(join(source,'business-capture'),captured,process.env.SEP_MAC_BUSINESS_CAPTURE_SHA256);const captureBytes=await readFile(join(captured,'CAPTURE.json'));result.captureSha256=sha(captureBytes);
 if(images){const {prepareSettingsUi}=await import('../settings-ui/adapter.mjs');result.settingsUi=(await prepareSettingsUi({hostRoot:host,bundleRoot:captured})).receipt;}
 const list=JSON.parse(await readFile(new URL('./runtime-inputs.json',import.meta.url),'utf8'));assert.equal(list.schema,1);
 if(images){const extra=JSON.parse(await readFile(new URL('./image-runtime-inputs.json',import.meta.url),'utf8'));assert.equal(extra.schema,1);list.files.push(...extra.files);}
 if(documents){const extra=JSON.parse(await readFile(new URL('./document-runtime-inputs.json',import.meta.url),'utf8'));assert.equal(extra.schema,1);list.files.push(...extra.files);}
 assert.equal(new Set(list.files).size,list.files.length);const mac=join(payload,'mac'),inputs=[];
 for(const name of list.files){assert(!name.split('/').some(p=>!p||p==='.'||p==='..'));const from=join(source,name),stat=await lstat(from);assert(stat.isFile()&&!stat.isSymbolicLink());const target=join(mac,name);await mkdir(dirname(target),{recursive:true,mode:0o755});await copyFile(from,target);inputs.push({path:name,sha256:await fileHash(target)});}
 const native=join(payload,'native');await mkdir(native,{mode:0o755});const helperTarget=join(native,'project-tree');await copyFile(helper,helperTarget);await chmod(helperTarget,0o555);
 let attachmentHelper;
 if(images){const provided=process.env.SEP_MAC_ATTACHMENT_HELPER;assert(provided&&provided.startsWith(temp+'/'));assert.equal(await realpath(provided),provided);assert((await lstat(provided)).isFile());attachmentHelper=join(native,'attachment-tree');await copyFile(provided,attachmentHelper);await chmod(attachmentHelper,0o555);}
 const node=join(resources,'runtime/primary-runtime/dependencies/node/bin/node');assert((await lstat(node)).isFile());await run('verify-node',node,['--version']);
 let parser;
 if(documents){const owner=process.env.SEP_MAC_PARSER_OWNER,dependencies=process.env.SEP_MAC_PARSER_DEPENDENCIES;for(const p of [owner,dependencies]){assert(p&&p.startsWith(temp+'/'));assert.equal(await realpath(p),p);}const {assembleInstalledParser}=await import('./assemble-parser-runtime.mjs');parser=await assembleInstalledParser({destination:join(payload,'parser-runtime'),resources,source,helper,owner,dependencies,captured});result.parserRuntime={manifestSha256:parser.manifestSha256,inputs:parser.inputs};}
 const manifest={schema:documents?3:images?2:1,validationScope:'isolated-macos-preview',dshVersion:'0.2.1-alpha.2',bundleRoot:'payload/host/sep-capture',hostRoot:'payload/host',appRoot:'DSH SEP.app',...images?{capabilities:['governed-images',...documents?['trusted-parsers']:[]]}:{},...documents?{parserRoot:'payload/parser-runtime'}:{},entries:{}};
 for(const [role,path]of Object.entries({node,business:join(mac,documents?'document-business/standalone.mjs':images?'media-business/standalone.mjs':'business/standalone.mjs'),ownerLease:join(mac,'captured/owner-lease.mjs'),helper:helperTarget,...images?{attachmentHelper}:{},...documents?{parserManifest:parser.manifestPath}:{},electron:join(app,'Contents/MacOS/DSH SEP'),asar:join(resources,'app.asar')}))manifest.entries[role]={path:relative(packageRoot,path),sha256:await fileHash(path)};
 validateProgramShape(manifest);const program=JSON.stringify(manifest,null,2)+'\n',programSha256=sha(program);await writeFile(join(packageRoot,'PROGRAM.json'),program,{flag:'wx',mode:0o444});
 const command=`#!/bin/sh\nset -eu\nroot=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)\nnode="$root/${manifest.entries.node.path}"\nactual=$(/usr/bin/shasum -a 256 "$node" | /usr/bin/cut -d ' ' -f 1)\n[ "$actual" = '${manifest.entries.node.sha256}' ] || { echo SEP_MAC_NODE_CHANGED >&2; exit 1; }\nexec "$node" "$root/payload/mac/desktop/managed-broker/launch-full.mjs" "$root/PROGRAM.json" '${programSha256}' "$HOME/Library/Application Support/DSH SEP/alpha2-mac-preview"\n`;
 await writeFile(join(packageRoot,'DSH SEP.command'),command,{flag:'wx',mode:0o755});await chmod(join(packageRoot,'DSH SEP.command'),0o755);
 await copyFile(new URL('./README-package.md',import.meta.url),join(packageRoot,'README.md'));await copyFile(join(captured,'LICENSE'),join(packageRoot,'LICENSE'));
 // No generated business data, credentials, user home or test fixtures are
 // placed inside packageRoot. Identity/data are created by the launcher later.
 const inventory=await inventoryPackage(packageRoot);await writeFile(join(out,'PACKAGE-INVENTORY.json'),JSON.stringify(inventory,null,2)+'\n',{flag:'wx'});await verifyPackage(packageRoot,inventory);
 const archive=join(out,'DSH-SEP-macOS-Alpha2-preview.zip');await run('archive','/usr/bin/ditto',['-c','-k','--sequesterRsrc','--keepParent',packageRoot,archive]);
 result.status='pass';Object.assign(result,{capabilities:manifest.capabilities??[],packageRoot,programSha256,inputs,treeSha256:inventory.treeSha256,artifact:'DSH-SEP-macOS-Alpha2-preview.zip',artifactSha256:await fileHash(archive),artifactBytes:(await lstat(archive)).size,notVerified:['integrated native desktop startup until separate smoke passes','Developer ID/notarization','physical desktop and TCC interaction','paid provider calls','arbitrary process-family cleanup','Finder app bootstrap','production automatic updates']});
}catch(e){result.code=/^[A-Z][A-Z0-9_]+$/.test(e?.code??'')?e.code:'SEP_MAC_PACKAGE_ASSEMBLY_FAILED';result.errorType=e.name;result.diagnostic=String(e.message).slice(0,300);process.exitCode=1;}
finally{await writeFile(join(out,'RESULT.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({status:result.status,code:result.code,artifact:result.artifact}));}
