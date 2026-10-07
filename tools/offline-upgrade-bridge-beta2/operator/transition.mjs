import {fileURLToPath,pathToFileURL} from 'node:url';
const demand=(v,c)=>{if(!v)throw Error(c)};
/** Compose a graph without dropping packages present only in the accepted installation. */
export function composeGraph(old,next){
 const graph=structuredClone(next),seen=new Set(graph.packages.map(p=>p.id));
 demand(seen.size===graph.packages.length,'HOST_DUPLICATE_ID');
 for(const p of next.packages){if(!p.name.startsWith('@deepseek-ai/')&&!p.name.startsWith('dsh-')||graph.roots[p.name])continue;const rows=next.packages.filter(x=>x.name===p.name);demand(rows.length===1,'HOST_ROOT_AMBIGUOUS');graph.roots[p.name]=p.id;}const map={},retainedNames=[],retained=new Map();
 const choose=p=>{const root=graph.roots[p.name];if(root)return root;const matches=next.packages.filter(x=>x.name===p.name);return matches.length===1?matches[0].id:null};
 function retain(id){if(retained.has(id))return retained.get(id);const p=old.packages.find(p=>p.id===id);demand(p&&/^[\w-]+$/.test(id),'HOST_RETAINED_SOURCE');const target='retained_'+id;demand(!seen.has(target),'HOST_RETAINED_COLLISION');seen.add(target);retained.set(id,target);const row={...structuredClone(p),id:target,dependencies:{}};graph.packages.push(row);retainedNames.push(p.name);for(const[name,dep]of Object.entries(p.dependencies??{}))row.dependencies[name]=retain(dep);for(const f of old.files.filter(f=>f.path.startsWith('store/'+id+'/')))graph.files.push({...f,path:'store/'+target+'/'+f.path.slice(('store/'+id+'/').length)});return target;}
 for(const[name,id]of Object.entries(old.roots)){const p=old.packages.find(p=>p.id===id);demand(p?.name===name,'HOST_OLD_ROOT');if(graph.roots[name])continue;const matches=next.packages.filter(x=>x.name===name);demand(matches.length<=1,'HOST_ROOT_AMBIGUOUS');graph.roots[name]=matches[0]?.id??retain(id);}
 for(const p of old.packages)map[p.id]=retained.get(p.id)??choose(p);
 return {graph,map,retainedNames,sources:graph.files.map(f=>{const prefix=f.path.split('/')[1];const before=[...retained].find(([,to])=>to===prefix)?.[0];return {path:f.path,from:before?'old':'candidate',sourcePath:before?'store/'+before+'/'+f.path.split('/').slice(2).join('/'):f.path};})};
}
/** Only graph-owned references move; external and untracked custom references stay fixed. */
export function rebaseOwned(value,oldRoot,newRoot,old,target,map){
 if(typeof value==='string'){
  if(value.startsWith('file:')){const path=fileURLToPath(value),mapped=rebaseOwned(path,oldRoot,newRoot,old,target,map);return mapped===path?value:pathToFileURL(mapped).href;}
  const normalize=p=>p.replaceAll('\\','/').replace(/\/$/,''),v=normalize(value),a=normalize(oldRoot),b=normalize(newRoot),key=p=>process.platform==='win32'?p.toLowerCase():p;
  if(key(v)===key(a))return b;if(!key(v).startsWith(key(a)+'/'))return value;
  const rel=v.slice(a.length+1);
  if(rel.startsWith('store/')){const[,id,...tail]=rel.split('/'),mapped=map[id];demand(mapped&&old.files.some(f=>f.path===rel),'HOST_PATH_UNVERIFIED');const next='store/'+mapped+'/'+tail.join('/');demand(target.files.some(f=>f.path===next),'HOST_PATH_UNVERIFIED');return b+'/'+next;}
  if(rel.startsWith('node_modules/')){const parts=rel.slice(13).split('/'),count=parts[0].startsWith('@')?2:1,name=parts.slice(0,count).join('/');if(!old.roots[name])return value;demand(target.roots[name],'HOST_PATH_UNVERIFIED');const rest=parts.slice(count).join('/');if(rest)demand(target.files.some(f=>f.path==='store/'+target.roots[name]+'/'+rest),'HOST_PATH_UNVERIFIED');return b+'/'+rel;}
  return value;
 }
 if(Array.isArray(value))return value.map(v=>rebaseOwned(v,oldRoot,newRoot,old,target,map));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,rebaseOwned(v,oldRoot,newRoot,old,target,map)]));return value;
}

