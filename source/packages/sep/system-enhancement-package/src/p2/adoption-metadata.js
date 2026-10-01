import {isAbsolute,win32} from 'node:path';
import {z} from 'zod';

const fail=()=>{throw Object.assign(new Error('P2_ADOPTION_METADATA'),{code:'P2_ADOPTION_METADATA'});};
const object=shape=>z.object(shape).strict();
const hash=z.string().regex(/^[a-f0-9]{64}$/);
const uuid=z.string().regex(/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
const count=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const positive=count.min(1);
const bounded=z.string().min(1).max(256).regex(/^[^\x00-\x1f\x7f]+$/);
const path=z.string().min(1).max(32768).refine(v=>!/[\x00-\x1f\x7f]/.test(v)&&(isAbsolute(v)||win32.isAbsolute(v)));
const decimal=z.string().regex(/^[0-9]{1,32}$/);
const sid=z.string().max(184).regex(/^S-[0-9]+(?:-[0-9]+)+$/);
const time=z.string().max(35).regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/).refine(v=>Number.isFinite(Date.parse(v)));
const errorCode=z.string().max(100).regex(/^(?:P2_ADOPTION_|ADOPTION_|P2_PLAN_CHANGED)[A-Z_]*$/);
const names=['dsh_enhancement_suite_v1','dsh_four_layer_memory_v1','dsh_four_layer_archive_v1'];
const three=f=>z.tuple(names.map(f));
const owner=z.string().regex(/^(?:project|user):[a-f0-9]{64}$/);

// SDDL is a security descriptor, not an arbitrary source-text field. This accepts
// the ordinary canonical ACE form used by this helper. Conditional/resource ACEs
// need an explicit protocol extension instead of a permissive text passthrough.
function ordinarySddl(value){
  if(!value||value.length>65536||/[^A-Za-z0-9_:;(){}\-]/.test(value))return false;
  const headers=[...value.matchAll(/([OGDS]):/g)];
  if(!headers.length||headers[0].index!==0||new Set(headers.map(m=>m[1])).size!==headers.length)return false;
  const trustee=/^(?:S-[0-9]+(?:-[0-9]+)+|[A-Z]{2})$/;
  const guid=/^(?:[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12})?$/;
  for(const [i,header]of headers.entries()){
    const body=value.slice(header.index+2,headers[i+1]?.index??value.length);
    if(['O','G'].includes(header[1])){if(!trustee.test(body))return false;continue;}
    const start=body.indexOf('('),flags=start<0?body:body.slice(0,start);
    if(!/^(?:P|AI|AR|NO_ACCESS_CONTROL)*$/.test(flags))return false;
    const aces=start<0?'':body.slice(start);let offset=0;
    for(const match of aces.matchAll(/\(([^()]*)\)/g)){
      if(match.index!==offset)return false;offset+=match[0].length;const f=match[1].split(';');
      if(f.length!==6||!/^(?:A|D|OA|OD|AU|AL|OU|OL|ML|SP|TL|FL)$/.test(f[0])||!/^(?:OI|CI|NP|IO|ID|SA|FA|TP|CR)*$/.test(f[1])||
        !/^(?:0x[a-fA-F0-9]+|[0-9]+|(?:CC|DC|LC|SW|RP|WP|DT|LO|CR|SD|RC|WD|WO|GA|GR|GW|GX|FA|FR|FW|FX|KA|KR|KW|KX|NR|NW|NX|AS|MA)*)$/.test(f[2])||
        !guid.test(f[3])||!guid.test(f[4])||!trustee.test(f[5]))return false;
    }
    if(offset!==aces.length)return false;
  }
  return true;
}
const sddl=z.string().refine(ordinarySddl);
const canonicalIdentity=object({canonicalPath:path,exists:z.boolean(),anchorPath:path,device:decimal,inode:decimal});
const fingerprint=z.union([
  object({path,identity:canonicalIdentity,exists:z.literal(true),sha256:hash,size:count}),
  object({path,identity:canonicalIdentity,exists:z.literal(false),sha256:z.null(),size:z.null()})
]);
const captureIdentity={path,finalPath:path,volume:z.string().regex(/^[a-f0-9]{8}$/),fileId:z.string().regex(/^[a-f0-9]{16}$/)};
const assurance=z.literal('known-writer-perimeter');
const retirement=object({retired:z.literal(true),assurance,writerSid:sid,entries:z.array(object({path,mask:count,originalSddl:sddl,retiredSddl:sddl})).min(1).max(256)});
const retirementPlan=object({version:z.literal(1),assurance,writerSid:sid,entries:z.array(object({path,mask:count,currentSddl:sddl,afterSddl:sddl})).min(1).max(256)});
const sourceSnapshot=object({version:z.literal(1),sourceRoot:path,trustedAncestor:path,writerSid:sid,sourceDirectories:z.array(object(captureIdentity)).min(2).max(256),
  files:three(name=>object({...captureIdentity,name:z.literal(name+'.json'),size:count,sha256:hash})),retirement:retirement.nullable()});
