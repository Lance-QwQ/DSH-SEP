import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile,chmod,symlink,link,rename,lstat,realpath,cp} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {INSTALLER_PATHS as paths,validateInstallerManifest} from '../manifest.mjs';
const exec=promisify(execFile),hash=b=>createHash('sha256').update(b).digest('hex'),here=fileURLToPath(new URL('.',import.meta.url));
const dependency='Resources/runtime/support/closure.mjs';
const codes={identity:'SEP_INSTALLER_ADMISSION_RESOURCE_IDENTITY',changed:'SEP_INSTALLER_ADMISSION_RESOURCE_CHANGED',shape:'SEP_INSTALLER_ADMISSION_MANIFEST'};
const cases=[
 ['fixed-bundle',null],['non-test-report','SEP_INSTALLER_UI_NOT_CONNECTED'],['external-arguments','SEP_INSTALLER_ADMISSION_ARGUMENT'],
 ['manifest-digest','SEP_INSTALLER_ADMISSION_MANIFEST_CHANGED'],['manifest-extra-key',codes.shape],['path-traversal',codes.shape],['wrong-role-path',codes.shape],
 ['receipt-bytes',codes.changed],['receipt-metadata-mismatch',codes.shape],['payload-program-bytes',codes.changed],['payload-bootstrap-bytes',codes.changed],
 ['node-bytes',codes.changed],['core-helper-bytes',codes.changed],['helper-nonexecutable',codes.identity],['closure-bytes',codes.changed],
 ['closure-symlink',codes.identity],['node-hardlink',codes.identity],['file-group-write',codes.identity],['directory-group-write',codes.identity],
 ['runtime-parent-alias',codes.identity],['unlisted-runtime',codes.identity],['missing-runtime',codes.identity],['payload-alias',codes.identity],
 ['receipt-hardlink',codes.identity],['payload-parent-alias',codes.identity],['manifest-symlink',codes.identity],['test-runtime-in-manifest',codes.shape],
 ['file-replaced-after-read',codes.identity],['directory-replaced-after-read',codes.identity],
];
async function saved(root,run){await writeFile(join(root,'stdout.log'),String(run.stdout??''),{flag:'wx'});await writeFile(join(root,'stderr.log'),String(run.stderr??''),{flag:'wx'});}
async function boundaryRun(binary,root,mutate){
 const child=spawn(binary,[],{env:{PATH:'/usr/bin:/bin'},stdio:['ignore','pipe','pipe','pipe']});let stdout='',stderr='',mutated=false,hookError;
 child.stdout.on('data',b=>{stdout+=b;});child.stderr.on('data',b=>{stderr+=b;});let pending=Promise.resolve(),buffer='';
 child.stdio[3].on('data',b=>{buffer+=b;if(!buffer.endsWith('\n'))return;pending=pending.then(async()=>{if(buffer!=='read-boundary\n'||mutated)throw Error('HOOK_PROTOCOL');await mutate();mutated=true;child.stdio[3].write('A');}).catch(e=>{hookError=e;child.stdio[3].end();});});
 const closed=new Promise(resolve=>child.once('close',(code,signal)=>resolve({code,signal})));let timer,cleanup='none';
 const result=await Promise.race([closed,new Promise(resolve=>{timer=setTimeout(async()=>{cleanup='test-only exact probe SIGKILL after deadline';child.kill('SIGKILL');resolve(await closed);},12000);})]);clearTimeout(timer);await pending;
 await writeFile(join(root,'hook.json'),JSON.stringify({mutated,hookError:hookError?.message??null,cleanup,code:result.code,signal:result.signal})+'\n',{flag:'wx'});
 if(hookError)throw hookError;return {...result,stdout,stderr,mutated};
}
for(const [name,expected]of cases)test('fixed installer NSBundle admission: '+name,{timeout:45000},async()=>{
 assert.equal(process.platform,'darwin');const base=process.env.SEP_INSTALLER_ADMISSION_ROOT;assert(base);assert.equal(await realpath(base),base);
 const root=join(base,name);await mkdir(root,{mode:0o700});const app=join(root,'Install DSH SEP.app'),contents=join(app,'Contents'),binary=join(contents,'MacOS/DSH SEP Installer');await mkdir(dirname(binary),{recursive:true,mode:0o700});
 await writeFile(join(contents,'Info.plist'),'<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>DSH SEP Installer</string><key>CFBundleIdentifier</key><string>app.dshsep.installer.admission.fixture</string><key>CFBundlePackageType</key><string>APPL</string><key>LSUIElement</key><true/></dict></plist>\n',{flag:'wx',mode:0o444});
 const payload=join(contents,paths.payload),program=Buffer.from('{"scope":"synthetic admission identity only"}\n'),bootstrap=Buffer.from('{"scope":"never executed"}\n');await mkdir(join(payload,'Contents/Resources'),{recursive:true,mode:0o700});await writeFile(join(payload,'Contents/Resources/PROGRAM.json'),program,{flag:'wx',mode:0o444});await writeFile(join(payload,'Contents/Resources/BOOTSTRAP.json'),bootstrap,{flag:'wx',mode:0o444});
 const receipt={inventory:{scope:'synthetic; full payload verification belongs to the lower controller'},programSha256:hash(program),bootstrapSha256:hash(bootstrap)};if(name==='receipt-metadata-mismatch')receipt.programSha256='f'.repeat(64);
 const values={receipt:Buffer.from(JSON.stringify(receipt)+'\n'),node:Buffer.from('identity-only Node placeholder; never execute\n'),controller:Buffer.from('throw Error("must never execute");\n'),entryHelper:Buffer.from('identity-only helper placeholder\n'),coreHelper:Buffer.from('identity-only core placeholder\n')};
 for(const role of Object.keys(values)){const file=join(contents,paths[role]);await mkdir(dirname(file),{recursive:true,mode:0o700});await writeFile(file,values[role],{flag:'wx',mode:['node','entryHelper','coreHelper'].includes(role)?0o555:0o444});}
 await mkdir(dirname(join(contents,dependency)),{recursive:true,mode:0o700});const depBytes=Buffer.from('export const admitted=true;\n');await writeFile(join(contents,dependency),depBytes,{flag:'wx',mode:0o444});
 const entry=role=>({path:paths[role],sha256:hash(values[role])}),manifest={schema:1,layout:'macos-installer-v1',payload:{path:paths.payload,receipt:entry('receipt'),programSha256:hash(program),bootstrapSha256:hash(bootstrap)},node:entry('node'),controller:entry('controller'),entryHelper:entry('entryHelper'),coreHelper:entry('coreHelper'),closure:[entry('controller'),{path:dependency,sha256:hash(depBytes)}]};
 validateInstallerManifest(manifest);
 if(name==='manifest-extra-key')manifest.home='/tmp/no';if(name==='path-traversal')manifest.closure[1].path='Resources/runtime/../outside.mjs';if(name==='wrong-role-path')manifest.node.path='Resources/another-node';if(name==='test-runtime-in-manifest')manifest.closure[1].path='Resources/runtime/support/fixture-worker.mjs';
 const manifestBytes=Buffer.from(JSON.stringify(manifest)+'\n'),manifestPath=join(contents,'Resources/INSTALLER.json');await writeFile(manifestPath,manifestBytes,{flag:'wx',mode:0o444});const expectedHash=name==='manifest-digest'?'0'.repeat(64):hash(manifestBytes),hook=name.endsWith('-after-read');
 const flags=[`-DSEP_INSTALLER_MANIFEST_SHA256="${expectedHash}"`,...(name==='non-test-report'?[]:['-DSEP_INSTALLER_ADMISSION_REPORT=1']),...(hook?['-DSEP_INSTALLER_ADMISSION_TEST_HOOK=1']:[])];
 let compiled;try{compiled=await exec('/usr/bin/clang',['-fobjc-arc','-Wall','-Wextra','-Werror',...flags,'-framework','Foundation',join(here,'admission-probe.m'),join(here,'installer-admission.m'),'-o',binary],{timeout:20000,maxBuffer:1048576});}catch(e){compiled=e;}
 await writeFile(join(root,'compile.log'),String(compiled.stdout??'')+'\n'+String(compiled.stderr??''),{flag:'wx'});assert.equal(compiled.code,undefined,'admission fixture must compile');
 const dep=join(contents,dependency),replace=async(file,text)=>{await chmod(file,0o600);await writeFile(file,text);await chmod(file,0o444);};
 if(name==='receipt-bytes')await replace(join(contents,paths.receipt),'{}\n');if(name==='payload-program-bytes')await replace(join(payload,'Contents/Resources/PROGRAM.json'),'{}\n');if(name==='payload-bootstrap-bytes')await replace(join(payload,'Contents/Resources/BOOTSTRAP.json'),'{}\n');
 if(name==='node-bytes'||name==='core-helper-bytes'){const file=join(contents,paths[name==='node-bytes'?'node':'coreHelper']);await chmod(file,0o700);await writeFile(file,'changed\n');await chmod(file,0o555);}
 if(name==='helper-nonexecutable')await chmod(join(contents,paths.entryHelper),0o444);if(name==='closure-bytes')await replace(dep,'changed\n');
 if(name==='closure-symlink'){const outside=join(root,'outside.mjs');await rename(dep,outside);await symlink(outside,dep);}if(name==='node-hardlink')await link(join(contents,paths.node),join(root,'node-hardlink'));
 if(name==='file-group-write')await chmod(dep,0o664);if(name==='directory-group-write')await chmod(dirname(dep),0o770);
 if(name==='runtime-parent-alias'){const moved=join(root,'moved-runtime-parent');await rename(dirname(dep),moved);await symlink(moved,dirname(dep));}
 if(name==='unlisted-runtime')await writeFile(join(dirname(dep),'unlisted.mjs'),'export{}\n',{flag:'wx',mode:0o444});if(name==='missing-runtime')await rename(dep,join(root,'missing.mjs'));
 if(name==='payload-alias'){const moved=join(root,'moved-payload.app');await rename(payload,moved);await symlink(moved,payload);}if(name==='receipt-hardlink')await link(join(contents,paths.receipt),join(root,'receipt-hardlink'));
 if(name==='payload-parent-alias'){const moved=join(root,'moved-payload-parent');await rename(dirname(payload),moved);await symlink(moved,dirname(payload));}
 if(name==='manifest-symlink'){const moved=join(root,'manifest.json');await rename(manifestPath,moved);await symlink(moved,manifestPath);}
 let run;
 if(hook){run=await boundaryRun(binary,root,async()=>{if(name==='file-replaced-after-read'){await rename(dep,join(root,'original.mjs'));await writeFile(dep,depBytes,{flag:'wx',mode:0o444});}else{const moved=join(root,'original-support');await rename(dirname(dep),moved);await cp(moved,dirname(dep),{recursive:true});}});}
 else{try{run=await exec(binary,name==='external-arguments'?['--path',contents]:[],{env:{PATH:'/usr/bin:/bin',HOME:'/not-an-account',SEP_INSTALLER_MANIFEST_SHA256:'f'.repeat(64),NODE_OPTIONS:'--eval process.exit(91)'},timeout:6000,maxBuffer:131072});}catch(e){run=e;}}
 await saved(root,run);const result=JSON.parse(String(run.stdout).trim());
 if(expected===null){assert.equal(run.code,undefined);assert.equal(result.status,'pass');assert.equal(result.manifestVerified,true);assert.equal(result.config.contents,contents);assert.equal(result.config.sourceApp,payload);assert.equal(result.config.receiptPath,join(contents,paths.receipt));assert.equal(result.config.receiptSha256,hash(values.receipt));assert.equal(result.config.programSha256,hash(program));assert.equal(result.config.bootstrapSha256,hash(bootstrap));for(const role of ['node','controller','entryHelper','coreHelper'])assert.deepEqual(result.config[role],{path:join(contents,paths[role]),sha256:hash(values[role])});}
 else{assert.equal(run.code,78);assert.equal(result.status,'blocked');assert.equal(result.code,expected);assert.equal('config' in result,false);if(name==='non-test-report')assert.equal(result.manifestVerified,true);if(hook)assert.equal(run.mutated,true,'real held-fd read boundary was reached and mutated');}
 await assert.rejects(lstat(join(root,'unexpected-started')),{code:'ENOENT'});
});
