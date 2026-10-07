import {readFile,lstat} from 'node:fs/promises';import {createReadStream} from 'node:fs';import{createHash}from'node:crypto';import{isAbsolute}from'node:path';
const demand=(v,c)=>{if(!v)throw Object.assign(Error(c),{code:c});};const sha=b=>createHash('sha256').update(b).digest('hex');
async function checked(row){
 demand(row&&isAbsolute(row.path??'')&&/^[a-f0-9]{64}$/.test(row.sha256??''),'EXACT_EVIDENCE_INPUT');
 const before=await lstat(row.path,{bigint:true});demand(before.isFile()&&!before.isSymbolicLink(),'EXACT_EVIDENCE_FILE');
 const h=createHash('sha256');for await(const chunk of createReadStream(row.path))h.update(chunk);
 const after=await lstat(row.path,{bigint:true});demand(['dev','ino','size','mtimeNs','ctimeNs'].every(k=>before[k]===after[k])&&h.digest('hex')===row.sha256,'EXACT_EVIDENCE_CHANGED');
 return row.path;
}
/** Evidence names alone are not admission. Authenticate manifest, then each byte
 * binding; the caller must also place these paths in P2 plan.input.bindings. */
export async function readEvidenceInputs(admission){
 const ref=admission?.evidenceBindings;await checked(ref);
 const raw=await readFile(ref.path);demand(sha(raw)===ref.sha256,'EXACT_EVIDENCE_CHANGED');
 const manifest=JSON.parse(raw);demand(manifest.schema===1&&manifest.kind==='exact-candidate-review-evidence'&&manifest.status==='pass'&&manifest.baseGraphHash===admission.baseGraphHash&&manifest.targetGraphHash===admission.targetGraphHash&&Array.isArray(manifest.bindings)&&manifest.bindings.length>0&&manifest.bindings.length<=4096,'EXACT_EVIDENCE_MANIFEST');
 const paths=[ref.path];for(const row of manifest.bindings)paths.push(await checked(row));
 return [...new Set(paths)];
}
export async function readAdditionalEvidence(rows=[]){demand(Array.isArray(rows)&&rows.length<=4096,'EXACT_EVIDENCE_INPUT');const paths=[];for(const row of rows)paths.push(await checked(row));return [...new Set(paths)];}
