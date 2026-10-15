// Test operator only: restore exactly r44, with no rebuild, patch or re-sign.
import assert from 'node:assert/strict';
import {mkdir,realpath,readFile,writeFile,copyFile,open,stat} from 'node:fs/promises';
import {createWriteStream,createReadStream} from 'node:fs';
import {Readable,Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {createHash} from 'node:crypto';
import {join,resolve,dirname} from 'node:path';
import {runOwnedCommand} from '../desktop/run-command.mjs';
import {verifyPackage} from './package-inventory.mjs';
assert.equal(process.platform,'darwin');assert.equal(process.arch,'arm64');
const out=resolve(process.argv[2]),temp=await realpath(process.env.RUNNER_TEMP);
assert(out.startsWith(temp+'/'));assert.equal(await realpath(dirname(out)),dirname(out));await mkdir(out,{mode:0o700});
const source={run:38576229021,commit:'569b4bdf6fd1ab2ebc7ec3aa5821b21cad3f2e4a',assemblySha256:'18137f4f284b90cf28a23b293fb8fab035a9bcbba8fde4617a12eb89db2f1f65',archiveSha256:'6d0705c190bc56b3028cfa26a287ca04eba9ab39822e2edae1177a1033ccbf67',archiveBytes:647468896,treeSha256:'128885968401b628b2c21974d045a70a04233bc04a0bfd3aa943eba1ce4e5ebd',programSha256:'fbe989745254464885c390b7d6e55fd3883674faa26b705ea74833240c07d713',bootstrapSha256:'ef6c6054a9affd6895639fe5c0a0fda746c0ecf8a9f33b1f6e3b48612077b009',artifacts:[
 {label:'evidence',id:11900327240,bytes:1250543,sha256:'4d8a099d73d9d446d2b00ced617b48b09f28b5046fe159314c4d9a98cb2df222'},
 {label:'part-one',id:11900412268,bytes:402654429,sha256:'de11207c1024cd8ee800b0d82b306c4326cc9969c7817be77295351b673c3a99'},
 {label:'part-two',id:11900587137,bytes:244815934,sha256:'d5298c524ab05520cc1cadde6bfe87114054a605edc3de364d80939cbd031695'}]};
const result={schema:1,status:'fail',scope:'restore exact r44 signed application bytes; no new product build',source,commands:[]};
const digest=async path=>{const h=createHash('sha256');for await(const b of createReadStream(path))h.update(b);return h.digest('hex');};
async function run(label,file,args){const r=await runOwnedCommand({file,args,cwd:out,env:{PATH:'/usr/bin:/bin:/usr/sbin:/sbin',LANG:'en_US.UTF-8'},logPath:join(out,label+'.log'),timeoutMs:300000});result.commands.push({label,...r,tail:undefined});assert.equal(r.status,'pass');}
try{
 const token=process.env.SEP_ARTIFACT_TOKEN;assert(token);
 for(const item of source.artifacts){
  const response=await fetch('https://api.github.com/repos/Lance-QwQ/DSH-SEP/actions/artifacts/'+item.id+'/zip',{redirect:'manual',headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(60000)});assert([301,302,303,307,308].includes(response.status));
  const url=new URL(response.headers.get('location'));assert.equal(url.protocol,'https:');assert(url.hostname.endsWith('.blob.core.windows.net')||url.hostname.endsWith('.actions.githubusercontent.com'));
  const reply=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(600000)});assert(reply.ok);let bytes=0;const hash=createHash('sha256'),archive=join(out,item.label+'.zip');
  await pipeline(Readable.fromWeb(reply.body),new Transform({transform(b,e,done){bytes+=b.length;if(bytes>item.bytes)return done(Error('SEP_MAC_FIXED_ARTIFACT_SIZE'));hash.update(b);done(null,b);}}),createWriteStream(archive,{flags:'wx',mode:0o600}));assert.equal(bytes,item.bytes);assert.equal(hash.digest('hex'),item.sha256);
  await mkdir(join(out,item.label),{mode:0o700});await run('extract-'+item.label,'/usr/bin/ditto',['-x','-k',archive,join(out,item.label)]);
 }
 const original=join(out,'evidence/application-build/RESULT.json');assert.equal(await digest(original),source.assemblySha256);const assembly=JSON.parse(await readFile(original,'utf8'));assert.equal(assembly.status,'pass');assert.equal(assembly.artifactSha256,source.archiveSha256);assert.equal(assembly.artifactBytes,source.archiveBytes);
 const transport=JSON.parse(await readFile(join(out,'part-one/transport-manifest.json'),'utf8'));assert.equal(transport.status,'pass');assert.equal(transport.assemblyResultSha256,source.assemblySha256);assert.equal(transport.parts.length,2);assert.deepEqual(transport.artifact,{name:assembly.artifact,sha256:source.archiveSha256,bytes:source.archiveBytes});
 const archive=join(out,assembly.artifact);assert.equal(dirname(archive),out);const fh=await open(archive,'wx',0o600);let total=0;
 try{for(let i=0;i<2;i++){const row=transport.parts[i];assert.equal(row.index,i+1);assert.match(row.name,/^[A-Za-z0-9._-]+\.part$/);const path=join(out,i===0?'part-one':'part-two',row.name);assert.equal((await stat(path)).size,row.bytes);assert.equal(await digest(path),row.sha256);for await(const b of createReadStream(path)){let offset=0;while(offset<b.length){const r=await fh.write(b,offset,b.length-offset);assert(r.bytesWritten>0);offset+=r.bytesWritten;}total+=b.length;assert(total<=source.archiveBytes);}}await fh.sync();}finally{await fh.close();}
 assert.equal(total,source.archiveBytes);assert.equal(await digest(archive),source.archiveSha256);
 const restored=join(out,'restored');await mkdir(restored,{mode:0o700});await run('restore-fixed-application','/usr/bin/ditto',['-x','-k',archive,restored]);
 const app=join(restored,'DSH SEP.app'),inventoryPath=join(out,'evidence/application-build/PACKAGE-INVENTORY.json'),inventory=JSON.parse(await readFile(inventoryPath,'utf8'));assert.equal(inventory.treeSha256,source.treeSha256);result.verification=await verifyPackage(app,inventory);await copyFile(inventoryPath,join(out,'PACKAGE-INVENTORY.json'));
 assert.equal(await digest(join(app,'Contents/Resources/PROGRAM.json')),source.programSha256);assert.equal(await digest(join(app,'Contents/Resources/BOOTSTRAP.json')),source.bootstrapSha256);await run('verify-fixed-signature','/usr/bin/codesign',['--verify','--deep','--strict','--verbose=2',app]);
 Object.assign(result,{status:'pass',restoredApplication:app,programSha256:source.programSha256,bootstrapSha256:source.bootstrapSha256,treeSha256:source.treeSha256,notVerified:['new native lifecycle test outcome','new DOM diagnostic outcome','Developer ID and notarization']});
}catch(e){result.code=/^SEP_[A-Z0-9_]{1,90}$/.test(e?.code??'')?e.code:'SEP_MAC_FIXED_APPLICATION_RESTORE';result.errorType=e.name;process.exitCode=1;}
finally{await writeFile(join(out,'RESULT.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({status:result.status,code:result.code,scope:result.scope}));}
