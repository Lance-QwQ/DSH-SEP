// Compile-only preflight. No admission, UI, helper or payload is executed.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,lstat,realpath,open,chmod} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const sourceRoot=await realpath(fileURLToPath(new URL('../',import.meta.url))),out=resolve(process.argv[2]),sha=b=>createHash('sha256').update(b).digest('hex'),exec=promisify(execFile);
const implementations=['installer-ui/application/main.m','installer-ui/native/InstallerUI.m','installer-ui/admission/installer-admission.m','installer-ui/transport/InstallerPipeTransport.m','installer-ui/application/InstallerApplication.m','installer-ui/application/FixedApplicationOpener.m'];
const headers=['installer-ui/native/InstallerUI.h','installer-ui/admission/installer-admission.h','installer-ui/transport/InstallerPipeTransport.h','installer-ui/application/InstallerApplication.h','installer-ui/application/FixedApplicationOpener.h'];
const allowed=new Set([...implementations,...headers]),identity=s=>[s.dev,s.ino,s.mode,s.uid,s.nlink,s.size,s.mtimeNs,s.ctimeNs].join(':');
assert.equal(process.platform,'darwin');assert.equal(process.arch,'arm64');assert.equal(process.argv.length,3);const temp=await realpath(process.env.RUNNER_TEMP),workspace=await realpath(process.env.GITHUB_WORKSPACE);assert(out.startsWith(temp+'/'));assert(sourceRoot.startsWith(workspace+'/'));assert.equal(await realpath(dirname(out)),dirname(out));await mkdir(out,{mode:0o700});
const result={schema:1,status:'fail',scope:'Exact production six-source compile-only preflight, with dummy manifest hash; not native admission or UI acceptance',executed:false,manifestSha256:'0'.repeat(64),sourceCommit:process.env.GITHUB_SHA??null,inputs:[]};
async function capture(relative){
 const path=join(sourceRoot,relative),before=await lstat(path,{bigint:true});assert(allowed.has(relative)&&before.isFile()&&!before.isSymbolicLink()&&before.nlink===1n&&before.size>0n&&before.size<=4194304n&&(before.mode&0o022n)===0n);assert.equal(await realpath(path),path);const f=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);let bytes;
 try{assert.equal(identity(await f.stat({bigint:true})),identity(before));bytes=await f.readFile();assert.equal(bytes.length,Number(before.size));assert.equal(identity(await f.stat({bigint:true})),identity(before));assert.equal(identity(await lstat(path,{bigint:true})),identity(before));assert.equal(await realpath(path),path);}finally{await f.close();}
 const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);for(const match of text.matchAll(/^\s*#\s*(?:import|include)\s*"([^"\r\n]+)"/gm))assert([...allowed].some(p=>join(sourceRoot,p)===resolve(dirname(path),match[1])));return{path:relative,sha256:sha(bytes),identity:identity(before),bytes};
}
try{
 const pinPath=join(sourceRoot,'package/installer-native-inputs.json'),pinBytes=await readFile(pinPath),pin=JSON.parse(pinBytes);result.nativePinsSha256=sha(pinBytes);assert.equal(pin.schema,1);assert.equal(pin.status,'build-ready');assert.equal(pin.files.length,11);assert.equal(new Set(pin.files.map(x=>x.path)).size,11);assert(pin.files.every(x=>allowed.has(x.path)&&/^[a-f0-9]{64}$/.test(x.sha256)));
 const captured=[];for(const row of pin.files){const source=await capture(row.path);assert.equal(source.sha256,row.sha256);captured.push(source);const target=join(out,'source',row.path);await mkdir(dirname(target),{recursive:true,mode:0o700});await writeFile(target,source.bytes,{flag:'wx',mode:0o600});await chmod(target,0o444);}result.inputs=captured.map(({path,sha256})=>({path,sha256}));
 const binary=join(out,'compile-only-installer'),args=['-fobjc-arc','-Wall','-Wextra','-Werror','-Wno-deprecated-declarations','-framework','AppKit','-framework','Security',`-DSEP_INSTALLER_MANIFEST_SHA256="${result.manifestSha256}"`,...implementations.map(p=>join(out,'source',p)),'-o',binary];
 let native;try{native=await exec('/usr/bin/clang',args,{cwd:out,env:{PATH:'/usr/bin:/bin:/usr/sbin:/sbin',LANG:'en_US.UTF-8'},timeout:120000,maxBuffer:2097152});}catch(e){native=e;}
 const log=Buffer.from(String(native.stdout??'')+'\n'+String(native.stderr??''));await writeFile(join(out,'compile.log'),log.subarray(0,2097152),{flag:'wx',mode:0o600});result.compile={exitCode:typeof native.code==='number'?native.code:native.code?null:0,signal:native.signal??null,timedOut:!!native.killed,logSha256:sha(log.subarray(0,2097152)),logTruncated:log.length>2097152,...native instanceof Error?{processFamilyCleanup:'not_verified'}:{}};assert(!(native instanceof Error));assert.equal(result.compile.exitCode,0);
 for(const row of captured){const again=await capture(row.path);assert.equal(again.sha256,row.sha256);assert.equal(again.identity,row.identity);assert.equal(sha(await readFile(join(out,'source',row.path))),row.sha256);}assert.equal(sha(await readFile(pinPath)),result.nativePinsSha256);result.binarySha256=sha(await readFile(binary));result.status='pass';
}catch(e){result.code=typeof e.code==='string'?e.code:'SEP_INSTALLER_NATIVE_PREFLIGHT_FAILED';result.errorType=e.name;process.exitCode=1;}
finally{await writeFile(join(out,'RESULT.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({status:result.status,compile:result.compile,executed:false}));}