const entry=object({owner,id:bounded,revision:positive,category:z.enum(['preference','personal','goal','task','project','temporary']),layer:z.enum(['L2','L3']),
  status:z.enum(['candidate','confirmed']),taskState:z.enum(['active','open','completed','cancelled']),disposition:z.enum(['eligible','excluded','archive_due','expired']),
  reasons:z.array(z.enum(['unknown_time','existing_expiry_requires_review','candidate_unconfirmed_30d','task_closed_7d','temporary_unused_30d','project_closed_30d',
    'known_withdrawn','known_purged','known_archive_withdrawn','known_legacy_revoked','known_backup_revoked','known_backup_purged','unconfirmed','unknown_source',
    'unresolved_conflict','missing_dependency','unresolved_history','legacy_current_conflict','dependency_unavailable'])).max(32),
  timeIssues:z.array(z.enum(['createdAt','updatedAt','lastUsedAt','closedAt','updatedAt_before_createdAt','closedAt_before_createdAt','closedAt_missing','dueAt','automatic.expiresAt'])).max(16),
  recordSha256:hash,textSha256:hash,textLength:count.max(2000),omittedSourceSha256:hash,omittedAutomaticSha256:hash.optional(),
  historyNotImported:z.literal(true),omittedHistoryCount:count,omittedHistorySha256:hash});
const omissions=object({oldArchiveBodies:count,oldBackups:count,legacyRecords:count,legacyIndexAndCache:z.literal(true),oldWorkflowAndAudits:z.literal(true)});
const knownRestrictions=object({count,sha256:hash});
const version=z.literal(1),metadataOnly=z.literal(true),historyCoverage=z.literal('unknown-before-adoption'),ruleVersion=z.literal('alpha6-adoption-candidates-v1');
const provenance=object({version,metadataOnly,status:z.literal('selection-only'),historyCoverage,sourceHash:hash,scopeHash:hash,ruleVersion,decisionHash:hash,manifestHash:hash,
  evaluatedAt:time,recheckedAt:time,entries:z.array(entry).max(16000),omissions,knownRestrictions});
const manifest=object({version,metadataOnly,kind:z.literal('adoption-candidate-manifest'),historyCoverage,ruleVersion,evaluatedAt:time,sourceHash:hash,scopeHash:hash,decisionHash:hash,
  domainFingerprints:three(name=>object({name:z.literal(name),sha256:hash,size:count})),entries:z.array(entry).max(16000),
  excludedLegacy:z.array(object({owner,id:bounded,revision:positive,reason:z.literal('legacy_only_not_imported'),recordSha256:hash})).max(8000),omissions,knownRestrictions,hash});
const request=object({sourceRoot:path,storageRoot:path,trustedAncestor:path,configPath:path,budgetPath:path,retireKnownWriters:z.boolean(),
  projects:z.array(object({root:path,userProfile:z.string().min(1).max(128).regex(/^[^\x00-\x1f\x7f]+$/).optional()})).min(1).max(16),parsedConfigFingerprint:fingerprint.optional()});
