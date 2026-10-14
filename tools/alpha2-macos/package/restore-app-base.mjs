// Reuse the immutable r33 preview as input to a new, separate application.
// No prior artifact is rebuilt or relabelled as a later verification result.
import assert from 'node:assert/strict';
import {mkdir,realpath,readFile,writeFile} from 'node:fs/promises';
import {createWriteStream,createReadStream} from 'node:fs';
import {Readable,Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {createHash} from 'node:crypto';
import {join,resolve,dirname} from 'node:path';
import {runOwnedCommand} from '../desktop/run-command.mjs';
import {verifyPackage} from './package-inventory.mjs';
assert.equal(process.platform,'darwin');assert.equal(process.arch,'arm64');
const out=resolve(process.argv[2]),temp=await realpath(process.env.RUNNER_TEMP);
assert(out.startsWith(temp+'/'));assert.equal(await realpath(dirname(out)),dirname(out));
await mkdir(out,{mode:0o700});
const source={run:38557966121,commit:'7aa4b2113d1b858d4f7358a9cfbd93e780a2de5b',artifactId:11891016729,bytes:653163007,sha256:'e7aab0bf4890a3a86c51e8532b3faf8c6a5adb5f16225944110e2c642883fd5c',innerSha256:'61794443c47753b64d2bf770d98c4c6202f1dc49407e9218c9893ce8b64a0e94',treeSha256:'59ede7a177436158cef44412d26a5063d5c3463fba04635b5891f7cb2928a83d',programSha256:'172e7fd05b6da4fef28d210846f28f674e684283621473c0458d5e9b2d26164f'};
const result={schema:1,status:'fail',scope:'restore fixed previous preview only',source,commands:[]};
const digest=async path=>{const h=createHash('sha256');for await(const b of createReadStream(path))h.update(b);return h.digest('hex');};
async function ditto(label,args){const r=await runOwnedCommand({file:'/usr/bin/ditto',args,cwd:out,env:{PATH:'/usr/bin:/bin:/usr/sbin:/sbin',LANG:'en_US.UTF-8'},logPath:join(out,label+'.log'),timeoutMs:300000});result.commands.push({label,...r,tail:undefined});assert.equal(r.status,'pass');}
try{
 const token=process.env.SEP_ARTIFACT_TOKEN;assert(token);
 const response=await fetch('https://api.github.com/repos/Lance-QwQ/DSH-SEP/actions/artifacts/'+source.artifactId+'/zip',{redirect:'manual',headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(60000)});
 assert([301,302,303,307,308].includes(response.status));
 const url=new URL(response.headers.get('location'));assert.equal(url.protocol,'https:');assert(url.hostname.endsWith('.blob.core.windows.net')||url.hostname.endsWith('.actions.githubusercontent.com'));
 const reply=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(600000)});assert(reply.ok);
 let bytes=0;const hash=createHash('sha256'),archive=join(out,'previous-artifact.zip');
 await pipeline(Readable.fromWeb(reply.body),new Transform({transform(b,encoding,done){bytes+=b.length;if(bytes>source.bytes)return done(Error('SEP_MAC_BASE_SIZE'));hash.update(b);done(null,b);}}),createWriteStream(archive,{flags:'wx',mode:0o600}));
 assert.equal(bytes,source.bytes);assert.equal(hash.digest('hex'),source.sha256);
 const evidence=join(out,'previous-evidence');await mkdir(evidence,{mode:0o700});await ditto('restore-evidence',['-x','-k',archive,evidence]);
 const inner=join(evidence,'DSH-SEP-macOS-Alpha2-preview.zip');assert.equal(await digest(inner),source.innerSha256);
 const restored=join(out,'restored');await mkdir(restored,{mode:0o700});await ditto('restore-package',['-x','-k',inner,restored]);
 const packageRoot=join(restored,'DSH-SEP-macOS-Alpha2-preview'),inventory=JSON.parse(await readFile(join(evidence,'PACKAGE-INVENTORY.json'),'utf8'));
 assert.equal(inventory.treeSha256,source.treeSha256);result.verification=await verifyPackage(packageRoot,inventory);
 assert.equal(await digest(join(packageRoot,'PROGRAM.json')),source.programSha256);
 result.status='pass';result.packageRoot=packageRoot;result.notVerified=['new application derivation','new application startup or shutdown','new application signature'];
}catch(e){result.code=/^[A-Z][A-Z0-9_]{1,90}$/.test(e?.code??'')?e.code:'SEP_MAC_BASE_RESTORE_FAILED';result.errorType=e.name;process.exitCode=1;}
finally{await writeFile(join(out,'RESULT.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({status:result.status,code:result.code,scope:result.scope}));}
