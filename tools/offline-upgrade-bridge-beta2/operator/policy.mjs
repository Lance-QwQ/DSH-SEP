import {parseProfileText,expectedProfileValue} from './profile-text.mjs';
import {readEvidenceInputs} from './evidence-inputs.mjs';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {readFile,lstat,readdir} from 'node:fs/promises';
import {join} from 'node:path';import {pathToFileURL} from 'node:url';import {createRequire} from 'node:module';import {isDeepStrictEqual as equal} from 'node:util';
import {rebaseOwned} from './transition.mjs';
import{assertAdmission,verifyExactGraph,verifyInventoryPreservation,verifyProfileFileSet}from'./exact-contract.mjs';
import{dirname,resolve,isAbsolute}from'node:path';
const code=join(import.meta.dirname,'shared/sep-update');
const {inventory,fileHash}=await import(pathToFileURL(code+'/update-inventory.mjs'));
const {hash,compatibility}=await import(pathToFileURL(code+'/update-core.mjs'));
const rq=createRequire(code+'/update-profile.mjs'),yaml=createRequire(rq.resolve('@deepseek-ai/dsh-app-boot/package.json'))('js-yaml'),semver=rq('semver');
const json=async p=>JSON.parse(await readFile(p));const demand=(v,c)=>{if(!v)throw Object.assign(Error(c),{code:c})};
async function stateFingerprint(path){
 const before=await lstat(path,{bigint:true});demand(before.isFile()&&!before.isSymbolicLink()&&before.ino!==0n,'HOST_PRIVATE_IDENTITY');
 const h=createHash('sha256');for await(const b of createReadStream(path))h.update(b);
 const after=await lstat(path,{bigint:true});const fields=['dev','ino','size','mtimeNs','ctimeNs','nlink'];for(const f of fields)demand(before[f]===after[f],'HOST_PRIVATE_CHANGED_DURING_READ');
 return {sha256:h.digest('hex'),identity:Object.fromEntries(fields.map(k=>[k,String(after[k])]))};
}
export async function privateState(home){
 const records=[];async function visit(path){let s;try{s=await lstat(path)}catch(e){if(e.code==='ENOENT'){records.push({path,absent:true});return;}throw e;}demand(!s.isSymbolicLink(),'HOST_PRIVATE_ALIAS');if(s.isDirectory()){records.push({path,directory:true});for(const name of (await readdir(path)).sort())await visit(join(path,name));}else{demand(s.isFile(),'HOST_PRIVATE_IDENTITY');records.push({path,...await stateFingerprint(path)});}}
 for(const name of ['sessions','attachments','llm-deepseek','.credentials.yaml','settings.yaml','settings.yaml.imported'])await visit(join(home,name));return records;
}
export function preserveExternal(current,candidate){for(const p of current){if(['installed-graph','installed-graph-file','configuration-group'].includes(p.source))continue;const next=candidate.filter(n=>n.instanceId===p.instanceId);demand(next.length===1&&equal(p,next[0]),'HOST_EXTERNAL_PLUGIN_CHANGED');}}

