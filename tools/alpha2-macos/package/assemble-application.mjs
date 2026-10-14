// Fresh, isolated schema4 application assembly. Does not install or start it.
// Final manifests follow inner signing; the outer signer never re-signs nested code.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,copyFile,chmod,realpath,lstat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runOwnedCommand} from '../desktop/run-command.mjs';
import {applyReadinessToApplication} from '../desktop/renderer-readiness/apply-to-application.mjs';
import {validateProgramShape,loadProgram,relativeProgramPath} from '../desktop/managed-broker/program-manifest.mjs';
import {buildBootstrapManifest} from './bootstrap-manifest-builder.mjs';
import {inventoryPackage,verifyPackage} from './package-inventory.mjs';
assert.equal(process.platform,'darwin');assert.equal(process.arch,'arm64');
const [baseArg,sourceArg,captureArg,asarArg,outArg]=process.argv.slice(2);assert(outArg&&process.argv.length===7);
const temp=await realpath(process.env.RUNNER_TEMP),git=await realpath(process.env.GITHUB_WORKSPACE),base=await realpath(baseArg),source=await realpath(sourceArg),capture=await realpath(captureArg),asar=await realpath(asarArg),out=resolve(outArg);
for(const path of [base,asar,out])assert(path.startsWith(temp+'/'));for(const path of [source,capture])assert(path.startsWith(git+'/'));assert.equal(await realpath(dirname(out)),dirname(out));
await mkdir(out,{mode:0o700});process.umask(0o077);
const result={schema:1,status:'fail',scope:'fresh macOS ARM64 schema4 application assembly and archive restore',sourceCommit:process.env.GITHUB_SHA??null,fullMacCertification:'blocked',commands:[]};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function digest(path){const h=createHash('sha256');for await(const bytes of createReadStream(path))h.update(bytes);return h.digest('hex');}
async function run(name,file,args,timeoutMs=300000){const receipt=await runOwnedCommand({file,args,cwd:out,env:{PATH:'/usr/bin:/bin:/usr/sbin:/sbin',HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,RUNNER_TEMP:temp,GITHUB_WORKSPACE:git,LANG:'en_US.UTF-8'},logPath:join(out,name+'.log'),timeoutMs});result.commands.push({name,...receipt,tail:undefined});assert.equal(receipt.status,'pass','SEP_MAC_APPLICATION_'+name.toUpperCase());}
async function save(path,value){await writeFile(path,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o444});}
try{
 const draftRoot=join(out,'draft');await run('stage-layout',process.execPath,[fileURLToPath(new URL('./stage-application.mjs',import.meta.url)),base,draftRoot]);
 const draft=JSON.parse(await readFile(join(draftRoot,'APP-DRAFT.json'),'utf8'));assert.equal(draft.status,'pass');const app=join(draftRoot,'DSH SEP.app'),contents=join(app,'Contents');assert.equal(draft.app,app);assert.equal(draft.contents,contents);
 const runtime=join(contents,'Resources/product/runtime'),files=[];
 for(const name of ['runtime-inputs.json','image-runtime-inputs.json','document-runtime-inputs.json','product-runtime-inputs.json']){const list=JSON.parse(await readFile(new URL(name,import.meta.url),'utf8'));assert.equal(list.schema,1);assert(Array.isArray(list.files));files.push(...list.files);}
 assert.equal(new Set(files).size,files.length);assert.equal(files.length,58);result.inputs=[];
 for(const name of files){relativeProgramPath(name);assert(/\.(?:c|m)?js$/.test(name)&&!/(?:^|\/)(?:tests?|fixtures?)(?:\/|\.)/.test(name));const from=join(source,name),stat=await lstat(from);assert(stat.isFile()&&!stat.isSymbolicLink()&&stat.nlink===1);assert.equal(await realpath(from),from);const bytes=await readFile(from),target=join(runtime,name);await mkdir(dirname(target),{recursive:true,mode:0o755});try{const before=await lstat(target);assert(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1);assert.equal(await realpath(target),target);await chmod(target,0o600);}catch(e){if(e.code!=='ENOENT')throw e;}await writeFile(target,bytes,{mode:0o644});await chmod(target,0o644);result.inputs.push({path:name,sha256:hash(bytes)});}
 const runtimeInventory=await inventoryPackage(runtime);assert.deepEqual(runtimeInventory.entries.filter(e=>e.kind==='file').map(e=>e.path).sort(),[...files].sort());
 result.desktop=await applyReadinessToApplication({applicationRoot:app,captureRoot:capture,productControlRoot:join(source,'desktop/product-control'),evidenceRoot:join(out,'desktop'),asarPath:asar});assert.equal(result.desktop.status,'pass');
 // Inner signing may change nested executable bytes. Hash only final files.
 const program=structuredClone(draft.programPlan);for(const entry of Object.values(program.entries))entry.sha256=await digest(join(contents,entry.path));validateProgramShape(program);
 const programPath=join(contents,'Resources/PROGRAM.json');await save(programPath,program);const programSha256=await digest(programPath);await loadProgram(programPath,programSha256);
 const bootstrap=await buildBootstrapManifest(contents),bootstrapPath=join(contents,'Resources/BOOTSTRAP.json');await save(bootstrapPath,bootstrap);const bootstrapSha256=await digest(bootstrapPath);assert.equal(bootstrap.program.sha256,programSha256);
 const info={CFBundleName:'DSH SEP',CFBundleDisplayName:'DSH SEP',CFBundleExecutable:'DSH SEP',CFBundleIdentifier:'app.dshsep.macos.alpha2.preview',CFBundlePackageType:'APPL',CFBundleShortVersionString:'0.2.1',CFBundleVersion:'1',LSMinimumSystemVersion:'15.7',LSUIElement:true,NSHighResolutionCapable:true,CFBundleIconFile:'icon.icns'};
 const infoJson=join(out,'outer-info.json');await save(infoJson,info);await run('outer-info','/usr/bin/plutil',['-convert','xml1','-o',join(contents,'Info.plist'),infoJson]);
 const innerInfo=join(contents,program.appRoot,'Contents/Info.plist');await run('read-inner-info','/usr/bin/plutil',['-convert','json','-o',join(out,'inner-info.json'),innerInfo]);const originalInfo=JSON.parse(await readFile(join(out,'inner-info.json'),'utf8')),icon=originalInfo.CFBundleIconFile;assert(typeof icon==='string'&&!icon.includes('/')&&!icon.includes('\\'));const iconPath=join(contents,program.appRoot,'Contents/Resources',icon.endsWith('.icns')?icon:icon+'.icns');assert((await lstat(iconPath)).isFile());await copyFile(iconPath,join(contents,'Resources/icon.icns'));
 await copyFile(new URL('./README-application.md',import.meta.url),join(contents,'Resources/README.md'));
 const binary=join(contents,'MacOS/DSH SEP');await run('compile-outer','/usr/bin/clang',['-fobjc-arc','-Wno-deprecated-declarations','-framework','AppKit',`-DSEP_BOOTSTRAP_MANIFEST_SHA256="${bootstrapSha256}"`,'-DSEP_BOOTSTRAP_PRODUCT_CONNECTED=1',join(source,'bootstrap/appkit-bootstrap.m'),'-o',binary]);await chmod(binary,0o755);
 await run('sign-outer','/usr/bin/codesign',['--force','--sign','-',app]);await run('verify-outer','/usr/bin/codesign',['--verify','--deep','--strict','--verbose=2',app]);
 // A signing tool must not silently mutate a nested identity bound above.
 await loadProgram(programPath,programSha256);assert.equal(await digest(bootstrapPath),bootstrapSha256);assert.deepEqual(await buildBootstrapManifest(contents),bootstrap);
 const inventory=await inventoryPackage(app);await save(join(out,'PACKAGE-INVENTORY.json'),inventory);await verifyPackage(app,inventory);
 const archive=join(out,'DSH-SEP-macOS-Alpha2-application-preview.zip');await run('archive','/usr/bin/ditto',['-c','-k','--sequesterRsrc','--keepParent',app,archive]);const restored=join(out,'restored');await mkdir(restored,{mode:0o700});await run('restore','/usr/bin/ditto',['-x','-k',archive,restored]);await verifyPackage(join(restored,'DSH SEP.app'),inventory);await run('verify-restored','/usr/bin/codesign',['--verify','--deep','--strict','--verbose=2',join(restored,'DSH SEP.app')]);
 Object.assign(result,{status:'pass',application:app,restoredApplication:join(restored,'DSH SEP.app'),programSha256,bootstrapSha256,treeSha256:inventory.treeSha256,artifact:'DSH-SEP-macOS-Alpha2-application-preview.zip',artifactSha256:await digest(archive),artifactBytes:(await lstat(archive)).size,notVerified:['actual LaunchServices application lifecycle','physical Finder/Dock input','Developer ID and notarization','private environment continuation','paid models','arbitrary process families','production automatic updates']});
}catch(error){result.code=/^[A-Z][A-Z0-9_]{1,90}$/.test(error.code??'')?error.code:'SEP_MAC_APPLICATION_ASSEMBLY_FAILED';result.errorType=error.name;result.diagnostic=String(error.message).slice(0,300);process.exitCode=1;}
finally{await save(join(out,'RESULT.json'),result);console.log(JSON.stringify({status:result.status,code:result.code,artifact:result.artifact}));}
