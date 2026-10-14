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
const files=['appkit-bootstrap.m','fixture-controller.mjs','native.test.mjs','run-native.mjs','session.mjs','session.test.mjs'];
const result={schema:1,status:run.code===undefined?'pass':'fail',scope:'synthetic AppKit contract; no actual broker or Finder',expectedTests:4,inputs:await Promise.all(files.map(async file=>({file,sha256:hash(await readFile(join(here,file)))}))),logSha256:hash(await readFile(join(out,'native.log'))),notVerified:['Real broker','Finder or Dock interactions','Lease acquisition','Production resource manifest','Developer ID or notarization']};await writeFile(join(out,'RESULT.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));if(run.code!==undefined)throw Error('SEP_BOOTSTRAP_NATIVE_CONTRACT_FAILED');