export async function readDraftAdmission(input){const path=input??join(import.meta.dirname,'admission.json');demand(isAbsolute(path),'EXACT_ADMISSION_REQUIRED');let bytes;try{bytes=await readFile(path)}catch(e){if(e.code==='ENOENT')throw Error('EXACT_ADMISSION_REQUIRED');throw e}const admission=assertAdmission(JSON.parse(bytes));const contractPath=join(dirname(path),'exact-changes.json'),contractBytes=await readFile(contractPath);demand(hash(contractBytes)===admission.contractSha256,'EXACT_CONTRACT_BINDING');const contract=JSON.parse(contractBytes);demand(contract.kind==='exact-same-host-file-contract','EXACT_CONTRACT_REQUIRED');const evidencePaths=await readEvidenceInputs(admission);return{admission,contract,contractPath,admissionPath:path,evidencePaths};}
export async function inspectHostTransition(op){
 const{admission,contract}=await readDraftAdmission(op.admissionPath),policy=await json(op.policyPath),stage=await json(op.hostStagePath);
 demand(policy.kind==='exact-same-host-adaptation-policy'&&policy.metadata.stageHash===hash(await readFile(op.hostStagePath)),'HOST_POLICY_BINDING');
 demand(stage.oldGraphHash===admission.baseGraphHash&&stage.graphHash===admission.targetGraphHash&&stage.newRoot===op.candidateHostRoot&&stage.oldRoot===op.oldHostRoot,'HOST_FIXED_BASELINE');
 demand(policy.metadata.privateStateHash===hash(await readFile(op.privateStatePath)),'HOST_PRIVATE_STATE_BINDING');
 const oldBytes=await readFile(join(stage.oldRoot,'graph.json')),nextBytes=await readFile(join(stage.newRoot,'graph.json'));demand(hash(oldBytes)===admission.baseGraphHash&&hash(nextBytes)===admission.targetGraphHash,'HOST_GRAPH_BINDING');
 const old=JSON.parse(oldBytes),next=JSON.parse(nextBytes);verifyExactGraph(old,next,contract);const idMap=Object.fromEntries(old.packages.map(p=>[p.id,p.id]));
 const profiles=verifyProfileFileSet(await readdir(stage.oldRoot),await readdir(stage.newRoot));demand(equal(profiles,stage.profiles.map(p=>p.name).sort())&&new Set(profiles).size===stage.profiles.length,'HOST_PROFILE_SET');
 for(const record of stage.profiles){demand(typeof record.name==='string'&&!/[\\/:]/.test(record.name),'HOST_PROFILE_NAME');const before=await readFile(join(stage.oldRoot,record.name)),after=await readFile(join(stage.newRoot,record.name));demand(hash(before)===record.sourceHash&&hash(after)===record.targetHash,'HOST_PROFILE_CHANGED');if(before.equals(after))continue;
  const parse=b=>parseProfileText(b.toString('utf8'),record.name.endsWith('.json')?'json':'yaml');const expected=expectedProfileValue(parse(before),{currentRoot:stage.oldRoot,targetRoot:stage.newRoot,name:record.name,oldGraph:old,graph:next});demand(equal(expected,parse(after)),'HOST_CONFIG_PRESERVATION');
 }
 demand(equal(await privateState(op.homeRoot),await json(op.privateStatePath)),'HOST_PRIVATE_STATE_CHANGED');
 const[current,candidate]=await Promise.all([inventory(op.oldHostRoot,{profileContext:op.currentContext}),inventory(op.candidateHostRoot,{profileContext:op.targetContext})]);demand(current.binding===policy.currentBinding&&candidate.binding===policy.targetBinding,'HOST_INVENTORY_CHANGED');
 demand(current.rootVersions['@deepseek-ai/dsh']===admission.hostVersion&&candidate.rootVersions['@deepseek-ai/dsh']===admission.hostVersion&&current.rootVersions['dsh-system-enhancement-package']===admission.fromSepVersion&&candidate.rootVersions['dsh-system-enhancement-package']===admission.sepVersion,'HOST_VERSION_REQUIRED');
 demand(current.profileCoverage.complete&&candidate.profileCoverage.complete,'HOST_PROFILE_INCOMPLETE');
 const{effectiveProfile}=await import(pathToFileURL(code+'/update-profile.mjs'));const[profile,nextProfile]=await Promise.all([effectiveProfile(op.oldHostRoot,op.currentContext,{fileHash}),effectiveProfile(op.candidateHostRoot,op.targetContext,{fileHash})]);
 verifyInventoryPreservation({before:old,after:next,contract,current,candidate,profile,nextProfile,oldRoot:op.oldHostRoot,newRoot:op.candidateHostRoot});preserveExternal(current.plugins,candidate.plugins);
 const plugins=candidate.plugins.map(p=>{const deps={},declared={},unknown=[];for(const[name,range]of Object.entries(p.peerDependencies??{})){const resolved=p.resolvedDependencies?.[name];if(resolved===undefined){unknown.push(name);continue;}declared[name]=range;if(resolved)deps[name]=resolved.version;}const c=compatibility([{...p,peerDependencies:declared}],deps,(v,r)=>semver.satisfies(v,r,{includePrerelease:true}))[0];return{...p,verdict:c.verdict,reasons:[...c.reasons,...(unknown.length?['缺少依赖解析证据：'+unknown.join(',')]:[])]}});
 const hardBlocks=[...current.hardBlocks,...candidate.hardBlocks],report={schema:1,current:'DSH '+admission.hostVersion+' / SEP '+admission.fromSepVersion,target:'DSH '+admission.hostVersion+' / SEP '+admission.sepVersion,checkedAt:new Date().toISOString(),readiness:hardBlocks.length?'blocked':'review-ready',scope:'Exact same-host local adaptation bound to each reviewed file. Private configuration, user plugins and unknown compatibility remain preserved; no runtime compatibility inferred.',binding:hash({current:current.binding,candidate:candidate.binding,stageHash:policy.metadata.stageHash,privateStateHash:policy.metadata.privateStateHash,admission}),currentBinding:current.binding,candidateBinding:candidate.binding,hardBlocks,plugins,profileCoverage:current.profileCoverage};return{current,candidate,report};
}
