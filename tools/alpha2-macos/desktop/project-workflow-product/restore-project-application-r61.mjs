// Test operator only: restore exactly r61, with no rebuild, patch or re-sign.
import assert from 'node:assert/strict';
import {mkdir,realpath,readFile,writeFile,copyFile,open,stat} from 'node:fs/promises';
import {createWriteStream,createReadStream} from 'node:fs';
import {Readable,Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {createHash} from 'node:crypto';
import {join,resolve,dirname} from 'node:path';
import {runOwnedCommand} from '../run-command.mjs';
import {verifyPackage} from '../../package/package-inventory.mjs';
assert.equal(process.platform,'darwin');assert.equal(process.arch,'arm64');assert.equal(process.argv.length,3);
const out=resolve(process.argv[2]),temp=await realpath(process.env.RUNNER_TEMP);
assert(out.startsWith(temp+'/'));assert.equal(await realpath(dirname(out)),dirname(out));await mkdir(out,{mode:0o700});
const source={
  "schema": 1,
  "run": 38629693549,
  "commit": "157eef6bcaaee8db959f37ed267ff202b9bc206c",
  "assemblySha256": "6c0b301d362ab8b576498c44852f0de35e55a0ebb8f040b3f9d429bc699dafa1",
  "assemblyBytes": 27784,
  "inventorySha256": "6a22a85ac1f40e784f5bf0118daedc255f9d61acefa88d991a4aa9c2ae560ad9",
  "artifact": "DSH-SEP-macOS-Alpha2-project-preview.zip",
  "archiveSha256": "742c503ba230ee9dd92f54b8c4646af3385dd1d6259fdfdcbc2212f2ff020d13",
  "archiveBytes": 647522618,
  "treeSha256": "1f984a51666bb94068141be79e5d46fcf9d79d0cb6f1ba84127f4fb99d879991",
  "programSha256": "0e8867766b0c01307959b935ced963ae0edd0eeb576cb62eb1c1c3a84ee1a732",
  "bootstrapSha256": "3b36e6443d277fce03502c2913cf27ff74660cdef12124a00c6a812aa2818836",
  "artifacts": [
    {
      "label": "evidence",
      "id": 11925148439,
      "bytes": 1235369,
      "sha256": "00edfa9092a45c20255a3a03765cd063f14e758aff6c980215f10b209ba65815"
    },
    {
      "label": "part-one",
      "id": 11925713136,
      "bytes": 402654409,
      "sha256": "1d64b891d480f738853c8f0fe8260e5341c783fafaa3bd717a7b5f9d693589b1"
    },
    {
      "label": "part-two",
      "id": 11925373341,
      "bytes": 244869648,
      "sha256": "61059b8272734a7d484a645937e1cf3857bd79d8c2a04c55d5ed0a7e3bf819b6"
    }
  ]
};
const result={schema:1,status:'fail',scope:'restore exact r61 signed application bytes; no new product build',source,commands:[]};
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
 const original=join(out,'evidence/project-build/RESULT.json');assert.equal(await digest(original),source.assemblySha256);const assembly=JSON.parse(await readFile(original,'utf8'));assert.equal(assembly.status,'pass');assert.equal(assembly.sourceCommit,source.commit);assert.equal(assembly.programSha256,source.programSha256);assert.equal(assembly.bootstrapSha256,source.bootstrapSha256);assert.equal(assembly.treeSha256,source.treeSha256);assert.equal(assembly.artifact,source.artifact);assert.equal(assembly.artifactSha256,source.archiveSha256);assert.equal(assembly.artifactBytes,source.archiveBytes);
 const transport=JSON.parse(await readFile(join(out,'part-one/transport-manifest.json'),'utf8'));assert.equal(transport.status,'pass');assert.equal(transport.assemblyResultSha256,source.assemblySha256);assert.equal(transport.parts.length,2);assert.deepEqual(transport.artifact,{name:assembly.artifact,sha256:source.archiveSha256,bytes:source.archiveBytes});
 const archive=join(out,assembly.artifact);assert.equal(dirname(archive),out);const fh=await open(archive,'wx',0o600);let total=0;
 try{for(let i=0;i<2;i++){const row=transport.parts[i];assert.equal(row.index,i+1);assert.match(row.name,/^[A-Za-z0-9._-]+\.part$/);const path=join(out,i===0?'part-one':'part-two',row.name);assert.equal((await stat(path)).size,row.bytes);assert.equal(await digest(path),row.sha256);for await(const b of createReadStream(path)){let offset=0;while(offset<b.length){const r=await fh.write(b,offset,b.length-offset);assert(r.bytesWritten>0);offset+=r.bytesWritten;}total+=b.length;assert(total<=source.archiveBytes);}}await fh.sync();}finally{await fh.close();}
 assert.equal(total,source.archiveBytes);assert.equal(await digest(archive),source.archiveSha256);
 const restored=join(out,'restored');await mkdir(restored,{mode:0o700});await run('restore-fixed-application','/usr/bin/ditto',['-x','-k',archive,restored]);
 const app=join(restored,'DSH SEP.app'),inventoryPath=join(out,'evidence/project-build/PACKAGE-INVENTORY.json'),inventory=JSON.parse(await readFile(inventoryPath,'utf8'));assert.equal(await digest(inventoryPath),source.inventorySha256);assert.equal(inventory.treeSha256,source.treeSha256);result.verification=await verifyPackage(app,inventory);await copyFile(inventoryPath,join(out,'PACKAGE-INVENTORY.json'));
 assert.equal(await digest(join(app,'Contents/Resources/PROGRAM.json')),source.programSha256);assert.equal(await digest(join(app,'Contents/Resources/BOOTSTRAP.json')),source.bootstrapSha256);await run('verify-fixed-signature','/usr/bin/codesign',['--verify','--deep','--strict','--verbose=2',app]);
 Object.assign(result,{status:'pass',restoredApplication:app,programSha256:source.programSha256,bootstrapSha256:source.bootstrapSha256,treeSha256:source.treeSha256,notVerified:['new native lifecycle test outcome','new DOM diagnostic outcome','Developer ID and notarization']});
}catch(e){result.code=/^SEP_[A-Z0-9_]{1,90}$/.test(e?.code??'')?e.code:'SEP_MAC_FIXED_APPLICATION_RESTORE';result.errorType=e.name;process.exitCode=1;}
finally{await writeFile(join(out,'RESULT.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({status:result.status,code:result.code,scope:result.scope}));}
