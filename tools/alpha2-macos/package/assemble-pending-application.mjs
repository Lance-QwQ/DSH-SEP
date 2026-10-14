// Isolated build operator: derive a NEW r44 copy. It never installs or starts it.
import assert from'node:assert/strict';
import{readFile,writeFile,mkdir,chmod,lstat,realpath}from'node:fs/promises';
import{createReadStream}from'node:fs';import{createHash}from'node:crypto';
import{join,dirname,resolve}from'node:path';
import{runOwnedCommand}from'../desktop/run-command.mjs';
import{verifyPackage,inventoryPackage}from'./package-inventory.mjs';
import{buildBootstrapManifest}from'./bootstrap-manifest-builder.mjs';
import{loadProgram,validateProgramShape,relativeProgramPath}from'../desktop/managed-broker/program-manifest.mjs';
import{applyProjectUi}from'../desktop/project-workflow-product/apply-to-application.mjs';
import{EXTRA_RUNTIME,RUNTIME_REPLACEMENT,BUSINESS_ENTRY}from'../desktop/project-workflow-product/pending-startup/package-inputs.mjs';
assert.equal(process.platform,'darwin');assert.equal(process.arch,'arm64');assert.equal(process.argv.length,6);
const [baseArg,sourceArg,asarArg,outArg]=process.argv.slice(2),temp=await realpath(process.env.RUNNER_TEMP),git=await realpath(process.env.GITHUB_WORKSPACE);
const base=await realpath(baseArg),source=await realpath(sourceArg),asar=await realpath(asarArg),out=resolve(outArg);
for(const p of [base,asar,out])assert(p.startsWith(temp+'/'));assert(source.startsWith(git+'/'));assert.equal(await realpath(dirname(out)),dirname(out));await mkdir(out,{mode:0o700});process.umask(0o077);
const fixed={program:'fbe989745254464885c390b7d6e55fd3883674faa26b705ea74833240c07d713',bootstrap:'ef6c6054a9affd6895639fe5c0a0fda746c0ecf8a9f33b1f6e3b48612077b009',tree:'128885968401b628b2c21974d045a70a04233bc04a0bfd3aa943eba1ce4e5ebd'};
const result={schema:1,status:'fail',scope:'fresh r44 project application with pending-plan startup derivative; build and restore only',sourceCommit:process.env.GITHUB_SHA??null,base:fixed,commands:[],fullMacCertification:'blocked'};
const hash=b=>createHash('sha256').update(b).digest('hex');
async function digest(path){const h=createHash('sha256');for await(const b of createReadStream(path))h.update(b);return h.digest('hex');}
async function run(name,file,args,timeoutMs=300000){const r=await runOwnedCommand({file,args,cwd:out,env:{PATH:'/usr/bin:/bin:/usr/sbin:/sbin',HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,RUNNER_TEMP:temp,GITHUB_WORKSPACE:git,LANG:'en_US.UTF-8'},logPath:join(out,name+'.log'),timeoutMs});result.commands.push({name,...r,tail:undefined});assert.equal(r.status,'pass','SEP_PROJECT_PACKAGE_'+name.toUpperCase());}
async function save(path,value){await writeFile(path,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o444});}
async function replace(path,bytes,expected){const s=await lstat(path);assert(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1);assert.equal(await realpath(path),path);if(expected)assert.equal(await digest(path),expected);await chmod(path,0o600);await writeFile(path,bytes);await chmod(path,0o644);assert.equal(await digest(path),hash(bytes));}
try{
 const restored=JSON.parse(await readFile(join(base,'RESULT.json'),'utf8'));assert.equal(restored.status,'pass');assert.equal(restored.source.commit,'569b4bdf6fd1ab2ebc7ec3aa5821b21cad3f2e4a');
 const original=join(base,'restored/DSH SEP.app'),inventory=JSON.parse(await readFile(join(base,'PACKAGE-INVENTORY.json'),'utf8'));assert.equal(restored.restoredApplication,original);assert.equal(inventory.treeSha256,fixed.tree);await verifyPackage(original,inventory);
 const originalContents=join(original,'Contents');assert.equal(await digest(join(originalContents,'Resources/PROGRAM.json')),fixed.program);assert.equal(await digest(join(originalContents,'Resources/BOOTSTRAP.json')),fixed.bootstrap);
 const draft=join(out,'draft');await mkdir(draft,{mode:0o700});const app=join(draft,'DSH SEP.app'),contents=join(app,'Contents');await run('copy-fixed-application','/usr/bin/ditto',[original,app]);await verifyPackage(app,inventory);
 await save(join(draft,'PROJECT-DRAFT.json'),{schema:1,status:'pass',application:app,baseProgramSha256:fixed.program});
 // The exact ASAR derivative validates original PROGRAM before any replacement.
 result.desktop=await applyProjectUi({applicationRoot:app,evidenceRoot:join(out,'desktop'),asarPath:asar});assert.equal(result.desktop.status,'pass','SEP_PROJECT_PACKAGE_DESKTOP');
 const runtime=join(contents,'Resources/product/runtime'),old=[];
 for(const name of ['runtime-inputs.json','image-runtime-inputs.json','document-runtime-inputs.json','product-runtime-inputs.json']){const value=JSON.parse(await readFile(new URL(name,import.meta.url),'utf8'));assert.equal(value.schema,1);old.push(...value.files);}
 assert.equal(old.length,58);assert.equal(new Set(old).size,58);assert.equal(EXTRA_RUNTIME.length,26);assert(old.includes(RUNTIME_REPLACEMENT.target));
 const rows=[...old.map(path=>({path,source:path===RUNTIME_REPLACEMENT.target?RUNTIME_REPLACEMENT.source:path})),...EXTRA_RUNTIME.map(path=>({path,source:path}))];assert.equal(new Set(rows.map(r=>r.path)).size,84);
 result.runtime=[];
 for(const row of rows){for(const p of [row.path,row.source]){relativeProgramPath(p);assert(/\.(?:mjs|cjs|js|json)$/.test(p)&&!/(?:^|\/)(?:tests?|fixtures?)(?:\/|\.)|\.test\./.test(p));}
  const from=join(source,row.source),before=await lstat(from,{bigint:true});assert(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1n&&before.size<=4194304n);assert.equal(await realpath(from),from);const bytes=await readFile(from),after=await lstat(from,{bigint:true});for(const k of ['dev','ino','size','mtimeNs','ctimeNs'])assert.equal(before[k],after[k]);
  const target=join(runtime,row.path);await mkdir(dirname(target),{recursive:true,mode:0o755});if(old.includes(row.path))await replace(target,bytes);else{await writeFile(target,bytes,{flag:'wx',mode:0o644});await chmod(target,0o644);}result.runtime.push({path:row.path,source:row.source,sha256:hash(bytes)});
 }
 const captured=await inventoryPackage(runtime);assert.deepEqual(captured.entries.filter(e=>e.kind==='file').map(e=>e.path).sort(),rows.map(r=>r.path).sort());
 const programPath=join(contents,'Resources/PROGRAM.json'),program=JSON.parse(await readFile(programPath,'utf8'));assert.equal(program.schema,4);program.entries.business.path=BUSINESS_ENTRY;
 for(const entry of Object.values(program.entries))entry.sha256=await digest(join(contents,entry.path));validateProgramShape(program);await replace(programPath,Buffer.from(JSON.stringify(program,null,2)+'\n'),fixed.program);const programSha256=await digest(programPath);await loadProgram(programPath,programSha256);
 const bootstrap=await buildBootstrapManifest(contents),bootstrapPath=join(contents,'Resources/BOOTSTRAP.json');assert.equal(bootstrap.program.sha256,programSha256);await replace(bootstrapPath,Buffer.from(JSON.stringify(bootstrap,null,2)+'\n'),fixed.bootstrap);const bootstrapSha256=await digest(bootstrapPath);
 await run('read-outer-info','/usr/bin/plutil',['-convert','json','-o',join(out,'old-info.json'),join(contents,'Info.plist')]);const info=JSON.parse(await readFile(join(out,'old-info.json'),'utf8'));assert.equal(info.CFBundleIdentifier,'app.dshsep.macos.alpha2.preview');info.CFBundleVersion='3';await save(join(out,'new-info.json'),info);await run('write-outer-info','/usr/bin/plutil',['-convert','xml1','-o',join(contents,'Info.plist'),join(out,'new-info.json')]);
 const binary=join(contents,'MacOS/DSH SEP');await run('compile-outer','/usr/bin/clang',['-fobjc-arc','-Wno-deprecated-declarations','-framework','AppKit',`-DSEP_BOOTSTRAP_MANIFEST_SHA256="${bootstrapSha256}"`,'-DSEP_BOOTSTRAP_PRODUCT_CONNECTED=1',join(source,'bootstrap/appkit-bootstrap.m'),'-o',binary]);await chmod(binary,0o755);
 await run('sign-outer','/usr/bin/codesign',['--force','--sign','-',app]);await run('verify-outer','/usr/bin/codesign',['--verify','--deep','--strict','--verbose=2',app]);await loadProgram(programPath,programSha256);assert.equal(await digest(bootstrapPath),bootstrapSha256);assert.deepEqual(await buildBootstrapManifest(contents),bootstrap);
 const finalInventory=await inventoryPackage(app);await save(join(out,'PACKAGE-INVENTORY.json'),finalInventory);await verifyPackage(app,finalInventory);
 const archive=join(out,'DSH-SEP-macOS-Alpha2-project-preview.zip');await run('archive','/usr/bin/ditto',['-c','-k','--sequesterRsrc','--keepParent',app,archive]);const restore=join(out,'restored');await mkdir(restore,{mode:0o700});await run('restore','/usr/bin/ditto',['-x','-k',archive,restore]);await verifyPackage(join(restore,'DSH SEP.app'),finalInventory);await run('verify-restored','/usr/bin/codesign',['--verify','--deep','--strict','--verbose=2',join(restore,'DSH SEP.app')]);await verifyPackage(original,inventory);
 Object.assign(result,{status:'pass',application:app,restoredApplication:join(restore,'DSH SEP.app'),programSha256,bootstrapSha256,treeSha256:finalInventory.treeSha256,artifact:'DSH-SEP-macOS-Alpha2-project-preview.zip',artifactSha256:await digest(archive),artifactBytes:(await lstat(archive)).size,originalUnchanged:true,notVerified:['actual new application startup and project UI','same Profile overlay migration','native project confirmation','physical input','Developer ID and notarization','private continuation','paid models','arbitrary process families']});
}catch(e){result.code=/^SEP_[A-Z0-9_]{1,100}$/.test(e.code??e.message??'')?e.code??e.message:'SEP_PROJECT_PACKAGE_FAILED';result.errorType=e.name;result.diagnostic=String(e.message).slice(0,300);process.exitCode=1;}
finally{await save(join(out,'RESULT.json'),result);console.log(JSON.stringify({status:result.status,code:result.code,artifact:result.artifact}));}
