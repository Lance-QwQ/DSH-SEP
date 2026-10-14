import {readFile,lstat,realpath,open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join,relative,isAbsolute} from 'node:path';
import {owned} from './bundle-modules.mjs';
import {hash,boundedRead} from './bounded-read.mjs';
const fail=code=>{throw Object.assign(Error(code),{code});};
const {createDocumentManager}=await owned('modules/system-enhancement-package/src/documents.js');
const within=(root,path)=>{const p=relative(root,path);return p&&p!=='..'&&!p.startsWith('../')&&!isAbsolute(p)?p:undefined;};
export const documentDescription='Permanently remove one logical document from SEP RAG, archives and every managed macOS generation/candidate after exact direct-user plan confirmation. Preview includes copy counts and pending-plan invalidation. Imported original files and native chat history remain; deleteSource:true is refused. Persistent independent P2 authority prevents restoration and re-indexing.';
// Startup accepts only markers tied to a verifiable, body-free macOS review.
// Losing this plan cannot turn a fresh inventory into retroactive permission.
export function macDocumentAuthority(control,source){return {identity:control.identity+':'+hash(source),async read(){return control.withAccess(async()=>{
 // Never independently sample journal/head during a parent P1 write. The
 // shared P2 lease also re-enters safely inside deletion and preview work.
 const result=[];
 for(const marker of control.documentDeletions().filter(m=>m.owner==='project:'+hash(source))){
  try{
  const path=join(control.root,'document-plans',marker.planHash+'.json'),s=await lstat(path,{bigint:true});
  if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1n||s.size>2097152n||await realpath(path)!==path)fail('SEP_MAC_DOCUMENT_PLAN_UNVERIFIED');
  const h=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);let body,bytes;try{const actual=await h.stat({bigint:true});if(actual.dev!==s.dev||actual.ino!==s.ino||actual.size!==s.size)fail('SEP_MAC_DOCUMENT_PLAN_UNVERIFIED');bytes=await boundedRead(path,{maxBytes:2097152});body=JSON.parse(bytes);}finally{await h.close();}
  if(hash(bytes)!==marker.planHash||body.identity!==control.identity||body.projectRoot!==source||body.owner!==marker.owner||body.path!==marker.documentPath||body.deleteSource!==false||body.source?.managedCopies?.sourcePolicy!=='imported-source-retained; all-managed-generations-and-candidates-governed'||!/^[a-f0-9]{64}$/.test(body.source.managedCopies.planHash??''))fail('SEP_MAC_DOCUMENT_PLAN_UNVERIFIED');
  result.push({...marker,managedPlanHash:body.source.managedCopies.planHash});
  }catch(e){if(e.code==='ENOENT')fail('SEP_MAC_DOCUMENT_PLAN_UNVERIFIED');throw e;}
 }
 return result;});
}};}
export function macDocumentFactory({source,local,syncDirectory}){return options=>{
 if(options.scope.projects.length!==1||options.scope.projects[0].key!==hash(source))fail('SEP_MAC_DOCUMENT_PROJECT_IDENTITY');
 let reviewed;
 const current=()=>{const value=local.getStore();if(!value?.documentOps)fail('SEP_MAC_DOCUMENT_ACCESS_REQUIRED');return value;};
 const adapter={async inspectSource(input){
  const view=current(),path=within(view.path,input)??within(source,input);if(!path)fail('SEP_MAC_DOCUMENT_PATH');
  reviewed=await view.documentOps.review(path);const entry=view.entries.find(e=>e.path===path),physical=join(view.path,path);
  if(!entry)return {status:'missing',path:physical,managedCopies:reviewed};
  if(entry.kind!=='file')fail('SEP_MAC_DOCUMENT_PATH');const s=await lstat(physical,{bigint:true});
  if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1n||s.size!==BigInt(entry.size))fail('SOURCE_CHANGED');
  return {status:'present',path:physical,sha256:entry.sha256,identity:{volumeSerialNumber:String(s.dev),fileId:String(s.ino)},managedCopies:reviewed};
 },deleteReviewedSource(){fail('SEP_MAC_ORIGINAL_SOURCE_RETAINED');}};
 const manager=createDocumentManager({...options,sourceAdapter:adapter,facility:{...options.facility,async applyDocumentDeletion(marker){
  await options.facility.applyDocumentDeletion(marker);
  await current().documentOps.delete({marker,expectedPlanHash:reviewed?.planHash});
 }}});
 return {async execute(project,args,exec){
  if(args.deleteSource===true)fail('SEP_MAC_ORIGINAL_SOURCE_RETAINED');
  reviewed=undefined;const result=await manager.execute(project,args,exec);
  if(result.status==='preview'){await syncDirectory(join(options.control.root,'document-plans'));await syncDirectory(options.control.root);}
  return result.status==='preview'?{...result,excludedFromDeletion:[...result.excludedFromDeletion,'imported_original_source'],managedCopyPolicy:'all historical generations and all uncommitted candidates; uncommitted plans are invalidated'}:{...result,retainedSourceScope:'imported-original-source-only'};
 }};
};}
