// Writes a fresh candidate directory only. Never modifies an installed app.
import {readFile,writeFile,mkdir,lstat,realpath} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';import {createHash} from 'node:crypto';
import {SOURCE_INPUTS,deriveReadiness} from './derive.mjs';
const [inputArg,outArg]=process.argv.slice(2);if(!inputArg||!outArg||process.argv.length!==4)throw Error('SEP_MAC_READINESS_ARGUMENTS');
const input=await realpath(inputArg),out=resolve(outArg);if(await realpath(dirname(out))!==dirname(out)||out===input||out.startsWith(input+'/')||out.startsWith(input+'\\'))throw Error('SEP_MAC_READINESS_DESTINATION');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const rows=[];for(const [kind,definition]of Object.entries(SOURCE_INPUTS)){const file=join(input,definition.file),st=await lstat(file);if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1)throw Error('SEP_MAC_READINESS_INPUT');rows.push({kind,file:definition.file,...deriveReadiness(kind,await readFile(file))});}
await mkdir(out,{mode:0o700});
const outputs=[];for(const row of rows){await writeFile(join(out,row.file),row.bytes,{flag:'wx',mode:0o600});await writeFile(join(out,row.kind+'.origin.json'),JSON.stringify(row.origin,null,2)+'\n',{flag:'wx',mode:0o600});outputs.push({kind:row.kind,file:row.file,bytes:row.bytes.length,sourceSha256:row.origin.sourceSha256,sha256:row.origin.resultSha256,transforms:row.origin.changes.length});}
const gate=await readFile(new URL('./main-gate.mjs',import.meta.url));await writeFile(join(out,'sep-renderer-readiness.mjs'),gate,{flag:'wx',mode:0o600});outputs.push({kind:'new-main-helper',file:'sep-renderer-readiness.mjs',bytes:gate.length,sha256:sha(gate)});
const sources=[];for(const file of ['derive.mjs','main-gate.mjs','preload-bridge.mjs','build-candidate.mjs','derive.test.mjs','gate.test.mjs','preload-bridge.test.mjs','prepare-inputs.mjs','ci-job.yml','README.md']){const bytes=await readFile(new URL(file,import.meta.url));sources.push({file,bytes:bytes.length,sha256:sha(bytes)});}
const result={schema:1,status:'pass',scope:'fixed-byte candidate generation only',outputs,sources,notRun:['Actual ASAR frontend byte comparison','ASAR/integrity/signature rebuild','Actual Electron renderer hydration and commit','Finder bootstrap and broker transport integration','Welcome surface readiness','Physical input','Settings intermittent close attribution'],notChanged:['frozen capture','existing product packages','daily installation']};
await writeFile(join(out,'CANDIDATE.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({status:result.status,scope:result.scope,outputs:outputs.map(({kind,sha256})=>({kind,sha256}))}));
