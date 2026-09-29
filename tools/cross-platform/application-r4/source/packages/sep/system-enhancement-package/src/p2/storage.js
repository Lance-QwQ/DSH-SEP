import {realpath,mkdir,readFile} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {z} from 'zod';
import {fail} from '../errors.js';
import {DATA_DOMAINS} from './control.js';
import {applyDeletionGovernance} from './backups.js';
import {isDeepStrictEqual} from 'node:util';

export const p2Config=z.object({enabled:z.boolean().default(true),storageRoot:z.string()}).strict();
const key=path=>process.platform==='win32'?path.toLowerCase():path;

/** rc.5 adapter: route lookup and unit.path are verified against the registered
 * JSON backend. Unknown backends or layouts fail instead of trusting config. */
export async function bindStorage({facility,storageRoot,control}){
  storageRoot=await realpath(storageRoot);if(key(storageRoot)!==key(control.storageRoot))fail('P2_STORAGE_MISMATCH');
  const routes=new Map();
  for(const name of DATA_DOMAINS){
    const route=facility.config?.routes?.[name]??facility.config?.backend;
    const backend=facility.ctx?.storage?.backend?.get(route);
    if(!backend||backend.constructor.name!=='JsonStorageBackend'||!backend.kv||typeof backend.root!=='string')fail('P2_BACKEND_UNVERIFIED');
    await mkdir(backend.root,{recursive:true});const actual=await realpath(backend.root);
    if(key(actual)!==key(storageRoot))fail('P2_STORAGE_MISMATCH');if(facility.get(name))fail('P2_STORAGE_ALREADY_OPEN');routes.set(name,{route,backend});
  }
  const tableNames={dsh_enhancement_suite_v1:['projects','media'],dsh_four_layer_memory_v1:['active'],dsh_four_layer_archive_v1:['archives','backups']},opened=new Map();
  async function snapshots(){const rows=[],existing=new Set();for(const name of DATA_DOMAINS){try{rows.push(JSON.parse(await readFile(join(storageRoot,name+'.json'),'utf8')));existing.add(name);}catch(error){if(error.code!=='ENOENT')throw error;rows.push({unit:{name,version:1},global:null,tables:Object.fromEntries(tableNames[name].map(table=>[table,{}]))});}}return {rows,existing};}
  async function applyDocumentDeletion(marker){
    control.assertDocumentDeletion(marker);await control.assertOwned();const {rows,existing}=await snapshots(),governed=applyDeletionGovernance(rows,control.documentDeletions());
    for(const [i,value]of governed.entries()){
      const name=value.unit.name;if(!existing.has(name)||isDeepStrictEqual(rows[i],value))continue;
      let domain=opened.get(name)??facility.get(name),temporary=false;
      if(!domain){domain=await facility.open({name,version:1,tables:Object.fromEntries(tableNames[name].map(table=>[table,{valueSchema:z.json()}]))});temporary=true;}
      try{
        if(typeof domain.unit?.path!=='string'||key(resolve(domain.unit.path))!==key(join(storageRoot,name+'.json')))fail('P2_STORAGE_MISMATCH');
        for(const tableName of tableNames[name]){const table=domain.table(tableName),next=value.tables[tableName]??{};for(const old of table.keys())if(!Object.hasOwn(next,old))await table.delete(old);for(const [entry,item]of Object.entries(next))if(!isDeepStrictEqual(table.get(entry),item))await table.put(entry,item);}
      }finally{if(temporary)await domain.close();}
    }
    return {status:'current_domains_cleaned',id:marker.id};
  }
  return {withAccess:fn=>control.withAccess(fn),documentDeletion:(...args)=>control.documentDeletion(...args),documentDeletions:()=>control.documentDeletions(),applyDocumentDeletion,finishDeletion:({id})=>control.business({operation:'purge_owned_backups',recordId:id},()=>control.completeDeletion({id})),async open(spec){
    if(!routes.has(spec.name))fail('P2_DOMAIN_UNMANAGED');await control.assertOwned();const expected=routes.get(spec.name);const current=facility.ctx.storage.backend.get(facility.config.routes?.[spec.name]??facility.config.backend);if(current!==expected.backend)fail('P2_STORAGE_MISMATCH');
    const domain=await facility.open(spec);
    async function verify(){await control.assertOwned();if(typeof domain.unit?.path!=='string'||key(resolve(domain.unit.path))!==key(join(storageRoot,`${spec.name}.json`))||key(await realpath(dirname(domain.unit.path)))!==key(storageRoot))fail('P2_STORAGE_MISMATCH');}
    try{await verify();}catch(e){await domain.close();throw e;}
    opened.set(spec.name,domain);
    const tables=new Map();
    return {name:domain.name,close:async()=>{opened.delete(spec.name);await domain.close();},table(name){if(tables.has(name))return tables.get(name);const table=domain.table(name);
      const readable=fn=>{control.assertReadable();return fn();};
      const protectedTable={get:key=>readable(()=>structuredClone(table.get(key))),entries:()=>readable(()=>structuredClone([...table.entries()])[Symbol.iterator]()),keys:()=>readable(()=>[...table.keys()][Symbol.iterator]()),get size(){return readable(()=>table.size);},
        put:(key,value)=>control.business({domain:spec.name,table:name,key,operation:'put'},async()=>{await verify();
          const documentMarkers=control.documentDeletions();
          if(documentMarkers.length){const {rows}=await snapshots(),target=rows.find(row=>row.unit.name===spec.name);target.tables[name]??={};target.tables[name][key]=structuredClone(value);const governed=applyDeletionGovernance(rows,documentMarkers).find(row=>row.unit.name===spec.name).tables[name];if(!Object.hasOwn(governed,key))return table.delete(key);value=governed[key];}
          if(spec.name==='dsh_four_layer_memory_v1'&&name==='active'&&key==='catalog')for(const [owner,state]of Object.entries(value.owners??{}))for(const marker of state.markers??[])if(['withdrawn','purged'].includes(marker.status))await control.deletion({...marker,owner});
          if(spec.name==='dsh_enhancement_suite_v1'&&name==='projects')for(const memory of value.memories??[])if(memory.status==='revoked')await control.deletion({id:memory.id,owner:`project:${key}`,status:'withdrawn',at:memory.updatedAt});
          return table.put(key,value);
        }),
        delete:key=>control.business({domain:spec.name,table:name,key,operation:'delete'},async()=>{await verify();return table.delete(key);})};tables.set(name,protectedTable);return protectedTable;}
    };
  }};
}
