// Build/test only: preserve the validated r49 lifecycle, including the corrected
// single-hide/independent-effect rule. Only input binding and operator scope vary.
import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import {deriveExercise} from '../hide-effect-probe/derive.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),pins=JSON.parse(await readFile(new URL('./candidate-pins.json',import.meta.url))),fail=code=>{throw Object.assign(Error(code),{code});};
if(sha(await readFile(new URL('../hide-effect-probe/derive.mjs',import.meta.url)))!=='34cc30c0ccde18e2b8d93a7785c191382930ec6c430b0c996f0f85446477cae0')fail('SEP_PROJECT_CANDIDATE_ORIGIN');
function transform(source,inputSha256,edits,scope){let value=source;const transforms=[];for(const [before,after]of edits){if(value.split(before).length!==2)fail('SEP_PROJECT_CANDIDATE_TRANSFORM');value=value.replace(before,after);transforms.push({before,after});}return{source:value,origin:{schema:1,status:'pass',scope,inputSha256,outputSha256:sha(value),transforms}};}
export function deriveCandidateExercise(bytes){
 const r49=deriveExercise(bytes),result=transform(r49.source,sha(r49.source),[
  ["import{verifyPackage}from'./package-inventory.mjs';","import{verifyPackage}from'./package-inventory.mjs';\nimport{readCandidate}from'./candidate-binding.mjs';"],
  ["const[assembledArg,outArg]=process.argv.slice(2),assembled=await realpath(assembledArg),out=resolve(outArg),temp=await realpath(process.env.RUNNER_TEMP);","assert.equal(process.argv.length,6);const[resultPath,resultSha256,assembledArg,outArg]=process.argv.slice(2),assembled=await realpath(assembledArg),out=resolve(outArg),temp=await realpath(process.env.RUNNER_TEMP);"],
  ["const assembly=await json(join(assembled,'RESULT.json'));assert.equal(assembly.status,'pass');app=assembly.restoredApplication;","const assembly=await readCandidate({resultPath,resultSha256,restoredRoot:assembled,runnerTemp:temp});app=assembly.restoredApplication;"],
 ],'r49 actual lifecycle with fixed r61 candidate binding; no lifecycle behavior change');return{...result,origin:{...result.origin,r49:r49.origin}};
}
export function deriveCandidateRestore(bytes){
 const pin='b8eeaed8ca9843c77e94c0f12eff273c517a8a3429b3ae827e129b736c314645';if(!Buffer.isBuffer(bytes)||sha(bytes)!==pin)fail('SEP_PROJECT_CANDIDATE_ORIGIN');const text=bytes.toString().replaceAll('\r\n','\n'),start=text.indexOf('const source='),end=text.indexOf('\nconst result=',start);if(start<0||end<0)fail('SEP_PROJECT_CANDIDATE_TRANSFORM');
 return transform(text,pin,[
  ['// Test operator only: restore exactly r44, with no rebuild, patch or re-sign.','// Test operator only: restore exactly r61, with no rebuild, patch or re-sign.'],
  ["from '../desktop/run-command.mjs'","from '../run-command.mjs'"],["from './package-inventory.mjs'","from '../../package/package-inventory.mjs'"],
  ["assert.equal(process.platform,'darwin');assert.equal(process.arch,'arm64');","assert.equal(process.platform,'darwin');assert.equal(process.arch,'arm64');assert.equal(process.argv.length,3);"],
  [text.slice(start,end),'const source='+JSON.stringify(pins,null,2)+';'],
  ["scope:'restore exact r44 signed application bytes; no new product build'","scope:'restore exact r61 signed application bytes; no new product build'"],
  ["evidence/application-build/RESULT.json","evidence/project-build/RESULT.json"],
  ["assert.equal(assembly.status,'pass');assert.equal(assembly.artifactSha256","assert.equal(assembly.status,'pass');assert.equal(assembly.sourceCommit,source.commit);assert.equal(assembly.programSha256,source.programSha256);assert.equal(assembly.bootstrapSha256,source.bootstrapSha256);assert.equal(assembly.treeSha256,source.treeSha256);assert.equal(assembly.artifact,source.artifact);assert.equal(assembly.artifactSha256"],
  ["evidence/application-build/PACKAGE-INVENTORY.json","evidence/project-build/PACKAGE-INVENTORY.json"],
  ["assert.equal(inventory.treeSha256,source.treeSha256);","assert.equal(await digest(inventoryPath),source.inventorySha256);assert.equal(inventory.treeSha256,source.treeSha256);"],
 ],'exact r44 restorer adapted only to r61 artifact pins, evidence location and relative imports');
}
export function deriveCandidateRunner(bytes){
 const pin='9bbd353116245fc01c9592657ce844f64a287b13f8924404b5f68e933a0e68ff';if(!Buffer.isBuffer(bytes)||sha(bytes)!==pin)fail('SEP_PROJECT_CANDIDATE_ORIGIN');const text=bytes.toString().replaceAll('\r\n','\n'),start=text.indexOf(' const receipt='),end=text.indexOf(' result.macBuild=',start);if(start<0||end<0)fail('SEP_PROJECT_CANDIDATE_TRANSFORM');
 const oldLoop="for(const f of ['observation.mjs','observation.test.mjs','r48-cases.json','derive.mjs','derive.test.mjs','run-product.mjs','ci-job.yml','README.md']){\n  const bytes=await readFile(join(here,f));inputs.push({file:'desktop/hide-effect-probe/'+f,bytes:bytes.length,sha256:digest(bytes)});\n  if(f==='observation.mjs')await writeFile(join(generated,f),bytes,{flag:'wx',mode:0o600});\n }";
 const paths=['candidate-binding.mjs','candidate-pins.json','derive-candidate-lifecycle.mjs','candidate-lifecycle.mjs','candidate.test.mjs','restore-project-application-r61.mjs','CANDIDATE-ORIGIN.json','candidate-ci-step.yml','candidate-README.md','../hide-effect-probe/observation.mjs','../hide-effect-probe/derive.mjs','../hide-effect-probe/run-product.mjs','../../package/restore-fixed-application-r44.mjs'];
 return transform(text,pin,[
  ['// Test operator only. The original r44 app is restored and verified separately.','// Test operator only. The fixed r61 candidate is restored and verified separately.'],
  ["import {deriveExercise} from './derive.mjs';","import {deriveCandidateExercise as deriveExercise} from './derive-candidate-lifecycle.mjs';\nimport {readCandidate} from './candidate-binding.mjs';"],
  ["assert.equal(process.argv.length,4)","assert.equal(process.argv.length,6)"],
  ["const restored=await realpath(process.argv[2]),out=resolve(process.argv[3]),temp=await realpath(process.env.RUNNER_TEMP);","const [resultPath,resultSha256,restoredArg,outArg]=process.argv.slice(2),restored=await realpath(restoredArg),out=resolve(outArg),temp=await realpath(process.env.RUNNER_TEMP);"],
  ["scope:'new test-only r44 three-cycle hide-effect/reopen operator; raw BOOL and observed effect remain separate'","scope:'fixed r61 three-cycle LaunchServices operator; raw BOOL and observed hide effect remain separate'"],
  ["productSourceCommit:'569b4bdf6fd1ab2ebc7ec3aa5821b21cad3f2e4a'","productSourceCommit:'"+pins.commit+"'"],
  [text.slice(start,end)," const binding=await readCandidate({resultPath,resultSha256,restoredRoot:restored,runnerTemp:temp});\n result.binding={sourceAssemblySha256:binding.sourceAssemblySha256,programSha256:binding.programSha256,bootstrapSha256:binding.bootstrapSha256,archiveSha256:binding.artifactSha256,archiveBytes:binding.artifactBytes,treeSha256:binding.treeSha256,application:binding.restoredApplication};\n"],
  [oldLoop,"for(const path of "+JSON.stringify(paths)+"){\n  const bytes=await readFile(join(here,path));inputs.push({file:path,bytes:bytes.length,sha256:digest(bytes)});\n  const name=path.split('/').at(-1);if(['observation.mjs','candidate-binding.mjs','candidate-pins.json'].includes(name))await writeFile(join(generated,name),bytes,{flag:'wx',mode:0o600});\n }"],
  ["[script,restored,join(out,'lifecycle')]","[script,resultPath,resultSha256,restored,join(out,'lifecycle')]"],
 ],'r49 supervisor adapted to explicit r61 result SHA and exact fresh restored candidate');
}
