// BUILD OPERATOR ONLY. Fresh installer app assembly, never installation/launch.
// The native pin file remains pending until production entry evidence is ready.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,chmod,lstat,realpath,open} from 'node:fs/promises';
import {constants,createReadStream} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readCandidate} from './installer-binding.mjs';
import {assembleInstallerResources} from '../installer-ui/resources/assemble-resources.mjs';
import {buildInstallerManifest,loadInstallerConfiguration} from '../installer-ui/bundle-config.mjs';
import {verifyCandidate} from '../installer-entry/candidate.mjs';
import {inventoryPackage,verifyPackage} from '../package/package-inventory.mjs';
import {prepareInstallerSigning} from '../package/prepare-installer-signing.mjs';
import {verifyInstallerSources} from './installer-source-binding.mjs';

const sources=['installer-ui/application/main.m','installer-ui/native/InstallerUI.m','installer-ui/admission/installer-admission.m','installer-ui/transport/InstallerPipeTransport.m','installer-ui/application/InstallerApplication.m','installer-ui/application/FixedApplicationOpener.m'];
const headers=['installer-ui/native/InstallerUI.h','installer-ui/admission/installer-admission.h','installer-ui/transport/InstallerPipeTransport.h','installer-ui/application/InstallerApplication.h','installer-ui/application/FixedApplicationOpener.h'];
const allowed=new Set([...sources,...headers]),exec=promisify(execFile),hash=b=>createHash('sha256').update(b).digest('hex');
const identity=s=>[s.dev,s.ino,s.mode,s.uid,s.nlink,s.size,s.mtimeNs,s.ctimeNs].join(':');
const fail=code=>{throw Object.assign(Error(code),{code});};
assert.equal(process.platform,'darwin');assert.equal(process.arch,'arm64');assert.equal(process.argv.length,6);
const [resultPath,resultSha256,restoredArg,outArg]=process.argv.slice(2),temp=await realpath(process.env.RUNNER_TEMP),workspace=await realpath(process.env.GITHUB_WORKSPACE);
const restored=await realpath(restoredArg),out=resolve(outArg),sourceRoot=await realpath(fileURLToPath(new URL('../',import.meta.url)));
assert.equal(restoredArg,restored);assert(out.startsWith(temp+'/'));assert(sourceRoot.startsWith(workspace+'/'));assert.equal(await realpath(dirname(out)),dirname(out));await mkdir(out,{mode:0o700});process.umask(0o077);
const result={schema:1,status:'fail',scope:'Reviewed native-revalidation payload: build, ad-hoc signature, archive and restore only; no UI certification',sourceCommit:process.env.GITHUB_SHA??null,applicationStarted:false,installationPerformed:false,fullMacCertification:'blocked',commands:[],notVerified:['Installer UI actual interaction','Install confirmation','LaunchServices installer lifecycle','Physical Mac input','Developer ID/notarization','Private data continuation']};
async function save(path,value,mode=0o444){await writeFile(path,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});await chmod(path,mode);}
async function digest(path){const h=createHash('sha256');for await(const b of createReadStream(path))h.update(b);return h.digest('hex');}
async function capture(relative){
 assert(allowed.has(relative));const path=join(sourceRoot,relative),before=await lstat(path,{bigint:true});
 if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1n||before.size<0n||before.size>4194304n||(before.mode&0o022n)||await realpath(path)!==path)fail('SEP_INSTALLER_NATIVE_SOURCE');
 const f=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);let bytes;
 try{if(identity(before)!==identity(await f.stat({bigint:true})))fail('SEP_INSTALLER_NATIVE_SOURCE');bytes=await f.readFile();if(bytes.length!==Number(before.size)||identity(before)!==identity(await f.stat({bigint:true}))||identity(before)!==identity(await lstat(path,{bigint:true}))||await realpath(path)!==path)fail('SEP_INSTALLER_NATIVE_SOURCE');}finally{await f.close();}
 const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
 for(const match of text.matchAll(/^\s*#\s*(?:import|include)\s*"([^"\r\n]+)"/gm)){const target=resolve(dirname(path),match[1]);if(![...allowed].some(p=>join(sourceRoot,p)===target))fail('SEP_INSTALLER_NATIVE_INCLUDE');}
 return{path:relative,sha256:hash(bytes),identity:identity(before),bytes};
}
async function run(name,file,args,timeout=300000){
 let r;try{r=await exec(file,args,{cwd:out,env:{PATH:'/usr/bin:/bin:/usr/sbin:/sbin',LANG:'en_US.UTF-8'},timeout,killSignal:'SIGKILL',maxBuffer:2097152});}catch(e){r=e;}
 const log=Buffer.from(String(r.stdout??'')+'\n'+String(r.stderr??'')),logPath=join(out,name+'.log');await writeFile(logPath,log.subarray(0,2097152),{flag:'wx',mode:0o600});
 const receipt={name,file,exitCode:typeof r.code==='number'?r.code:r.code?null:0,signal:r.signal??null,timedOut:!!r.killed,logSha256:await digest(logPath),logTruncated:log.length>2097152,status:r instanceof Error?'fail':'pass'};
 if(receipt.status!=='pass')receipt.processFamilyCleanup='not_verified';result.commands.push(receipt);if(receipt.status!=='pass')fail('SEP_INSTALLER_APPLICATION_COMMAND');
}
try{
 result.currentSources=await verifyInstallerSources(sourceRoot);
 const pinPath=join(sourceRoot,'package/installer-native-inputs.json'),pinBytes=await readFile(pinPath),pin=JSON.parse(pinBytes);result.nativePinsSha256=hash(pinBytes);
 if(pin.schema!==1||pin.status!=='build-ready'||!Array.isArray(pin.files)||pin.files.length!==allowed.size||new Set(pin.files.map(x=>x.path)).size!==allowed.size||pin.files.some(x=>!allowed.has(x.path)||!/^[a-f0-9]{64}$/.test(x.sha256??'')))fail('SEP_INSTALLER_NATIVE_INPUTS_PENDING');
 const captured=[];for(const row of pin.files){const value=await capture(row.path);if(value.sha256!==row.sha256)fail('SEP_INSTALLER_NATIVE_SOURCE');captured.push(value);}result.nativeInputs=captured.map(({path,sha256})=>({path,sha256}));
 const captureRoot=join(out,'native-source');await mkdir(captureRoot,{mode:0o700});for(const row of captured){const target=join(captureRoot,row.path);await mkdir(dirname(target),{recursive:true,mode:0o700});await writeFile(target,row.bytes,{flag:'wx',mode:0o600});await chmod(target,0o444);}
 const binding=await readCandidate({resultPath,resultSha256,restoredRoot:restored,runnerTemp:temp}),inventory=JSON.parse(await readFile(join(restored,'PACKAGE-INVENTORY.json'),'utf8'));
 const receipt={inventory,programSha256:binding.programSha256,bootstrapSha256:binding.bootstrapSha256};await verifyCandidate(binding.restoredApplication,receipt);
 result.payload={sourceAssemblySha256:binding.sourceAssemblySha256,programSha256:binding.programSha256,bootstrapSha256:binding.bootstrapSha256,archiveSha256:binding.artifactSha256,treeSha256:binding.treeSha256,entries:inventory.entries.length,totalBytes:inventory.totalBytes};
 const app=join(out,'DSH SEP Installer.app'),contents=join(app,'Contents');await mkdir(app,{mode:0o755});await chmod(app,0o755);
 const resource=await assembleInstallerResources({sourceApp:binding.restoredApplication,receipt,sourceRoot,contents});assert.equal(resource.status,'pass');await save(join(out,'RESOURCES.json'),resource);result.resources={manifestSha256:resource.manifestSha256,source:resource.source,compilers:resource.compilers};
 const info={CFBundleName:'DSH SEP Installer',CFBundleDisplayName:'DSH SEP Installer',CFBundleExecutable:'DSH SEP Installer',CFBundleIdentifier:'app.dshsep.macos.installer.alpha2.preview',CFBundlePackageType:'APPL',CFBundleShortVersionString:'0.2.1',CFBundleVersion:'1',LSMinimumSystemVersion:'15.7',NSHighResolutionCapable:true};
 const infoPath=join(out,'installer-info.json');await save(infoPath,info);await run('info','/usr/bin/plutil',['-convert','xml1','-o',join(contents,'Info.plist'),infoPath]);await chmod(join(contents,'Info.plist'),0o444);
 const binary=join(contents,'MacOS/DSH SEP Installer');await mkdir(dirname(binary),{mode:0o755});
 // No testing macro or caller-provided compile flag is admitted. Sources and
 // quoted local headers come only from the exact captured eleven-file set.
 await run('compile-installer','/usr/bin/clang',['-fobjc-arc','-Wall','-Wextra','-Werror','-Wno-deprecated-declarations','-framework','AppKit','-framework','Security',`-DSEP_INSTALLER_MANIFEST_SHA256="${resource.manifestSha256}"`,...sources.map(p=>join(captureRoot,p)),'-o',binary],120000);await chmod(binary,0o755);
 for(const row of captured){const after=await capture(row.path);if(after.sha256!==row.sha256||after.identity!==row.identity||await digest(join(captureRoot,row.path))!==row.sha256)fail('SEP_INSTALLER_NATIVE_SOURCE');}
 if(await digest(pinPath)!==result.nativePinsSha256)fail('SEP_INSTALLER_NATIVE_SOURCE');
 const manifestBefore=await readFile(resource.manifestPath),built=await buildInstallerManifest(contents);assert.equal(hash(manifestBefore),resource.manifestSha256);assert.deepEqual(JSON.parse(manifestBefore),built);
 result.signingLayout=await prepareInstallerSigning({contents,evidencePath:join(out,'RESOURCES-BUILD.json'),resource});
 // Only the outer app is signed. Never --deep re-sign Node, helpers, payload or
 // any previously hash-bound role. Verification may inspect nested signatures.
 await run('sign-outer','/usr/bin/codesign',['--force','--sign','-',app]);await run('verify-outer','/usr/bin/codesign',['--verify','--deep','--strict','--verbose=2',app]);
 assert.equal(await digest(resource.manifestPath),resource.manifestSha256);assert.deepEqual(await buildInstallerManifest(contents),built);await loadInstallerConfiguration(contents,resource.manifestSha256);
 const complete=await inventoryPackage(app);await save(join(out,'PACKAGE-INVENTORY.json'),complete);await verifyPackage(app,complete);
 const artifact='DSH-SEP-macOS-Alpha2-installer-preview.zip',archive=join(out,artifact);await run('archive','/usr/bin/ditto',['-c','-k','--sequesterRsrc','--keepParent',app,archive],600000);
 const restore=join(out,'restored');await mkdir(restore,{mode:0o700});await run('restore','/usr/bin/ditto',['-x','-k',archive,restore],600000);const restoredApp=join(restore,'DSH SEP Installer.app');
 await verifyPackage(restoredApp,complete);await run('verify-restored','/usr/bin/codesign',['--verify','--deep','--strict','--verbose=2',restoredApp]);await loadInstallerConfiguration(join(restoredApp,'Contents'),resource.manifestSha256);
 await verifyCandidate(binding.restoredApplication,receipt);Object.assign(result,{status:'pass',application:app,restoredApplication:restoredApp,manifestSha256:resource.manifestSha256,treeSha256:complete.treeSha256,artifact,artifactSha256:await digest(archive),artifactBytes:(await lstat(archive)).size,payloadUnchanged:true,nativeSourceUnchanged:true,currentSourcesAfter:await verifyInstallerSources(sourceRoot)});
}catch(e){result.code=/^SEP_[A-Z0-9_]{1,100}$/.test(e?.code??'')?e.code:'SEP_INSTALLER_APPLICATION_BUILD';result.errorType=e.name;result.failureArtifactsPreserved=true;process.exitCode=1;}
finally{await save(join(out,'RESULT.json'),result,0o600);console.log(JSON.stringify({status:result.status,code:result.code,artifact:result.artifact,manifestSha256:result.manifestSha256}));}
