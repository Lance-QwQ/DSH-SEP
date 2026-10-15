import {isAbsolute} from 'node:path';
import {digest,fail} from '../errors.js';
import {spec as legacySpec} from '../store.js';
import {createLayeredMemory} from '../layered-memory.js';
import {classifyMemory} from '../layer-policy.js';
import {applyDeletionGovernance} from './backups.js';

const names=['dsh_enhancement_suite_v1','dsh_four_layer_memory_v1','dsh_four_layer_archive_v1'];
const tables=[['projects','media'],['active'],['archives','backups']];
const normalized=value=>value.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function jsonData(value,depth=0){
  if(depth>64)fail('P2_MIGRATION_SCHEMA');
  if(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return;
  if(Array.isArray(value)){for(const child of value)jsonData(child,depth+1);return;}
  if(!object(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail('P2_MIGRATION_SCHEMA');
  for(const [key,child]of Object.entries(value)){
    if(['__proto__','constructor','prototype'].includes(key))fail('P2_MIGRATION_SCHEMA');
    jsonData(child,depth+1);
  }
}

/** Pure copied-data adapter for an existing, reviewed migration. It never opens
 * a filesystem, model, project, or native writer. Persistent checkpoint/deletion
 * verification and output publication remain the maintenance controller's job. */
export async function migrateLegacyDomains({domains,projects,now,fromVersion,toVersion}={}){
  if(fromVersion!=='0.1.0-alpha.5'||!['0.1.0-alpha.6','0.1.0-alpha.7'].includes(toVersion))fail('P2_MIGRATION_UNSUPPORTED');
  const time=Date.parse(now);
  if(typeof now!=='string'||!Number.isFinite(time)||new Date(time).toISOString()!==now)fail('P2_MIGRATION_CONFIG','A fixed canonical ISO time is required');
  if(!Array.isArray(domains)||domains.length!==3||!Array.isArray(projects)||projects.length<1||projects.length>16)fail('P2_MIGRATION_CONFIG');
  jsonData(domains);jsonData(projects);
  const copies=domains.map((data,i)=>data===null?{unit:{name:names[i],version:1},global:null,tables:Object.fromEntries(tables[i].map(name=>[name,{}]))}:structuredClone(data));
  for(const [i,data]of copies.entries())if(data?.unit?.name!==names[i]||data.global!==null)fail('P2_MIGRATION_SCHEMA');
  // This stable validator rejects unknown envelope/table/record keys, including
  // cold and migration-backup records that native z.json tables alone accept.
  applyDeletionGovernance(copies,[]);
  const dataByName=new Map(copies.map(data=>[data.unit.name,data]));
  const facility={async open(spec){
    const data=dataByName.get(spec.name);if(!data||spec.version!==data.unit.version)fail('P2_MIGRATION_SCHEMA');
    for(const [name,table]of Object.entries(spec.tables)){
      data.tables[name]??={};for(const value of Object.values(data.tables[name]))table.valueSchema.parse(value);
    }
    return {name:spec.name,async close(){},table(name){
      const schema=spec.tables[name]?.valueSchema;if(!schema)fail('P2_MIGRATION_SCHEMA');const rows=data.tables[name];
      return {get:key=>structuredClone(rows[key]),entries:()=>Object.entries(structuredClone(rows))[Symbol.iterator](),keys:()=>Object.keys(rows)[Symbol.iterator](),get size(){return Object.keys(rows).length;},
        async put(key,value){jsonData(value);rows[key]=structuredClone(schema.parse(value));},async delete(key){delete rows[key];}};
    }};
  }};
  const legacyDomain=await facility.open(legacySpec);await legacyDomain.close();
  const mapping=structuredClone(projects),keys=new Set(),roots=new Set(),reports=[];
  const catalog=copies[1].tables.active?.catalog;
  for(const project of mapping){
    if(!object(project)||Object.keys(project).some(key=>!['key','root'].includes(key))||typeof project.key!=='string'||! /^[a-z0-9_-]{1,128}$/i.test(project.key)||['__proto__','constructor','prototype'].includes(project.key)||!isAbsolute(project.root??'')||keys.has(project.key)||roots.has(project.root))fail('P2_MIGRATION_CONFIG');
    keys.add(project.key);roots.add(project.root);
    const source=copies[0].tables.projects[project.key];
    if(!source||source.root!==project.root)fail('P2_MIGRATION_SCOPE','Each selected legacy owner must retain its exact root and key');
    const sourceSha256=digest(JSON.stringify(source.memories)),prior=catalog?.migrations[project.key];
    if(prior){
      if(prior.sourceSha256!==sourceSha256)fail('P2_MIGRATION_SOURCE_CHANGED');
      const backup=copies[2].tables.backups?.[prior.backupId];
      if(!backup||backup.projectKey!==project.key||backup.sourceSha256!==sourceSha256)fail('P2_MIGRATION_INCOMPLETE');
      legacySpec.tables.projects.valueSchema.parse(backup.snapshot);
      if(digest(JSON.stringify(backup.snapshot.memories))!==sourceSha256)fail('P2_MIGRATION_INCOMPLETE');
    }
    for(const old of source.memories){
      const classification=classifyMemory({kind:old.automatic?.kind},{});
      const keyHash=digest(normalized(old.automatic?.key??`${classification.category}:${old.text}`)),textHash=digest(normalized(old.text));
      for(const marker of catalog?.owners['project:'+project.key]?.markers??[]){
        if((marker.id===old.id||marker.keyHash===keyHash||marker.textHash===textHash)&&(marker.status==='purged'||marker.status==='withdrawn'&&old.status!=='revoked'))fail('P2_MIGRATION_GOVERNANCE_REQUIRED','Apply verified deletion authority before importing legacy rows');
      }
    }
    reports.push({key:project.key,root:project.root,status:prior?'replayed':source.memories.length?'migrated':'empty',sourceSha256});
  }
  const legacy={read:project=>structuredClone(copies[0].tables.projects[project.key])};
  const manager=await createLayeredMemory({facility,scope:{projects:mapping},legacy,config:{enabled:true,migrateLegacy:true},now:()=>time});
  try{
    for(const [i,project]of mapping.entries()){
      const preview=manager.migrationPreview(project),migration=copies[1].tables.active?.catalog?.migrations[project.key];
      for(const record of manager.read(project))for(const id of record.historyRefs){
        const meta=copies[1].tables.active.catalog.archives[id],payload=copies[2].tables.archives[id];
        if(!meta||!payload||meta.archiveId!==id||payload.archiveId!==id||meta.recordId!==record.id||payload.record?.id!==record.id)fail('P2_MIGRATION_INCOMPLETE');
      }
      Object.assign(reports[i],{active:manager.read(project).length,withdrawn:preview.withdrawn,expired:preview.expired,...migration?{backupId:migration.backupId}:{}});
    }
  }finally{await manager.close();}
  applyDeletionGovernance(copies,[]);
  return {domains:copies,migration:{id:'alpha5-legacy-to-four-layer-v1',fromVersion,toVersion,now,projects:reports,
    sharing:'retain_legacy_project_scope',legacyEvents:'retained_in_legacy_domain'}};
}
