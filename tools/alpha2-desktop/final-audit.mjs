import assert from 'node:assert/strict';
import {readFile,writeFile,readdir,lstat,realpath} from 'node:fs/promises';
import {join,relative,resolve} from 'node:path';
import {createHash} from 'node:crypto';
const phase=resolve(process.argv[2]),sha=b=>createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(await readFile(join(phase,'private-capture-r4/CAPTURE.json')));
let checked=0;for(const row of manifest.rows){const s=await lstat(row.path,{bigint:true});assert.equal([s.dev,s.ino,s.size,s.mtimeNs,s.ctimeNs].join(':'),row.identity,'ORIGINAL_IDENTITY_CHANGED');assert.equal(sha(await readFile(row.path)),row.sha256,'ORIGINAL_BYTES_CHANGED');assert.equal(sha(await readFile(join(phase,'private-capture-r4',row.domain,row.relative))),row.sha256,'CAPTURE_BYTES_CHANGED');checked++;}
for(const [domain,source]of Object.entries(manifest.sources)){
 const files=[];async function walk(p){if(domain==='memory'&&resolve(p).toLowerCase()===resolve(join(source,'.suite-memory/p2/updates')).toLowerCase())return;const s=await lstat(p);assert(!s.isSymbolicLink(),'SOURCE_ALIAS');if(s.isDirectory()){for(const name of await readdir(p))await walk(join(p,name));}else files.push(relative(source,p));}await walk(source);assert.deepEqual(files.sort(),manifest.rows.filter(r=>r.domain===domain).map(r=>r.relative).sort(),'SOURCE_FILE_SET_CHANGED');
}
// The capture declares the selected daily storage; do not embed a user's C: path.
const daily=resolve(manifest.sources.memory,'../..');
const dailyExpected={'deployment-rc2.json':'6be63c927bb34c583b2ee60e28c66935e191d5aa6605ebe7b37706477b96079d','launch.mjs':'b7743453923f84913efaa96c1a8e846ed3ec205d9706d4d49163d9cad7c91ef1'};
for(const [name,hash]of Object.entries(dailyExpected))assert.equal(sha(await readFile(join(daily,name))),hash,'DAILY_SELECTION_CHANGED');
const runtime=join(phase,'alpha2-runtime-r5'),graphBytes=await readFile(join(runtime,'graph.json')),graph=JSON.parse(graphBytes);assert.equal(sha(graphBytes),'cd92c0ecebcf94023c318d567cb9487f3b947d4803cb612bd3e3adb686a4b6ca');
for(const row of graph.files){const p=join(runtime,row.path),s=await lstat(p);assert(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1,'PROGRAM_ALIAS');assert.equal(sha(await readFile(p)),row.sha256,'PROGRAM_BYTES_CHANGED');}
const privateResult=JSON.parse(await readFile(process.env.SEP_PRIVATE_PROFILE_RESULT??join(phase,'private-working-root/profile-2AqWjk/PRIVATE-PROFILE-RESULT.json')));assert.equal(privateResult.status,'pass');assert.equal(privateResult.checks.length,2);for(const row of privateResult.checks){assert.equal(row.privateChecks.privateSessions,19);assert.equal(row.privateChecks.privatePhysicalSessionFilesUnchanged,21);assert.equal(row.resourcesRetained,false);}
const result={schema:1,status:'pass',originalFilesReadOnlyVerified:checked,sourceFileSetsUnchanged:true,captureBodyHashesUnchanged:true,dailySelectorHashesUnchanged:true,programGraphHash:sha(graphBytes),programFilesVerified:graph.files.length,privateProfileRounds:2,privateSessionCount:19,privateSessionPhysicalFiles:21,scope:'file identity/content and exact final program; resource and ACL audits recorded separately'};
await writeFile(join(phase,process.argv[3]??'FINAL-DATA-PROGRAM-AUDIT.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
