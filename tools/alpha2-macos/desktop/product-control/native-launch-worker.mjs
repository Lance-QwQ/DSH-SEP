// Test-only owner process. A failed or timed-out test still asks for normal quit.
import {readFile,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {runNativeLaunchCase,nativeCaseNames} from './native-launch-cases.mjs';
const input=JSON.parse(await readFile(process.argv[2],'utf8'));
if(process.platform!=='darwin'||process.arch!=='arm64'||process.execPath!==input.nodeExecutable)throw Error('SEP_PRODUCT_NATIVE_WORKER');
const abort=new AbortController();process.on('message',m=>{if(m&&Object.keys(m).length===1&&m.kind==='requestCleanup')abort.abort();});
let serial=0;
async function save(name,value){const path=join(input.outputRoot,name),tmp=path+'.'+(++serial)+'.tmp';await writeFile(tmp,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});await rename(tmp,path);}
const cases=[];
for(const index of [1,2]){
 if(cases.some(r=>r.status==='blocked')||abort.signal.aborted){cases.push({index,name:nativeCaseNames[index-1],status:'not_run',cleanup:{status:'blocked',resourcesConfirmedReleased:false}});continue;}
 const result=await runNativeLaunchCase(index,{...input,signal:abort.signal,onProgress:r=>save(`CASE-${index}${r.lateCleanup?'-LATE-CLEANUP':''}.json`,r)});cases.push(result);
}
const status=cases.some(r=>r.status==='blocked'||r.status==='not_run')?'blocked':cases.every(r=>r.status==='pass')?'pass':'fail';
await save('WORKER-RESULT.json',{schema:1,status,workerPid:process.pid,embeddedNode:process.version,programSha256:input.programSha256,cases});
if(status==='blocked')setInterval(()=>{},1000); // Preserve the unknown owner, even if no other active handle remains.
else if(process.connected)process.disconnect();
process.exitCode=status==='pass'?0:1;
