import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {copyVerifiedProgram} from './program-files.mjs';
const output=resolve(process.argv[2]??''),proofPath=resolve(process.argv[3]??'');
if(!/^D:\\AIData\\ProjectWork\\DSH\\alpha2-windows-packages-20261015-r1$/i.test(output)||!proofPath.toLowerCase().startsWith(output.toLowerCase()+'\\'))throw Error('SCOPE');
const sha=b=>createHash('sha256').update(b).digest('hex'),json=x=>JSON.stringify(x,null,2)+'\n';
const bytes=await readFile(join(output,'ONLY-REQUIRED-CANDIDATE.json')),candidate=JSON.parse(bytes),proofBytes=await readFile(proofPath),proof=JSON.parse(proofBytes);
if(!['pass','mismatch'].includes(proof.status)||proof.inputSha256!==sha(bytes)||proof.notVerified.length||proof.packages.length!==candidate.packages.length)throw Error('OFFICIAL_PROOF_INCOMPLETE');
const required=[],packages=[],movedToPayload=[];
for(const pkg of candidate.packages){
 const evidence=proof.packages.filter(x=>x.name===pkg.name&&x.version===pkg.version);if(evidence.length!==1)throw Error('OFFICIAL_PROOF_PACKAGE');const p=evidence[0];
 if(!/^https:\/\/registry\.npmjs\.org\//.test(p.tarballUrl)||!/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(p.integrity)||!/^[a-f0-9]{64}$/.test(p.sha256))throw Error('OFFICIAL_PROOF_ORIGIN');
 const rows=candidate.required.filter(x=>x.packageName===pkg.name),matched=new Map((p.files??[]).map(x=>[x.path,x])),accepted=[];
 for(const row of rows){const rel=row.sourcePath.slice(('node_modules/'+pkg.name+'/').length),f=matched.get(rel);if(p.manifestSha256===pkg.manifestHash&&f?.size===row.size&&f.sha256===row.sha256)accepted.push(row);else movedToPayload.push({path:row.path,reason:'candidate differs from official tar or manifest; supplied as adapted payload'});}
 if(accepted.length){if(!accepted.some(x=>x.sourcePath==='node_modules/'+pkg.name+'/package.json'))throw Error('OFFICIAL_MANIFEST_NOT_SELECTED');required.push(...accepted);packages.push({...pkg,metadataUrl:p.metadataUrl,metadataSha256:p.metadataSha256,tarballUrl:p.tarballUrl,tarballSha256:p.sha256,tarballSize:p.size,integrity:p.integrity,files:accepted.length});}
}
if(required.length<500||!packages.some(x=>x.name==='@deepseek-ai/dsh'))throw Error('OFFICIAL_COVERAGE');
await copyVerifiedProgram({source:join(output,'program'),out:join(output,'official-donor'),files:required});
const final={schema:1,status:'pass',scope:'Each required file matches an independently downloaded exact-version official npm tarball after SHA-512 SRI verification. Local adaptations remain payload.',proofSha256:sha(proofBytes),candidateSha256:sha(bytes),required,packages,movedToPayload};
await writeFile(join(output,'ONLY-REQUIRED.json'),json(final),{flag:'wx'});
await writeFile(join(output,'ONLY-HOST-package.json'),json({name:'dsh-sep-official-alpha2-donor',version:'1.0.0',private:true,dependencies:Object.fromEntries(packages.map(x=>[x.name,x.version]))}),{flag:'wx'});
console.log(JSON.stringify({status:'pass',requiredFiles:required.length,packages:packages.length,adaptedPayloadFiles:movedToPayload.length,officialBytes:required.reduce((n,x)=>n+x.size,0)}));
