import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile,realpath} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
const exec=promisify(execFile),hash=b=>createHash('sha256').update(b).digest('hex'),here=fileURLToPath(new URL('.',import.meta.url));
assert.equal(process.platform,'darwin');assert.equal(process.arch,'arm64');assert(process.argv[2]);
const out=resolve(process.argv[2]);assert.equal(await realpath(dirname(out)),dirname(out));await mkdir(out,{mode:0o700});
const app=join(out,'Bootstrap Contract.app'),contents=join(app,'Contents'),binary=join(contents,'MacOS/bootstrap-contract');await mkdir(dirname(binary),{recursive:true,mode:0o700});
await writeFile(join(contents,'Info.plist'),'<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleExecutable</key><string>bootstrap-contract</string><key>CFBundleIdentifier</key><string>ai.dshsep.bootstrap.synthetic</string><key>CFBundlePackageType</key><string>APPL</string><key>LSUIElement</key><true/></dict></plist>\n',{flag:'wx'});
let build;try{build=await exec('/usr/bin/clang',['-fobjc-arc','-Wall','-Wextra','-Werror','-DSEP_BOOTSTRAP_TESTING=1','-framework','AppKit',join(here,'appkit-bootstrap.m'),'-o',binary],{timeout:60000,maxBuffer:1048576});}catch(error){build=error;}
await writeFile(join(out,'compile.log'),String(build.stdout??'')+'\n'+String(build.stderr??''),{flag:'wx'});if(build.code!==undefined)throw build;
const cases=join(out,'cases');await mkdir(cases,{mode:0o700});let run;try{run=await exec(process.execPath,['--test',join(here,'native.test.mjs')],{env:{...process.env,SEP_BOOTSTRAP_BINARY:binary,SEP_BOOTSTRAP_TEST_ROOT:cases},timeout:150000,maxBuffer:4*1024*1024});}catch(error){run=error;}
await writeFile(join(out,'native.log'),String(run.stdout??'')+'\n'+String(run.stderr??''),{flag:'wx'});
// Compile a separate binary without the test macro; source inspection alone
// does not establish that its external descriptor entry is actually refused.
const productionBinary=join(dirname(binary),'bootstrap-production-check');let productionBuild;
try{productionBuild=await exec('/usr/bin/clang',['-fobjc-arc','-Wall','-Wextra','-Werror','-framework','AppKit',join(here,'appkit-bootstrap.m'),'-o',productionBinary],{timeout:60000,maxBuffer:1048576});}catch(error){productionBuild=error;}
await writeFile(join(out,'production-compile.log'),String(productionBuild.stdout??'')+'\n'+String(productionBuild.stderr??''),{flag:'wx'});if(productionBuild.code!==undefined)throw productionBuild;
const productionRoot=join(cases,'production');await mkdir(productionRoot,{mode:0o700});let production;
try{production=await exec(process.execPath,['--test',join(here,'production.test.mjs')],{env:{...process.env,SEP_BOOTSTRAP_PRODUCTION_BINARY:productionBinary,SEP_BOOTSTRAP_PRODUCTION_ROOT:productionRoot},timeout:30000,maxBuffer:1048576});}catch(error){production=error;}
await writeFile(join(out,'production.log'),String(production.stdout??'')+'\n'+String(production.stderr??''),{flag:'wx'});
const files=['appkit-bootstrap.m','fixture-controller.mjs','native.test.mjs','production.test.mjs','run-native.mjs','session.mjs','session.test.mjs'];
const result={schema:1,status:run.code===undefined&&production.code===undefined?'pass':'fail',scope:'synthetic AppKit contract and non-test entry refusal; no actual broker or Finder',expectedTests:6,groups:{synthetic:{definitions:5,originalDefinitions:4,modalDeadlineDefinitions:1,status:run.code===undefined?'pass':'fail'},productionRefusal:{definitions:1,status:production.code===undefined?'pass':'fail'}},inputs:await Promise.all(files.map(async file=>({file,sha256:hash(await readFile(join(here,file)))}))),logSha256:hash(await readFile(join(out,'native.log'))),productionLogSha256:hash(await readFile(join(out,'production.log'))),binaries:{syntheticSha256:hash(await readFile(binary)),nonTestSha256:hash(await readFile(productionBinary))},notVerified:['Real broker','Finder or Dock interactions','Lease acquisition','Production resource manifest','Developer ID or notarization']};await writeFile(join(out,'RESULT.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));if(run.code!==undefined||production.code!==undefined)throw Error('SEP_BOOTSTRAP_NATIVE_CONTRACT_FAILED');
