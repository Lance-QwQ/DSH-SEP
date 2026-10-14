import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile,chmod,symlink,link,rename,lstat,realpath} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
const exec=promisify(execFile),hash=b=>createHash('sha256').update(b).digest('hex'),here=fileURLToPath(new URL('.',import.meta.url));
const paths={program:'Resources/PROGRAM.json',node:'Helpers/DSH SEP Desktop.app/Contents/Resources/runtime/primary-runtime/dependencies/node/bin/node',controller:'Resources/product/runtime/bootstrap/controller.mjs',dependency:'Resources/product/runtime/desktop/managed-broker/launch-full.mjs'};
const cases=[
 ['fixed-bundle','SEP_BOOTSTRAP_PRODUCTION_NOT_CONNECTED'],['external-args','SEP_BOOTSTRAP_PRODUCTION_ARGUMENTS'],
 ['manifest-digest','SEP_BOOTSTRAP_MANIFEST_CHANGED'],['manifest-extra-key','SEP_BOOTSTRAP_MANIFEST'],
 ['path-traversal','SEP_BOOTSTRAP_MANIFEST'],['closure-bytes','SEP_BOOTSTRAP_RESOURCE_CHANGED'],
 ['closure-symlink','SEP_BOOTSTRAP_RESOURCE_IDENTITY'],['closure-hardlink','SEP_BOOTSTRAP_RESOURCE_IDENTITY'],
 ['program-bytes','SEP_BOOTSTRAP_RESOURCE_CHANGED'],['unsafe-mode','SEP_BOOTSTRAP_RESOURCE_IDENTITY'],
 ['closure-parent-alias','SEP_BOOTSTRAP_RESOURCE_IDENTITY'],['missing-closure','SEP_BOOTSTRAP_RESOURCE_IDENTITY'],
 ['unlisted-runtime-file','SEP_BOOTSTRAP_RESOURCE_IDENTITY'],
];
for(const [name,expected] of cases)test('non-test fixed NSBundle manifest: '+name,{skip:process.platform!=='darwin'?'native macOS required':false,timeout:30000},async()=>{
 const base=process.env.SEP_BOOTSTRAP_PRODUCTION_NATIVE_ROOT;assert(base);assert.equal(await realpath(base),base);
 const root=join(base,name);await mkdir(root,{mode:0o700});const app=join(root,'SEP Identity Test.app'),contents=join(app,'Contents'),binary=join(contents,'MacOS/DSH SEP');await mkdir(dirname(binary),{recursive:true,mode:0o700});
 await writeFile(join(contents,'Info.plist'),'<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>DSH SEP</string><key>CFBundleIdentifier</key><string>ai.dshsep.identity.fixture</string><key>CFBundlePackageType</key><string>APPL</string><key>LSUIElement</key><true/></dict></plist>\n',{flag:'wx',mode:0o444});
 const bytes={program:Buffer.from('{"fixture":"not-a-live-program"}\n'),node:Buffer.from('identity-only-executable-placeholder\n'),controller:Buffer.from('throw Error("must never execute this identity fixture");\n'),dependency:Buffer.from('export const identityFixture=true;\n')};
 for(const role of Object.keys(paths)){const file=join(contents,paths[role]);await mkdir(dirname(file),{recursive:true,mode:0o700});await writeFile(file,bytes[role],{flag:'wx',mode:role==='node'?0o555:0o444});}
 const entry=role=>({path:paths[role],sha256:hash(bytes[role])});const manifest={schema:1,layout:'macos-app-v1',program:entry('program'),node:entry('node'),controller:entry('controller'),closure:[entry('controller'),entry('dependency')]};
 if(name==='manifest-extra-key')manifest.dataRoot='/tmp/externally-specified';
 if(name==='path-traversal')manifest.closure[1].path='Resources/product/runtime/../escape.mjs';
 const data=Buffer.from(JSON.stringify(manifest)+'\n'),manifestPath=join(contents,'Resources/BOOTSTRAP.json');await writeFile(manifestPath,data,{flag:'wx',mode:0o444});
 const digest=name==='manifest-digest'?'0'.repeat(64):hash(data);
 let compiled;try{compiled=await exec('/usr/bin/clang',['-fobjc-arc','-Wall','-Wextra','-Werror',`-DSEP_BOOTSTRAP_MANIFEST_SHA256="${digest}"`,'-framework','AppKit',join(here,'appkit-bootstrap.m'),'-o',binary],{timeout:20000,maxBuffer:1048576});}catch(error){compiled=error;}
 await writeFile(join(root,'compile.log'),String(compiled.stdout??'')+'\n'+String(compiled.stderr??''),{flag:'wx'});assert.equal(compiled.code,undefined,'production identity fixture must compile');
 const dependency=join(contents,paths.dependency);
 if(name==='closure-bytes'||name==='program-bytes'){const file=name==='closure-bytes'?dependency:join(contents,paths.program);await chmod(file,0o600);await writeFile(file,'changed\n');await chmod(file,0o444);}
 if(name==='closure-symlink'){const original=join(root,'outside.mjs');await rename(dependency,original);await symlink(original,dependency);}
 if(name==='closure-hardlink')await link(dependency,join(root,'another-link.mjs'));
 if(name==='unsafe-mode')await chmod(dependency,0o666);
 if(name==='closure-parent-alias'){const old=dirname(dependency),moved=join(root,'moved-runtime');await rename(old,moved);await symlink(moved,old);}
 if(name==='missing-closure')await rename(dependency,join(root,'missing.mjs'));
 if(name==='unlisted-runtime-file')await writeFile(join(dirname(dependency),'unlisted.mjs'),'export const foreign=true;\n',{flag:'wx',mode:0o444});
 let run;try{run=await exec(binary,name==='external-args'?['--synthetic-contract',manifestPath]:[],{timeout:5000,maxBuffer:65536,env:{PATH:'/usr/bin:/bin',HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,SEP_BOOTSTRAP_MANIFEST_SHA256:'f'.repeat(64),NODE_OPTIONS:'--eval throw'}});}catch(error){run=error;}
 await writeFile(join(root,'stdout.log'),String(run.stdout??''),{flag:'wx'});await writeFile(join(root,'stderr.log'),String(run.stderr??''),{flag:'wx'});
 assert.equal(run.code,78);const receipt=JSON.parse(String(run.stdout).trim());assert.equal(receipt.status,'blocked');assert.equal(receipt.code,expected);assert.equal(receipt.resourcesConfirmedReleased,false);
 if(name==='fixed-bundle')assert.equal(receipt.manifestVerified,true);
 await assert.rejects(lstat(join(root,'unexpected-started')),{code:'ENOENT'});
});
