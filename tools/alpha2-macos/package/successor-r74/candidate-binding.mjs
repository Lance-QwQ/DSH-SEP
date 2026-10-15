// TEST ONLY. Pin original r74 build evidence and exact restored bytes, without adopting
// a prior VM's absolute application path or changing any application contents.
import {readFile,lstat,realpath,open} from 'node:fs/promises';import {join,resolve,isAbsolute,sep} from 'node:path';import {createHash} from 'node:crypto';
const pins=JSON.parse(await readFile(new URL('./candidate-pins.json',import.meta.url),'utf8')),sha=b=>createHash('sha256').update(b).digest('hex'),fail=code=>{throw Object.assign(Error(code),{code});};
export function validateCandidateFacts(r){
 if(r?.schema!==1||r.status!=='pass'||r.sourceCommit!==pins.commit||r.originalUnchanged!==true||r.programSha256!==pins.programSha256||r.bootstrapSha256!==pins.bootstrapSha256||r.treeSha256!==pins.treeSha256||r.artifact!==pins.artifact||r.artifactSha256!==pins.archiveSha256||r.artifactBytes!==pins.archiveBytes||!Array.isArray(r.runtime)||r.runtime.length!==84||new Set(r.runtime.map(row=>row.path)).size!==84)fail('SEP_PROJECT_CANDIDATE_FACTS');
 return r;
}
export function validateAssemblyBytes(bytes,expectedSha256){if(!Buffer.isBuffer(bytes)||expectedSha256!==pins.assemblySha256||bytes.length!==pins.assemblyBytes||sha(bytes)!==pins.assemblySha256)fail('SEP_PROJECT_CANDIDATE_RESULT');let r;try{r=JSON.parse(bytes);}catch{fail('SEP_PROJECT_CANDIDATE_RESULT');}return validateCandidateFacts(r);}
export function candidatePaths(root){if(typeof root!=='string'||!isAbsolute(root)||resolve(root)!==root)fail('SEP_PROJECT_CANDIDATE_PATH');return{application:join(root,'restored/DSH SEP.app'),archive:join(root,pins.artifact),inventory:join(root,'PACKAGE-INVENTORY.json')};}
const identity=s=>[s.dev,s.ino,s.size,s.mode,s.nlink,s.mtimeNs,s.ctimeNs].join(':');
async function file(path,maxBytes,consume){
 const before=await lstat(path,{bigint:true});if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1n||before.size>BigInt(maxBytes)||await realpath(path)!==path)fail('SEP_PROJECT_CANDIDATE_FILE');const f=await open(path,'r');
 try{if(identity(await f.stat({bigint:true}))!==identity(before))fail('SEP_PROJECT_CANDIDATE_FILE');const result=await consume(f);if(identity(await f.stat({bigint:true}))!==identity(before)||identity(await lstat(path,{bigint:true}))!==identity(before))fail('SEP_PROJECT_CANDIDATE_FILE');return result;}finally{await f.close();}
}
const bytes=(path,limit)=>file(path,limit,f=>f.readFile());
export async function readCandidate({resultPath,resultSha256,restoredRoot,runnerTemp}){
 candidatePaths(restoredRoot);for(const p of [resultPath,restoredRoot,runnerTemp])if(typeof p!=='string'||!isAbsolute(p)||resolve(p)!==p||await realpath(p)!==p)fail('SEP_PROJECT_CANDIDATE_PATH');
 if(!resultPath.startsWith(runnerTemp+sep)||!restoredRoot.startsWith(runnerTemp+sep))fail('SEP_PROJECT_CANDIDATE_PATH');
 const record=validateAssemblyBytes(await bytes(resultPath,1048576),resultSha256),paths=candidatePaths(restoredRoot);
 if(await realpath(paths.application)!==paths.application)fail('SEP_PROJECT_CANDIDATE_PATH');
 const inventoryBytes=await bytes(paths.inventory,67108864);if(sha(inventoryBytes)!==pins.inventorySha256||JSON.parse(inventoryBytes).treeSha256!==pins.treeSha256)fail('SEP_PROJECT_CANDIDATE_INVENTORY');
 for(const [name,pin]of [['PROGRAM.json',pins.programSha256],['BOOTSTRAP.json',pins.bootstrapSha256]])if(sha(await bytes(join(paths.application,'Contents/Resources',name),1048576))!==pin)fail('SEP_PROJECT_CANDIDATE_MANIFEST');
 await file(paths.archive,pins.archiveBytes,async f=>{const h=createHash('sha256');let size=0;for await(const b of f.createReadStream({autoClose:false})){size+=b.length;if(size>pins.archiveBytes)fail('SEP_PROJECT_CANDIDATE_ARCHIVE');h.update(b);}if(size!==pins.archiveBytes||h.digest('hex')!==pins.archiveSha256)fail('SEP_PROJECT_CANDIDATE_ARCHIVE');});
 return{...record,restoredApplication:paths.application,sourceAssemblyPath:resultPath,sourceAssemblySha256:pins.assemblySha256,restorationRoot:restoredRoot};
}