const environment=object({files:z.array(fingerprint).min(2).max(128),directories:z.array(canonicalIdentity).min(1).max(128),runtime:object({
  node:z.string().regex(/^v[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?$/),platform:z.enum(['aix','android','darwin','freebsd','haiku','linux','openbsd','sunos','win32','cygwin','netbsd']),
  architecture:z.enum(['arm','arm64','ia32','loong64','mips','mipsel','ppc','ppc64','riscv64','s390','s390x','x64'])})});
const basePlan={kind:z.literal('adoption-preparation-v1'),transactionId:uuid,storageRoot:path,request,createdAt:time,evaluatedAt:time,expiresAt:count,environment,source:sourceSnapshot,manifest,
  retirementPlan:retirementPlan.optional(),oldHistoryCoverage:historyCoverage,
  excludedHistory:z.tuple([z.literal('old-L4'),z.literal('legacy-history'),z.literal('migration-backups'),z.literal('index-and-media-body')]),businessWrites:z.literal('blocked-not-adopted'),hash};
const plan=z.discriminatedUnion('phase',[
  object({...basePlan,phase:z.literal('prepared')}),
  object({...basePlan,phase:z.literal('selected'),baseHash:hash,choices:z.array(object({owner,id:bounded,revision:positive,action:z.enum(['include','exclude'])})).max(16000),
    selection:object({hashes:z.tuple([hash,hash,hash]),provenance})})
]);
const staged=object({status:z.literal('staged'),planHash:hash,transactionId:uuid,storageRoot:path,
  files:three(name=>object({name:z.literal(name),path,sha256:hash,bytes:count})),retirement:z.union([retirement,object({status:z.literal('not-requested'),assurance})]),
  sourceProof:sourceSnapshot,expiresAt:count,businessWrites:z.literal('blocked-not-adopted'),formalPublicationSupported:z.literal(false)});
const restorationInspection=object({version:z.literal(1),assurance,writerSid:sid,entries:z.array(object({path,mask:count,currentSddl:sddl,originalSddl:sddl,state:z.enum(['original','retired'])})).min(1).max(256),interruptedRestorationMayPermitWrites:z.literal(true)});
const release=object({kind:z.literal('adoption-maintenance-end-v1'),nonce:uuid,transactionId:uuid,storageRoot:path,originalPlanHash:hash,mode:z.literal('restore-original-dacl'),createdAt:count,expiresAt:count,permissions:restorationInspection,implementation:object({files:z.array(fingerprint).min(1).max(128),runtime:environment.shape.runtime}),newBusinessAvailable:z.literal(false),oldBusinessHealthVerified:z.literal(false),hash});
const payloads={
  preparing:object({transactionId:uuid,businessWrites:z.literal('blocked-not-adopted')}),
  plan_reserved:object({planHash:hash,phase:z.enum(['prepared','selected'])}),
  prepared:object({planHash:hash}),selected:object({planHash:hash,baseHash:hash}),confirmed:object({planHash:hash}),staging:object({planHash:hash}),
  retired:object({planHash:hash,retirement}),staged:object({planHash:hash,result:staged}),
  invalidated:object({planHash:hash,code:errorCode}),cancelled:object({planHash:hash.nullable()}),expired:object({planHash:hash.nullable()}),
  interrupted:object({planHash:hash.nullable(),code:errorCode.optional()})
  ,maintenance_end_planned:object({planHash:hash,release}),maintenance_end_intent:object({planHash:hash,releaseHash:hash}),
  maintenance_end_done:object({planHash:hash,releaseHash:hash,restoredPaths:z.array(path).max(256),alreadyOriginalPaths:z.array(path).max(256)}),
  maintenance_end_interrupted:object({planHash:hash,releaseHash:hash,code:errorCode})
};
const event=z.discriminatedUnion('type',Object.entries(payloads).map(([type,payload])=>object({identity:hash,seq:positive,previous:hash.nullable(),type:z.literal(type),payload,at:count,hash})));

function plainJson(value,depth=0,seen=new Set()){
  if(depth>32)fail();
  if(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return;
  if(!value||typeof value!=='object'||seen.has(value)||!Array.isArray(value)&&![Object.prototype,null].includes(Object.getPrototypeOf(value))||Object.getOwnPropertySymbols(value).length)fail();
  if(Array.isArray(value)&&Object.keys(value).length!==value.length)fail();seen.add(value);
  for(const [key,d]of Object.entries(Object.getOwnPropertyDescriptors(value))){
    if(Array.isArray(value)&&key==='length')continue;
    if(!d.enumerable||!Object.hasOwn(d,'value')||['__proto__','constructor','prototype'].includes(key)||Array.isArray(value)&&(!/^(0|[1-9][0-9]*)$/.test(key)||Number(key)>=value.length))fail();
    plainJson(d.value,depth+1,seen);
  }
  seen.delete(value);
}
function assert(value,schema){try{plainJson(value);schema.parse(value);return value;}catch{fail();}}

/** Shape validation only: the controller separately verifies exact hashes,
 * registered plan identity, event ordering and current filesystem evidence. */
export const assertPreparationPlan=value=>assert(value,plan);
export const assertPreparationEvent=value=>assert(value,event);
